"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = process.env.RESTOCK_DATA_DIR || (IS_VERCEL ? path.join(os.tmpdir(), "restock-data") : path.join(ROOT, "data"));
const DB_PATH = process.env.RESTOCK_DB || path.join(DATA_DIR, "restock.sqlite");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    stock REAL NOT NULL DEFAULT 0,
    buy_price REAL NOT NULL DEFAULT 0,
    sell_price REAL NOT NULL DEFAULT 0,
    lead_time INTEGER NOT NULL DEFAULT 1,
    service_level REAL NOT NULL DEFAULT 0.95,
    expiry_date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    product_id TEXT NOT NULL,
    type TEXT NOT NULL,
    qty REAL NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_tx_product ON transactions(product_id);
  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    date TEXT NOT NULL,
    stock_at_notify REAL NOT NULL DEFAULT 0,
    rop REAL NOT NULL DEFAULT 0,
    suggested_qty REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'baru',
    eta REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_notif_product ON notifications(product_id);
  CREATE TABLE IF NOT EXISTS settings (
    skey TEXT PRIMARY KEY,
    svalue TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    mkey TEXT PRIMARY KEY,
    mvalue TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

/* ============ AUTH HELPERS ============ */
const SESSION_DAYS = 30;

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function makeId(prefix) {
  return prefix + "_" + crypto.randomBytes(8).toString("hex");
}

function publicUser(r) {
  if (!r) return null;
  return { id: r.id, username: r.username, email: r.email, name: r.name, role: r.role, createdAt: r.created_at };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 86400000);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now.toISOString(), exp.toISOString());
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(String(token));
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    try { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); } catch (e) {}
    return null;
  }
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  return u || null;
}

function tokenFromReq(req) {
  const h = req.headers["x-session-token"] || req.headers["X-Session-Token"];
  if (h) return String(h).trim();
  const auth = req.headers["authorization"] || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return "";
}

function seedDefaultUser() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare(`INSERT INTO users (id, username, email, name, password_hash, salt, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(makeId("u"), "admin", "admin@restock.id", "Administrator",
      hashPassword("admin123", salt), salt, "admin", new Date().toISOString());
  console.log("Akun demo dibuat: admin / admin123");
}

function validUsername(u) { return /^[a-zA-Z0-9_.-]{3,32}$/.test(String(u || "")); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "")); }

seedDefaultUser();

function rowToProduct(r) {
  return {
    id: r.id, sku: r.sku, name: r.name, category: r.category, unit: r.unit,
    stock: r.stock, buyPrice: r.buy_price, sellPrice: r.sell_price,
    leadTime: r.lead_time, serviceLevel: r.service_level,
    expiryDate: r.expiry_date, createdAt: r.created_at, note: r.note
  };
}

function rowToTransaction(r) {
  return { id: r.id, date: r.date, productId: r.product_id, type: r.type, qty: r.qty, note: r.note };
}

function rowToNotification(r) {
  return {
    id: r.id, productId: r.product_id, date: r.date, stockAtNotify: r.stock_at_notify,
    rop: r.rop, suggestedQty: r.suggested_qty, status: r.status, eta: r.eta
  };
}

function readJSONRow(stmt, key) {
  const row = stmt.get(key);
  if (!row) return null;
  try { return JSON.parse(row.svalue); } catch (e) { return null; }
}

function queryJSONRow(stmt, key) {
  const row = stmt.get(key);
  if (!row) return null;
  try { return JSON.parse(row.mvalue); } catch (e) { return null; }
}

function getState() {
  const products = db.prepare("SELECT * FROM products ORDER BY rowid").all().map(rowToProduct);
  const transactions = db.prepare("SELECT * FROM transactions ORDER BY rowid").all().map(rowToTransaction);
  const notifications = db.prepare("SELECT * FROM notifications ORDER BY rowid").all().map(rowToNotification);
  const settings = readJSONRow(db.prepare("SELECT svalue FROM settings WHERE skey = ?"), "json");
  const meta = queryJSONRow(db.prepare("SELECT mvalue FROM meta WHERE mkey = ?"), "json");
  return { settings: settings || {}, products: products, transactions: transactions, notifications: notifications, meta: meta };
}

function putState(body) {
  if (!body || typeof body !== "object") throw new Error("payload tidak valid");
  if (!body.settings || typeof body.settings !== "object") throw new Error("settings tidak valid");
  if (!Array.isArray(body.products) || !Array.isArray(body.transactions) || !Array.isArray(body.notifications)) {
    throw new Error("struktur data tidak valid");
  }
  const insertP = db.prepare(`INSERT OR REPLACE INTO products
    (id, sku, name, category, unit, stock, buy_price, sell_price, lead_time, service_level, expiry_date, created_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertT = db.prepare(`INSERT OR REPLACE INTO transactions
    (id, date, product_id, type, qty, note) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertN = db.prepare(`INSERT OR REPLACE INTO notifications
    (id, product_id, date, stock_at_notify, rop, suggested_qty, status, eta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const upsertS = db.prepare("INSERT OR REPLACE INTO settings (skey, svalue) VALUES (?, ?)");
  const upsertM = db.prepare("INSERT OR REPLACE INTO meta (mkey, mvalue) VALUES (?, ?)");

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM products; DELETE FROM transactions; DELETE FROM notifications;");
    const s = body.settings;
    const m = body.meta || {};
    for (const p of body.products) {
      insertP.run(p.id, String(p.sku), String(p.name), String(p.category || ""), String(p.unit || ""),
        Number(p.stock) || 0, Number(p.buyPrice) || 0, Number(p.sellPrice) || 0,
        Math.max(0, Number(p.leadTime)) || 1, Number(p.serviceLevel) || 0.95,
        String(p.expiryDate || ""), String(p.createdAt || ""), String(p.note || ""));
    }
    for (const t of body.transactions) {
      insertT.run(t.id, String(t.date), String(t.productId), String(t.type), Number(t.qty) || 0, String(t.note || ""));
    }
    for (const n of body.notifications) {
      insertN.run(n.id, String(n.productId), String(n.date), Number(n.stockAtNotify) || 0,
        Number(n.rop) || 0, Number(n.suggestedQty) || 0, String(n.status || "baru"), Number(n.eta) || 0);
    }
    upsertS.run("json", JSON.stringify(s));
    upsertM.run("json", JSON.stringify({ txId: Number(m.txId) || 9001, notifSerial: Number(m.notifSerial) || 1, poSerial: Number(m.poSerial) || 1 }));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function clearState() {
  db.exec("DELETE FROM products; DELETE FROM transactions; DELETE FROM notifications; DELETE FROM settings; DELETE FROM meta;");
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > 2e7) { reject(new Error("payload terlalu besar")); req.destroy(); return; }
    });
    req.on("end", function () { resolve(data); });
    req.on("error", reject);
  });
}

function readJSONBody(req) {
  return readBody(req).then(function (text) {
    if (!text) return {};
    try { return JSON.parse(text); } catch (e) { throw new Error("JSON tidak valid"); }
  });
}

function handleAuth(req, res, pathname) {
  // POST /api/auth/register
  if (req.method === "POST" && pathname === "/api/auth/register") {
    readJSONBody(req).then(function (body) {
      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name) return sendJSON(res, 400, { error: "Nama lengkap wajib diisi." });
      if (!validUsername(username)) return sendJSON(res, 400, { error: "Username 3-32 karakter (huruf, angka, _ . -)." });
      if (!validEmail(email)) return sendJSON(res, 400, { error: "Email tidak valid." });
      if (password.length < 6) return sendJSON(res, 400, { error: "Password minimal 6 karakter." });
      const existsU = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
      if (existsU) return sendJSON(res, 409, { error: "Username sudah dipakai." });
      const existsE = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
      if (existsE) return sendJSON(res, 409, { error: "Email sudah terdaftar." });
      const salt = crypto.randomBytes(16).toString("hex");
      const id = makeId("u");
      db.prepare(`INSERT INTO users (id, username, email, name, password_hash, salt, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, username, email, name, hashPassword(password, salt), salt, "user", new Date().toISOString());
      const token = createSession(id);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      sendJSON(res, 200, { ok: true, token: token, user: publicUser(user) });
    }).catch(function (err) {
      sendJSON(res, 400, { error: String(err.message || err) });
    });
    return true;
  }

  // POST /api/auth/login
  if (req.method === "POST" && pathname === "/api/auth/login") {
    readJSONBody(req).then(function (body) {
      const id = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!id || !password) return sendJSON(res, 400, { error: "Username/email dan password wajib diisi." });
      let user = db.prepare("SELECT * FROM users WHERE username = ?").get(id);
      if (!user) user = db.prepare("SELECT * FROM users WHERE email = ?").get(id.toLowerCase());
      if (!user) return sendJSON(res, 401, { error: "Akun tidak ditemukan." });
      const hash = hashPassword(password, user.salt);
      const bufHash = Buffer.from(hash, "hex");
      const bufStored = Buffer.from(user.password_hash, "hex");
      const ok = bufHash.length === bufStored.length && crypto.timingSafeEqual(bufHash, bufStored);
      if (!ok) return sendJSON(res, 401, { error: "Password salah." });
      const token = createSession(user.id);
      sendJSON(res, 200, { ok: true, token: token, user: publicUser(user) });
    }).catch(function (err) {
      sendJSON(res, 400, { error: String(err.message || err) });
    });
    return true;
  }

  // POST /api/auth/logout
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = tokenFromReq(req);
    if (token) {
      try { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); } catch (e) {}
    }
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // GET /api/auth/me
  if (req.method === "GET" && pathname === "/api/auth/me") {
    const user = getUserByToken(tokenFromReq(req));
    if (!user) return sendJSON(res, 401, { error: "Belum login." });
    sendJSON(res, 200, { user: publicUser(user) });
    return true;
  }

  return false;
}

function requireAuth(req, res) {
  const user = getUserByToken(tokenFromReq(req));
  if (!user) {
    sendJSON(res, 401, { error: "Sesi berakhir. Silakan login kembali." });
    return null;
  }
  return user;
}

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const STATIC_ROOT = path.join(ROOT, "public");
  let fp;
  try {
    fp = path.normalize(path.join(STATIC_ROOT, decodeURIComponent(rel)));
  } catch (e) {
    sendJSON(res, 400, { error: "path tidak valid" });
    return;
  }
  if (fp !== STATIC_ROOT && !fp.startsWith(STATIC_ROOT + path.sep)) {
    sendJSON(res, 403, { error: "akses ditolak" });
    return;
  }
  fs.stat(fp, function (err, st) {
    if (err || !st.isFile()) {
      sendJSON(res, 404, { error: "file tidak ditemukan" });
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(fp).pipe(res);
  });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname.startsWith("/api/auth/")) {
    if (handleAuth(req, res, pathname)) return;
  }

  if (pathname === "/api/state" || pathname === "/api/state/") {
    if (!requireAuth(req, res)) return;
  }

  if (req.method === "GET" && (pathname === "/api/state" || pathname === "/api/state/")) {
    sendJSON(res, 200, getState());
    return;
  }
  if (req.method === "PUT" && (pathname === "/api/state" || pathname === "/api/state/")) {
    readBody(req).then(function (text) {
      let body;
      try { body = JSON.parse(text); } catch (e) { sendJSON(res, 400, { error: "JSON tidak valid" }); return; }
      try {
        putState(body);
        sendJSON(res, 200, { ok: true });
      } catch (err) {
        sendJSON(res, 400, { error: String(err.message || err) });
      }
    }).catch(function (err) { sendJSON(res, 400, { error: String(err.message || err) }); });
    return;
  }
  if (req.method === "DELETE" && (pathname === "/api/state" || pathname === "/api/state/")) {
    clearState();
    sendJSON(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res, pathname);
    return;
  }
  sendJSON(res, 405, { error: "metode tidak didukung" });
});

server.listen(PORT, HOST, function () {
  console.log("");
  console.log("=========== Restock.id - Manajemen Stok ROP ===========");
  console.log("Server berjalan di:  http://localhost:" + PORT);
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    ifaces[name].forEach(function (iface) {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log("Akses dari perangkat lain: http://" + iface.address + ":" + PORT);
      }
    });
  });
  console.log("Database SQLite:      " + DB_PATH);
  console.log("==================================================");
  console.log("");
});

process.on("SIGINT", function () {
  try { db.close(); } catch (e) {}
  process.exit(0);
});
process.on("SIGTERM", function () {
  try { db.close(); } catch (e) {}
  process.exit(0);
});