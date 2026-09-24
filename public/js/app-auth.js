var Auth = {
  TOKEN_KEY: "restock_token",
  USER_KEY: "restock_user",

  token: function () {
    try { return localStorage.getItem(this.TOKEN_KEY) || ""; } catch (e) { return ""; }
  },

  user: function () {
    try {
      var raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  setSession: function (token, user) {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch (e) {}
  },

  clear: function () {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (e) {}
  },

  headers: function (extra) {
    var h = extra || {};
    var t = this.token();
    if (t) h["X-Session-Token"] = t;
    return h;
  },

  api: function (method, path, body) {
    var self = this;
    var opts = { method: method, headers: self.headers({ "Accept": "application/json" }) };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  },

  login: function (id, password) {
    var self = this;
    return this.api("POST", "/api/auth/login", { username: id, password: password }).then(function (res) {
      if (res.ok && res.data && res.data.token) {
        self.setSession(res.data.token, res.data.user);
        return { ok: true, user: res.data.user };
      }
      return { ok: false, error: (res.data && res.data.error) || "Login gagal. Coba lagi." };
    }).catch(function () {
      return { ok: false, error: "Tidak dapat terhubung ke server." };
    });
  },

  register: function (payload) {
    var self = this;
    return this.api("POST", "/api/auth/register", payload).then(function (res) {
      if (res.ok && res.data && res.data.token) {
        self.setSession(res.data.token, res.data.user);
        return { ok: true, user: res.data.user };
      }
      return { ok: false, error: (res.data && res.data.error) || "Pendaftaran gagal." };
    }).catch(function () {
      return { ok: false, error: "Tidak dapat terhubung ke server." };
    });
  },

  logout: function () {
    var self = this;
    this.api("POST", "/api/auth/logout", {}).catch(function () {});
    this.clear();
  },

  me: function () {
    var self = this;
    if (!this.token()) return Promise.resolve(null);
    return this.api("GET", "/api/auth/me").then(function (res) {
      if (res.ok && res.data && res.data.user) {
        try { localStorage.setItem(self.USER_KEY, JSON.stringify(res.data.user)); } catch (e) {}
        return res.data.user;
      }
      self.clear();
      return null;
    }).catch(function () { return self.user(); });
  }
};

if (typeof window !== "undefined") window.Auth = Auth;
