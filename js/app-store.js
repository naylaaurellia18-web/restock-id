var Store = {
  data: null,
  statsCache: {},
  sim: null,
  txId: 9001,
  notifSerial: 1,
  poSerial: 1,
  persistTimer: null,

  init: function () {
    this.data = makeDefaultData();
    this._recalc();
  },

  initAsync: function (cb) {
    if (!this.data) this.init();
    if (typeof fetch !== "function") {
      if (cb) cb(false);
      return;
    }
    var self = this;
    fetch("api/state", {headers: {Accept: "application/json"}})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (state) {
        if (state && state.products && state.products.length) {
          state.settings = state.settings && Object.keys(state.settings).length ? state.settings : self.data.settings;
          state.transactions = state.transactions || [];
          state.notifications = state.notifications || [];
          self.data = state;
          self.txId = (state.meta && state.meta.txId) ? Number(state.meta.txId) : 9001;
          self.notifSerial = (state.meta && state.meta.notifSerial) ? Number(state.meta.notifSerial) : 1;
          self.poSerial = (state.meta && state.meta.poSerial) ? Number(state.meta.poSerial) : 1;
          self._recalc();
          if (cb) cb(true);
        } else {
          self._persistNow();
          if (cb) cb(false);
        }
      })
      .catch(function () {
        if (cb) cb(false);
      });
  },

  _persistPayload: function () {
    return {
      settings: this.data.settings,
      products: this.data.products,
      transactions: this.data.transactions,
      notifications: this.data.notifications,
      meta: {txId: this.txId, notifSerial: this.notifSerial, poSerial: this.poSerial}
    };
  },

  _persistNow: function () {
    if (typeof fetch !== "function") return;
    var self = this;
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    fetch("api/state", {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(this._persistPayload())
    }).catch(function () {});
  },

  _persistSoon: function () {
    if (typeof fetch !== "function") return;
    var self = this;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(function () {
      self.persistTimer = null;
      self._persistNow();
    }, 400);
  },

  reset: function () {
    this.data = makeDefaultData();
    this.sim = null;
    this.statsCache = {};
    this.txId = 9001;
    this.notifSerial = 1;
    this._recalc();
    this._persistNow();
  },

  _recalc: function () {
    this.statsCache = {};
    this.refreshNotifications();
  },

  settings: function () { return this.data.settings; },
  products: function () { return this.data.products; },
  transactions: function () { return this.data.transactions; },
  notifications: function () { return this.data.notifications; },

  getProduct: function (id) {
    for (var i = 0; i < this.data.products.length; i++) {
      if (this.data.products[i].id === id) return this.data.products[i];
    }
    return null;
  },

  computeStats: function (product, daysOpt) {
    var days = daysOpt || this.settings().historyDays;
    var key = product.id + ":" + days;
    if (this.statsCache[key]) return this.statsCache[key];
    var st = computeStats(product, this.data.transactions, this.settings(), days);
    this.statsCache[key] = st;
    return st;
  },

  computeStatsAll: function (daysOpt) {
    var m = {};
    var self = this;
    this.data.products.forEach(function (p) {
      m[p.id] = self.computeStats(p, daysOpt);
    });
    return m;
  },

  addProduct: function (f) {
    var self = this;
    var exists = false;
    this.data.products.forEach(function (p) {
      if (p.sku === f.sku) exists = true;
    });
    if (exists) return {ok: false, error: "SKU sudah digunakan, gunakan kode lain."};
    var id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
    var p = {
      id: id,
      sku: f.sku,
      name: f.name,
      category: f.category,
      unit: f.unit,
      stock: Number(f.stock) || 0,
      buyPrice: Number(f.buyPrice) || 0,
      sellPrice: Number(f.sellPrice) || 0,
      leadTime: Number(f.leadTime) || 1,
      serviceLevel: Number(f.serviceLevel) || 0.95,
      expiryDate: f.expiryDate || "",
      createdAt: fmtDateStr(new Date()),
      note: f.note || ""
    };
    this.data.products.push(p);
    this._recalc();
    this._persistSoon();
    return {ok: true, product: p};
  },

  updateProduct: function (id, f) {
    var p = this.getProduct(id);
    if (!p) return {ok: false, error: "Produk tidak ditemukan."};
    var self = this;
    var exists = false;
    this.data.products.forEach(function (q) {
      if (q.id !== id && q.sku === f.sku) exists = true;
    });
    if (exists) return {ok: false, error: "SKU sudah digunakan produk lain."};
    p.sku = f.sku;
    p.name = f.name;
    p.category = f.category;
    p.unit = f.unit;
    p.stock = Number(f.stock) || 0;
    p.buyPrice = Number(f.buyPrice) || 0;
    p.sellPrice = Number(f.sellPrice) || 0;
    p.leadTime = Number(f.leadTime) || 1;
    p.serviceLevel = Number(f.serviceLevel) || 0.95;
    p.expiryDate = f.expiryDate || "";
    p.note = f.note || "";
    this._recalc();
    this._persistSoon();
    return {ok: true, product: p};
  },

  removeProduct: function (id) {
    this.data.products = this.data.products.filter(function (p) { return p.id !== id; });
    this.data.transactions = this.data.transactions.filter(function (t) { return t.productId !== id; });
    this.data.notifications = this.data.notifications.filter(function (n) { return n.productId !== id; });
    this.statsCache = {};
    this._persistSoon();
    return true;
  },

  addTransaction: function (f) {
    var p = this.getProduct(f.productId);
    if (!p) return {ok: false, error: "Produk tidak ditemukan."};
    var qty = Number(f.qty);
    if (!qty || qty <= 0) return {ok: false, error: "Jumlah harus lebih dari 0."};
    if (f.type === "out" && qty > p.stock) {
      return {ok: false, error: "Stok tidak mencukupi. Stok " + p.name + " saat ini " + p.stock + " " + p.unit + "."};
    }
    var date = f.date || fmtDateStr(new Date());
    if (f.type === "in") {
      p.stock += qty;
    } else {
      p.stock -= qty;
    }
    var t = {
      id: "tx" + (this.txId++),
      date: date,
      productId: f.productId,
      type: f.type,
      qty: qty,
      note: f.note || (f.type === "in" ? "Pembelian / restok" : "Penjualan")
    };
    this.data.transactions.push(t);
    this._recalc();
    var open = this.openNotifFor(f.productId);
    if (open && p.stock > this.computeStats(p).rop) {
      open.status = "selesai";
    }
    this._persistSoon();
    return {ok: true, txn: t, product: p};
  },

  openNotifFor: function (productId) {
    for (var i = 0; i < this.data.notifications.length; i++) {
      var n = this.data.notifications[i];
      if (n.productId === productId && (n.status === "baru" || n.status === "dipesan")) return n;
    }
    return null;
  },

  refreshNotifications: function () {
    var self = this;
    var added = 0;
    this.data.products.forEach(function (p) {
      var st = self.computeStats(p);
      if (!st.enough || st.rop == null) return;
      if (p.stock > st.rop) return;
      if (self.openNotifFor(p.id)) return;
      var qty = suggestOrderQty(st, p.stock);
      self.data.notifications.push({
        id: "n" + (self.notifSerial++),
        productId: p.id,
        date: fmtDateStr(new Date()),
        stockAtNotify: p.stock,
        rop: st.rop,
        suggestedQty: qty,
        status: "baru",
        eta: st.d > 0 ? Math.max(0, Math.floor(p.stock / st.d)) : 0
      });
      added++;
    });
    if (added > 0) this._persistSoon();
  },

  setNotifStatus: function (id, status) {
    for (var i = 0; i < this.data.notifications.length; i++) {
      if (this.data.notifications[i].id === id) {
        this.data.notifications[i].status = status;
        this._persistSoon();
        return true;
      }
    }
    return false;
  },

  markAllOrdered: function () {
    var changed = false;
    this.data.notifications.forEach(function (n) {
      if (n.status === "baru") { n.status = "dipesan"; changed = true; }
    });
    if (changed) this._persistSoon();
  },

  buildPurchaseOrder: function () {
    var items = [];
    var tot = 0;
    var self = this;
    this.data.notifications.forEach(function (n) {
      if (n.status !== "baru") return;
      var p = self.getProduct(n.productId);
      if (!p) return;
      var qty = n.suggestedQty;
      items.push({
        notifId: n.id, sku: p.sku, name: p.name, unit: p.unit,
        qty: qty, price: p.buyPrice, sub: qty * p.buyPrice
      });
      tot += qty * p.buyPrice;
    });
    var po = {no: "PO-" + fmtDateStr(new Date()).replace(/-/g, "") + "-" + (this.poSerial++), date: fmtDateStr(new Date()), items: items, total: tot};
    this._persistSoon();
    return po;
  },

  runSimulation: function (periodDays) {
    var cfg = this.settings();
    var self = this;
    var rows = [];
    var accSum = {triggers: 0, timely: 0, runs: 0, detected: 0};
    var agg = {
      rop: {stockoutDays: 0, totalShort: 0, totalDemand: 0, avgSum: 0, overDays: 0, cost: 0},
      man: {stockoutDays: 0, totalShort: 0, totalDemand: 0, avgSum: 0, overDays: 0, cost: 0}
    };
    var skipped = 0, used = 0;
    var traj = {};

    this.data.products.forEach(function (p) {
      var st = self.computeStats(p, periodDays);
      if (!st.enough || st.rop == null || st.d <= 0) {
        skipped++;
        return;
      }
      used++;
      var ser = demandSeries(p, self.data.transactions, periodDays);
      var L = (p.leadTime && p.leadTime > 0) ? p.leadTime : cfg.defaultLeadTime;
      var Q = (cfg.manual.orderQty > 0) ? cfg.manual.orderQty : suggestOrderQty(st, p.stock);
      var init = Math.round(st.rop + Q);

      var ropLog = runRopPolicy(ser.qty, init, L, st.rop, Q);
      var manLog = runManualPolicy(ser.qty, init, L, Q, cfg.manual);
      var mop = metricsOf(ropLog, p.buyPrice, cfg.holdingPct, st.rop, Q);
      var mman = metricsOf(manLog, p.buyPrice, cfg.holdingPct, st.rop, Q);
      var acc = accuracyOf(ropLog, L);

      accSum.triggers += acc.triggers;
      accSum.timely += acc.timely;
      accSum.runs += acc.runs;
      accSum.detected += acc.detected;

      agg.rop.stockoutDays += mop.stockoutDays;
      agg.rop.totalShort += mop.totalShort;
      agg.rop.totalDemand += mop.totalDemand;
      agg.rop.avgSum += mop.avgStock;
      agg.rop.overDays += mop.overstockDays;
      agg.rop.cost += mop.holdingCost;
      agg.man.stockoutDays += mman.stockoutDays;
      agg.man.totalShort += mman.totalShort;
      agg.man.totalDemand += mman.totalDemand;
      agg.man.avgSum += mman.avgStock;
      agg.man.overDays += mman.overstockDays;
      agg.man.cost += mman.holdingCost;

      rows.push({
        sku: p.sku, name: p.name, unit: p.unit,
        d: st.d, rop: st.rop, lt: L, qty: Q,
        stockout: mman.stockoutDays,
        stockoutRop: mop.stockoutDays,
        fill: mman.fillRate,
        fillRop: mop.fillRate,
        avg: mman.avgStock,
        avgRop: mop.avgStock,
        over: mman.overstockDays,
        overRop: mop.overstockDays,
        cost: mman.holdingCost,
        costRop: mop.holdingCost,
        acc: acc,
        traj: {
          date: ser.dates,
          man: manLog.map(function (e) { return e.end; }),
          rop: ropLog.map(function (e) { return e.end; }),
          ropLine: st.rop, qty: Q
        }
      });
      traj[p.sku] = {name: p.name, date: ser.dates, man: manLog.map(function (e) { return e.end; }), rop: ropLog.map(function (e) { return e.end; }), ropLine: st.rop, qty: Q};
    });

    var fillMan = agg.man.totalDemand > 0 ? r1((1 - agg.man.totalShort / agg.man.totalDemand) * 100) : 100;
    var fillRop = agg.rop.totalDemand > 0 ? r1((1 - agg.rop.totalShort / agg.rop.totalDemand) * 100) : 100;
    var avgMan = used ? r1(agg.man.avgSum / used) : 0;
    var avgRop = used ? r1(agg.rop.avgSum / used) : 0;
    var precision = accSum.triggers > 0 ? r1(accSum.timely / accSum.triggers * 100) : null;
    var detectionRate = accSum.runs > 0 ? r1(accSum.detected / accSum.runs * 100) : 100;

    var verdict = {level: "no", title: "", text: ""};
    var outDiff = agg.man.stockoutDays - agg.rop.stockoutDays;
    var betterOver = agg.rop.overDays <= agg.man.overDays;
    var betterAvg = avgRop <= avgMan * 1.05;
    var betterCost = agg.rop.cost <= agg.man.cost;
    var effBetter = betterOver || betterAvg || betterCost;
    var fmtRp = function (x) { return "Rp" + Math.round(x).toLocaleString("id-ID"); };
    if (outDiff > 0) {
      var full = agg.rop.stockoutDays === 0;
      verdict.level = full ? "ok" : "part";
      verdict.title = full ? "Hipotesis terdukung penuh" : "Hipotesis terdukung (sebagian besar)";
      verdict.text = "Metode ROP mengurangi kehabisan stok " + outDiff + " hari dibandingkan metode manual (" + agg.man.stockoutDays + " &rarr; " + agg.rop.stockoutDays + " hari) dengan tingkat layanan yang sama atau lebih baik. " + (full ? "Sepanjang periode simulasi metode ROP tidak mengalami kehabisan stok sama sekali. " : "") + (effBetter ? "Rata-rata stok, hari kelebihan stok, dan biaya simpan juga kompetitif (avg " + avgMan + " &rarr; " + avgRop + "; over " + agg.man.overDays + " &rarr; " + agg.rop.overDays + "; cost " + fmtRp(agg.man.cost) + " &rarr; " + fmtRp(agg.rop.cost) + ")." : "Namun rata-rata stok ROP sedikit lebih tinggi; periksa kuantitas pesanan (batas siklus) dan target stok maksimum.");
    } else if (effBetter) {
      verdict.level = "part";
      verdict.title = "Hipotesis terdukung (dimensi efisiensi)";
      verdict.text = "Tingkat kehabisan stok kedua metode setara (" + agg.man.stockoutDays + " hari), namun metode ROP beroperasi dengan persediaan lebih efisien: rata-rata stok " + avgMan + " &rarr; " + avgRop + " unit, hari kelebihan stok " + agg.man.overDays + " &rarr; " + agg.rop.overDays + ", biaya simpan " + fmtRp(agg.man.cost) + " &rarr; " + fmtRp(agg.rop.cost) + ".";
    } else {
      verdict.level = "no";
      verdict.title = "Hipotesis belum terdukung pada parameter ini";
      verdict.text = "Hasil pada parameter metode manual dan periode yang dipilih belum menunjukkan perbaikan yang jelas. Coba ubah parameter metode manual (misalnya interval/ambang yang lebih wajar), sesuaikan batas siklus pemesanan (kuantitas pesanan), atau perpanjang periode simulasi.";
    }

    this.sim = {
      period: periodDays,
      used: used,
      skipped: skipped,
      rows: rows,
      traj: traj,
      acc: {
        triggers: accSum.triggers, timely: accSum.timely, precision: precision,
        runs: accSum.runs, detected: accSum.detected,
        missed: accSum.runs - accSum.detected, detectionRate: detectionRate
      },
      agg: {
        man: {stockoutDays: agg.man.stockoutDays, fillRate: fillMan, avgStock: avgMan, overDays: agg.man.overDays, cost: r1(agg.man.cost)},
        rop: {stockoutDays: agg.rop.stockoutDays, fillRate: fillRop, avgStock: avgRop, overDays: agg.rop.overDays, cost: r1(agg.rop.cost)}
      },
      verdict: verdict
    };
    return this.sim;
  },

  exportJSON: function () {
    return JSON.stringify({
      settings: this.data.settings,
      products: this.data.products,
      transactions: this.data.transactions,
      notifications: this.data.notifications,
      meta: {txId: this.txId, notifSerial: this.notifSerial, poSerial: this.poSerial}
    }, null, 2);
  },

  _recomputeIds: function () {
    var mtx = 0, mn = 0;
    this.data.transactions.forEach(function (t) {
      var id = String(t.id || "");
      if (id.indexOf("tx") === 0) {
        var n = parseInt(id.slice(2), 10);
        if (!isNaN(n) && n > mtx) mtx = n;
      }
    });
    this.data.notifications.forEach(function (n) {
      var id = String(n.id || "");
      if (id.indexOf("n") === 0) {
        var v = parseInt(id.slice(1), 10);
        if (!isNaN(v) && v > mn) mn = v;
      }
    });
    this.txId = mtx + 1;
    this.notifSerial = mn + 1;
    this.poSerial = 1;
  }
};