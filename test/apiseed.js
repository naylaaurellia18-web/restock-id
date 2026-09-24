const fs = require("fs");
const vm = require("vm");
const path = require("path");
const sandbox = {Math, Date, JSON, console, Number, String, Object, Array, isFinite, Infinity, parseInt, parseFloat, Intl};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["app-calc.js", "app-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js", f), "utf8"), sandbox, {filename: f});
}
const data = sandbox.makeDefaultData();
const payload = {
  settings: data.settings,
  products: data.products,
  transactions: data.transactions,
  notifications: data.notifications,
  meta: {txId: 9001, notifSerial: 1, poSerial: 1}
};
fs.writeFileSync(path.join(__dirname, "payload.json"), JSON.stringify(payload));
console.log("produced", data.products.length, "products,", data.transactions.length, "transactions");