/**
 * Front-end language switcher (injected via Astro injectScript on every page).
 * Renders into [data-ml-switcher] when present, otherwise a floating pill.
 * Preference is remembered via the ml_pref cookie (set on navigation).
 */
(async function () {
  if (window.__apMlSwitcher) return;
  window.__apMlSwitcher = true;
  try {
    var cfg = await fetch("/ml-asset/config").then(function (r) { return r.json(); });
    if (!cfg || !Array.isArray(cfg.languages) || cfg.languages.length < 2) return;

    function targetHref(code) {
      var path = location.pathname;
      var search = location.search;
      var codes = cfg.languages.map(function (l) { return l.code; });
      var segs = path.split("/");
      if (segs.length > 1 && codes.indexOf(segs[1]) !== -1) {
        segs[1] = code === cfg.defaultLang ? "" : code;
        var next = segs.filter(function (s, i) { return !(i === 1 && s === ""); }).join("/") || "/";
        return next + search;
      }
      if (cfg.urlStrategy === "param") {
        var sp = new URLSearchParams(search);
        if (code === cfg.defaultLang) sp.delete("lang"); else sp.set("lang", code);
        var qs = sp.toString();
        return path + (qs ? "?" + qs : "");
      }
      return (code === cfg.defaultLang ? "" : "/" + code) + (path === "/" ? "/" : path) + search;
    }

    var host = document.querySelector("[data-ml-switcher]");
    var floating = false;
    if (!host) {
      host = document.createElement("nav");
      host.setAttribute("aria-label", "Language");
      host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;gap:4px;background:#fff;border:1px solid #dcdcde;border-radius:999px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);font-size:13px;";
      floating = true;
    }
    cfg.languages.forEach(function (l) {
      var a = document.createElement("a");
      a.href = targetHref(l.code);
      a.textContent = l.nativeLabel || l.code;
      a.setAttribute("hreflang", l.locale || l.code);
      a.setAttribute("data-ml-code", l.code);
      if (l.code === cfg.current) a.setAttribute("aria-current", "true");
      a.style.cssText = "padding:4px 12px;border-radius:999px;text-decoration:none;color:#1d2327;" +
        (l.code === cfg.current ? "background:#2271b1;color:#fff;" : "");
      host.appendChild(a);
    });
    if (floating) document.body.appendChild(host);

    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("[data-ml-switcher] a, nav[aria-label='Language'] a") : null;
      if (!a) return;
      // Store the language CODE (e.g. "zh-hans"), not the hreflang locale —
      // server-side resolveLang matches ml_pref against settings codes.
      var code = a.getAttribute("data-ml-code") || "";
      if (code) document.cookie = "ml_pref=" + code + ";path=/;max-age=31536000;samesite=lax";
    }, true);
  } catch (err) {
    /* switcher is best-effort; never break the page */
  }
})();