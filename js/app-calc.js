function startOfDay(d) {
  var x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDateStr(d) {
  var x = startOfDay(d);
  var m = String(x.getMonth() + 1).padStart(2, "0");
  var day = String(x.getDate()).padStart(2, "0");
  return x.getFullYear() + "-" + m + "-" + day;
}

function parseISODate(s) {
  if (!s) return null;
  var p = String(s).slice(0, 10).split("-");
  if (p.length !== 3) return null;
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function meanOf(a) {
  if (!a.length) return 0;
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

function sumOf(a) {
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i];
  return s;
}

function sampleStd(a) {
  var n = a.length;
  if (n < 2) return 0;
  var m = meanOf(a);
  var s = 0;
  for (var i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / (n - 1));
}

function zFor(sl) {
  var k = Number(sl);
  if (Z_TABLE[k]) return Z_TABLE[k];
  if (k >= 0.99) return 2.33;
  if (k >= 0.95) return 1.65;
  return 1.28;
}

function r1(x) {
  return Math.round(x * 10) / 10;
}

function demandSeries(product, transactions, days, today) {
  today = startOfDay(today || new Date());
  var dayMs = 86400000;
  var winStartRaw = today.getTime() - (days - 1) * dayMs;
  var created = product.createdAt ? startOfDay(parseISODate(product.createdAt) || new Date(0)).getTime() : 0;
  var ws = Math.max(created, winStartRaw);
  if (created === 0) ws = winStartRaw;
  var map = {};
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (t.productId !== product.id) continue;
    if (t.type !== "out") continue;
    var key = String(t.date).slice(0, 10);
    map[key] = (map[key] || 0) + (t.qty || 0);
  }
  var dates = [], qty = [];
  var ts = ws;
  while (ts <= today.getTime()) {
    var key2 = fmtDateStr(new Date(ts));
    dates.push(key2);
    qty.push(map[key2] || 0);
    ts += dayMs;
  }
  return {dates: dates, qty: qty, n: dates.length, total: sumOf(qty)};
}

function computeStats(product, transactions, settings, daysOpt) {
  var days = daysOpt || settings.historyDays || 90;
  var ser = demandSeries(product, transactions, days);
  var n = ser.n;
  var total = ser.total;
  var enough = n >= (settings.minHistoryDays || MIN_HISTORY_DAYS) && total > 0;
  var d = enough ? r1(total / n) : 0;
  var sigma = enough ? r1(sampleStd(ser.qty)) : 0;
  var L = (product.leadTime && product.leadTime > 0) ? product.leadTime : (settings.defaultLeadTime || 1);
  var Z = zFor(product.serviceLevel != null ? product.serviceLevel : settings.defaultServiceLevel);
  var ss = null, rop = null;
  if (enough) {
    ss = r1(Z * sigma * Math.sqrt(L));
    rop = r1(d * L + ss);
  }
  var D = d * 365;
  var S = settings.orderCost || 0;
  var Hper = (product.buyPrice || 0) * (settings.holdingPct || 0) / 100;
  var eoq = null;
  if (enough && D > 0 && S > 0 && Hper > 0) {
    var e = Math.sqrt(2 * D * S / Hper);
    if (isFinite(e) && e > 0) eoq = Math.round(e);
  }
  var maxCycleDays = settings.maxCycleDays || 14;
  var cycle;
  if (enough && d > 0) {
    var cap = Math.ceil(d * maxCycleDays);
    var minC = Math.ceil(d * (L + 1));
    var est = eoq || Math.ceil(d * L * 2);
    cycle = Math.max(minC, Math.min(est, cap));
  } else {
    cycle = Math.max(1, Math.round(d * L * 2));
  }
  var targetMax = enough ? Math.round(rop + cycle) : null;
  var rec = null;
  if (enough && targetMax != null) {
    rec = Math.max(0, Math.ceil(targetMax - (product.stock || 0)));
  }
  return {
    n: n, total: total, enough: enough, d: d, sigma: sigma,
    L: L, Z: Z, ss: ss, rop: rop, eoq: eoq, cycle: cycle,
    targetMax: targetMax, rec: rec, minDays: settings.minHistoryDays || MIN_HISTORY_DAYS
  };
}

function suggestOrderQty(stats, stock) {
  if (stats.enough && stats.rec != null && stats.rec > 0) return stats.rec;
  if (stats.enough && stats.targetMax != null) {
    return Math.max(1, Math.ceil(stats.targetMax - (stock || 0)));
  }
  return Math.max(1, Math.ceil((stats.d || 0) * (1 + (stats.L || 1))));
}

function runPolicy(demand, init, L, Q, ROP, mode, interval, threshold) {
  var n = demand.length;
  var stock = init;
  var pending = -1, pendQty = 0;
  var log = [];
  for (var t = 0; t < n; t++) {
    if (pending === t) {
      stock += pendQty;
      pending = -1;
      pendQty = 0;
    }
    var start = stock;
    var trig = false;
    if (pending === -1) {
      if (mode === "rop") {
        if (ROP != null && ROP >= 0 && stock > 0 && stock <= ROP) {
          trig = true;
        }
      } else if (mode === "interval") {
        if (interval > 0 && t % interval === 0) {
          trig = true;
        }
      } else {
        if (stock > 0 && stock < threshold) {
          trig = true;
        }
      }
      if (trig) {
        pending = t + L;
        pendQty = Q;
      }
    }
    var dem = demand[t];
    var short = Math.max(0, dem - stock);
    var end = Math.max(0, stock - dem);
    log.push({t: t, start: start, trig: trig, dem: dem, short: short, end: end});
    stock = end;
  }
  return log;
}

function runRopPolicy(demand, init, L, ROP, Q) {
  return runPolicy(demand, init, L, Q, ROP, "rop", 0, 0);
}

function runManualPolicy(demand, init, L, Q, cfg) {
  var mode = cfg && cfg.mode === "interval" ? "interval" : "threshold";
  var interval = cfg && cfg.intervalDays > 0 ? cfg.intervalDays : 15;
  var threshold = cfg && cfg.threshold >= 0 ? cfg.threshold : 12;
  return runPolicy(demand, init, L, Q, null, mode, interval, threshold);
}

function metricsOf(log, buyPrice, holdingPct, rop, qty) {
  var totalDemand = 0, totalShort = 0, stockoutDays = 0, endSum = 0;
  for (var i = 0; i < log.length; i++) {
    totalDemand += log[i].dem;
    var sh = log[i].short;
    totalShort += sh;
    if (sh > 0) stockoutDays++;
    endSum += log[i].end;
  }
  var n = log.length || 1;
  var avgStock = r1(endSum / n);
  var overThr = (rop || 0) + (qty || 0);
  var overDays = 0;
  var costSum = 0;
  for (var j = 0; j < log.length; j++) {
    if (log[j].end > overThr) overDays++;
    costSum += log[j].end;
  }
  var avgForCost = n ? costSum / n : 0;
  var holdCost = r1(avgForCost * (buyPrice || 0) * (holdingPct || 0) / 100 * (n / 365));
  var fillRate = totalDemand > 0 ? r1((1 - totalShort / totalDemand) * 100) : 100;
  return {
    totalDemand: totalDemand,
    totalShort: totalShort,
    stockoutDays: stockoutDays,
    avgStock: avgStock,
    overstockDays: overDays,
    fillRate: fillRate,
    holdingCost: holdCost
  };
}

function accuracyOf(log, L) {
  var triggers = 0, timely = 0;
  var ldm = 0;
  var runs = [], run = null;
  for (var t = 0; t < log.length; t++) {
    var e = log[t];
    if (e.trig) {
      triggers++;
      var win = 0;
      for (var k = t; k < t + L && k < log.length; k++) win += log[k].dem;
      if (e.start >= win) timely++;
    }
    if (e.short > 0) {
      if (!run) run = {start: t, ok: false};
    } else {
      if (run) {
        runs.push(run);
        run = null;
      }
    }
  }
  if (run) runs.push(run);
  var missed = 0;
  for (var r = 0; r < runs.length; r++) {
    var s = runs[r].start;
    var covered = false;
    for (var tt = 0; tt <= s - L; tt++) {
      if (log[tt] && log[tt].trig) {
        var w = 0;
        for (var k2 = tt; k2 < tt + L && k2 < log.length; k2++) w += log[k2].dem;
        if (log[tt].start >= w) { covered = true; break; }
      }
    }
    if (covered) runs[r].ok = true; else missed++;
  }
  var detected = runs.length - missed;
  return {
    triggers: triggers,
    timely: timely,
    precision: triggers > 0 ? r1(timely / triggers * 100) : null,
    runs: runs.length,
    detected: detected,
    missed: missed,
    detectionRate: runs.length > 0 ? r1(detected / runs.length * 100) : 100
  };
}

function niceMax(v) {
  if (v <= 0) return 1;
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  var n = v / p;
  if (n <= 1) v = 1; else if (n <= 2) v = 2; else if (n <= 5) v = 5; else v = 10;
  return v * p;
}