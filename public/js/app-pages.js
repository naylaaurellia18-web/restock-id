var NAV = [
  {id:"dashboard", label:"Dashboard", sub:"Ringkasan &amp; peringatan"},
  {id:"products", label:"Produk", sub:"Master produk &amp; status stok"},
  {id:"transactions", label:"Transaksi", sub:"Stok masuk &amp; keluar"},
  {id:"reorder", label:"Reorder Point", sub:"Perhitungan ROP &amp; safety stock"},
  {id:"notifications", label:"Notifikasi", sub:"Peringatan pemesanan ulang"},
  {id:"simulation", label:"Pengujian", sub:"Perbandingan manual vs ROP"},
  {id:"reports", label:"Laporan", sub:"Ekspor &amp; cetak"},
  {id:"settings", label:"Pengaturan", sub:"Preferensi sistem"}
];

var A = {};
var P = {};
P.nav = NAV;

P.render = function (page) {
  var fn = P[page];
  if (typeof fn !== "function") fn = P.dashboard;
  fn();
};

function statusCounts() {
  var st = Store.computeStatsAll();
  var c = {total: 0, aman: 0, waspada: 0, reorder: 0, habis: 0, nodata: 0};
  Store.products().forEach(function (p) {
    c.total++;
    var s = statusOf(p, st[p.id]);
    c[s]++;
  });
  return c;
}

function etaCalc(st, stock) {
  if (!st || !st.enough || st.d <= 0) return null;
  return Math.max(0, Math.floor(stock / st.d));
}

/* ============ DASHBOARD ============ */

P.dashboard = function () {
  var st = Store.computeStatsAll();
  var c = statusCounts();
  var alerts = [];
  Store.products().forEach(function (p) {
    var s = statusOf(p, st[p.id]);
    if (s === "reorder" || s === "habis") {
      var eta = etaCalc(st[p.id], p.stock);
      alerts.push({p: p, s: s, st: st[p.id], eta: eta});
    }
  });
  alerts.sort(function (a, b) {
    var ae = a.eta == null ? 999 : a.eta;
    var be = b.eta == null ? 999 : b.eta;
    if (ae !== be) return ae - be;
    var ar = a.st.rop > 0 ? a.p.stock / a.st.rop : 0;
    var br = b.st.rop > 0 ? b.p.stock / b.st.rop : 0;
    return ar - br;
  });

  var html = "";
  if (alerts.length > 0) {
    html += '<div class="alert-banner">&#9888; ' + alerts.length + " produk membutuhkan pemesanan ulang. Segera periksa daftar di bawah.</div>";
  }

  html += '<div class="grid grid-4">' +
    statCard("total", c.total, "Total Produk", "semua SKU terdaftar", "dot-blue") +
    statCard("aman", c.aman, "Stok Aman", "di atas batas waspada", "dot-green") +
    statCard("reorder", c.reorder + c.habis, "Perlu Reorder", "+" + c.waspada + " waspada", "dot-orange") +
    statCard("habis", c.habis, "Stok Habis", "perlu restok segera", "dot-red") +
    "</div>";

  html += '<div class="grid grid-2 section-gap">' +
    '<div class="card card-pad"><h3 class="card-title">Peringatan Pemesanan Ulang <span class="text-muted" style="font-weight:400">(stok &le; ROP)</span></h3>' +
    '<p class="card-sub">Diurutkan berdasarkan urgensi (estimasi hari sampai stok habis).</p>' +
    (alerts.length ? '<div id="alertList">' + alerts.map(function (a) {
      var etaTxt = a.eta == null ? "data belum cukup" : "&asymp; " + a.eta + " hari lagi habis";
      var qty = suggestOrderQty(a.st, a.p.stock);
      return '<div class="alert-item">' +
        '<div class="ai-body"><div class="ai-name">' + esc(a.p.name) + " " + statusBadge(a.s) + "</div>" +
        '<div class="ai-meta">Stok <b>' + fmtNum(a.p.stock) + "</b> " + esc(a.p.unit) + " &bullet; ROP <b>" + fmtNum(a.st.rop) + "</b> &bullet; " + etaTxt + "</div></div>" +
        '<div class="ai-body" style="flex:0 0 auto;text-align:right"><div style="font-size:12px;color:var(--muted)">Saran pesan</div><b>' + fmtNum(qty) + " " + esc(a.p.unit) + "</b></div>" +
        '<button class="btn btn-outline btn-sm" onclick="A.detailProduct(\'' + a.p.id + '\')">Detail</button>' +
        '<button class="btn btn-primary btn-sm" onclick="A.quickOrder(\'' + a.p.id + '\')">Pesan</button>' +
        "</div>";
    }).join("") + "</div>" : emptyState("Semua stok berada di atas titik pemesanan ulang. Tidak ada peringatan.")) +
    "</div>" +

    '<div class="card card-pad"><h3 class="card-title">Tren Penjualan Harian</h3>' +
    '<p class="card-sub">30 hari terakhir.</p>' +
    '<div class="row mb12"><label style="font-size:12.5px;font-weight:600">Pilih produk:</label>' + productSelect(DASH_SEL, "dashProd") +
    '<button class="btn btn-ghost btn-sm" onclick="A.dashProduct(this.previousElementSibling.value)">Tampilkan</button></div>' +
    '<div id="dashTrend" class="chart-box"></div></div>' +

    '</div>';

  html += '<div class="card card-pad section-gap"><h3 class="card-title">Stok Saat Ini vs Reorder Point</h3>' +
    '<p class="card-sub">Batang biru = stok saat ini, batang teal = ROP (titik pemesanan ulang).</p>' +
    '<div id="dashStockRop" class="chart-box"></div></div>';

  document.getElementById("content").innerHTML = html;

  var selId = DASH_SEL;
  if (!selId) {
    var first = Store.products().find(function (p) { return Store.computeStats(p).enough; });
    selId = first ? first.id : "";
  }
  renderTrend(selId);
  renderStockVsRop();
};

function statCard(key, num, label, sub, dot) {
  return '<div class="stat-card"><div class="sc-top"><span class="sc-dot ' + dot + '"></span><span class="sc-label">' + label + "</span></div>" +
    '<div class="sc-num">' + fmtNum(num) + '</div><div class="sc-sub mt8">' + sub + "</div></div>";
}

var DASH_SEL = "";

A.dashProduct = function (val) {
  DASH_SEL = val;
  P.dashboard();
};

function renderTrend(selId) {
  DASH_SEL = selId;
  var p = Store.getProduct(selId);
  var el = document.getElementById("dashTrend");
  if (!el) return;
  if (!p) { el.innerHTML = emptyState("Tidak ada produk."); return; }
  var ser = demandSeries(p, Store.transactions(), 30);
  if (!Store.computeStats(p).enough) {
    el.innerHTML = emptyState("Belum ada cukup data penjualan untuk produk ini (minimal 14 hari).");
    return;
  }
  renderLine("dashTrend", ser.dates.map(fmtDateLabel), [{
    name: p.name, values: ser.qty, color: COLOR.primary, fill: true
  }], {height: 250});
}

function renderStockVsRop() {
  var el = document.getElementById("dashStockRop");
  if (!el) return;
  var labels = [], stock = [], rop = [], colors = [];
  var st = Store.computeStatsAll();
  Store.products().forEach(function (p) {
    labels.push(p.sku);
    stock.push(p.stock);
    rop.push(st[p.id].enough ? st[p.id].rop : 0);
    var s = statusOf(p, st[p.id]);
    colors.push({aman: COLOR.green, waspada: COLOR.yellow, reorder: COLOR.orange, habis: COLOR.red, nodata: COLOR.gray}[s]);
  });
  renderGroupedBar("dashStockRop", labels, stock, rop, "Stok saat ini", "ROP", {colorA: COLOR.primary, colorB: COLOR.teal, height: 300});
}

/* ============ PRODUK ============ */

P.products = function () {
  var html = '<div class="row-between mb12">' +
    '<div class="row">' +
    '<input type="search" id="prodSearch" placeholder="Cari nama/SKU..." style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;min-width:220px" oninput="A.filterProducts()">' +
    '<select id="prodCat" onchange="A.filterProducts()"><option value="">Semua kategori</option>' + categoriesOpt() + "</select>" +
    '<select id="prodStat" onchange="A.filterProducts()"><option value="">Semua status</option><option value="aman">Aman</option><option value="waspada">Waspada</option><option value="reorder">Perlu reorder</option><option value="habis">Habis</option><option value="nodata">Data belum cukup</option></select>' +
    "</div>" +
    '<button class="btn btn-primary" onclick="A.modalProduct()">+ Tambah Produk</button>' +
    "</div>";

  html += '<div class="card"><div class="table-wrap"><table class="tbl" id="prodTbl"><thead><tr>' +
    "<th>SKU</th><th>Nama Produk</th><th>Kategori</th><th class='num'>Stok</th><th>Satuan</th><th>Status</th><th class='num'>ROP</th><th class='num'>Harga Jual</th><th>Info</th><th>Aksi</th>" +
    "</tr></thead><tbody></tbody></table></div></div>";
  document.getElementById("content").innerHTML = html;
  A.filterProducts();
};

function categoriesOpt() {
  var cats = ["Sembako", "Bahan Kue", "Minuman", "Snack", "Lainnya"];
  return cats.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
}

A.filterProducts = function () {
  var tbody = document.querySelector("#prodTbl tbody");
  if (!tbody) return;
  var q = (document.getElementById("prodSearch").value || "").toLowerCase();
  var cat = document.getElementById("prodCat").value;
  var stat = document.getElementById("prodStat").value;
  var st = Store.computeStatsAll();
  var rows = Store.products().filter(function (p) {
    if (cat && p.category !== cat) return false;
    if (stat) {
      var s = statusOf(p, st[p.id]);
      if (s !== stat) return false;
    }
    var hay = (p.name + " " + p.sku).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
  tbody.innerHTML = rows.map(function (p) {
    var stk = st[p.id];
    var s = statusOf(p, stk);
    var info = p.leadTime + " hr LT";
    if (p.expiryDate && monthDiff(p.expiryDate, new Date()) <= 2) {
      info += ' <span class="badge badge-yellow">kadal 2 bl</span>';
    }
    return "<tr" + (s === "habis" || s === "reorder" ? ' class="crit"' : "") + ">" +
      "<td class='mono'>" + esc(p.sku) + "</td>" +
      "<td><b>" + esc(p.name) + "</b></td>" +
      "<td>" + esc(p.category) + "</td>" +
      '<td class="num"><b>' + fmtNum(p.stock) + "</b></td>" +
      "<td>" + esc(p.unit) + "</td>" +
      "<td>" + statusBadge(s) + "</td>" +
      '<td class="num">' + (stk.enough && stk.rop != null ? fmtNum(stk.rop) : "&ndash;") + "</td>" +
      '<td class="num">' + cur(p.sellPrice) + "</td>" +
      "<td>" + info + "</td>" +
      '<td><div class="row" style="gap:4px">' +
      '<button class="btn btn-ghost btn-sm" onclick="A.detailProduct(\'' + p.id + "')" + '">Lihat</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="A.modalProduct(\'' + p.id + "')" + '">Edit</button>' +
      '<button class="btn btn-danger btn-sm" onclick="A.deleteProduct(\'' + p.id + "')" + '">Hapus</button>' +
      "</div></td></tr>";
  }).join("");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:28px">Tidak ada produk yang cocok.</td></tr>';
  }
};

function monthDiff(dstr, from) {
  var d = parseISODate(dstr);
  if (!d) return 999;
  return Math.floor((startOfDay(d) - from) / (86400000 * 30.4));
}

function productFormHTML(p) {
  p = p || {};
  return '<form id="prodForm" class="form-grid" onsubmit="A.saveProduct(event)">' +
    '<div class="field"><label>Kode SKU *</label><input name="sku" value="' + esc(p.sku || "") + '" placeholder="cth: BRG-014" required></div>' +
    '<div class="field"><label>Nama Produk *</label><input name="name" value="' + esc(p.name || "") + '" required></div>' +
    '<div class="field"><label>Kategori</label><select name="category">' + catSelect(p.category) + "</select></div>" +
    '<div class="field"><label>Satuan</label><input name="unit" value="' + esc(p.unit || "pcs") + '"></div>' +
    '<div class="field"><label>Stok Saat Ini *</label><input name="stock" type="number" min="0" step="1" value="' + (p.stock != null ? p.stock : 0) + '" required></div>' +
    '<div class="field"><label>Harga Beli (Rp)</label><input name="buyPrice" type="number" min="0" value="' + (p.buyPrice != null ? p.buyPrice : 0) + '"></div>' +
    '<div class="field"><label>Harga Jual (Rp)</label><input name="sellPrice" type="number" min="0" value="' + (p.sellPrice != null ? p.sellPrice : 0) + '"></div>' +
    '<div class="field"><label>Lead Time Pemasok (hari) * <span class="tooltip" data-tip="Waktu antara pemesanan sampai barang tiba di toko.">&#9432;</span></label><input name="leadTime" type="number" min="1" step="1" value="' + (p.leadTime != null ? p.leadTime : 2) + '" required></div>' +
    '<div class="field"><label>Tingkat Layanan (service level)</label><select name="serviceLevel">' +
    '<option value="0.9"' + (p.serviceLevel === 0.9 ? " selected" : "") + '>90% (Z=1,28)</option>' +
    '<option value="0.95"' + (p.serviceLevel === 0.95 || p.serviceLevel == null ? " selected" : "") + '>95% (Z=1,65)</option>' +
    '<option value="0.99"' + (p.serviceLevel === 0.99 ? " selected" : "") + '>99% (Z=2,33)</option>' +
    "</select></div>" +
    '<div class="field"><label>Tanggal Kedaluwarsa <span class="tooltip" data-tip="Opsional. Header produk akan ditandai jika mendekati kedaluwarsa (kurang dari 2 bulan).">&#9432;</span></label><input name="expiryDate" type="date" value="' + esc(p.expiryDate || "") + '"></div>' +
    '<div class="field full"><label>Catatan</label><textarea name="note" rows="2">' + esc(p.note || "") + "</textarea></div>" +
    "</form>";
}

function catSelect(val) {
  var cats = ["Sembako", "Bahan Kue", "Minuman", "Snack", "Lainnya"];
  return cats.map(function (c) {
    return '<option value="' + c + '"' + (c === val ? " selected" : "") + ">" + c + "</option>";
  }).join("");
}

A.modalProduct = function (id) {
  A.editingId = id || null;
  var p = id ? Store.getProduct(id) : null;
  var title = p ? "Edit Produk: " + esc(p.name) : "Tambah Produk Baru";
  openModal({
    title: title,
    body: productFormHTML(p),
    foot: '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" onclick="A.saveProduct(event)">Simpan</button>'
  });
};

A.saveProduct = function (evt) {
  if (evt && evt.preventDefault) evt.preventDefault();
  var form = document.getElementById("prodForm");
  if (!form) return;
  var f = {
    sku: (form.sku.value || "").trim(),
    name: (form.name.value || "").trim(),
    category: form.category.value || "Lainnya",
    unit: (form.unit.value || "pcs").trim(),
    stock: form.stock.value,
    buyPrice: form.buyPrice.value,
    sellPrice: form.sellPrice.value,
    leadTime: form.leadTime.value,
    serviceLevel: form.serviceLevel.value,
    expiryDate: form.expiryDate.value,
    note: form.note.value.trim()
  };
  if (!f.sku || !f.name) {
    toast("SKU dan nama produk wajib diisi.", "error");
    return;
  }
  if (Number(f.stock) < 0 || Number(f.leadTime) <= 0) {
    toast("Stok tidak boleh negatif dan lead time harus lebih dari 0.", "error");
    return;
  }
  var out;
  if (A.editingId) {
    out = Store.updateProduct(A.editingId, f);
  } else {
    out = Store.addProduct(f);
  }
  if (!out.ok) {
    toast(out.error, "error");
    return;
  }
  closeModal();
  toast("Produk berhasil disimpan.", "success");
  refreshCurrent();
};

A.deleteProduct = function (id) {
  var p = Store.getProduct(id);
  if (!p) return;
  confirmDialog(
    "Hapus Produk",
    'Hapus produk <b>' + esc(p.name) + "</b> beserta seluruh riwayat transaksi dan notifikasinya? Tindakan ini tidak dapat dibatalkan.",
    function () {
      Store.removeProduct(id);
      toast("Produk dihapus.", "success");
      refreshCurrent();
    },
    "Hapus",
    true
  );
};

/* ============ DETAIL PERHITUNGAN ============ */

A.detailProduct = function (id) {
  var p = Store.getProduct(id);
  if (!p) return;
  var st = Store.computeStats(p);
  var title = "Detail Perhitungan &mdash; " + esc(p.sku);
  var body = detailCalcBody(p, st);
  openModal({
    title: title,
    wide: true,
    body: body,
    foot: '<button class="btn btn-ghost" onclick="closeModal()">Tutup</button>' +
      '<button class="btn btn-outline" onclick="A.printCalc(\'' + id + '\')">Cetak</button>' +
      '<button class="btn btn-primary" onclick="A.quickOrder(\'' + id + '\')">Buat Pesanan</button>'
  });
  if (st.enough) {
    renderBar("detSales", serDates(p).map(fmtDateLabel), serDates(p).map(function (d) { return dailyQty(p, d); }), null, {height: 230, color: COLOR.primary});
  }
};

function serDates(p) {
  return demandSeries(p, Store.transactions(), Store.settings().historyDays).dates;
}

function dailyQty(p, dateStr) {
  var total = 0;
  Store.transactions().forEach(function (t) {
    if (t.productId === p.id && t.type === "out" && String(t.date).slice(0, 10) === dateStr) total += t.qty;
  });
  return total;
}

function detailCalcBody(p, st) {
  var steps = "";
  if (!st.enough) {
    steps = '<div class="card card-pad" style="background:#fffbeb;border-color:#fde68a"><b>Data historis belum cukup.</b><br>Diperlukan minimal <b>' + st.minDays + " hari</b> data penjualan untuk menghitung Reorder Point. Saat ini data yang tersedia: <b>" + st.n + " hari</b> (total " + fmtNum(st.total) + " unit terjual). Terus catat transaksi penjualan agar sistem dapat menghitung ROP secara otomatis.</div>";
  } else {
    var maxC = Store.settings().maxCycleDays || 14;
    var eoqDesc = st.eoq ? "EOQ = &#8730;(2 &times; " + fmtNum(st.d * 365) + " &times; " + cur(Store.settings().orderCost) + " / " + cur(p.buyPrice * Store.settings().holdingPct / 100) + ") = <b>" + fmtNum(st.eoq) + "</b> unit. Karena kapasitas penyimpanan UMKM terbatas, kuantitas saran dibatasi kebutuhan maksimal " + maxC + " hari." : "Biaya pesan/biaya simpan belum terisi penuh, sehingga saran kuantitas memakai cadangan siklus (d &times; 2L), dibatasi kebutuhan maksimal " + maxC + " hari.";
    steps =
      '<div class="card card-pad mb12">' +
      '<div class="row row-between"><b>Status saat ini:</b> ' + statusBadge(statusOf(p, st)) + "</div>" +
      '<div class="row row-between mt8"><span class="text-muted">Periode data historis</span><b>' + st.n + " hari terakhir</b></div>" +
      '<div class="row row-between"><span class="text-muted">Total penjualan periode</span><b>' + fmtNum(st.total) + " " + esc(p.unit) + "</b></div>" +
      "</div>" +
      stepQ("1. Rata-rata permintaan harian (d)", "d = total penjualan &divide; jumlah hari = " + fmtNum(st.total) + " &divide; " + st.n, "d = <b>" + fmtNum(st.d) + "</b> unit/hari") +
      stepQ("2. Simpangan baku permintaan harian (&sigma;d)", "Dihitung dari data historis penjualan harian periode tersebut", "&sigma;d = <b>" + fmtNum(st.sigma) + "</b>") +
      stepQ("3. Lead time (L)", "Waktu tunggu pemasok (dari data produk)", "L = <b>" + st.L + " hari</b>") +
      stepQ("4. Faktor Z (tingkat layanan)", "Nilai Z sesuai service level " + (st.Z * 100).toFixed(0).replace(/\./g, ",") + "%", "Z = <b>" + st.Z + "</b>") +
      stepQ("5. Safety Stock (SS)", "SS = Z &times; &sigma;d &times; &#8730;L = " + st.Z + " &times; " + fmtNum(st.sigma) + " &times; " + "&#8730;" + st.L, "SS = <b>" + fmtNum(st.ss) + "</b> unit") +
      stepQ("6. Reorder Point (ROP)", "ROP = (d &times; L) + SS = (" + fmtNum(st.d) + " &times; " + st.L + ") + " + fmtNum(st.ss), "ROP = <b>" + fmtNum(st.rop) + "</b> unit") +
      stepQ("7. Kuantitas pesanan disarankan", eoqDesc, "Kuantitas saran = <b>" + fmtNum(st.cycle) + "</b> unit &middot; target stok maks <b>" + fmtNum(st.targetMax) + "</b>") +
      '<div class="card card-pad" style="background:#eff6ff;border-color:#bfdbfe"><b>Artinya:</b> pesan ulang dilakukan saat stok mencapai <b>' + fmtNum(st.rop) + " " + esc(p.unit) + "</b>. Stok kini <b>" + fmtNum(p.stock) + "</b> "
      + (p.stock <= st.rop ? "&rarr; <span style='color:var(--red);font-weight:700'>sudah di bawah ROP, segera pesan!</span>" : "&rarr; masih di atas ROP, aman untuk saat ini.") + "</div>";
  }
  return '<div class="mb12">' + steps + "</div><h4 style='margin:16px 0 6px'>Penjualan Historis Harian</h4><div id='detSales' class='chart-box'></div>";
}

function stepQ(title, calc, result) {
  return '<div class="formula"><div class="f-title">' + title + "</div>" +
    '<div class="f-desc">' + calc + "</div>" +
    '<div class="f-calc">Hasil: ' + result + "</div></div>";
}

A.printCalc = function (id) {
  var p = Store.getProduct(id);
  var st = Store.computeStats(p);
  var rows = "";
  if (st.enough) {
    rows = "<h2>Ringkasan Penghitungan</h2><table><thead><tr><th>Parameter</th><th>Nilai</th></tr></thead><tbody>" +
      "<tr><td>Rata-rata permintaan harian (d)</td><td>" + fmtNum(st.d) + "</td></tr>" +
      "<tr><td>Simpangan baku (σd)</td><td>" + fmtNum(st.sigma) + "</td></tr>" +
      "<tr><td>Lead time (L)</td><td>" + st.L + " hari</td></tr>" +
      "<tr><td>Faktor Z</td><td>" + st.Z + "</td></tr>" +
      "<tr><td>Safety stock (SS)</td><td>" + fmtNum(st.ss) + "</td></tr>" +
      "<tr><td>Reorder point (ROP)</td><td>" + fmtNum(st.rop) + "</td></tr>" +
      "<tr><td>EOQ</td><td>" + (st.eoq ? fmtNum(st.eoq) : "-") + "</td></tr>" +
      "<tr><td>Kuantitas saran (dibatasi siklus)</td><td>" + fmtNum(st.cycle) + "</td></tr>" +
      "<tr><td>Target stok maksimum</td><td>" + fmtNum(st.targetMax) + "</td></tr>" +
      "<tr><td>Stok saat ini</td><td>" + fmtNum(p.stock) + " " + esc(p.unit) + "</td></tr></tbody></table>";
  } else {
    rows = "<p>Data historis belum cukup (minimal " + st.minDays + " hari).</p>";
  }
  printHTML("Detail Perhitungan " + p.sku + " - " + p.name, rows + signatureHTML());
};

function signatureHTML() {
  return '<div class="ttd"><div><div class="sp"></div><div>Disiapkan oleh,</div><div>______________________</div></div>' +
    '<div><div class="sp"></div><div>Mengetahui,</div><div>______________________</div></div></div>';
}

/* ============ TRANSAKSI ============ */

P.transactions = function () {
  var html = '<div class="grid grid-2">' +
    '<div class="card card-pad"><h3 class="card-title" style="color:#166534">&#10133; Stok Masuk (Pembelian / Restok)</h3>' +
    '<p class="card-sub">Catat penerimaan barang; stok otomatis bertambah.</p>' +
    '<form class="form-grid" onsubmit="A.submitTx(event,this)">' +
    '<input type="hidden" name="type" value="in">' +
    '<div class="field full">' + productSelect("", "productId") + "</div>" +
    '<div class="field"><label>Jumlah *</label><input name="qty" type="number" min="1" step="1" required></div>' +
    '<div class="field"><label>Tanggal</label><input name="date" type="date" value="' + fmtDateStr(new Date()) + '"></div>' +
    '<div class="field full"><label>Keterangan</label><input name="note" placeholder="cth: Pembelian dari distributor"></div>' +
    '<div class="field full"><button class="btn btn-success" type="submit">Catat Stok Masuk</button></div>' +
    "</form></div>" +

    '<div class="card card-pad"><h3 class="card-title" style="color:#92400e">&#10134; Stok Keluar (Penjualan)</h3>' +
    '<p class="card-sub">Catat penjualan; stok otomatis berkurang. Tidak boleh melebihi stok.</p>' +
    '<form class="form-grid" onsubmit="A.submitTx(event,this)">' +
    '<input type="hidden" name="type" value="out">' +
    '<div class="field full">' + productSelect("", "productId") + "</div>" +
    '<div class="field"><label>Jumlah *</label><input name="qty" type="number" min="1" step="1" required></div>' +
    '<div class="field"><label>Tanggal</label><input name="date" type="date" value="' + fmtDateStr(new Date()) + '"></div>' +
    '<div class="field full"><label>Keterangan</label><input name="note" placeholder="cth: Penjualan tunai"></div>' +
    '<div class="field full"><button class="btn btn-yellow" type="submit">Catat Stok Keluar</button></div>' +
    "</form></div></div>";

  html += '<div class="card card-pad section-gap">' +
    '<div class="row-between mb12">' +
    '<div><h3 class="card-title" style="margin:0">Riwayat Transaksi</h3>' +
    '<p class="card-sub" style="margin:2px 0 0">Filter &amp; kelola seluruh pergerakan stok.</p></div>' +
    '<div class="row">' +
    '<button class="btn btn-ghost btn-sm" onclick="A.downloadTxTemplate()">Template CSV</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'impFile\').click()">Import CSV</button>' +
    '<input type="file" id="impFile" accept=".csv,text/csv" class="hidden" onchange="A.importCSV(this)">' +
    '<button class="btn btn-outline btn-sm" onclick="A.exportTx()">Ekspor CSV</button>' +
    "</div></div>" +

    '<div class="filter-bar">' +
    '<div class="filter-field">' +
    '<label for="txFrom">Dari tanggal</label>' +
    '<input type="date" id="txFrom" onchange="A.filterTx()">' +
    "</div>" +
    '<div class="filter-field">' +
    '<label for="txTo">Sampai tanggal</label>' +
    '<input type="date" id="txTo" onchange="A.filterTx()">' +
    "</div>" +
    '<div class="filter-field filter-grow">' +
    '<label for="txProd">Produk</label>' +
    productSelect("", "txProd", "Semua produk").replace('id="psel_txProd"', 'id="txProd"').replace('name="txProd"', 'name="txProd" onchange="A.filterTx()"') +
    "</div>" +
    '<div class="filter-field">' +
    '<label for="txType">Jenis</label>' +
    '<select id="txType" onchange="A.filterTx()">' +
    '<option value="">Semua jenis</option>' +
    '<option value="in">Masuk</option>' +
    '<option value="out">Keluar</option>' +
    "</select>" +
    "</div>" +
    '<div class="filter-field filter-action">' +
    '<label>&nbsp;</label>' +
    '<button class="btn btn-ghost" onclick="A.resetTx()">Reset</button>' +
    "</div>" +
    "</div>" +

    '<div class="table-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>SKU</th><th>Nama Produk</th><th>Jenis</th><th class="num">Jumlah</th><th>Keterangan</th></tr></thead>' +
    '<tbody id="txTbl"></tbody></table></div>' +
    '<div id="txPager" class="row mt12"></div></div>';

  document.getElementById("content").innerHTML = html;
  A.txPage = 1;
  A.filterTx();
};

function txRows(filters) {
  var f = filters || A._txf || {};
  var list = Store.transactions().slice();
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  list = list.filter(function (t) {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.productId && t.productId !== f.productId) return false;
    if (f.type && t.type !== f.type) return false;
    return true;
  });
  list.sort(function (a, b) { return b.date.localeCompare(a.date) || a.id.localeCompare(b.id); });
  return list;
}

A.filterTx = function () {
  A._txf = {
    from: document.getElementById("txFrom").value,
    to: document.getElementById("txTo").value,
    productId: document.getElementById("txProd").value,
    type: document.getElementById("txType").value
  };
  A.txPage = 1;
  renderTxTable();
};

A.resetTx = function () {
  document.getElementById("txFrom").value = "";
  document.getElementById("txTo").value = "";
  document.getElementById("txProd").value = "";
  document.getElementById("txType").value = "";
  A.filterTx();
};

function renderTxTable() {
  var list = txRows();
  var per = 15;
  var maxPage = Math.max(1, Math.ceil(list.length / per));
  if (A.txPage > maxPage) A.txPage = maxPage;
  var pages = list.slice((A.txPage - 1) * per, A.txPage * per);
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  var tbody = document.getElementById("txTbl");
  if (!tbody) return;
  tbody.innerHTML = pages.map(function (t) {
    var p = mapP[t.productId];
    var isIn = t.type === "in";
    return "<tr>" +
      "<td>" + fmtDateLabel(t.date) + "</td>" +
      "<td class='mono'>" + esc(p ? p.sku : "-") + "</td>" +
      "<td>" + esc(p ? p.name : "(produk dihapus)") + "</td>" +
      "<td>" + (isIn ? '<span class="badge badge-info">Masuk</span>' : '<span class="badge badge-yellow">Keluar</span>') + "</td>" +
      '<td class="num">' + (isIn ? "+" : "&minus;") + fmtNum(t.qty) + "</td>" +
      "<td>" + esc(t.note) + "</td></tr>";
  }).join("");
  if (!pages.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:26px">Tidak ada transaksi yang cocok dengan filter.</td></tr>';
  }
  var pager = document.getElementById("txPager");
  pager.innerHTML = '<div class="row"><small class="text-muted">' + list.length + " transaksi &middot; hal " + A.txPage + "/" + maxPage + '</small>' +
    '<button class="btn btn-ghost btn-sm" onclick="A.txGo(-1)">&#9664;</button><button class="btn btn-ghost btn-sm" onclick="A.txGo(1)">&#9654;</button></div>';
}

A.txGo = function (d) {
  A.txPage += d;
  renderTxTable();
};

A.submitTx = function (evt, form) {
  if (evt.preventDefault) evt.preventDefault();
  var f = {
    productId: form.productId.value,
    type: form.type.value,
    qty: form.qty.value,
    date: form.date.value || fmtDateStr(new Date()),
    note: form.note.value.trim()
  };
  if (!f.productId || !f.qty) {
    toast("Pilih produk dan isi jumlah.", "error");
    return;
  }
  var out = Store.addTransaction(f);
  if (!out.ok) {
    toast(out.error, "error");
    return;
  }
  toast("Transaksi dicatat (" + (f.type === "in" ? "masuk" : "keluar") + " +" + (f.type === "in" ? " " : " ") + fmtNum(f.qty) + " " + esc(out.product.unit) + ". Stok kini " + fmtNum(out.product.stock) + ").", "success");
  refreshCurrent();
};

A.downloadTxTemplate = function () {
  downloadCSV("template-import-penjualan.csv",
    ["tanggal", "sku", "nama", "qty", "jenis"],
    [
      ["2026-08-01", "BRG-001", "Beras Premium 5 kg", "5", "out"],
      ["2026-08-01", "KOP-009", "Kopi Sachet 10 g", "10", "out"],
      ["2026-08-02", "BRG-001", "Beras Premium 5 kg", "3", "out"]
    ]
  );
  toast("Template CSV diunduh. Format tanggal: YYYY-MM-DD.", "success");
};

A.importCSV = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var rows = parseCSV(String(e.target.result));
    if (rows.length < 2) {
      toast("File CSV kosong atau tidak valid.", "error");
      input.value = "";
      return;
    }
    var hdr = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var ix = {date: hdr.indexOf("tanggal") >= 0 ? hdr.indexOf("tanggal") : 0, sku: hdr.indexOf("sku"), nama: hdr.indexOf("nama"), qty: hdr.indexOf("qty"), jenis: hdr.indexOf("jenis")};
    var added = 0, failed = 0, skipped = 0;
    var errs = [];
    rows.slice(1).forEach(function (r, ri) {
      var qty = Number(r[ix.qty]);
      var date = normalizeDate(r[ix.date]);
      var type = ix.jenis >= 0 && r[ix.jenis] && String(r[ix.jenis]).trim().toLowerCase() === "in" ? "in" : "out";
      var p = null;
      if (ix.sku >= 0 && r[ix.sku]) {
        var sku = String(r[ix.sku]).trim();
        p = Store.products().find(function (pp) { return pp.sku === sku; });
      }
      if (!p && ix.nama >= 0 && r[ix.nama]) {
        var nm = String(r[ix.nama]).trim().toLowerCase();
        p = Store.products().find(function (pp) { return pp.name.toLowerCase() === nm; });
      }
      if (!p) {
        failed++;
        if (errs.length < 6) errs.push("Baris " + (ri + 2) + ": produk tidak dikenal");
        return;
      }
      if (!qty || qty <= 0) {
        skipped++;
        return;
      }
      if (type === "out" && qty > p.stock) {
        var out = Store.addTransaction({productId: p.id, type: "out", qty: qty, date: date, note: "Import CSV"});
        if (!out.ok) {
          failed++;
          if (errs.length < 6) errs.push("Baris " + (ri + 2) + ": " + out.error);
        } else added++;
        return;
      }
      var r2 = Store.addTransaction({productId: p.id, type: type, qty: qty, date: date, note: "Import CSV"});
      if (r2.ok) added++; else { failed++; if (errs.length < 6) errs.push("Baris " + (ri + 2) + ": " + r2.error); }
    });
    toast("Import selesai: " + added + " berhasil, " + failed + " gagal, " + skipped + " dilewati." + (errs.length ? " " + errs.join("; ") : ""), failed ? "error" : "success");
    input.value = "";
    refreshCurrent();
  };
  reader.readAsText(file);
};

function normalizeDate(v) {
  v = String(v || "").trim();
  if (!v) return fmtDateStr(new Date());
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  var m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
  }
  return fmtDateStr(new Date());
}

A.exportTx = function () {
  var list = txRows();
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  var rows = list.map(function (t) {
    var p = mapP[t.productId];
    return [t.date, p ? p.sku : "-", p ? p.name : "-", t.type === "in" ? "Masuk" : "Keluar", t.qty, t.note];
  });
  downloadCSV("riwayat-transaksi.csv", ["tanggal", "sku", "nama", "jenis", "jumlah", "keterangan"], rows);
  toast("Riwayat transaksi diekspor.", "success");
};

/* ============ REORDER POINT ============ */

P.reorder = function () {
  var s = Store.settings();
  var html = '<div class="card card-pad mb16"><h3 class="card-title">Cara Kerja Metode Reorder Point</h3>' +
    '<ol class="steps">' +
    "<li>Sistem mencatat setiap transaksi (masuk/keluar) secara otomatis, sehingga data historis penjualan selalu tersedia.</li>" +
    "<li>Dari data historis, sistem menghitung rata-rata permintaan harian (d) dan simpangan bakunya (&sigma;d).</li>" +
    "<li>Dengan lead time pemasok (L), faktor Z (service level), dihitung Safety Stock dan Reorder Point.</li>" +
    "<li>Setiap stok <b>mencapai atau di bawah ROP</b>, sistem mengeluarkan notifikasi pemesanan ulang beserta jumlah pesanan yang disarankan.</li>" +
    "</ol></div>";

  html += '<div class="grid grid-3 mb16">' +
    formulaCard("Rata-rata Permintaan Harian", "d = &#931; penjualan &divide; jumlah hari", "Permintaan rata-rata per hari dari data historis periode terpilih (30/60/90 hari).") +
    formulaCard("Safety Stock", "SS = Z &times; &sigma;d &times; &#8730;L", "Cadangan pengaman untuk menutupi ketidakpastian permintaan selama masa tunggu pemasok.") +
    formulaCard("Reorder Point", "ROP = (d &times; L) + SS", "Titik stok terendah yang boleh dicapai sebelum harus pesan ulang.") +
    "</div>";

  html += '<div class="grid grid-2 mb16">' +
    formulaCard("Kuantitas Pesanan Saran (EOQ)", "EOQ = &#8730;(2 &times; D &times; S &divide; H)", "D = permintaan tahunan, S = biaya pemesanan sekali, H = biaya simpan per unit per tahun. Saran dibatasi kebutuhan " + (s.maxCycleDays || 14) + " hari agar realistik bagi kapasitas UMKM.") +
    '<div class="card card-pad"><h3 class="card-title">Nilai Z dari Tingkat Layanan (service level)</h3>' +
    '<p class="card-sub">Semakin tinggi service level, semakin besar safety stocknya.</p>' +
    '<table class="tbl"><thead><tr><th>Service level</th><th>Z</th></tr></thead><tbody>' +
    '<tr><td>90%</td><td class="num">1,28</td></tr><tr><td>95% (default)</td><td class="num">1,65</td></tr><tr><td>99%</td><td class="num">2,33</td></tr>' +
    "</tbody></table></div></div>";

  html += '<div class="row-between card card-pad mb16" style="align-items:center">' +
    '<div><b>Periode Data Historis:</b> <span class="text-muted">di bawah 14 hari &rArr; status &ldquo;Data belum cukup&rdquo;</span></div>' +
    '<div class="row">' +
    '<select id="ropPeriod">' + [30, 60, 90].map(function (d) {
      return '<option value="' + d + '"' + (s.historyDays === d ? " selected" : "") + ">" + d + " hari</option>";
    }).join("") + "</select>" +
    '<button class="btn btn-primary btn-sm" onclick="A.applyPeriod()">Terapkan</button>' +
    "</div></div>";

  html += '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr>' +
    "<th>SKU</th><th>Nama</th><th class='num'>d</th><th class='num'>&sigma;d</th><th class='num'>L</th><th class='num'>Z</th><th class='num'>SS</th><th class='num'>ROP</th><th class='num'>Saran Q</th><th class='num'>Stok</th><th>Status</th><th>Aksi</th>" +
    "</tr></thead><tbody>" + ropTblRows() + "</tbody></table></div></div>";
  document.getElementById("content").innerHTML = html;
};

function ropTblRows() {
  var st = Store.computeStatsAll();
  return Store.products().map(function (p) {
    var s = st[p.id];
    return "<tr>" +
      '<td class="mono">' + esc(p.sku) + "</td>" +
      "<td>" + esc(p.name) + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.d) : "&ndash;") + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.sigma) : "&ndash;") + "</td>" +
      '<td class="num">' + p.leadTime + "</td>" +
      '<td class="num">' + s.Z.toFixed(2).replace(".", ",") + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.ss) : "&ndash;") + "</td>" +
      '<td class="num"><b>' + (s.enough ? fmtNum(s.rop) : "&ndash;") + "</b></td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.cycle) : "&ndash;") + "</td>" +
      '<td class="num"><b>' + fmtNum(p.stock) + "</b></td>" +
      "<td>" + statusBadge(statusOf(p, s)) + "</td>" +
      '<td><div class="row" style="gap:4px">' +
      '<button class="btn btn-ghost btn-sm" onclick="A.detailProduct(\'' + p.id + "')" + '">Detail</button>' +
      '<button class="btn btn-outline btn-sm" onclick="A.quickOrder(\'' + p.id + "')" + '">Pesan</button>' +
      "</div></td></tr>";
  }).join("");
}

function formulaCard(title, expr, desc) {
  return '<div class="card card-pad"><div class="f-title" style="font-weight:700;font-size:13px">' + title + "</div>" +
    '<div class="f-expr" style="font-family:Cambria,Georgia,serif;font-size:17px;color:#1e3a8a;margin:8px 0 6px">' + expr + "</div>" +
    '<p class="card-sub" style="margin:0">' + desc + "</p></div>";
}

A.applyPeriod = function () {
  var v = document.getElementById("ropPeriod").value;
  Store.settings().historyDays = Number(v);
  Store._recalc();
  toast("Periode data historis diubah menjadi " + v + " hari.", "success");
  refreshCurrent();
};

/* ============ NOTIFIKASI ============ */

P.notifications = function () {
  var html = '<div class="tabs">' +
    '<button id="tabn_all" class="active" onclick="A.setNotifTab(\'all\')">Semua</button>' +
    '<button id="tabn_baru" onclick="A.setNotifTab(\'baru\')">Baru</button>' +
    '<button id="tabn_dipesan" onclick="A.setNotifTab(\'dipesan\')">Sudah Dipesan</button>' +
    '<button id="tabn_selesai" onclick="A.setNotifTab(\'selesai\')">Selesai</button>' +
    "</div>";
  html += '<div id="notifList"></div>';
  document.getElementById("content").innerHTML = html;
  A.notifTab = "all";
  renderNotifList();
};

A.setNotifTab = function (tab) {
  A.notifTab = tab;
  ["all", "baru", "dipesan", "selesai"].forEach(function (t) {
    var el = document.getElementById("tabn_" + t);
    if (el) el.className = t === tab ? "active" : "";
  });
  renderNotifList();
};

function renderNotifList() {
  var el = document.getElementById("notifList");
  if (!el) return;
  var tab = A.notifTab || "all";
  var list = Store.notifications().slice().reverse();
  list = list.filter(function (n) { return tab === "all" ? true : n.status === tab; });
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  var html = "";
  var baruCount = Store.notifications().filter(function (n) { return n.status === "baru"; }).length;
  html += '<div class="row-between mb12">' +
    '<div class="text-muted" style="font-size:12.5px">' + list.length + " notifikasi " + (tab === "all" ? "(ditampilkan terbaru di atas)" : "") + "</div>" +
    '<div class="row">' +
    '<button class="btn btn-primary btn-sm"' + (baruCount ? "" : " disabled") + ' onclick="A.openPO()">Buat Daftar Pesanan</button>' +
    "</div></div>";

  if (!list.length) {
    el.innerHTML = emptyState("Belum ada notifikasi pemesanan ulang.");
    return;
  }
  list.forEach(function (n) {
    var p = mapP[n.productId];
    var name = p ? p.name : "(produk dihapus)";
    var st = p ? Store.computeStats(p) : null;
    var etaTxt = st && st.d > 0 ? "&asymp; " + Math.floor(n.stockAtNotify / st.d) + " hari sampai habis" : "data belum cukup";
    var badge = n.status === "baru" ? '<span class="badge badge-orange">Baru</span>' : n.status === "dipesan" ? '<span class="badge badge-info">Sudah Dipesan</span>' : '<span class="badge badge-green">Selesai</span>';
    html += '<div class="alert-item ' + (n.status === "baru" ? "" : "" ) + '">' +
      '<div class="ai-body">' +
      '<div class="ai-name">' + esc(name) + " " + badge + "</div>" +
      '<div class="ai-meta">Stok saat notifikasi: <b>' + fmtNum(n.stockAtNotify) + "</b> &bullet; ROP: <b>" + fmtNum(n.rop) + "</b> &bullet; " + etaTxt + "</div>" +
      '<div class="ai-meta">Pesan ulang disarankan: <b>' + fmtNum(n.suggestedQty) + " " + esc(p ? p.unit : "") + "</b> &bullet; " + fmtDateLabel(n.date) + "</div>" +
      "</div>" +
      (p ? '<button class="btn btn-ghost btn-sm" onclick="A.detailProduct(\'' + p.id + "')" + '">Detail</button>' : "") +
      (n.status === "baru" ? '<button class="btn btn-outline btn-sm" onclick="A.setNotif(\'' + n.id + "','dipesan')" + '">Tandai Dipesan</button>' : "") +
      (n.status !== "selesai" ? '<button class="btn btn-ghost btn-sm" onclick="A.setNotif(\'' + n.id + "','selesai')" + '">Selesai</button>' : "") +
      "</div>";
  });
  el.innerHTML = html;
}

A.setNotif = function (id, status) {
  Store.setNotifStatus(id, status);
  toast("Status notifikasi diperbarui.", "success");
  renderNotifList();
};

A.openPO = function () {
  var po = Store.buildPurchaseOrder();
  if (!po.items.length) {
    toast("Tidak ada notifikasi baru untuk dimasukkan ke daftar pesanan.", "error");
    return;
  }
  var rows = po.items.map(function (it, i) {
    return "<tr>" +
      '<td class="mono">' + esc(it.sku) + "</td>" +
      "<td>" + esc(it.name) + "</td>" +
      "<td>" + esc(it.unit) + "</td>" +
      '<td><input type="number" min="1" step="1" value="' + it.qty + '" id="poq_' + it.notifId + '" style="width:90px"></td>' +
      '<td class="num">' + cur(it.price) + "</td>" +
      '<td class="num">' + cur(it.sub) + "</td></tr>";
  }).join("");
  openModal({
    title: "Draft Purchase Order &mdash; " + po.no,
    wide: true,
    body: '<p class="text-muted">Daftar pemesanan ulang dari notifikasi berstatus <b>Baru</b>. Sesuaikan jumlah jika perlu, lalu tandai sebagai &ldquo;Sudah Dipesan&rdquo;.</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>SKU</th><th>Nama</th><th>Satuan</th><th>Jumlah</th><th class="num">Harga Beli</th><th class="num">Subtotal</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      "<p class='text-right mt8'><b>Total: " + cur(po.total) + "</b></p>",
    foot: '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-outline" onclick="A.downloadPO()">Unduh CSV</button>' +
      '<button class="btn btn-outline" onclick="A.printPO()">Cetak PO</button>' +
      '<button class="btn btn-primary" onclick="A.savePO()">Simpan &amp; Tandai Dipesan</button>'
  });
};

A.savePO = function () {
  var updated = 0;
  Store.notifications().slice().forEach(function (n) {
    if (n.status !== "baru") return;
    var inp = document.getElementById("poq_" + n.id);
    if (inp) {
      var q = Number(inp.value);
      if (q > 0) n.suggestedQty = q;
    }
    n.status = "dipesan";
    updated++;
  });
  closeModal();
  toast(updated + " notifikasi ditandai sebagai 'Sudah Dipesan'.", "success");
  refreshCurrent();
};

A.printPO = function () {
  var po = Store.buildPurchaseOrder();
  var rows = po.items.map(function (it, i) {
    var inp = document.getElementById("poq_" + it.notifId);
    var q = inp ? (Number(inp.value) || it.qty) : it.qty;
    return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.sku) + "</td><td>" + esc(it.name) + "</td><td class='num'>" + q + "</td><td>" + esc(it.unit) + "</td><td class='num'>" + cur(it.price) + "</td><td class='num'>" + cur(q * it.price) + "</td></tr>";
  }).join("");
  var tot = po.items.reduce(function (a, it) {
    var inp = document.getElementById("poq_" + it.notifId);
    var q = inp ? (Number(inp.value) || it.qty) : it.qty;
    return a + q * it.price;
  }, 0);
  var body = "<h2>Purchase Order</h2>" +
    '<table style="border:none"><tr><td style="border:none">No. PO</td><td style="border:none">: ' + esc(po.no) + "</td></tr>" +
    '<tr><td style="border:none">Tanggal</td><td style="border:none">: ' + fmtDateLabel(po.date) + "</td></tr></table>" +
    "<table><thead><tr><th>#</th><th>SKU</th><th>Nama Produk</th><th class='num'>Jumlah</th><th>Satuan</th><th class='num'>Harga</th><th class='num'>Subtotal</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    "<p class='text-right'><b>Total: " + cur(tot) + "</b></p>" +
    '<p class="text-muted">Metode: Reorder Point &mdash; otomatis.</p>' + signatureHTML();
  printHTML("Purchase Order " + po.no, body);
};

A.downloadPO = function () {
  var po = Store.buildPurchaseOrder();
  var rows = po.items.map(function (it) {
    var inp = document.getElementById("poq_" + it.notifId);
    var q = inp ? (Number(inp.value) || it.qty) : it.qty;
    return [po.no, po.date, it.sku, it.name, q, it.unit, it.price, q * it.price];
  });
  downloadCSV("purchase-order-" + po.no + ".csv", ["no_po", "tanggal", "sku", "nama", "jumlah", "satuan", "harga_beli", "subtotal"], rows);
  toast("Draft PO diunduh sebagai CSV.", "success");
};

/* ============ PENGUJIAN ============ */

P.simulation = function () {
  var cfg = Store.settings().manual;
  var html = '<div class="card card-pad mb16"><h3 class="card-title">Tujuan &amp; Asumsi Pengujian</h3>' +
    '<p class="card-sub">Simulasi membandingkan kebijakan pemesanan ulang <b>manual</b> vs <b>Reorder Point</b> pada data historis penjualan yang sama.</p>' +
    '<ol class="steps">' +
    '<li>Kedua metode memakai <b>kuantitas pesanan yang sama</b> (jumlah saran EOQ), sehingga perbedaan hasil semata-mata berasal dari <b>kapan</b> pesanan dilakukan.</li>' +
    '<li>Permintaan diambil dari data historis harian periode terpilih; barang yang tidak terpenuhi dianggap hilang (<i>stockout</i>).</li>' +
    '<li>Metode manual: pesan ulang pada interval tetap atau saat stok di bawah ambang yang ditentukan pelaku usaha.</li>' +
    '<li>Metode ROP: pesan ulang setiap kali stok mencapai titik ROP hasil hitung sistem, barang tiba setelah lead time.</li>' +
    "<li>Produk tanpa cukup data (min 14 hari) dilewati dari simulasi.</li></ol>" +
    "<p class='helptext'>Metrik: hari/kejadian stockout, tingkat layanan (fill rate), rata-rata stok tersimpan, hari kelebihan stok (overstock), dan estimasi biaya simpan.</p></div>";

  html += '<div class="card card-pad mb16"><h3 class="card-title">Konfigurasi Simulasi</h3>' +
    '<form class="form-grid mt8" onsubmit="A.runSim(event)">' +
    '<div class="field"><label>Periode data simulasi</label><select name="period" id="simPeriod">' + [30, 60, 90].map(function (d) {
      return '<option value="' + d + '"' + (Store.settings().historyDays === d ? " selected" : "") + ">" + d + " hari</option>";
    }).join("") + "</select></div>" +
    '<div class="field"><label>Metode manual</label><select name="mmode" id="simMMode">' +
    '<option value="threshold"' + (cfg.mode === "threshold" ? " selected" : "") + '>Ambang tetap (stok &lt; jumlah lapor)</option>' +
    '<option value="interval"' + (cfg.mode === "interval" ? " selected" : "") + '>Interval tetap (pesan tiap N hari)</option>' +
    "</select></div>" +
    '<div class="field"><label id="lblMParam">Ambang stok manual (unit)</label><input type="number" min="0" id="simMParam" value="' + (cfg.mode === "interval" ? cfg.intervalDays : cfg.threshold) + '"></div>' +
    '<div class="field"><label>Kuantitas pesanan <span class="tooltip" data-tip="0 = otomatis memakai saran sistem (min EOQ, kebutuhan '+ (Store.settings().maxCycleDays || 14) +' hari), sama untuk kedua metode.">&#9432;</span></label><input type="number" min="0" id="simQty" value="' + (cfg.orderQty || 0) + '"></div>' +
    '<div class="field full"><button class="btn btn-primary" type="submit">Jalankan Simulasi</button></div>' +
    "</form></div>";

  document.getElementById("content").innerHTML = html;
  syncSimParamLabel();
  if (Store.sim) {
    renderSimResults();
  } else {
    insertSimEmpty();
  }
  var sel = document.getElementById("simMMode");
  if (sel) sel.onchange = syncSimParamLabel;
};

function syncSimParamLabel() {
  var m = document.getElementById("simMMode");
  var lbl = document.getElementById("lblMParam");
  if (m && lbl) {
    lbl.textContent = m.value === "interval" ? "Interval pemesanan (hari)" : "Ambang stok manual (unit)";
  }
}

function insertSimEmpty() {
  var cont = document.getElementById("content");
  cont.insertAdjacentHTML("beforeend", '<div class="section-gap">' + emptyState("Klik \u201cJalankan Simulasi\u201d untuk membandingkan kinerja metode manual vs Reorder Point.") + "</div>");
}

A.runSim = function (evt) {
  if (evt.preventDefault) evt.preventDefault();
  var period = Number(document.getElementById("simPeriod").value);
  var m = document.getElementById("simMMode").value;
  var mp = Number(document.getElementById("simMParam").value);
  var q = Number(document.getElementById("simQty").value);
  var cfg = Store.settings().manual;
  cfg.mode = m;
  if (m === "interval") cfg.intervalDays = Math.max(1, mp); else cfg.threshold = Math.max(0, mp);
  cfg.orderQty = Math.max(0, q || 0);
  A.simProduct = "";
  Store.runSimulation(period);
  toast("Simulasi selesai (" + period + " hari, " + Store.sim.used + " produk dianalisis).", "success");
  renderSimResults();
};

function renderSimResults() {
  var sim = Store.sim;
  var cont = document.getElementById("content");
  if (document.getElementById("simResultRoot")) {
    document.getElementById("simResultRoot").remove();
  }
  var wrap = document.createElement("div");
  wrap.id = "simResultRoot";
  wrap.className = "section-gap";
  wrap.innerHTML = buildSimResultsHTML(sim);
  cont.appendChild(wrap);
  renderSimCharts(sim);
}

function buildSimResultsHTML(sim) {
  var v = sim.verdict;
  var vcls = v.level === "ok" ? "verdict ok" : v.level === "part" ? "verdict part" : "verdict no";
  var vico = v.level === "ok" ? "&#10003;" : v.level === "part" ? "&#9888;" : "&#10005;";
  var html = '<div class="' + vcls + ' mb16"><div class="v-icon">' + vico + "</div>" +
    '<div><h4>' + v.title + "</h4><p>" + v.text + "</p></div></div>";

  html += '<div class="grid grid-3 mb16">' +
    compCard("Hari Kehabisan Stok (stockout)", sim.agg.man.stockoutDays, sim.agg.rop.stockoutDays, "hari", "lebih rendah lebih baik") +
    compCard("Tingkat Layanan (fill rate)", sim.agg.man.fillRate + "%", sim.agg.rop.fillRate + "%", "%", "lebih tinggi lebih baik") +
    compCard("Rata-rata Stok Tersimpan", fmtNum(sim.agg.man.avgStock), fmtNum(sim.agg.rop.avgStock), "unit", "lebih rendah lebih efisien") +
    compCard("Hari Kelebihan Stok (overstock)", sim.agg.man.overDays, sim.agg.rop.overDays, "hari", "lebih rendah lebih baik") +
    compCard("Estimasi Biaya Simpan", cur(sim.agg.man.cost), cur(sim.agg.rop.cost), "Rp", "lebih rendah lebih baik") +
    compCard("Produk Dianalisis", sim.used + " produk", sim.used + " produk", "", sim.skipped + " produk dilewati (data kurang)") +
    "</div>";

  html += '<div class="grid grid-2 mb16">' +
    '<div class="card card-pad"><h3 class="card-title">Perbandingan Metrik (rata-rata agregat)</h3>' +
    '<p class="card-sub">Nilai diskalakan 0-100% per indikator agar sebanding; angka pasti tertera pada tabel di bawah.</p>' +
    '<div id="simCompare" class="chart-box"></div></div>' +
    '<div class="card card-pad"><h3 class="card-title">Trajektori Stok per Produk</h3>' +
    '<p class="card-sub">Jalur stok harian hasil simulasi (garis putus-putus = ROP).</p>' +
    '<div class="row mb12"><label style="font-size:12.5px;font-weight:600">Produk:</label><select id="simProd" onchange="A.simProdChange()">' + simTrajOpts(sim) + "</select></div>" +
    '<div id="simTraj" class="chart-box"></div></div></div>';

  html += '<div class="card card-pad mb16"><h3 class="card-title">Uji Akurasi Notifikasi Reorder</h3>' +
    '<p class="card-sub">Dari simulasi metode ROP: seberapa tepat sistem memicu notifikasi sebelum stok habis.</p><div class="grid grid-4 mb12">' +
    accCard("Notifikasi dipicu", fmtNum(sim.acc.triggers), "total kali stok &le; ROP memicu pesanan") +
    accCard("Tepat waktu", fmtNum(sim.acc.timely), "muncul dengan cukup waktu sebelum krisis") +
    accCard("Presisi (precision)", (sim.acc.precision == null ? "-" : fmtNum(sim.acc.precision) + "%"), "proporsi notifikasi yang mencegah stockout") +
    accCard("Deteksi stockout (miss)", fmtNum(sim.acc.missed) + " / " + fmtNum(sim.acc.runs), "kejadian stockout yang tidak terdeteksi lebih awal &rarr; tingkat deteksi " + fmtNum(sim.acc.detectionRate) + "%") +
    "</div><div class='helptext'>Catatan: notifikasi dihitung <b>tepat waktu</b> bila stok saat memicu masih sanggup menutupi permintaan selama lead time, sehingga pesanan tiba sebelum stok habis. <b>Miss</b> dihitung sebagai rangkaian hari stockout yang tidak diawali notifikasi tepat waktu minimal satu lead time sebelumnya.</div></div>";

  html += '<div class="card card-pad"><div class="row-between mb12">' +
    '<h3 class="card-title" style="margin:0">Tabel Hasil per Produk</h3>' +
    '<div class="row"><button class="btn btn-outline btn-sm" onclick="A.exportSim()">Ekspor ke CSV</button></div></div>' +
    '<div class="table-wrap"><table class="tbl"><thead><tr>' +
    "<th>SKU</th><th>Nama</th><th class='num'>d</th><th class='num'>ROP</th><th class='num'>Q</th>" +
    "<th class='num'>SO Manual</th><th class='num'>SO ROP</th>" +
    "<th class='num'>Fill M</th><th class='num'>Fill R</th>" +
    "<th class='num'>Rata2 M</th><th class='num'>Rata2 R</th>" +
    "<th class='num'>Ovr M</th><th class='num'>Ovr R</th>" +
    "<th class='num'>B. Simpan M</th><th class='num'>B. Simpan R</th></tr></thead><tbody>" +
    sim.rows.map(function (r) {
      return "<tr>" +
        '<td class="mono">' + esc(r.sku) + "</td>" +
        "<td>" + esc(r.name) + "</td>" +
        '<td class="num">' + fmtNum(r.d) + "</td>" +
        '<td class="num">' + fmtNum(r.rop) + "</td>" +
        '<td class="num">' + fmtNum(r.qty) + "</td>" +
        '<td class="num">' + fmtNum(r.stockout) + " / " + fmtNum(r.stockoutRop) + "</td>" +
        '<td class="num">' + fmtNum(r.fill) + "% / " + fmtNum(r.fillRop) + "%</td>" +
        '<td class="num">' + fmtNum(r.avg) + " / " + fmtNum(r.avgRop) + "</td>" +
        '<td class="num">' + fmtNum(r.over) + " / " + fmtNum(r.overRop) + "</td>" +
        '<td class="num">' + cur(r.cost) + " / " + cur(r.costRop) + "</td>" +
        "</tr>";
    }).join("") + "</tbody></table></div></div>";
  return html;
}

function compCard(label, manV, ropV, unit, hint) {
  return '<div class="card card-pad">' +
    '<div class="sc-label" style="font-weight:600">' + label + "</div>" +
    '<div class="row-between mt8"><div><div style="font-size:11px;color:var(--muted)">Manual</div><b style="color:#57534e">' + manV + "</b></div>" +
    '<div style="font-size:18px;color:var(--muted)">&#8594;</div>' +
    '<div><div style="font-size:11px;color:var(--muted)">ROP</div><b style="color:#166534">' + ropV + "</b></div></div>" +
    '<div class="sc-sub mt8">' + hint + " (" + unit + ")</div></div>";
}

function accCard(label, val, hint) {
  return '<div class="stat-card"><div class="sc-top"><span class="sc-label">' + label + "</span></div>" +
    '<div class="sc-num" style="font-size:24px">' + val + '</div><div class="sc-sub mt8">' + hint + "</div></div>";
}

function simTrajOpts(sim) {
  var keys = Object.keys(sim.traj);
  if (!keys.length) return '<option value="">-</option>';
  return keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(sim.traj[k].name) + "</option>";
  }).join("");
}

function renderSimCharts(sim) {
  if (!document.getElementById("simCompare")) return;
  var labels = ["Stockout", "Fill rate", "Rata2 stok", "Overstock", "Biaya simpan"];
  var man = [sim.agg.man.stockoutDays, sim.agg.man.fillRate, sim.agg.man.avgStock, sim.agg.man.overDays, sim.agg.man.cost / 1000];
  var rop = [sim.agg.rop.stockoutDays, sim.agg.rop.fillRate, sim.agg.rop.avgStock, sim.agg.rop.overDays, sim.agg.rop.cost / 1000];
  renderGroupedBar("simCompare", labels, man, rop, "Manual", "Reorder Point", {colorA: "#78716c", colorB: COLOR.teal, height: 240, norm: false});
  var keys = Object.keys(sim.traj);
  if (!keys.length) {
    document.getElementById("simTraj").innerHTML = emptyState("Tidak ada produk yang layak disimulasikan.");
    return;
  }
  var sku = A.simProduct || keys[0];
  var sel = document.getElementById("simProd");
  if (sel) sel.value = sku;
  renderTraj(sim, sku);
}

function renderTraj(sim, sku) {
  var tr = sim.traj[sku];
  var el = document.getElementById("simTraj");
  if (!tr || !el) return;
  renderLine("simTraj", tr.date.map(fmtDateLabel), [
    {name: "Manual", values: tr.man, color: "#78716c"},
    {name: "Reorder Point", values: tr.rop, color: COLOR.teal}
  ], {height: 260, threshold: {value: tr.ropLine, color: COLOR.orange, label: "ROP"}});
}

A.simProduct = "";

P.simulationCharts = renderSimCharts;

A.simProdChange = function () {
  A.simProduct = document.getElementById("simProd").value;
  renderTraj(Store.sim, A.simProduct);
};

A.exportSim = function () {
  var sim = Store.sim;
  if (!sim) return;
  var rows = sim.rows.map(function (r) {
    return [r.sku, r.name, r.d, r.rop, r.qty, r.stockout, r.stockoutRop, r.fill, r.fillRop, r.avg, r.avgRop, r.over, r.overRop, r.cost, r.costRop, r.acc.triggers, r.acc.timely, r.acc.precision, r.acc.runs, r.acc.missed, r.acc.detectionRate];
  });
  downloadCSV("hasil-pengujian-manual-vs-rop.csv",
    ["sku", "nama", "d", "rop", "Q", "days_stockout_manual", "days_stockout_rop", "fill_rate_manual", "fill_rate_rop", "avg_stock_manual", "avg_stock_rop", "days_overstock_manual", "days_overstock_rop", "holding_cost_manual", "holding_cost_rop", "notif_triggers", "notif_timely", "precision_pct", "stockout_runs", "miss_runs", "detection_pct"],
    rows);
  toast("Hasil pengujian diekspor ke CSV.", "success");
};

/* ============ LAPORAN ============ */

P.reports = function () {
  var html = '<div class="tabs">' +
    '<button id="repr_stock" class="active" onclick="A.setReportTab(\'stock\')">Stok Saat Ini</button>' +
    '<button id="repr_move" onclick="A.setReportTab(\'move\')">Pergerakan Stok</button>' +
    '<button id="repr_rop" onclick="A.setReportTab(\'rop\')">Hasil Perhitungan ROP</button>' +
    "</div><div id='repBody'></div>";
  document.getElementById("content").innerHTML = html;
  A.repTab = "stock";
  renderReport();
};

A.setReportTab = function (tab) {
  A.repTab = tab;
  ["stock", "move", "rop"].forEach(function (t) {
    var el = document.getElementById("repr_" + t);
    if (el) el.className = t === tab ? "active" : "";
  });
  renderReport();
};

function renderReport() {
  var el = document.getElementById("repBody");
  if (!el) return;
  if (A.repTab === "stock") {
    el.innerHTML = reportStock({showToolbar: true});
  } else if (A.repTab === "move") {
    el.innerHTML = reportMoveToolbar() + '<div id="repMoveBody">' + reportMoveTable("", "", "", "") + "</div>";
  } else {
    el.innerHTML = reportROP();
  }
}

function reportStock() {
  var st = Store.computeStatsAll();
  var rows = Store.products().map(function (p) {
    var s = statusOf(p, st[p.id]);
    return "<tr" + ([ "habis", "reorder" ].indexOf(s) >= 0 ? ' class="crit"' : "") + ">" +
      '<td class="mono">' + esc(p.sku) + "</td>" +
      "<td>" + esc(p.name) + "</td>" +
      "<td>" + esc(p.category) + "</td>" +
      '<td class="num"><b>' + fmtNum(p.stock) + "</b></td>" +
      "<td>" + esc(p.unit) + "</td>" +
      '<td class="num">' + cur(p.buyPrice) + "</td>" +
      '<td class="num">' + cur(p.sellPrice) + "</td>" +
      "<td>" + statusBadge(s) + "</td></tr>";
  }).join("");
  var table = '<div class="table-wrap"><table class="tbl"><thead><tr>' +
    "<th>SKU</th><th>Nama</th><th>Kategori</th><th class='num'>Stok</th><th>Satuan</th><th class='num'>Harga Beli</th><th class='num'>Harga Jual</th><th>Status</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  return '<div class="card card-pad"><div class="row-between mb12">' +
    '<h3 class="card-title" style="margin:0">Laporan Stok Saat Ini</h3>' +
    '<div class="row"><button class="btn btn-outline btn-sm" onclick="A.exportRepStock()">Unduh CSV</button><button class="btn btn-outline btn-sm" onclick="A.printRepStock()">Cetak / PDF</button></div></div>' + table + "</div>";
}

function reportMoveToolbar() {
  return '<div class="card card-pad mb12"><div class="row">' +
    '<span class="text-muted">Tanggal:</span><input type="date" id="repF" onchange="A.refreshMove()"> <span class="text-muted">s/d</span> <input type="date" id="repT" onchange="A.refreshMove()"> ' +
    '<select id="repType" onchange="A.refreshMove()"><option value="">Semua jenis</option><option value="in">Masuk</option><option value="out">Keluar</option></select>' +
    '<button class="btn btn-outline btn-sm" onclick="A.exportRepMove()">Unduh CSV</button>' +
    '<button class="btn btn-outline btn-sm" onclick="A.printRepMove()">Cetak / PDF</button>' +
    "</div></div>";
}

function reportMoveTable(from, to, prod, type) {
  var list = Store.transactions().slice();
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  list = list.filter(function (t) {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (type && t.type !== type) return false;
    return true;
  });
  list.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var rows = list.slice(0, 500).map(function (t) {
    var p = mapP[t.productId];
    var isIn = t.type === "in";
    return "<tr>" + "<td>" + fmtDateLabel(t.date) + "</td>" +
      '<td class="mono">' + esc(p ? p.sku : "-") + "</td>" +
      "<td>" + esc(p ? p.name : "-") + "</td>" +
      "<td>" + (isIn ? '<span class="badge badge-info">Masuk</span>' : '<span class="badge badge-yellow">Keluar</span>') + "</td>" +
      '<td class="num">' + (isIn ? "+" : "&minus;") + fmtNum(t.qty) + "</td>" +
      "<td>" + esc(t.note) + "</td></tr>";
  }).join("");
  return '<div class="card card-pad"><div class="row-between mb12"><h3 class="card-title" style="margin:0">Laporan Pergerakan Stok</h3>' +
    '<span class="text-muted">' + list.length + " transaksi</span></div>" +
    '<div class="table-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>SKU</th><th>Produk</th><th>Jenis</th><th class="num">Jumlah</th><th>Keterangan</th></tr></thead>' +
    "<tbody>" + rows + "</tbody></table></div></div>";
}

function reportROP() {
  return '<div class="card card-pad"><div class="row-between mb12">' +
    '<h3 class="card-title" style="margin:0">Laporan Hasil Perhitungan Reorder Point</h3>' +
    '<div class="row"><button class="btn btn-outline btn-sm" onclick="A.exportRepRop()">Unduh CSV</button><button class="btn btn-outline btn-sm" onclick="A.printRepRop()">Cetak / PDF</button></div></div>' +
    '<div class="table-wrap">' + ropReportTable() + "</div></div>";
}

function ropReportTable() {
  var st = Store.computeStatsAll();
  var rows = Store.products().map(function (p) {
    var s = st[p.id];
    return "<tr>" +
      '<td class="mono">' + esc(p.sku) + "</td>" +
      "<td>" + esc(p.name) + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.d) : "&ndash;") + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.sigma) : "&ndash;") + "</td>" +
      '<td class="num">' + p.leadTime + "</td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.ss) : "&ndash;") + "</td>" +
      '<td class="num"><b>' + (s.enough ? fmtNum(s.rop) : "&ndash;") + "</b></td>" +
      '<td class="num">' + (s.enough ? fmtNum(s.cycle) : "&ndash;") + "</td>" +
      '<td class="num"><b>' + fmtNum(p.stock) + "</b></td>" +
      "<td>" + statusBadge(statusOf(p, s)) + "</td></tr>";
  }).join("");
  return '<table class="tbl"><thead><tr><th>SKU</th><th>Nama</th><th class="num">d</th><th class="num">&sigma;d</th><th class="num">L</th><th class="num">SS</th><th class="num">ROP</th><th class="num">Saran Q</th><th class="num">Stok</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table>";
}

function ropReportCSV() {
  var st = Store.computeStatsAll();
  return Store.products().map(function (p) {
    var s = st[p.id];
    return [p.sku, p.name, p.category, s.enough ? s.d : "", s.enough ? s.sigma : "", p.leadTime, s.enough ? s.ss : "", s.enough ? s.rop : "", s.enough ? s.cycle : "", p.stock, statusOf(p, s)];
  });
}

A.refreshMove = function () {
  var from = document.getElementById("repF").value;
  var to = document.getElementById("repT").value;
  var type = document.getElementById("repType").value;
  document.getElementById("repMoveBody").innerHTML = reportMoveTable(from, to, "", type);
};

A.exportRepStock = function () {
  var st = Store.computeStatsAll();
  var rows = Store.products().map(function (p) {
    var s = statusOf(p, st[p.id]);
    return [p.sku, p.name, p.category, p.stock, p.unit, p.buyPrice, p.sellPrice, s];
  });
  downloadCSV("laporan-stok.csv", ["sku", "nama", "kategori", "stok", "satuan", "harga_beli", "harga_jual", "status"], rows);
  toast("Laporan stok diunduh.", "success");
};

A.printRepStock = function () {
  var st = Store.computeStatsAll();
  var rows = Store.products().map(function (p) {
    return "<tr><td>" + esc(p.sku) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.category) + "</td><td class='num'>" + p.stock + "</td><td>" + esc(p.unit) + "</td><td class='num'>" + cur(p.buyPrice) + "</td><td class='num'>" + cur(p.sellPrice) + "</td><td>" + statusOf(p, st[p.id]) + "</td></tr>";
  }).join("");
  printHTML("Laporan Stok Saat Ini", "<h2>Stok Saat Ini</h2><table><thead><tr><th>SKU</th><th>Nama</th><th>Kategori</th><th class='num'>Stok</th><th>Satuan</th><th class='num'>H. Beli</th><th class='num'>H. Jual</th><th>Status</th></tr></thead><tbody>" + rows + "</tbody></table>" + signatureHTML());
};

A.exportRepMove = function () {
  var from = document.getElementById("repF").value;
  var to = document.getElementById("repT").value;
  var type = document.getElementById("repType").value;
  var list = Store.transactions().slice();
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  list = list.filter(function (t) {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (type && t.type !== type) return false;
    return true;
  });
  list.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var rows = list.map(function (t) {
    var p = mapP[t.productId];
    return [t.date, p ? p.sku : "-", p ? p.name : "-", t.type === "in" ? "Masuk" : "Keluar", t.qty, t.note];
  });
  downloadCSV("laporan-pergerakan-stok.csv", ["tanggal", "sku", "nama", "jenis", "jumlah", "keterangan"], rows);
  toast("Laporan pergerakan stok diunduh.", "success");
};

A.printRepMove = function () {
  var from = document.getElementById("repF").value;
  var to = document.getElementById("repT").value;
  var type = document.getElementById("repType").value;
  var list = Store.transactions().slice();
  var mapP = {};
  Store.products().forEach(function (p) { mapP[p.id] = p; });
  list = list.filter(function (t) {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (type && t.type !== type) return false;
    return true;
  });
  list.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var rows = list.map(function (t) {
    var p = mapP[t.productId];
    return "<tr><td>" + fmtDateLabel(t.date) + "</td><td>" + esc(p ? p.sku : "-") + "</td><td>" + esc(p ? p.name : "-") + "</td><td>" + (t.type === "in" ? "Masuk" : "Keluar") + "</td><td class='num'>" + (t.type === "in" ? "+" : "-") + t.qty + "</td><td>" + esc(t.note) + "</td></tr>";
  }).join("");
  printHTML("Laporan Pergerakan Stok", "<h2>Pergerakan Stok</h2><table><thead><tr><th>Tanggal</th><th>SKU</th><th>Nama</th><th>Jenis</th><th class='num'>Jumlah</th><th>Keterangan</th></tr></thead><tbody>" + rows + "</tbody></table>" + signatureHTML());
};

A.exportRepRop = function () {
  downloadCSV("laporan-perhitungan-rop.csv", ["sku", "nama", "kategori", "d", "sigma_d", "lead_time", "safety_stock", "rop", "qty_pesan", "stock", "status"], ropReportCSV());
  toast("Laporan ROP diunduh.", "success");
};

A.printRepRop = function () {
  var st = Store.computeStatsAll();
  var rows = Store.products().map(function (p) {
    var s = st[p.id];
    return "<tr><td>" + esc(p.sku) + "</td><td>" + esc(p.name) + "</td><td class='num'>" + (s.enough ? fmtNum(s.d) : "-") + "</td><td class='num'>" + (s.enough ? fmtNum(s.sigma) : "-") + "</td><td class='num'>" + p.leadTime + "</td><td class='num'>" + (s.enough ? fmtNum(s.ss) : "-") + "</td><td class='num'><b>" + (s.enough ? fmtNum(s.rop) : "-") + "</b></td><td class='num'>" + (s.enough ? fmtNum(s.cycle) : "-") + "</td><td class='num'>" + p.stock + "</td></tr>";
  }).join("");
  printHTML("Laporan Hasil Perhitungan Reorder Point", "<h2>Hasil Perhitungan ROP</h2><table><thead><tr><th>SKU</th><th>Nama</th><th class='num'>d</th><th class='num'>σd</th><th class='num'>L</th><th class='num'>SS</th><th class='num'>ROP</th><th class='num'>Saran Q</th><th class='num'>Stok</th></tr></thead><tbody>" + rows + "</tbody></table>" + signatureHTML());
};

/* ============ PENGATURAN ============ */

P.settings = function () {
  var s = Store.settings();
  var html = '<div class="card card-pad mb16"><h3 class="card-title">Pengaturan Sistem</h3>' +
    '<p class="card-sub">Parameter ini dipakai untuk seluruh perhitungan ROP dan simulasi.</p>' +
    '<form class="form-grid" onsubmit="A.saveSettings(event)">' +
    '<div class="field full"><label>Nama Toko / Usaha</label><input name="storeName" value="' + esc(s.storeName) + '"></div>' +
    '<div class="field"><label>Tingkat Layanan Default</label><select name="defaultServiceLevel">' +
    '<option value="0.9"' + (s.defaultServiceLevel === 0.9 ? " selected" : "") + '>90% (Z=1,28)</option>' +
    '<option value="0.95"' + (s.defaultServiceLevel === 0.95 ? " selected" : "") + '>95% (Z=1,65)</option>' +
    '<option value="0.99"' + (s.defaultServiceLevel === 0.99 ? " selected" : "") + '>99% (Z=2,33)</option>' +
    "</select></div>" +
    '<div class="field"><label>Lead Time Default (hari)</label><input type="number" min="1" name="defaultLeadTime" value="' + s.defaultLeadTime + '"></div>' +
    '<div class="field"><label>Biaya Pesan S (Rp / pemesanan) <span class="tooltip" data-tip="Biaya tetap tiap kali pesan ulang ke pemasok, dipakai untuk EOQ.">&#9432;</span></label><input type="number" min="0" name="orderCost" value="' + s.orderCost + '"></div>' +
    '<div class="field"><label>Biaya Simpan H (% dari harga beli / tahun)</label><input type="number" min="0" name="holdingPct" value="' + s.holdingPct + '"></div>' +
    '<div class="field"><label>Faktor Waspada (kali ROP)</label><input type="number" step="0.1" min="1" name="yellowFactor" value="' + s.yellowFactor + '"></div>' +
    '<div class="field"><label>Periode Data Historis (hari)</label><select name="historyDays">' + [30, 60, 90].map(function (d) {
      return '<option value="' + d + '"' + (s.historyDays === d ? " selected" : "") + ">" + d + " hari</option>";
    }).join("") + "</select></div>" +
    '<div class="field"><label>Batas Siklus Pemesanan (hari) <span class="tooltip" data-tip="Kuantitas pesanan saran dibatasi kebutuhan maksimal sejumlah hari ini agar realistik bagi kapasitas penyimpanan UMKM.">&#9432;</span></label><input type="number" min="1" name="maxCycleDays" value="' + (s.maxCycleDays || 14) + '"></div>' +
    '<div class="field full sc-label" style="margin-top:6px">Parameter Metode Manual (untuk modul Pengujian)</div>' +
    '<div class="field"><label>Metode</label><select name="mMode">' +
    '<option value="threshold"' + (s.manual.mode === "threshold" ? " selected" : "") + '>Ambang tetap</option>' +
    '<option value="interval"' + (s.manual.mode === "interval" ? " selected" : "") + '>Interval tetap</option>' +
    "</select></div>" +
    '<div class="field"><label>Ambang / Interval</label><input type="number" min="0" name="mParam" value="' + (s.manual.mode === "interval" ? s.manual.intervalDays : s.manual.threshold) + '"></div>' +
    '<div class="field"><label>Kuantitas Pesanan (0 = otomatis EOQ)</label><input type="number" min="0" name="mQty" value="' + (s.manual.orderQty || 0) + '"></div>' +
    '<div class="field full"><button class="btn btn-primary" type="submit">Simpan Pengaturan</button></div>' +
    "</form></div>";

  html += '<div class="card card-pad"><h3 class="card-title">Data &amp; Utilitas</h3>' +
    '<div class="row mt8">' +
    '<button class="btn btn-ghost" onclick="A.downloadBackup()">Unduh Cadangan Data</button>' +
    '<button class="btn btn-ghost" onclick="document.getElementById(\'backupFile\').click()">Pulihkan Data</button>' +
    '<input type="file" id="backupFile" accept="application/json,.json" class="hidden" onchange="A.restoreBackup(this)">' +
    '<button class="btn btn-danger" onclick="A.resetData()">Reset ke Data Contoh</button>' +
    "</div>" +
    '<p class="helptext mb8 mt8">Reset akan menghapus seluruh perubahan dan mengembalikan purwarupa ke data contoh (13 produk, 90 hari riwayat penjualan). Semua data tersimpan di memori peramban (tanpa server).</p></div>';

  html += '<div class="card card-pad section-gap"><h3 class="card-title">Tentang Purwarupa</h3>' +
    '<p class="card-sub">Sistem Manajemen Stok Otomatis berbasis Reorder Point untuk UMKM.</p>' +
    '<p class="helptext">Penelitian ini menguji apakah pemesanan ulang berbasis ROP mengurangi risiko kehabisan stok dan kelebihan stok dibanding pencatatan manual. Seluruh perhitungan (d, &sigma;d, safety stock, ROP, EOQ) dijalankan di sisi klien. Data dapat direset ulang kapan saja.</p></div>';

  document.getElementById("content").innerHTML = html;
};

A.saveSettings = function (evt) {
  if (evt.preventDefault) evt.preventDefault();
  var f = evt.target;
  var s = Store.settings();
  s.storeName = f.storeName.value.trim() || "Toko Berkah Jaya";
  s.defaultServiceLevel = Number(f.defaultServiceLevel.value);
  s.defaultLeadTime = Math.max(1, Number(f.defaultLeadTime.value) || 1);
  s.orderCost = Math.max(0, Number(f.orderCost.value) || 0);
  s.holdingPct = Math.max(0, Number(f.holdingPct.value) || 0);
  s.yellowFactor = Math.max(1, Number(f.yellowFactor.value) || 1.5);
  s.historyDays = Number(f.historyDays.value);
  s.maxCycleDays = Math.max(1, Number(f.maxCycleDays.value) || 14);
  s.manual.mode = f.mMode.value;
  if (f.mMode.value === "interval") s.manual.intervalDays = Math.max(1, Number(f.mParam.value) || 1);
  else s.manual.threshold = Math.max(0, Number(f.mParam.value) || 0);
  s.manual.orderQty = Math.max(0, Number(f.mQty.value) || 0);
  Store._recalc();
  Store._persistSoon();
  toast("Pengaturan disimpan.", "success");
  refreshCurrent();
};

A.downloadBackup = function () {
  var blob = new Blob([Store.exportJSON()], {type: "application/json"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "restock-backup-" + fmtDateStr(new Date()) + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  toast("Cadangan data diunduh.", "success");
};

A.restoreBackup = function (input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var d = JSON.parse(String(e.target.result));
      if (!d.products || !d.transactions || !d.settings) throw new Error("format");
      Store.data = d;
      if (!d.notifications) d.notifications = [];
      Store._recomputeIds();
      Store.sim = null;
      Store._recalc();
      Store._persistNow();
      toast("Data berhasil dipulihkan.", "success");
      refreshCurrent();
    } catch (err) {
      toast("File cadangan tidak valid.", "error");
    }
    input.value = "";
  };
  reader.readAsText(file);
};

A.resetData = function () {
  confirmDialog("Reset ke Data Contoh",
    "Seluruh data saat ini akan <b>dihapus</b> dan diganti data contoh bawaan. Lanjutkan?",
    function () {
      Store.reset();
      A.simProduct = "";
      toast("Data contoh berhasil dimuat ulang.", "success");
      refreshCurrent();
    },
    "Reset",
    true
  );
};

/* ============ QUICK ORDER ============ */

A.quickOrder = function (productId) {
  var p = Store.getProduct(productId);
  if (!p) return;
  var st = Store.computeStats(p);
  var qty = suggestOrderQty(st, p.stock);
  openModal({
    title: "Pemesanan Ulang &mdash; " + esc(p.name),
    body: '<p class="text-muted">Catat pembelian sebagai transaksi <b>stok masuk</b>. Stok akan bertambah otomatis sebesar jumlah yang dimasukkan.</p>' +
      '<div class="form-grid">' +
      '<div class="field full"><label>Produk</label><input value="' + esc(p.sku + " - " + p.name) + '" readonly></div>' +
      '<div class="field"><label>Stok saat ini</label><input value="' + fmtNum(p.stock) + " " + esc(p.unit) + '" readonly></div>' +
      '<div class="field"><label>ROP</label><input value="' + (st.enough ? fmtNum(st.rop) : "-") + '" readonly></div>' +
      '<div class="field full"><label>Jumlah pesanan (unit) *</label><input type="number" id="qoQty" min="1" step="1" value="' + Math.max(1, qty) + '"></div>' +
      '<div class="field"><label>Tanggal terima</label><input type="date" id="qoDate" value="' + fmtDateStr(new Date()) + '"></div>' +
      '<div class="field"><label>Keterangan</label><input id="qoNote" value="Pembelian restok" placeholder=""></div>' +
      "</div>",
    foot: '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" onclick="A.confirmOrder(\'' + productId + '\')">Catat &amp; Tambah Stok</button>'
  });
};

A.confirmOrder = function (productId) {
  var qty = Number(document.getElementById("qoQty").value);
  var date = document.getElementById("qoDate").value;
  var note = document.getElementById("qoNote").value.trim();
  var out = Store.addTransaction({
    productId: productId,
    type: "in",
    qty: qty,
    date: date,
    note: note || "Pembelian restok"
  });
  if (!out.ok) {
    toast(out.error, "error");
    return;
  }
  closeModal();
  toast("Stok " + out.product.name + " bertambah " + fmtNum(qty) + " unit. Stok kini " + fmtNum(out.product.stock) + ".", "success");
  refreshCurrent();
};

/* ============ REGISTER ============ */

if (typeof window !== "undefined") {
  window.A = A;
  window.P = P;
}