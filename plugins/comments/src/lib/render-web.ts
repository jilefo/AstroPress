import { md5 } from "./md5";
import { escapeHtml, formatDate, safeWebsite } from "./text";
import type { WebComment } from "./comments";

/**
 * 渲染前台评论区块：列表（最多 2 层缩进）+ 表单（含蜜罐）+ 内联 JS + 主题隔离样式。
 * 所有用户数据均经 escapeHtml；样式选择器只允许 #ap-comments 与 .ap-cmt-* 前缀。
 */
export function renderCommentsBlock(
  comments: WebComment[],
  opts: { postId: number; order: "asc" | "desc" }
): string {
  const byId = new Map<number, WebComment>();
  for (const c of comments) byId.set(c.id, c);

  // 组装两层树：超过两层的后代统一挂到其顶层祖先下
  const roots: WebComment[] = [];
  const childMap = new Map<number, WebComment[]>();
  for (const c of comments) {
    if (c.parent === 0 || !byId.has(c.parent)) {
      roots.push(c);
      continue;
    }
    let cur = c;
    let guard = 0;
    while (cur.parent !== 0 && byId.has(cur.parent) && guard < 12) {
      cur = byId.get(cur.parent)!;
      guard++;
    }
    if (cur.parent === 0) {
      const arr = childMap.get(cur.id) ?? [];
      arr.push(c);
      childMap.set(cur.id, arr);
    } else {
      roots.push(c);
    }
  }

  const gravatar = (email: string) =>
    `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?d=mp&s=40`;

  const renderItem = (c: WebComment): string => {
    const web = safeWebsite(c.website);
    const authorHtml = web
      ? `<a class="ap-cmt-author-link" href="${escapeHtml(web)}" rel="nofollow noopener" target="_blank">${escapeHtml(c.author)}</a>`
      : escapeHtml(c.author);
    const kids = childMap.get(c.id) ?? [];
    const kidsHtml = kids.length
      ? `<ul class="ap-cmt-children">${kids.map(renderChild).join("")}</ul>`
      : "";
    return `<li class="ap-cmt-item" data-id="${c.id}">
      <div class="ap-cmt-card">
        <img class="ap-cmt-avatar" src="${gravatar(c.email)}" width="40" height="40" alt="" loading="lazy" />
        <div class="ap-cmt-body">
          <div class="ap-cmt-meta">
            <span class="ap-cmt-author">${authorHtml}</span>
            <span class="ap-cmt-date">${escapeHtml(formatDate(c.createdAt))}</span>
          </div>
          <div class="ap-cmt-content">${escapeHtml(c.content)}</div>
          <div class="ap-cmt-actions">
            <button type="button" class="ap-cmt-reply-btn" data-id="${c.id}" data-author="${escapeHtml(c.author)}">回复</button>
          </div>
        </div>
      </div>
      ${kidsHtml}
    </li>`;
  };

  // 第二层（回复）不再展开更深缩进
  const renderChild = (c: WebComment): string => {
    const web = safeWebsite(c.website);
    const authorHtml = web
      ? `<a class="ap-cmt-author-link" href="${escapeHtml(web)}" rel="nofollow noopener" target="_blank">${escapeHtml(c.author)}</a>`
      : escapeHtml(c.author);
    return `<li class="ap-cmt-item ap-cmt-item-child" data-id="${c.id}">
      <div class="ap-cmt-card">
        <img class="ap-cmt-avatar" src="${gravatar(c.email)}" width="40" height="40" alt="" loading="lazy" />
        <div class="ap-cmt-body">
          <div class="ap-cmt-meta">
            <span class="ap-cmt-author">${authorHtml}</span>
            <span class="ap-cmt-date">${escapeHtml(formatDate(c.createdAt))}</span>
          </div>
          <div class="ap-cmt-content">${escapeHtml(c.content)}</div>
        </div>
      </div>
    </li>`;
  };

  const listHtml = roots.length
    ? `<ul class="ap-cmt-list" id="ap-cmt-list">${roots.map(renderItem).join("")}</ul>`
    : `<ul class="ap-cmt-list" id="ap-cmt-list" hidden></ul>`;
  const emptyHidden = roots.length ? " hidden" : "";

  return `<div id="ap-comments" class="ap-comments-wrap" data-order="${opts.order}">
<style data-ap-comments>
#ap-comments { margin: 32px 0; font-size: 14px; line-height: 1.7; color: #2c3338; }
#ap-comments .ap-cmt-title { font-size: 18px; font-weight: 600; margin: 0 0 16px; color: #1d2327; }
#ap-comments .ap-cmt-count { color: #2271b1; }
#ap-comments .ap-cmt-list, #ap-comments .ap-cmt-children { list-style: none; margin: 0; padding: 0; }
#ap-comments .ap-cmt-children { margin: 14px 0 0; padding-left: 16px; border-left: 3px solid #f0f0f1; }
#ap-comments .ap-cmt-item { margin: 0 0 14px; }
#ap-comments .ap-cmt-card { display: flex; gap: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
#ap-comments .ap-cmt-avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; background: #f0f0f1; }
#ap-comments .ap-cmt-body { min-width: 0; flex: 1; }
#ap-comments .ap-cmt-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 4px; }
#ap-comments .ap-cmt-author { font-weight: 600; color: #1d2327; }
#ap-comments .ap-cmt-author-link { color: #2271b1; text-decoration: none; }
#ap-comments .ap-cmt-author-link:hover { text-decoration: underline; }
#ap-comments .ap-cmt-date { color: #8c8f94; font-size: 12px; }
#ap-comments .ap-cmt-content { white-space: pre-wrap; word-break: break-word; }
#ap-comments .ap-cmt-actions { margin-top: 6px; }
#ap-comments .ap-cmt-reply-btn, #ap-comments .ap-cmt-submit, #ap-comments .ap-cmt-cancel {
  border: 1px solid #2271b1; background: #2271b1; color: #fff; border-radius: 6px;
  padding: 5px 14px; font-size: 13px; cursor: pointer;
}
#ap-comments .ap-cmt-reply-btn { background: #fff; color: #2271b1; padding: 3px 10px; }
#ap-comments .ap-cmt-reply-btn:hover, #ap-comments .ap-cmt-submit:hover { background: #135e96; border-color: #135e96; color: #fff; }
#ap-comments .ap-cmt-cancel { background: #fff; color: #50575e; border-color: #c3c4c7; margin-right: 8px; }
#ap-comments .ap-cmt-empty { color: #8c8f94; background: #fff; border: 1px dashed #c3c4c7; border-radius: 8px; padding: 18px; text-align: center; margin: 0 0 20px; }
#ap-comments .ap-cmt-form { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 20px; }
#ap-comments .ap-cmt-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
#ap-comments .ap-cmt-label { display: block; font-size: 13px; color: #50575e; margin-bottom: 4px; }
#ap-comments .ap-cmt-input, #ap-comments .ap-cmt-textarea {
  width: 100%; box-sizing: border-box; border: 1px solid #8c8f94; border-radius: 6px;
  padding: 8px 10px; font-size: 14px; font-family: inherit; color: #2c3338; background: #fff;
}
#ap-comments .ap-cmt-input:focus, #ap-comments .ap-cmt-textarea:focus { outline: none; border-color: #2271b1; box-shadow: 0 0 0 1px #2271b1; }
#ap-comments .ap-cmt-textarea { margin-top: 12px; resize: vertical; }
#ap-comments .ap-cmt-form-bar { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
#ap-comments .ap-cmt-replying { font-size: 13px; color: #2271b1; }
#ap-comments .ap-cmt-submit[disabled] { opacity: .6; cursor: default; }
#ap-comments .ap-cmt-msg { margin-top: 10px; font-size: 13px; min-height: 20px; }
#ap-comments .ap-cmt-msg-ok { color: #00a32a; }
#ap-comments .ap-cmt-msg-err { color: #b32d2e; }
#ap-comments .ap-cmt-hp { position: absolute !important; left: -9999px !important; top: -9999px !important; opacity: 0; height: 0; width: 0; overflow: hidden; }
@media (max-width: 600px) {
  #ap-comments .ap-cmt-fields { grid-template-columns: 1fr; gap: 0; }
  #ap-comments .ap-cmt-children { padding-left: 10px; }
  #ap-comments .ap-cmt-card { padding: 12px; gap: 10px; }
}
</style>

<h2 class="ap-cmt-title">评论 <span class="ap-cmt-count" id="ap-cmt-count">${roots.length}</span></h2>
${listHtml}
<p class="ap-cmt-empty" id="ap-cmt-empty"${emptyHidden}>暂无评论，来说两句吧～</p>

<form class="ap-cmt-form" id="ap-cmt-form" novalidate>
  <input type="hidden" name="postId" value="${opts.postId}" />
  <input type="hidden" name="parent" value="0" />
  <div class="ap-cmt-hp" aria-hidden="true">
    <label>请勿填写此字段<input type="text" name="ap_website" tabindex="-1" autocomplete="off" /></label>
  </div>
  <div class="ap-cmt-fields">
    <div>
      <label class="ap-cmt-label" for="ap-cmt-author">昵称 *</label>
      <input class="ap-cmt-input" id="ap-cmt-author" name="author" maxlength="50" required />
    </div>
    <div>
      <label class="ap-cmt-label" for="ap-cmt-email">邮箱 *（不公开）</label>
      <input class="ap-cmt-input" id="ap-cmt-email" name="email" type="email" maxlength="200" required />
    </div>
    <div>
      <label class="ap-cmt-label" for="ap-cmt-website">网站</label>
      <input class="ap-cmt-input" id="ap-cmt-website" name="website" type="url" maxlength="200" placeholder="https://example.com" />
    </div>
  </div>
  <textarea class="ap-cmt-textarea" name="content" rows="5" maxlength="4000" required placeholder="写下你的评论…"></textarea>
  <div class="ap-cmt-form-bar">
    <span class="ap-cmt-replying" id="ap-cmt-replying" hidden></span>
    <button type="button" class="ap-cmt-cancel" id="ap-cmt-cancel" hidden>取消回复</button>
    <button type="submit" class="ap-cmt-submit">发表评论</button>
  </div>
  <div class="ap-cmt-msg" id="ap-cmt-msg" role="status"></div>
</form>

<script>
(function () {
  var form = document.getElementById('ap-cmt-form');
  if (!form) return;
  var list = document.getElementById('ap-cmt-list');
  var empty = document.getElementById('ap-cmt-empty');
  var countEl = document.getElementById('ap-cmt-count');
  var msg = document.getElementById('ap-cmt-msg');
  var parentInput = form.querySelector('input[name="parent"]');
  var replying = document.getElementById('ap-cmt-replying');
  var cancelBtn = document.getElementById('ap-cmt-cancel');
  var submitBtn = form.querySelector('.ap-cmt-submit');
  var order = document.getElementById('ap-comments').getAttribute('data-order') === 'desc' ? 'desc' : 'asc';

  function setMsg(text, ok) {
    msg.textContent = text;
    msg.className = 'ap-cmt-msg ' + (ok ? 'ap-cmt-msg-ok' : 'ap-cmt-msg-err');
  }
  function validSite(u) {
    u = String(u || '').trim();
    if (!/^https?:\\/\\//i.test(u)) return '';
    try { var x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : ''; }
    catch (e) { return ''; }
  }
  function nowText() {
    try { return new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function avatarSrc(email) {
    var fallback = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&s=40';
    var base = String(email || '').trim().toLowerCase();
    if (window.crypto && crypto.subtle && crypto.subtle.digest && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(base)).then(function (buf) {
        var bytes = new Uint8Array(buf), hex = '';
        for (var i = 0; i < bytes.length; i++) hex += ('00' + bytes[i].toString(16)).slice(-2);
        return 'https://www.gravatar.com/avatar/' + hex + '?d=mp&s=40';
      }).catch(function () { return fallback; });
    }
    return Promise.resolve(fallback);
  }
  function makeItem(d) {
    var li = document.createElement('li');
    li.className = 'ap-cmt-item';
    li.setAttribute('data-id', String(d.id || 0));
    var card = document.createElement('div'); card.className = 'ap-cmt-card';
    var img = document.createElement('img');
    img.className = 'ap-cmt-avatar'; img.width = 40; img.height = 40; img.alt = ''; img.loading = 'lazy';
    avatarSrc(d.email).then(function (u) { img.src = u; });
    var body = document.createElement('div'); body.className = 'ap-cmt-body';
    var meta = document.createElement('div'); meta.className = 'ap-cmt-meta';
    var author = document.createElement('span'); author.className = 'ap-cmt-author';
    var site = validSite(d.website);
    if (site) {
      var a = document.createElement('a');
      a.className = 'ap-cmt-author-link'; a.href = site; a.rel = 'nofollow noopener'; a.target = '_blank';
      a.textContent = d.author; author.appendChild(a);
    } else { author.textContent = d.author; }
    var date = document.createElement('span'); date.className = 'ap-cmt-date'; date.textContent = nowText();
    meta.appendChild(author); meta.appendChild(date);
    var content = document.createElement('div'); content.className = 'ap-cmt-content'; content.textContent = d.content;
    var actions = document.createElement('div'); actions.className = 'ap-cmt-actions';
    var rb = document.createElement('button');
    rb.type = 'button'; rb.className = 'ap-cmt-reply-btn'; rb.textContent = '回复';
    rb.setAttribute('data-id', String(d.id || 0)); rb.setAttribute('data-author', d.author);
    actions.appendChild(rb);
    body.appendChild(meta); body.appendChild(content); body.appendChild(actions);
    card.appendChild(img); card.appendChild(body); li.appendChild(card);
    return li;
  }
  function insertItem(li, parent) {
    list.hidden = false;
    if (empty) empty.hidden = true;
    var host = list;
    if (parent > 0) {
      var parentLi = list.querySelector('.ap-cmt-item[data-id="' + parent + '"]');
      if (parentLi) {
        var kids = parentLi.querySelector('.ap-cmt-children');
        if (!kids) { kids = document.createElement('ul'); kids.className = 'ap-cmt-children'; parentLi.appendChild(kids); }
        host = kids;
      }
    }
    if (order === 'desc' && host === list) host.insertBefore(li, host.firstChild);
    else host.appendChild(li);
    var n = parseInt(countEl.textContent || '0', 10);
    countEl.textContent = String((isNaN(n) ? 0 : n) + 1);
  }

  form.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t && t.closest ? t.closest('.ap-cmt-reply-btn') : null;
    if (!btn || !form.contains(btn)) return;
    parentInput.value = btn.getAttribute('data-id') || '0';
    replying.textContent = '回复 @' + (btn.getAttribute('data-author') || '');
    replying.hidden = false;
    cancelBtn.hidden = false;
    var ta = form.querySelector('textarea');
    if (ta) try { ta.focus(); } catch (err) {}
  });
  cancelBtn.addEventListener('click', function () {
    parentInput.value = '0';
    replying.hidden = true;
    cancelBtn.hidden = true;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = {
      postId: fd.get('postId'), parent: fd.get('parent'),
      author: fd.get('author'), email: fd.get('email'), website: fd.get('website'),
      content: fd.get('content'), ap_website: fd.get('ap_website')
    };
    if (!String(payload.author || '').trim() || !String(payload.email || '').trim() || !String(payload.content || '').trim()) {
      setMsg('请填写昵称、邮箱和评论内容', false);
      return;
    }
    submitBtn.disabled = true;
    fetch('/ap-comments/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; });
    }).then(function (res) {
      if (res.status === 201 && res.data.status === 'approved') {
        var li = makeItem({
          id: res.data.id || 0, author: String(payload.author).trim(),
          email: String(payload.email || ''), website: String(payload.website || ''),
          content: String(payload.content).trim()
        });
        insertItem(li, parseInt(String(payload.parent), 10) || 0);
        form.reset();
        parentInput.value = '0'; replying.hidden = true; cancelBtn.hidden = true;
        setMsg('评论已发表', true);
      } else if (res.status === 201 || res.status === 202) {
        form.reset();
        parentInput.value = '0'; replying.hidden = true; cancelBtn.hidden = true;
        setMsg('评论已提交，审核通过后显示', true);
      } else {
        setMsg(res.data && res.data.error ? res.data.error : '提交失败，请稍后再试', false);
      }
    }).catch(function () {
      setMsg('网络错误，请稍后再试', false);
    }).finally(function () {
      submitBtn.disabled = false;
    });
  });
})();
</script>
</div>`;
}
