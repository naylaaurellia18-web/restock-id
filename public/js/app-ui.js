var COLOR = {
  primary: "#0d9488",
  teal: "#0f766e",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#dc2626",
  gray: "#94a3b8"
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nf() {
  return new Intl.NumberFormat("id-ID");
}

function fmtNum(x) {
  var v = Math.round((Number(x) || 0) * 100) / 100;
  return nf().format(v);
}

function cur(x) {
  return "Rp " + nf().format(Math.round(Number(x) || 0));
}

var MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function fmtDateLabel(dstr) {
  var d = parseISODate(dstr);
  if (!d) return dstr || "-";
  return d.getDate() + " " + MONTHS_ID[d.getMonth()] + " " + d.getFullYear();
}

function statusOf(p, st) {
  if (!st) return "nodata";
  if (!st.enough || st.rop == null) return "nodata";
  var yellowN = Store.settings().yellowFactor || 1.5;
  if (p.stock <= 0) return "habis";
  if (p.stock <= st.rop) return "reorder";
  if (p.stock <= st.rop * yellowN) return "waspada";
  return "aman";
}

function statusBadge(status) {
  var m = {
    aman: ["badge badge-green", "Aman"],
    waspada: ["badge badge-yellow", "Waspada"],
    reorder: ["badge badge-orange", "Perlu Reorder"],
    habis: ["badge badge-red", "Habis"],
    nodata: ["badge badge-gray", "Data belum cukup"]
  };
  var c = m[status] || m.nodata;
  return '<span class="' + c[0] + '">' + c[1] + "</span>";
}

function toast(msg, type) {
  var root = document.getElementById("toast-root");
  var el = document.createElement("div");
  el.className = "toast" + (type === "success" ? " success" : type === "error" ? " error" : "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
  }, 3200);
}

function openModal(cfg) {
  var root = document.getElementById("modal-root");
  var wide = cfg.wide ? " wide" : "";
  root.innerHTML = '<div class="modal-back"><div class="modal' + wide + '">' +
    '<div class="modal-head"><h3>' + cfg.title + "</h3>" +
    '<button class="icon-btn" onclick="closeModal()" title="Tutup">&#10005;</button></div>' +
    '<div class="modal-body">' + (cfg.body || "") + "</div>" +
    (cfg.foot ? '<div class="modal-foot">' + cfg.foot + "</div>" : "") +
    "</div></div>";
  document.body.classList.add("modal-open");
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
}

function confirmDialog(title, msg, onYes, okLabel, danger) {
  var label = okLabel || "Ya, lanjutkan";
  var btn = danger ? '" class="btn btn-danger' : '" class="btn btn-primary';
  openModal({
    title: title,
    body: "<p>" + msg + "</p>",
    foot: '<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button' + btn + ' onclick="A.confirmYes(fn)">' + esc(label) + "</button>"
  });
  A.confirmYes = function () {
    closeModal();
    onYes();
  };
}

function csvEscape(v) {
  var s = String(v == null ? "" : v);
  if (/[",\n;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCSV(filename, headers, rows) {
  var lines = [headers.map(csvEscape).join(",")];
  rows.forEach(function (r) {
    lines.push(r.map(csvEscape).join(","));
  });
  var blob = new Blob(["\ufeff" + lines.join("\r\n")], {type: "text/csv;charset=utf-8"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

function parseCSV(text) {
  var rows = [];
  var cur = "", row = [], inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === "," || c === ";") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter(function (r) { return r.length > 1 && r.join("").replace(/^\s+|\s+$/g, "").length > 0; });
}

function printHTML(title, bodyHTML) {
  var iframe = document.getElementById("print-frame");
  var doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>" +
    "body{font-family:system-ui,Arial,sans-serif;color:#0f172a;margin:28px;font-size:13px}" +
    "h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 8px;border-bottom:2px solid #1e3a8a;padding-bottom:4px}" +
    "table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:12px}" +
    "th{background:#f1f5f9}.num{text-align:right}.meta{color:#475569;font-size:11px;margin:2px 0}hr{border:none;border-top:1px solid #e2e8f0;margin:14px 0}.ttd{margin-top:46px;display:flex;justify-content:space-between}.ttd div{width:180px;text-align:center}.ttd .sp{height:50px}</style></head><body>" +
    "<h1>" + esc(Store.settings().storeName) + "</h1>" +
    "<div class='meta'>" + esc(Store.settings().address || "") + "</div>" +
    "<div class='meta'>Dibuat: " + fmtDateStr(new Date()) + " &bull; " + esc(title) + "</div>" +
    "<hr>" + bodyHTML + "</body></html>";
  iframe.setAttribute("srcdoc", doc);
  iframe.onload = function () {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
  };
  iframe.hidden = false;
}

function chartFrame(w, h, opts) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" font-family="system-ui,Arial,sans-serif">' + (opts || "") + "</svg>";
}

function renderLine(elId, labels, series, opts) {
  opts = opts || {};
  var el = document.getElementById(elId);
  if (!el) return;
  var H = opts.height || 240;
  var W = Math.max(520, labels.length * 42);
  var mL = opts.noAxis ? 8 : 52, mR = 18, mT = 18, mB = 30;
  var iw = W - mL - mR, ih = H - mT - mB;
  var allV = [];
  series.forEach(function (s) { allV = allV.concat(s.values); });
  var maxY = niceMax(Math.max(1, Math.max.apply(null, allV)));
  var x = function (i) { return mL + iw * (labels.length > 1 ? i / (labels.length - 1) : 0.5); };
  var y = function (v) { return mT + ih - (v / maxY) * ih * 0.94; };
  var parts = [];
  if (!opts.noAxis) {
    parts.push('<text x="' + (mL - 10) + '" y="' + (mT + 10) + '" font-size="11" fill="#64748b" text-anchor="end">' + maxY + "</text>");
    parts.push('<text x="' + (mL - 10) + '" y="' + (mT + ih - 4) + '" font-size="11" fill="#64748b" text-anchor="end">0</text>');
    [0.5, 1].forEach(function (f) {
      var yy = mT + ih * (1 - f * 0.94);
      parts.push('<line x1="' + mL + '" y1="' + yy + '" x2="' + (W - mR) + '" y2="' + yy + '" stroke="#eef2f7" />');
      parts.push('<text x="' + (mL - 10) + '" y="' + (yy + 4) + '" font-size="11" fill="#64748b" text-anchor="end">' + fmtShortNum(maxY * f) + "</text>");
    });
  }
  if (opts.threshold) {
    var th = opts.threshold.value, tc = opts.threshold.color || COLOR.orange, tl = opts.threshold.label || "ROP";
    var ty = y(th);
    if (ty > mT && ty < mT + ih) {
      parts.push('<line x1="' + mL + '" y1="' + ty + '" x2="' + (W - mR) + '" y2="' + ty + '" stroke="' + tc + '" stroke-width="1.6" stroke-dasharray="6 4" />');
      parts.push('<text x="' + (W - mR - 4) + '" y="' + (ty - 5) + '" font-size="11" font-weight="700" fill="' + tc + '" text-anchor="end">' + esc(tl) + " " + fmtNum(th) + "</text>");
    }
  }
  var step = Math.max(1, Math.ceil(labels.length / 10));
  for (var i = 0; i < labels.length; i += step) {
    var xi = x(i);
    parts.push('<text x="' + xi + '" y="' + (H - 8) + '" font-size="10.5" fill="#64748b" text-anchor="middle">' + esc(shortLabel(labels[i])) + "</text>");
  }
  series.forEach(function (s) {
    var pts = s.values.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
    parts.push('<polyline points="' + pts + '" fill="none" stroke="' + (s.color || COLOR.primary) + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />');
    if (opts.fill) {
      var pts2 = x(0) + "," + (mT + ih) + " " + pts + " " + x(labels.length - 1) + "," + (mT + ih);
      parts.push('<polygon points="' + pts2 + '" fill="' + (s.color || COLOR.primary) + '" opacity="0.12" stroke="none" />');
    }
    s.values.forEach(function (v, i) {
      if (step > 1 && i % step !== 0 && i !== labels.length - 1) return;
      parts.push('<g><circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="#fff" stroke="' + (s.color || COLOR.primary) + '" stroke-width="1.8"><title>' + esc((s.name ? s.name + " - " : "") + labels[i]) + ": " + fmtNum(v) + "</title></circle></g>");
    });
  });
  el.innerHTML = '<div class="legend">' + series.map(function (s) {
    return '<span class="lg-item"><span class="lg-dot" style="background:' + (s.color || COLOR.primary) + '"></span>' + esc(s.name || "") + "</span>";
  }).join("") + "</div>" + chartFrame(W, H, parts.join(""));
  if (series.length > 1) el.classList.add("has-legend");
}

function renderGroupedBar(elId, labels, colA, colB, aName, bName, opts) {
  opts = opts || {};
  var el = document.getElementById(elId);
  if (!el) return;
  var H = opts.height || 250;
  var W = Math.max(480, labels.length * 84);
  var mL = opts.noAxis ? 8 : 46, mR = 14, mT = 22, mB = 34;
  var iw = W - mL - mR, ih = H - mT - mB;
  var all = colA.concat(colB).map(function (v) { return Number(v) || 0; });
  var maxY = niceMax(Math.max(1, Math.max.apply(null, all)));
  var parts = [];
  if (!opts.noAxis) {
    parts.push('<text x="' + (mL - 8) + '" y="' + (mT + 8) + '" font-size="11" fill="#64748b" text-anchor="end">' + fmtShortNum(maxY) + "</text>");
    [0.5, 1].forEach(function (f) {
      var yy = mT + ih * (1 - f * 0.92);
      parts.push('<line x1="' + mL + '" y1="' + yy + '" x2="' + (W - mR) + '" y2="' + yy + '" stroke="#eef2f7" />');
    });
  }
  var step = Math.max(1, Math.ceil(labels.length / 9));
  for (var i = 0; i < labels.length; i++) {
    var gwd = iw / labels.length;
    var bw = Math.min(16, gwd * 0.3);
    var cx = mL + gwd * i + gwd / 2;
    var b1 = (Number(colA[i]) || 0), b2 = (Number(colB[i]) || 0);
    if (opts.norm !== false) {
      if (b1 > 0) {
        var h1 = (b1 / maxY) * ih * 0.92;
        parts.push('<g><rect x="' + (cx - bw - 1.5) + '" y="' + (mT + ih - h1) + '" width="' + bw + '" height="' + h1 + '" rx="3" fill="' + (colA_color() || COLOR.primary) + '" opacity=".88"><title>' + esc(aName) + " - " + esc(labels[i]) + ": " + fmtNum(b1) + "</title></rect></g>");
      }
      if (b2 > 0) {
        var h2 = (b2 / maxY) * ih * 0.92;
        parts.push('<g><rect x="' + (cx + 1.5) + '" y="' + (mT + ih - h2) + '" width="' + bw + '" height="' + h2 + '" rx="3" fill="' + (colB_color() || COLOR.teal) + '" opacity=".88"><title>' + esc(bName) + " - " + esc(labels[i]) + ": " + fmtNum(b2) + "</title></rect></g>");
      }
    } else {
      var maxPair = Math.max(b1, b2) || 1;
      if (b1 > 0) {
        var h1b = (b1 / Math.max(maxPair, 1)) * ih * 0.9;
        parts.push('<g><rect x="' + (cx - bw - 1.5) + '" y="' + (mT + ih - h1b) + '" width="' + bw + '" height="' + h1b + '" rx="3" fill="' + (colA_color() || COLOR.primary) + '"><title>' + esc(aName) + " - " + esc(labels[i]) + ": " + fmtNum(b1) + "</title></rect></g>");
      }
      if (b2 > 0) {
        var h2b = (b2 / Math.max(maxPair, 1)) * ih * 0.9;
        parts.push('<g><rect x="' + (cx + 1.5) + '" y="' + (mT + ih - h2b) + '" width="' + bw + '" height="' + h2b + '" rx="3" fill="' + (colB_color() || COLOR.teal) + '"><title>' + esc(bName) + " - " + esc(labels[i]) + ": " + fmtNum(b2) + "</title></rect></g>");
      }
    }
    if (i % step === 0) {
      parts.push('<text x="' + cx + '" y="' + (H - 8) + '" font-size="10.5" fill="#64748b" text-anchor="middle">' + esc(shortLabel(labels[i])) + "</text>");
    }
  }
  function colA_color() { return opts.colorA; }
  function colB_color() { return opts.colorB; }
  el.innerHTML = '<div class="legend">' +
    '<span class="lg-item"><span class="lg-dot" style="background:' + (opts.colorA || COLOR.primary) + '"></span>' + esc(aName) + "</span>" +
    '<span class="lg-item"><span class="lg-dot" style="background:' + (opts.colorB || COLOR.teal) + '"></span>' + esc(bName) + "</span></div>" +
    chartFrame(W, H, parts.join(""));
}

function renderBar(elId, labels, values, colors, opts) {
  opts = opts || {};
  var el = document.getElementById(elId);
  if (!el) return;
  var H = opts.height || 250;
  var W = Math.max(480, labels.length * 46);
  var mL = opts.noAxis ? 8 : 46, mR = 14, mT = 18, mB = 34;
  var iw = W - mL - mR, ih = H - mT - mB;
  var maxY = niceMax(Math.max(1, Math.max.apply(null, values)));
  var parts = [];
  if (!opts.noAxis) {
    [0.5, 1].forEach(function (f) {
      var yy = mT + ih * (1 - f * 0.92);
      parts.push('<line x1="' + mL + '" y1="' + yy + '" x2="' + (W - mR) + '" y2="' + yy + '" stroke="#eef2f7" />');
    });
  }
  var step = Math.max(1, Math.ceil(labels.length / 9));
  for (var i = 0; i < values.length; i++) {
    var gwd = iw / values.length;
    var bw = Math.max(6, Math.min(30, gwd * 0.6));
    var cx = mL + gwd * i + gwd / 2;
    var v = values[i];
    var h = (v / maxY) * ih * 0.92;
    var c = colors ? colors[i] : COLOR.primary;
    parts.push('<g><rect x="' + (cx - bw / 2) + '" y="' + (mT + ih - h) + '" width="' + bw + '" height="' + h + '" rx="3" fill="' + c + '" opacity=".9"><title>' + esc(labels[i]) + ": " + fmtNum(v) + "</title></rect></g>");
    if (i % step === 0) {
      parts.push('<text x="' + cx + '" y="' + (H - 8) + '" font-size="10.5" fill="#64748b" text-anchor="middle">' + esc(shortLabel(labels[i])) + "</text>");
    }
  }
  if (opts.thresholds) {
    opts.thresholds.forEach(function (th) {
      var ty = mT + ih - (th.value / maxY) * ih * 0.92;
      parts.push('<line x1="' + mL + '" y1="' + ty + '" x2="' + (W - mR) + '" y2="' + ty + '" stroke="' + (th.color || COLOR.orange) + '" stroke-width="1.6" stroke-dasharray="6 4" />');
      parts.push('<text x="' + (W - mR - 4) + '" y="' + (ty - 5) + '" font-size="11" font-weight="700" fill="' + (th.color || COLOR.orange) + '" text-anchor="end">' + esc(th.label || "") + "</text>");
    });
  }
  el.innerHTML = chartFrame(W, H, parts.join(""));
}

function shortLabel(s) {
  s = String(s || "");
  return s.length > 14 ? s.slice(0, 12) + ".." : s;
}

function fmtShortNum(v) {
  v = Number(v) || 0;
  if (v >= 1e6) return fmtNum(v / 1e6) + " jt";
  if (v >= 1e3) return fmtNum(v / 1e3) + " rb";
  return fmtNum(v);
}

function emptyState(msg) {
  return '<div class="card card-pad text-center text-muted" style="padding:34px">' + esc(msg || "Tidak ada data.") + "</div>";
}

function legendHTML(items) {
  return '<div class="legend">' + items.map(function (i) {
    return '<span class="lg-item"><span class="lg-dot" style="background:' + i.color + '"></span>' + esc(i.label) + "</span>";
  }).join("") + "</div>";
}

function statNumber(x) {
  var v = Number(x) || 0;
  return fmtNum(v);
}

function productSelect(selectedId, name, includeAll) {
  var opts = includeAll ? '<option value="">' + esc(includeAll) + "</option>" : "";
  Store.products().forEach(function (p) {
    opts += '<option value="' + esc(p.id) + '"' + (p.id === selectedId ? " selected" : "") + ">" + esc(p.sku + " - " + p.name) + "</option>";
  });
  return '<select name="' + (name || "productId") + '" id="psel_' + (name || "productId") + '">' + opts + "</select>";
}