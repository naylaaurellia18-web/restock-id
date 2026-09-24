const fs = require("fs");
const vm = require("vm");
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, innerHTML: "", textContent: "", value: "", selectedIndex: 0, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, appendChild() {}, options: [], reset() {} };
  return els[id];
}
const document = {
  getElementById: el,
  querySelector: (s) => { if (s === "#txTbl") return el("txTbl"); if (s === "#prodTbl tbody") return el("tbody"); return null; },
  addEventListener() {},
  body: { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, textContent: "" })
};
const sandbox = { Math, Date, JSON, console, Number, String, Object, Array, isFinite, Infinity, parseInt, parseFloat, Intl, document, window: { scrollTo() {} }, fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }), setTimeout, clearTimeout, URL, URLSearchParams };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["app-data.js", "app-calc.js", "app-store.js", "app-auth.js", "app-ui.js", "app-pages.js", "app-main.js"]) {
  vm.runInContext(fs.readFileSync("public/js/" + f, "utf8"), sandbox, { filename: f });
}
sandbox.Store.init();
sandbox.P.render("transactions");
const html = els["content"].innerHTML;
console.log("filter-bar:", html.includes("filter-bar"));
console.log("nested select bug:", /<select[^>]*>[^<]*<select/.test(html) ? "MASIH ADA" : "hilang");
console.log("Semua produk option:", html.includes("Semua produk"));
console.log("txProd id:", html.includes('id="txProd"'));
console.log("labels:", ["Dari tanggal", "Sampai tanggal", "Produk", "Jenis"].every((l) => html.includes(l)));
const open = (html.match(/<select/g) || []).length;
const close = (html.match(/<\/select>/g) || []).length;
console.log("select open/close:", open, close, open === close ? "BALANCED" : "IMBALANCE");
console.log("txTbl rows:", (els["txTbl"] && els["txTbl"].innerHTML.length) > 0);
