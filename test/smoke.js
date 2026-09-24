const fs = require("fs");
const vm = require("vm");
const path = require("path");

const base = path.resolve(__dirname, "..", "public", "js");
const sandbox = {
  Math, Date, JSON, console, Number, String, Object, Array, isFinite, Infinity,
  parseInt, parseFloat, Intl
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ["app-calc.js", "app-data.js", "app-store.js"]) {
  vm.runInContext(fs.readFileSync(path.join(base, f), "utf8"), sandbox, {filename: f});
}

const Store = sandbox.Store;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}

Store.init();

check("13 produk contoh", Store.products().length === 13, Store.products().length);
const outCount = Store.transactions().filter(t => t.type === "out").length;
check("riwayat penjualan > 1000", outCount > 1000, outCount);

const p1 = Store.getProduct("p1");
const st1 = Store.computeStats(p1);
check("p1 (beras) cukup data", st1.enough === true);
check("p1 ROP > 0", st1.rop > 0, st1.rop);
check("p1 d > 0", st1.d > 0, st1.d);
check("p1 SS > 0", st1.ss > 0, st1.ss);
check("p1 EOQ > 0", st1.eoq > 0, st1.eoq);
check("p1 ROP = d*L + SS", Math.abs(st1.rop - (st1.d * st1.L + st1.ss)) < 0.2, {rop: st1.rop, calc: st1.d * st1.L + st1.ss});

const demandSeries = sandbox.demandSeries;
const ser1 = demandSeries(p1, Store.transactions(), 90);
check("demand series p1 = 90 hari", ser1.n === 90, ser1.n);

const pv = Store.products().find(p => p.sku === "VNL-013");
check("produk baru (vanili) data belum cukup", Store.computeStats(pv).enough === false);
check("vanili stock 20", pv.stock === 20);

const notifBaru = Store.notifications().filter(n => n.status === "baru");
check("notifikasi reorder muncul (>=2)", notifBaru.length >= 2, notifBaru.map(n => n.productId));

const pTelur = Store.products().find(p => p.sku === "TLR-004");
check("telur stok habis = 0", pTelur.stock === 0);

let r = Store.addTransaction({productId: "p1", type: "out", qty: 999999999, date: "2026-01-01", note: "tes"});
check("validasi stok keluar > stok ditolak", r.ok === false);
const before = p1.stock;
r = Store.addTransaction({productId: "p1", type: "in", qty: 5, date: "2026-01-02", note: "tes masuk"});
check("stok masuk bertambah otomatis", r.ok === true && p1.stock === before + 5, {before, after: p1.stock});

const sim = Store.runSimulation(90);
check("simulasi selesai", !!sim);
check("simulasi menganalisis >= 1 produk", sim.used >= 1, sim.used);
check("simulasi agar fill rate dalam 0..100", sim.agg.rop.fillRate >= 0 && sim.agg.rop.fillRate <= 100, sim.agg.rop);
check("verdict tersedia", !!sim.verdict && !!sim.verdict.level);
check("trajectory tersedia", Object.keys(sim.traj).length >= 1);
check("akurasi notif terhitung", sim.acc.triggers > 0, sim.acc);
check("ujo stockout days >= 0", sim.agg.man.stockoutDays >= 0 && sim.agg.rop.stockoutDays >= 0);

const sim60 = Store.runSimulation(60);
check("simulasi 60 hari jalan", sim60.used >= 1);

r = Store.addProduct({sku: "TES-001", name: "Produk Tes", category: "Lainnya", unit: "pcs", stock: 10, buyPrice: 1000, sellPrice: 2000, leadTime: 1, serviceLevel: 0.95, expiryDate: "", note: ""});
check("tambah produk baru", r.ok === true);
check("produk baru belum cukup data", Store.computeStats(r.product).enough === false);

console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);