/*
 * Image Mirror — editor enhancement script.
 *
 * The server-side plugin middleware mirrors remote <img> images while a post is
 * saved and reports the counts with X-Ap-Mirrored / X-Ap-Mirror-Failed
 * response headers. This script:
 *
 *  1. wraps window.fetch to watch PUT /api/posts/:id responses;
 *  2. when mirroring happened, reloads the saved post and writes the rewritten
 *     content back into .ap-wysiwyg-editor / window.__editorContent / the
 *     excerpt textarea, so the next auto-save cannot overwrite local URLs with
 *     the original remote URLs;
 *  3. shows a small confirmation in #save-status.
 *
 * Pure DOM/fetch patching — no AstroPress source file is modified.
 */
(function () {
  "use strict";

  if (window.__apImageMirrorPatched) return;
  window.__apImageMirrorPatched = true;

  var originalFetch = window.fetch.bind(window);

  function matchPostSave(input, init) {
    var url =
      typeof input === "string"
        ? input
        : input && typeof input.url === "string"
          ? input.url
          : "";
    var method = (
      (init && init.method) ||
      (input && input.method) ||
      "GET"
    ).toUpperCase();
    if (method !== "PUT" || !url) return null;

    var m = url.match(/\/api\/posts\/(\d+)(?:[?#]|$)/);
    return m ? Number(m[1]) : null;
  }

  function setStatus(text, isError) {
    var el = document.getElementById("save-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#b32d2e" : "#2271b1";
    setTimeout(function () {
      el.textContent = "Saved \u2713";
      el.style.color = "";
    }, 6000);
  }

  function applyMirroredContent(postId, mirrored, failed) {
    originalFetch("/api/posts/" + postId, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (post) {
        if (!post) return;
        if (typeof post.content === "string") {
          var editor = document.querySelector(".ap-wysiwyg-editor");
          if (editor) editor.innerHTML = post.content; // ap-audit-ok: 自身文章内容回填
          window.__editorContent = post.content;
        }
        if (typeof post.excerpt === "string") {
          var excerptEl = document.getElementById("post-excerpt");
          if (excerptEl && excerptEl.value !== post.excerpt) {
            excerptEl.value = post.excerpt;
          }
        }
        var msg = "\u5df2\u8f6c\u5b58 " + mirrored + " \u5f20\u7f51\u7edc\u56fe\u7247\u5230\u5a92\u4f53\u5e93 \u2713";
        if (failed > 0) {
          msg += "\uff08" + failed + " \u5f20\u5931\u8d25\uff0c\u5df2\u4fdd\u7559\u539f\u94fe\u63a5\uff09";
        }
        setStatus(msg, failed > 0);
      })
      .catch(function () {
        /* silent: DB content is already mirrored, next page load is correct */
      });
  }

  window.fetch = function (input, init) {
    var postId = matchPostSave(input, init);
    if (postId === null) return originalFetch(input, init);

    return originalFetch(input, init).then(
      function (res) {
        try {
          var mirrored = Number(res.headers.get("X-Ap-Mirrored") || "0");
          if (mirrored > 0) {
            var failed = Number(res.headers.get("X-Ap-Mirror-Failed") || "0");
            applyMirroredContent(postId, mirrored, failed);
          }
        } catch (e) {
          /* header inspection must never break saving */
        }
        return res;
      },
      function (err) {
        throw err;
      }
    );
  };
})();
