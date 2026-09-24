const fs = require("fs");
const vm = require("vm");
const path = require("path");
const sandbox = {Math, Date, JSON, console, Number, String, Object, Array, isFinite, Infinity, parseInt, parseFloat, Intl};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["app-calc.js", "app-data.js", "app-store.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js", f), "utf8"), sandbox, {filename: f});
}
const Store = sandbox.Store;
Store.init();

Store.products().forEach(p => {
  const st = Store.computeStats(p);
  console.log(p.sku.padEnd(8), p.name.padEnd(22), "stok=" + String(p.stock).padStart(3),
    "d=" + String(st.d).padStart(4), "sd=" + String(st.sigma).padStart(4), "L=" + st.L,
    "SS=" + String(st.ss).padStart(4), "ROP=" + String(st.rop).padStart(5),
    "EOQ=" + String(st.eoq || "-").padStart(4), "rec=" + String(st.rec),
    st.enough ? "" : "(data belum cukup)");
});

const sim = Store.runSimulation(90);
console.log("\nAGG manual:", JSON.stringify(sim.agg.man));
console.log("AGG rop   :", JSON.stringify(sim.agg.rop));
console.log("ACC:", JSON.stringify(sim.acc));
console.log("VERDICT:", sim.verdict.title, "|", sim.verdict.level);
console.log("\nSample rows:");
sim.rows.slice(0, 4).forEach(r => console.log(r.sku, "SO:", r.stockout + "/" + r.stockoutRop, "fill:", r.fill + "/" + r.fillRop, "avg:", r.avg + "/" + r.avgRop, "over:", r.over + "/" + r.overRop, "cost:", r.cost + "/" + r.costRop));