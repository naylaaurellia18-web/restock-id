"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
`);

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