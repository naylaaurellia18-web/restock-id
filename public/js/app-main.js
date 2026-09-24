var App = {page: "dashboard", authed: false};

function $(id) { return document.getElementById(id); }

function showBoot(show) {
  var el = $("boot");
  if (el) el.classList.toggle("hidden", !show);
}

function showAuth(mode) {
  $("boot").classList.add("hidden");
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  if (mode === "register") {
    $("loginView").classList.add("hidden");
    $("registerView").classList.remove("hidden");
  } else {
    $("registerView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
  }
}

function showApp() {
  $("boot").classList.add("hidden");
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
}

function authError(elId, msg) {
  var el = $(elId);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("show", !!msg);
}

function setUserChip(user) {
  if (!user) return;
  var initial = (user.name || user.username || "U").trim().charAt(0).toUpperCase();
  $("userAvatar").textContent = initial;
  $("userName").textContent = user.name || user.username;
  $("umName").textContent = user.name || user.username;
  $("umMeta").textContent = "@" + (user.username || "") + (user.role === "admin" ? " · Admin" : "");
}

function buildNav() {
  var nav = document.getElementById("nav");
  var baru = Store.notifications().filter(function (n) { return n.status === "baru"; }).length;
  nav.innerHTML = NAV.map(function (item) {
    var extra = "";
    if (item.id === "notifications" && baru > 0) {
      extra = '<span class="ni-count">' + baru + "</span>";
    }
    return '<a class="' + (App.page === item.id ? "active" : "") + '" id="nav_' + item.id + '" data-page="' + item.id + '">' +
      '<span class="ni-title">' + extra + item.label + "</span>" +
      '<span class="ni-sub">' + item.sub + "</span></a>";
  }).join("");
  Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      goto(a.getAttribute("data-page"));
    });
  });
}

function goto(page) {
  App.page = page;
  document.body.classList.remove("nav-open");
  refresh();
  window.scrollTo(0, 0);
}

function refresh() {
  Store._recalc();
  updateTop();
  P.render(App.page);
  buildNav();
  updateBell();
}

function updateTop() {
  var item = NAV.find(function (x) { return x.id === App.page; }) || NAV[0];
  document.getElementById("pageTitle").textContent = item.label;
  var sub = document.getElementById("pageSubtitle");
  sub.innerHTML = item.sub;
  document.getElementById("storeName").textContent = Store.settings().storeName;
}

function updateBell() {
  var baru = Store.notifications().filter(function (n) { return n.status === "baru"; }).length;
  var b = document.getElementById("bellBadge");
  if (baru > 0) {
    b.textContent = baru;
    b.style.display = "inline-block";
  } else {
    b.style.display = "none";
  }
}

function refreshCurrent() {
  refresh();
}

function enterApp(user) {
  App.authed = true;
  setUserChip(user || Auth.user());
  Store.init();
  buildNav();
  updateTop();
  updateBell();
  P.render(App.page);
  showApp();
  $("pagefoot").textContent = "Restock.id — Purwarupa penelitian · Data tersimpan aman di server";
  Store.initAsync(function (loaded) {
    refreshCurrent();
    if (loaded) toast("Data dimuat dari database.", "success");
  });
}

function leaveApp() {
  App.authed = false;
  Auth.clear();
  showAuth("login");
}

/* ===== AUTH UI ===== */
function bindAuthUI() {
  $("toRegister").addEventListener("click", function (e) {
    e.preventDefault();
    authError("registerErr", "");
    showAuth("register");
  });
  $("toLogin").addEventListener("click", function (e) {
    e.preventDefault();
    authError("loginErr", "");
    showAuth("login");
  });

  Array.prototype.forEach.call(document.querySelectorAll(".pw-toggle"), function (btn) {
    btn.addEventListener("click", function () {
      var input = $(btn.getAttribute("data-target"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Sembunyi" : "Lihat";
    });
  });

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    authError("loginErr", "");
    var btn = $("loginBtn");
    btn.disabled = true;
    btn.textContent = "Memproses…";
    Auth.login($("loginId").value.trim(), $("loginPw").value).then(function (res) {
      btn.disabled = false;
      btn.textContent = "Masuk";
      if (!res.ok) { authError("loginErr", res.error); return; }
      toast("Selamat datang, " + (res.user.name || res.user.username) + "!", "success");
      $("loginForm").reset();
      enterApp(res.user);
    });
  });

  $("registerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    authError("registerErr", "");
    var pw = $("regPw").value;
    var pw2 = $("regPw2").value;
    if (pw !== pw2) { authError("registerErr", "Password tidak sama."); return; }
    var btn = $("registerBtn");
    btn.disabled = true;
    btn.textContent = "Mendaftar…";
    Auth.register({
      name: $("regName").value.trim(),
      username: $("regUsername").value.trim(),
      email: $("regEmail").value.trim(),
      password: pw
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = "Daftar & Masuk";
      if (!res.ok) { authError("registerErr", res.error); return; }
      toast("Akun berhasil dibuat. Selamat datang!", "success");
      $("registerForm").reset();
      enterApp(res.user);
    });
  });

  // user menu
  $("userChip").addEventListener("click", function (e) {
    e.stopPropagation();
    $("userMenu").classList.toggle("open");
  });
  document.addEventListener("click", function () {
    $("userMenu").classList.remove("open");
  });
  $("logoutBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    $("userMenu").classList.remove("open");
    Auth.logout();
    toast("Kamu telah keluar.", "success");
    leaveApp();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  bindAuthUI();

  $("bellBtn").addEventListener("click", function () {
    if (App.authed) goto("notifications");
  });
  $("navToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    document.body.classList.toggle("nav-open");
  });
  document.addEventListener("click", function (e) {
    if (!document.body.classList.contains("nav-open")) return;
    if (e.target.closest && (e.target.closest("#sidebar") || e.target.closest("#navToggle"))) return;
    document.body.classList.remove("nav-open");
  });

  showBoot(true);
  Auth.me().then(function (user) {
    if (!user) {
      showAuth("login");
      return;
    }
    enterApp(user);
  }).catch(function () {
    showAuth("login");
  });
});

window.goto = goto;
window.refresh = refresh;
window.refreshCurrent = refreshCurrent;
