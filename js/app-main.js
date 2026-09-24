var App = {page: "dashboard"};

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

document.addEventListener("DOMContentLoaded", function () {
  Store.init();
  buildNav();
  updateTop();
  updateBell();
  P.render("dashboard");

  document.getElementById("bellBtn").addEventListener("click", function () {
    goto("notifications");
  });
  document.getElementById("navToggle").addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
  });

  Store.initAsync(function (loaded) {
    if (loaded) {
      refreshCurrent();
      toast("Data dimuat dari database.", "success");
    }
  });
});

window.goto = goto;
window.refresh = refresh;
window.refreshCurrent = refreshCurrent;