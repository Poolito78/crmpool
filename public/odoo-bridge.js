/* ============================================================
   PONT CRMPOOL -> ODOO  (aucune console, aucune clé API)

   Ce script s'exécute DANS la page Odoo : les appels
   /web/dataset/call_kw partent donc avec la session déjà connectée.

   Il récupère le devis « en attente » déposé par crmpool :
     1. serveur local du Chiffrage (http://127.0.0.1:8765) s'il tourne ;
     2. sinon le presse-papiers (rempli automatiquement par crmpool) ;
     3. sinon collage manuel dans le panneau (filet de sécurité).

   Puis il laisse choisir le client, montre la résolution des articles,
   et crée le devis en BROUILLON (sections + notes + lignes).

   Installation (une seule fois) : un marque-page dont l'adresse est
     javascript:(function(){var s=document.createElement('script');
     s.src='https://crmpool.vercel.app/odoo-bridge.js?'+Date.now();
     document.body.appendChild(s);})()
============================================================ */
(function () {
  "use strict";
  var SRV = "http://127.0.0.1:8765";
  var old = document.getElementById("crmpool-bridge");
  if (old) old.remove();

  /* ---------- appels Odoo (session du navigateur) ---------- */
  function rpc(model, method, args, kwargs) {
    return fetch("/web/dataset/call_kw", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call",
        params: { model: model, method: method, args: args, kwargs: kwargs || {} } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) {
        var d = j.error.data || {};
        throw new Error(d.message || j.error.message || "erreur Odoo");
      }
      return j.result;
    });
  }

  /* ---------- panneau flottant ---------- */
  var box = document.createElement("div");
  box.id = "crmpool-bridge";
  box.style.cssText = [
    "position:fixed", "top:14px", "right:14px", "width:470px", "max-height:88vh",
    "overflow:auto", "z-index:2147483647", "background:#fff", "color:#111",
    "border:1px solid #c7c7d1", "border-radius:10px",
    "box-shadow:0 10px 34px rgba(0,0,0,.28)", "font:13px/1.45 system-ui,sans-serif",
    "padding:14px"
  ].join(";");
  document.body.appendChild(box);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function html(s) { box.innerHTML = s; }
  function hdr(sub) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '<b style="font-size:14px">🧾 crmpool → Odoo</b>'
      + '<span style="flex:1"></span>'
      + '<span id="cbX" style="cursor:pointer;color:#888;font-size:18px;line-height:1">×</span></div>'
      + '<div style="color:#666;margin-bottom:10px">' + sub + "</div>";
  }
  function wireClose() {
    var x = document.getElementById("cbX");
    if (x) x.onclick = function () { box.remove(); };
  }
  function fail(msg) { html(hdr('<b style="color:#b91c1c">' + esc(msg) + "</b>")); wireClose(); }

  var payload = null, partner = null, resolved = {}, fromServer = false;
  var match = {}, descOf = {}, partsCache = [];

  /* ---------- 0. session Odoo ouverte ? ---------- */
  function checkSession() {
    return fetch("/web/session/get_session_info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var s = j && j.result;
      if (!s || !s.uid) throw new Error("__NOSESSION__");
      return s;
    }).catch(function () { throw new Error("__NOSESSION__"); });
  }
  function askLogin() {
    html(hdr("Session Odoo requise.")
      + '<div style="padding:10px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px">'
      + "<b>Vous n'êtes pas connecté à Odoo dans cet onglet.</b><br><br>"
      + "Connectez-vous, puis relancez le marque-page <b>Devis → Odoo</b>.<br><br>"
      + '<a href="/web/login" style="color:#7c3aed;font-weight:600">Ouvrir la page de connexion →</a>'
      + "</div>");
    wireClose();
  }

  /* ---------- 1. récupération du devis en attente ---------- */
  function valid(p) { return p && p.lines && p.lines.length; }

  function fromLocalServer() {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 1200);
    return fetch(SRV + "/devispending?" + Date.now(), { signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); return r.json(); })
      .then(function (p) { if (!valid(p)) return null; fromServer = true; return p; })
      .catch(function () { return null; });
  }
  function fromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.resolve(null);
    return navigator.clipboard.readText()
      .then(function (txt) { try { var p = JSON.parse(txt); return valid(p) ? p : null; } catch (e) { return null; } })
      .catch(function () { return null; });
  }
  function askPaste() {
    html(hdr("Collez le devis (Ctrl+V) puis validez.")
      + '<textarea id="cbPaste" style="width:100%;height:120px;font:11px monospace;border:1px solid #ddd;border-radius:6px;padding:6px" placeholder="Dans crmpool : Actions → Envoyer vers Odoo, puis Ctrl+V ici"></textarea>'
      + '<button id="cbPasteGo" style="width:100%;margin-top:8px;padding:9px;border:0;border-radius:7px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">Continuer</button>');
    wireClose();
    var ta = document.getElementById("cbPaste");
    ta.focus();
    document.getElementById("cbPasteGo").onclick = function () {
      var p = null;
      try { p = JSON.parse(ta.value); } catch (e) { /* ignore */ }
      if (!valid(p)) { alert("Contenu invalide : recommencez depuis crmpool (Actions → Envoyer vers Odoo)."); return; }
      payload = p;
      start();
    };
  }

  html(hdr("Vérification de la session Odoo…")); wireClose();
  checkSession()
    .then(function () {
      html(hdr("Lecture du devis en attente…")); wireClose();
      return fromLocalServer();
    })
    .then(function (p) { return p || fromClipboard(); })
    .then(function (p) {
      if (!p) { askPaste(); return null; }
      payload = p;
      return start();
    })
    .catch(function (e) {
      if (e && e.message === "__NOSESSION__") askLogin();
      else fail(e.message);
    });

  function start() {
    html(hdr("Résolution des articles…")); wireClose();
    return resolveCodes().then(searchPartner).catch(function (e) { fail(e.message); });
  }

  /* ---------- 2. résolution des références ---------- */
  function orDom(conds) {
    var d = [];
    for (var i = 0; i < conds.length - 1; i++) d.push("|");
    return d.concat(conds);
  }

  // Comparaison « à la lettre près » : on ignore casse, accents et ponctuation.
  // GRANITEGRIS051 (crmpool) vs GRANITGRIS0,5/1 (Odoo) -> granitegris051 / granitgris051
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }
  function sim(a, b) {
    if (!a || !b) return 0;
    var m = Math.max(a.length, b.length);
    return m ? 1 - lev(a, b) / m : 0;
  }

  // Correspondances confirmées à la main (mémorisées sur l'origine Odoo) :
  // une fois GRANITEGRIS051 -> GRANITGRIS0,5/1 validé, c'est automatique ensuite.
  var MAPKEY = "crmpool_odoo_map";
  function loadMap() {
    try { return JSON.parse(localStorage.getItem(MAPKEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveMap(m) {
    try { localStorage.setItem(MAPKEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
  }
  function resolveCodes() {
    var refs = [];
    descOf = {};
    payload.lines.forEach(function (l) {
      if (l.type !== "product" || !l.ref) return;
      if (refs.indexOf(l.ref) < 0) refs.push(l.ref);
      if (!descOf[l.ref]) descOf[l.ref] = l.desc || "";
    });
    resolved = {}; match = {};
    if (!refs.length) return Promise.resolve();

    // Passe 0 — correspondances déjà confirmées à la main
    var map = loadMap();
    refs.forEach(function (r) {
      if (map[r] && map[r].id) { resolved[r] = map[r].id; match[r] = { kind: "map", code: map[r].code }; }
    });

    // Passe 1 — code exact
    return rpc("product.product", "search_read", [[["default_code", "in", refs]], ["id", "default_code"]], { limit: 500 })
      .then(function (res) {
        res.forEach(function (p) {
          resolved[p.default_code] = p.id;
          match[p.default_code] = { kind: "exact", code: p.default_code };
        });
        // Passe 2 — casse / espaces (=ilike)
        var todo = refs.filter(function (r) { return !resolved[r]; });
        if (!todo.length) return null;
        return rpc("product.product", "search_read",
          [orDom(todo.map(function (r) { return ["default_code", "=ilike", r]; })), ["id", "default_code"]], { limit: 500 })
          .then(function (r2) {
            todo.forEach(function (r) {
              var hit = r2.filter(function (p) {
                return String(p.default_code || "").trim().toLowerCase() === r.toLowerCase();
              })[0];
              if (hit) { resolved[r] = hit.id; match[r] = { kind: "exact", code: hit.default_code }; }
            });
          });
      })
      .then(function () {
        // Passe 3 — code contenu, seulement si code assez long ET hit unique
        var todo = refs.filter(function (r) { return !resolved[r] && r.length >= 5; });
        if (!todo.length) return null;
        return rpc("product.product", "search_read",
          [orDom(todo.map(function (r) { return ["default_code", "ilike", r]; })), ["id", "default_code"]], { limit: 500 })
          .then(function (r3) {
            todo.forEach(function (r) {
              var hits = r3.filter(function (p) {
                return String(p.default_code || "").toLowerCase().indexOf(r.toLowerCase()) >= 0;
              });
              if (hits.length === 1) { resolved[r] = hits[0].id; match[r] = { kind: "exact", code: hits[0].default_code }; }
            });
          });
      })
      .then(function () {
        // Passe 4 — RAPPROCHEMENT : le code Odoo diffère par la ponctuation ou
        // une lettre (GRANITEGRIS051 vs GRANITGRIS0,5/1). On ramène des candidats
        // par début de code ET par mot de la désignation, puis on note la
        // ressemblance. Retenu seulement si nettement au-dessus du 2e.
        var todo = refs.filter(function (r) { return !resolved[r]; });
        if (!todo.length) return null;
        var conds = [];
        todo.forEach(function (r) {
          var pre = r.replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
          if (pre.length >= 4) conds.push(["default_code", "ilike", pre]);
          var word = String(descOf[r] || "").split(/[^A-Za-zÀ-ÿ0-9]+/)
            .sort(function (a, b) { return b.length - a.length; })[0] || "";
          if (word.length >= 5) conds.push(["name", "ilike", word]);
        });
        if (!conds.length) return null;
        return rpc("product.product", "search_read",
          [orDom(conds), ["id", "default_code", "name"]], { limit: 400 })
          .then(function (cands) {
            todo.forEach(function (r) {
              var nr = norm(r), nd = norm(descOf[r] || "");
              var scored = cands.map(function (p) {
                var s = Math.max(sim(nr, norm(p.default_code)), nd ? sim(nd, norm(p.name)) : 0);
                return { p: p, s: s };
              }).sort(function (a, b) { return b.s - a.s; });
              var best = scored[0], second = scored[1];
              if (best && best.s >= 0.82 && (!second || best.s - second.s >= 0.04)) {
                resolved[r] = best.p.id;
                match[r] = { kind: "fuzzy", code: best.p.default_code, name: best.p.name, score: best.s };
              }
            });
          })
          .catch(function () { return null; });
      })
      .then(function () {
        // Article négoce (repli) : cherché par code, id de secours sinon
        return rpc("product.product", "search_read",
          [[["default_code", "=", payload.negoce_code || "NEG.ISO"]], ["id"]], { limit: 1 })
          .then(function (n) { payload._negId = n.length ? n[0].id : (payload.negoce_id || 0); })
          .catch(function () { payload._negId = payload.negoce_id || 0; });
      });
  }

  /* ---------- 3. choix du client ---------- */
  function searchPartner() {
    var q = (payload.client || "").trim();
    if (!q) return render([]);
    return rpc("res.partner", "search_read",
      [[["name", "ilike", q]], ["id", "name", "city", "is_company", "parent_id"]],
      { limit: 20, order: "is_company desc, name" }).then(render);
  }

  function render(parts) {
    if (parts) partsCache = parts; else parts = partsCache;
    var nArt = 0, nNeg = 0, nFuz = 0, rows = "";
    payload.lines.forEach(function (l) {
      if (l.type === "section" || l.type === "note") {
        rows += '<tr><td style="padding:2px 4px">' + (l.type === "section" ? "▪" : "✎") + "</td>"
          + '<td colspan="3" style="padding:2px 4px;color:#666;font-style:italic">' + esc(l.desc) + "</td></tr>";
        return;
      }
      var pid = l.ref && resolved[l.ref];
      var m = (l.ref && match[l.ref]) || null;
      if (pid) { nArt++; if (m && m.kind === "fuzzy") nFuz++; } else if (!l.port) nNeg++;

      var icon = pid ? (m && m.kind === "fuzzy" ? "🔎" : (m && m.kind === "map" ? "📌" : "✅"))
                     : (l.port ? "🚚" : "📦");
      // Colonne code : ce qui sera VRAIMENT utilisé dans Odoo
      var codeCell;
      if (l.port) codeCell = '<span style="color:#666">frais de port</span>';
      else if (!l.ref) codeCell = '<span style="color:#b45309">' + esc(payload.negoce_code || "NEG.ISO") + "</span>";
      else if (!pid) codeCell = '<span style="color:#b45309">' + esc(l.ref) + " → " + esc(payload.negoce_code || "NEG.ISO") + "</span>";
      else if (m && (m.kind === "fuzzy" || m.kind === "map"))
        codeCell = '<span style="color:#666">' + esc(l.ref) + "</span> → <b style=\"color:#7c3aed\">" + esc(m.code) + "</b>"
          + (m.kind === "fuzzy" ? ' <span style="color:#999">' + Math.round(m.score * 100) + "%</span>" : "");
      else codeCell = '<span style="color:#666">' + esc(m ? m.code : l.ref) + "</span>";

      var btn = (!l.port && l.ref)
        ? ' <button class="cbFind" data-ref="' + esc(l.ref) + '" style="border:0;background:none;color:#7c3aed;cursor:pointer;font-size:11px;text-decoration:underline;padding:0">chercher…</button>'
        : "";
      rows += '<tr><td style="padding:2px 4px;vertical-align:top">' + icon + "</td>"
        + '<td style="padding:2px 4px">' + esc(l.desc) + "</td>"
        + '<td style="padding:2px 4px;font:11px monospace">' + codeCell + btn + "</td>"
        + '<td style="padding:2px 4px;text-align:right;vertical-align:top">' + (l.qty == null ? "" : l.qty) + "</td></tr>";
    });

    var plist = parts.length
      ? parts.map(function (p, i) {
          return '<div class="cbP" data-i="' + i + '" style="cursor:pointer;padding:3px 5px;border-radius:4px">'
            + (p.is_company ? "🏢 " : "👤 ") + esc(p.name)
            + (p.city ? ' <span style="color:#888">— ' + esc(p.city) + "</span>" : "")
            + (p.parent_id ? ' <span style="color:#888">(' + esc(p.parent_id[1]) + ")</span>" : "")
            + "</div>";
        }).join("")
      : '<b style="color:#b91c1c">Aucun client « ' + esc(payload.client) + " » trouvé. Créez la fiche dans Odoo puis relancez.</b>";

    html(hdr("Devis <b>" + esc(payload.numero || "") + "</b> — créé en <b>brouillon</b>, rien n'est envoyé."
        + (fromServer ? "" : " <span style=\"color:#888\">(presse-papiers)</span>"))
      + '<div style="margin-bottom:6px"><b>Client</b> — cliquez pour choisir :</div>'
      + '<div id="cbList" style="max-height:130px;overflow:auto;border:1px solid #eee;border-radius:6px;padding:3px;margin-bottom:8px">' + plist + "</div>"
      + '<div style="margin-bottom:8px"><b>Chantier</b> : ' + esc(payload.ref || "—") + "</div>"
      + '<div style="max-height:230px;overflow:auto;border:1px solid #eee;border-radius:6px"><table style="width:100%;border-collapse:collapse">' + rows + "</table></div>"
      + '<div id="cbInfo" style="margin:8px 0;color:#666">✅ <b>' + nArt + "</b> article(s) catalogue"
      + (nFuz ? ' <span style="color:#7c3aed">(dont 🔎 ' + nFuz + " par rapprochement — vérifiez)</span>" : "")
      + (nNeg ? ' · 📦 <b style="color:#b45309">' + nNeg + "</b> en négoce" : "")
      + " · P.U. du devis imposés</div>"
      + '<button id="cbGo" style="width:100%;padding:9px;border:0;border-radius:7px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">Créer le devis</button>');
    wireClose();

    Array.prototype.forEach.call(box.querySelectorAll(".cbP"), function (el) {
      el.onmouseenter = function () { el.style.background = "#f1f1f6"; };
      el.onmouseleave = function () { el.style.background = ""; };
      el.onclick = function () {
        partner = parts[+el.dataset.i];
        Array.prototype.forEach.call(box.querySelectorAll(".cbP"), function (o) { o.style.outline = ""; });
        el.style.outline = "2px solid #7c3aed";
      };
    });
    if (parts.length === 1) {
      partner = parts[0];
      var f = box.querySelector(".cbP");
      if (f) f.style.outline = "2px solid #7c3aed";
    }
    // Choix manuel de l'article Odoo (et mémorisation pour les fois suivantes)
    Array.prototype.forEach.call(box.querySelectorAll(".cbFind"), function (el) {
      el.onclick = function () { pickArticle(el.dataset.ref); };
    });
    document.getElementById("cbGo").onclick = create;
  }

  /* ---------- 3bis. choix manuel d'un article ---------- */
  function pickArticle(ref) {
    var q0 = descOf[ref] || ref;
    html(hdr("Article Odoo pour <b>" + esc(ref) + "</b> — la correspondance sera mémorisée.")
      + '<div style="display:flex;gap:6px;margin-bottom:8px">'
      + '<input id="cbQ" value="' + esc(q0) + '" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px">'
      + '<button id="cbSearch" style="padding:6px 12px;border:0;border-radius:6px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">Chercher</button></div>'
      + '<div id="cbRes" style="max-height:300px;overflow:auto;border:1px solid #eee;border-radius:6px;padding:3px">Tapez un mot puis « Chercher ».</div>'
      + '<button id="cbBack" style="width:100%;margin-top:8px;padding:8px;border:1px solid #ddd;border-radius:7px;background:#fff;cursor:pointer">← Retour</button>');
    wireClose();
    document.getElementById("cbBack").onclick = function () { render(null); };

    function run() {
      var q = document.getElementById("cbQ").value.trim();
      if (!q) return;
      var res = document.getElementById("cbRes");
      res.textContent = "Recherche…";
      rpc("product.product", "search_read",
        [["|", ["default_code", "ilike", q], ["name", "ilike", q]], ["id", "default_code", "name"]], { limit: 25 })
        .then(function (list) {
          if (!list.length) { res.innerHTML = '<b style="color:#b91c1c">Aucun article. Essayez un autre mot.</b>'; return; }
          res.innerHTML = list.map(function (p, i) {
            return '<div class="cbR" data-i="' + i + '" style="cursor:pointer;padding:4px 5px;border-radius:4px">'
              + '<span style="font:11px monospace;color:#7c3aed">' + esc(p.default_code || "—") + "</span> "
              + esc(p.name) + "</div>";
          }).join("");
          Array.prototype.forEach.call(res.querySelectorAll(".cbR"), function (el) {
            el.onmouseenter = function () { el.style.background = "#f1f1f6"; };
            el.onmouseleave = function () { el.style.background = ""; };
            el.onclick = function () {
              var p = list[+el.dataset.i];
              resolved[ref] = p.id;
              match[ref] = { kind: "map", code: p.default_code || String(p.id) };
              var m = loadMap();
              m[ref] = { id: p.id, code: p.default_code || String(p.id) };
              saveMap(m);
              render(null);
            };
          });
        })
        .catch(function (e) { res.innerHTML = '<b style="color:#b91c1c">' + esc(e.message) + "</b>"; });
    }
    document.getElementById("cbSearch").onclick = run;
    document.getElementById("cbQ").onkeydown = function (e) { if (e.key === "Enter") run(); };
    run();
  }

  /* ---------- 4. création ---------- */
  function create() {
    if (!partner) { alert("Choisissez d'abord le client dans la liste."); return; }
    var btn = document.getElementById("cbGo");
    btn.disabled = true; btn.textContent = "Création…";

    var cid = payload.company_id || null;
    var ctx = cid ? { allowed_company_ids: [cid] } : {};
    var oid = null, tvaId = null, chantierField = null, contactField = null, contactId = null;

    // TVA 20 % vente
    rpc("account.tax", "search_read",
      [[["name", "ilike", "20"], ["type_tax_use", "=", "sale"], ["active", "=", true]].concat(cid ? [["company_id", "=", cid]] : []),
       ["id", "name"]], { limit: 5 })
      .then(function (t) { tvaId = t.length ? t[0].id : null; })
      // Champs optionnels (Studio) : chantier + contact de l'affaire
      .then(function () { return rpc("sale.order", "fields_get", [], { attributes: ["string", "type"] }); })
      .then(function (all) {
        Object.keys(all).forEach(function (k) {
          var s = String((all[k] && all[k].string) || "").toLowerCase();
          if (!chantierField && s.indexOf("chantier") >= 0) chantierField = k;
        });
        if (all.x_studio_contact_de_laffaire) contactField = "x_studio_contact_de_laffaire";
      })
      // Contact de l'affaire
      .then(function () {
        if (!payload.contact || !contactField) return null;
        return rpc("res.partner", "search_read",
          [[["parent_id", "=", partner.id], ["name", "ilike", payload.contact]], ["id", "name"]], { limit: 3 })
          .then(function (c) { if (c.length) contactId = c[0].id; })
          .catch(function () { return null; });
      })
      // En-tête
      .then(function () {
        var vals = {
          partner_id: partner.id,
          partner_invoice_id: partner.id,
          partner_shipping_id: partner.id
        };
        if (cid) vals.company_id = cid;
        if (payload.validity) vals.validity_date = payload.validity;
        if (payload.ref && chantierField) vals[chantierField] = String(payload.ref).slice(0, 200);
        else if (payload.ref) vals.client_order_ref = String(payload.ref).slice(0, 200);
        if (contactId && contactField) vals[contactField] = contactId;
        return rpc("sale.order", "create", [vals], { context: ctx });
      })
      .then(function (id) {
        oid = id;
        // Note système en tête de devis
        if (!payload.note) return null;
        return rpc("sale.order.line", "create",
          [{ order_id: oid, display_type: "line_note", name: payload.note, sequence: 5 }], { context: ctx });
      })
      // Lignes, dans l'ordre
      .then(function () {
        var chain = Promise.resolve(), seq = 10, ok = 0, errs = [];
        payload.lines.forEach(function (l) {
          seq += 10;
          var s = seq;
          chain = chain.then(function () {
            var vals = { order_id: oid, sequence: s, customer_lead: 0 };
            if (l.type === "section") {
              vals.display_type = "line_section"; vals.name = l.desc;
            } else if (l.type === "note") {
              vals.display_type = "line_note"; vals.name = l.desc;
            } else {
              var pid = (l.ref && resolved[l.ref]) || (l.port ? payload.port_id : payload._negId);
              vals.product_id = pid;
              vals.name = l.desc;
              vals.product_uom_qty = l.qty || 1;
              vals.price_unit = l.pu || 0;
              vals.discount = 0;
              if (tvaId) vals.tax_id = [[6, 0, [tvaId]]];
            }
            return rpc("sale.order.line", "create", [vals], { context: ctx })
              .then(function () { ok++; })
              .catch(function (e) { errs.push(l.desc + " : " + (e.message || "").slice(0, 80)); });
          });
        });
        return chain.then(function () { return { ok: ok, errs: errs }; });
      })
      .then(function (res) {
        return rpc("sale.order", "read", [[oid], ["name", "amount_untaxed"]], { context: ctx })
          .then(function (so) { return { so: so[0], res: res }; });
      })
      .then(function (r) {
        if (fromServer) fetch(SRV + "/devispending", { method: "DELETE" }).catch(function () {});
        var url = "/web#cids=" + (cid || 1) + "&menu_id=178&action=302&model=sale.order&view_type=form&id=" + oid;
        html(hdr("Terminé.")
          + '<div style="padding:10px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px">'
          + "✅ Devis <b>" + esc(r.so.name) + "</b> créé en <b>brouillon</b><br>"
          + (r.so.amount_untaxed || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 }) + " € HT · "
          + r.res.ok + " ligne(s)"
          + (r.res.errs.length ? '<br><b style="color:#b91c1c">Erreurs :</b><br>' + esc(r.res.errs.join(" — ")) : "")
          + '<br><br><a href="' + url + '" style="color:#7c3aed;font-weight:600">Ouvrir le devis →</a></div>');
        wireClose();
        location.hash = url.split("#")[1];
        location.reload();
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = "Créer le devis";
        var info = document.getElementById("cbInfo");
        if (info) info.innerHTML = '<b style="color:#b91c1c">Échec : ' + esc(e.message) + "</b>";
      });
  }
})();
