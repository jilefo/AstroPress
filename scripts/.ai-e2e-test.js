(function () {
  var ed = document.querySelector(".ap-wysiwyg-editor");
  ed.textContent = "";
  // 打开面板
  document.getElementById("apaiFab").click();
  var panel = document.getElementById("apaiPanel");
  var out = { panelOpen: panel.classList.contains("apai-open") };
  // 拦截 fetch：捕获发送体 + 返回模拟 AI 回复（HTML 格式，验证规则 d）
  var captured = null;
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    captured = { url: String(url), body: (opts && opts.body) || "" };
    return Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          reply:
            "<h2>Linux 运维与 AI 结合实战</h2><p>智能告警是降低运维门槛的第一步。</p>" +
            '<img src="https://img.example.com/ops-ai.png" alt="运维AI架构图"><p><strong>结论：</strong>相辅相成。</p>',
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
  };
  var input = document.getElementById("apaiInput");
  var sendBtn = document.getElementById("apaiSend");
  return new Promise(function (resolve) {
    setTimeout(function () {
      input.value = "请帮我生成一篇3000字的关于Linux运维与AI结合的文章";
      sendBtn.click();
      setTimeout(function () {
        window.fetch = realFetch;
        var msgs = Array.prototype.map.call(
          document.querySelectorAll("#apaiMsgs .apai-msg"),
          function (m) { return m.className; }
        );
        var aiBody = document.querySelector("#apaiMsgs .apai-ai .apai-msg-body");
        // 验证发出的 prompt（规则 a：空内容 → 新文章模式）
        out.capturedUrl = captured && captured.url;
        out.outgoingIsNewMode =
          captured && captured.body.indexOf("【已有文章内容】") === -1 &&
          captured.body.indexOf("Markdown") !== -1;
        out.outgoingKeepsQuestion =
          captured && captured.body.indexOf("3000字") !== -1;
        // 验证回复已转 Markdown（规则 d）
        out.aiReplyIsMarkdown =
          !!aiBody &&
          aiBody.textContent.indexOf("## Linux 运维与 AI 结合实战") !== -1 &&
          aiBody.textContent.indexOf("**结论：**") !== -1;
        // 点击「插入到编辑器」验证插入链路
        var insBtn = document.querySelector("#apaiMsgs .apai-insert");
        if (insBtn) insBtn.click();
        setTimeout(function () {
          out.editorGotContent = ed.innerHTML.indexOf("ops-ai.png") !== -1;
          out.editorGotHeading = ed.innerHTML.indexOf("Linux 运维与 AI 结合实战") !== -1;
          resolve(JSON.stringify(out, null, 1));
        }, 300);
      }, 800);
    }, 300);
  });
})();
