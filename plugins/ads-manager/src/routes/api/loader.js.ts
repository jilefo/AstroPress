import type { APIRoute } from "astro";

/**
 * Tracking loader: impression observer (>=50% visible, >=1s), click
 * delegation, rel="sponsored nofollow" enforcement, GDPR gating and batched
 * beacon reporting. Served as a static-ish JS asset (5 min cache).
 */
const JS = String.raw`
(function () {
  if (window.__apAdsLoader) return;
  window.__apAdsLoader = true;

  var queue = [];
  var timer = null;

  function send(events) {
    try {
      var body = JSON.stringify({ events: events });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/ap-ads/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/ap-ads/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
      }
    } catch (e) { /* tracking is best-effort */ }
  }

  function track(adId, type) {
    queue.push({ adId: adId, type: type });
    if (queue.length >= 10) {
      var batch = queue.splice(0, 10);
      send(batch);
      return;
    }
    if (!timer) {
      timer = setTimeout(function () {
        timer = null;
        var batch = queue.splice(0);
        if (batch.length) send(batch);
      }, 5000);
    }
  }

  function consentOk(el) {
    return el.getAttribute("data-ap-gdpr") !== "1" || window.__apGdprConsent === true;
  }

  function init() {
    var ads = document.querySelectorAll("[data-ap-ad-id]");
    ads.forEach(function (el) {
      el.querySelectorAll("a").forEach(function (a) {
        a.setAttribute("rel", "sponsored nofollow");
      });
      if (!consentOk(el)) return;
      if ("IntersectionObserver" in window) {
        var seen = false;
        var t0 = 0;
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting && !seen) {
              seen = true;
              t0 = Date.now();
              setTimeout(function () {
                if (Date.now() - t0 >= 1000) track(el.getAttribute("data-ap-ad-id"), "imp");
              }, 1100);
              io.unobserve(el);
            }
          });
        }, { threshold: 0.5 });
        io.observe(el);
      } else {
        track(el.getAttribute("data-ap-ad-id"), "imp");
      }
    });

    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-ap-track]") : null;
      if (!el || !consentOk(el)) return;
      track(el.getAttribute("data-ap-ad-id"), "clk");
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;

export const GET: APIRoute = async () =>
  new Response(JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });