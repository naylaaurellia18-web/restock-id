var SEED_KEY = 20240917;
var MIN_HISTORY_DAYS = 14;
var Z_TABLE = {0.90:1.28, 0.95:1.65, 0.99:2.33};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function boxMuller(rnd) {
  var u1 = Math.max(1e-9, rnd());
  var u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

var PRODUCT_SEEDS = [
  {sku:"BRG-001",name:"Beras Premium 5 kg",cat:"Sembako",unit:"kg",buy:55000,sell:62000,lt:2,sl:.95,base:3.2,cv:.22,stockMode:"aman",weekend:1.15,minQty:20},
  {sku:"GUL-002",name:"Gula Pasir 1 kg",cat:"Sembako",unit:"pcs",buy:15000,sell:17000,lt:2,sl:.95,base:5.0,cv:.18,stockMode:"reorder",weekend:1.10,minQty:15},
  {sku:"MYK-003",name:"Minyak Goreng 1 L",cat:"Sembako",unit:"pcs",buy:14500,sell:16200,lt:2,sl:.95,base:4.2,cv:.20,stockMode:"aman",weekend:1.15,minQty:12},
  {sku:"TLR-004",name:"Telur Ayam 1 kg",cat:"Sembako",unit:"kg",buy:22000,sell:24500,lt:1,sl:.95,base:4.6,cv:.50,stockMode:"habis",weekend:1.25,minQty:24},
  {sku:"TPT-005",name:"Tepung Terigu 1 kg",cat:"Bahan Kue",unit:"pcs",buy:9500,sell:11500,lt:2,sl:.95,base:3.5,cv:.25,stockMode:"aman",weekend:1.05,minQty:12},
  {sku:"MTG-006",name:"Mentega 250 g",cat:"Bahan Kue",unit:"pcs",buy:15000,sell:18000,lt:2,sl:.99,base:3.0,cv:.45,stockMode:"waspada",weekend:1.20,minQty:12},
  {sku:"CKT-007",name:"Coklat Bubuk 100 g",cat:"Bahan Kue",unit:"pcs",buy:18500,sell:22500,lt:3,sl:.95,base:1.6,cv:.30,stockMode:"waspada",weekend:1.20,minQty:8},
  {sku:"BKP-008",name:"Baking Powder 100 g",cat:"Bahan Kue",unit:"pcs",buy:6000,sell:8500,lt:3,sl:.90,base:1.1,cv:.30,stockMode:"aman",weekend:1.00,minQty:8},
  {sku:"KOP-009",name:"Kopi Sachet 10 g",cat:"Minuman",unit:"pcs",buy:2500,sell:3200,lt:1,sl:.95,base:7.8,cv:.30,stockMode:"reorder",weekend:.85,minQty:30},
  {sku:"TEH-010",name:"Teh Celup 50 pcs",cat:"Minuman",unit:"pcs",buy:8000,sell:10000,lt:2,sl:.90,base:2.0,cv:.25,stockMode:"aman",weekend:.90,minQty:8},
  {sku:"SUS-011",name:"Susu UHT 1 L",cat:"Minuman",unit:"pcs",buy:15500,sell:17700,lt:2,sl:.95,base:3.1,cv:.40,stockMode:"aman",weekend:1.10,minQty:12},
  {sku:"KRP-012",name:"Keripik Singkong",cat:"Snack",unit:"pcs",buy:7500,sell:9500,lt:2,sl:.90,base:2.4,cv:.35,stockMode:"reorder",weekend:1.30,minQty:10},
  {sku:"VNL-013",name:"Vanili Bubuk 10 g",cat:"Bahan Kue",unit:"pcs",buy:4500,sell:6500,lt:2,sl:.95,base:0,cv:.30,stockMode:"nogap",weekend:1.00,minQty:6}
];

function makeDefaultData() {
  var today = startOfDay(new Date());
  var DAY = 86400000;
  var settings = {
    storeName: "Toko Berkah Jaya",
    address: "Jl. Melati No. 12, Yogyakarta",
    defaultServiceLevel: 0.95,
    defaultLeadTime: 2,
    orderCost: 40000,
    holdingPct: 15,
    yellowFactor: 1.5,
    historyDays: 90,
    maxCycleDays: 14,
    minHistoryDays: MIN_HISTORY_DAYS,
    manual: {mode:"interval", intervalDays:15, threshold:10, orderQty:0}
  };
  var rnd = mulberry32(SEED_KEY);
  var products = [];
  var transactions = [];
  var pid = 1, tid = 1;

  PRODUCT_SEEDS.forEach(function (seed) {
    var created = new Date(today.getTime() - (95 + Math.floor(rnd() * 10)) * DAY);
    var createdStr = fmtDateStr(created);
    if (seed.base <= 0) {
      created = new Date(today.getTime() - 5 * DAY);
      createdStr = fmtDateStr(created);
    }
    var id = "p" + (pid++);
    var p = {
      id: id,
      sku: seed.sku,
      name: seed.name,
      category: seed.cat,
      unit: seed.unit,
      stock: 0,
      buyPrice: seed.buy,
      sellPrice: seed.sell,
      leadTime: seed.lt,
      serviceLevel: seed.sl,
      expiryDate: "",
      createdAt: createdStr,
      note: ""
    };
    if (seed.base > 0) {
      var demand = [];
      for (var i = 0; i < 90; i++) {
        var day = new Date(today.getTime() - (89 - i) * DAY);
        var dow = day.getDay();
        var wk = (dow === 0 || dow === 6) ? seed.weekend : 1;
        var mu = seed.base * wk;
        var z = Math.min(2.2, boxMuller(rnd));
        var v = Math.max(0, Math.round(mu + z * mu * seed.cv));
        demand.push({day: day, v: v});
      }
      demand.forEach(function (dd) {
        transactions.push({id:"t" + (tid++), date: fmtDateStr(dd.day), productId: id, type: "out", qty: dd.v, note: "Penjualan"});
      });
      [18, 45, 72].forEach(function (ri) {
        if (!demand[ri]) return;
        var q = Math.max(seed.minQty, Math.round(seed.minQty * (1 + rnd() * 0.6)));
        transactions.push({id:"t" + (tid++), date: fmtDateStr(demand[ri].day), productId: id, type: "in", qty: q, note: "Pembelian restok"});
      });
    }
    var st = computeStats(p, transactions, settings, 90);
    var stock = 0;
    if (seed.stockMode === "habis") {
      stock = 0;
    } else if (seed.stockMode === "reorder") {
      stock = Math.max(1, Math.round((st.rop || 5) * (0.5 + rnd() * 0.45)));
    } else if (seed.stockMode === "waspada") {
      stock = Math.max(2, Math.round((st.rop || 5) * (1.05 + rnd() * 0.45)));
    } else if (seed.stockMode === "aman") {
      stock = Math.round((st.rop || 5) * (2.5 + rnd() * 2));
    } else {
      stock = 20;
    }
    p.stock = stock;
    products.push(p);
  });

  return {
    settings: settings,
    products: products,
    transactions: transactions,
    notifications: []
  };
}