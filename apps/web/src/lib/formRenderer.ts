/** Builds a complete self-contained form HTML string for server-side injection. */
export function buildFormHtml(form: any): string {
  const fields: any[] = form.fields ?? [];
  const settings = form.settings ?? {};
  const submitText: string = settings.submitText ?? settings.submitButtonText ?? "Submit";

  // Split fields into pages
  const pages: any[][] = [];
  let cur: any[] = [];
  for (const f of fields) {
    if (f.type === "page_break") { pages.push(cur); cur = []; }
    else cur.push(f);
  }
  pages.push(cur);
  const isMulti = pages.length > 1;

  const pagesHtml = pages.map((pf, pi) => {
    const indicator = isMulti
      ? `<div class="apf-indicator">${pages.map((_, i) => `<span class="${i <= pi ? "apf-done" : ""}"></span>`).join("")}</div>`
      : "";
    const fieldsHtml = pf.map((f: any) => fieldHtml(f, form.id)).join("");
    const nav = isMulti
      ? `<div class="apf-nav">
          ${pi > 0 ? `<button type="button" class="apf-btn-prev apf-btn-secondary" data-go="${pi - 1}">← Previous</button>` : ""}
          ${pi < pages.length - 1
            ? `<button type="button" class="apf-btn-next apf-btn-primary" data-go="${pi + 1}">Next →</button>`
            : `<button type="submit" class="apf-btn-primary" id="apf-submit-${form.id}">${escHtml(submitText)}</button>`
          }
        </div>`
      : "";
    return `<div class="apf-page${pi === 0 ? " apf-active" : ""}" data-page="${pi}">${indicator}${fieldsHtml}${nav}</div>`;
  }).join("");

  const submitRow = isMulti ? "" : `<div class="apf-submit-row"><button type="submit" class="apf-btn-primary" id="apf-submit-${form.id}">${escHtml(submitText)}</button></div>`;

  return `
<div class="wp-block-astropress-form apf-wrap" data-form-id="${form.id}">
  <div class="apf-error" id="apf-error-${form.id}" style="display:none"></div>
  <div class="apf-confirmation" id="apf-conf-${form.id}" style="display:none"></div>
  <form class="apf-form" id="apf-form-${form.id}" data-form-id="${form.id}" novalidate>
    ${pagesHtml}${submitRow}
  </form>
</div>`;
}

function escHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldHtml(f: any, formId: string): string {
  if (f.type === "hidden") {
    return `<input type="hidden" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" value="${escHtml(f.defaultValue ?? "")}" />`;
  }

  const condAttr = f.conditionalLogic ? ` data-cond='${JSON.stringify(f.conditionalLogic)}'` : "";

  if (f.type === "html" || f.type === "content") {
    return `<div class="apf-field" data-fid="${escHtml(f.id)}"${condAttr}>${f.htmlContent ?? f.html ?? f.content ?? ""}</div>`;
  }

  if (f.type === "section_divider") {
    const title = f.label ? `<p class="apf-section-title">${escHtml(f.label)}</p>` : "";
    const desc = f.description ? `<p class="apf-hint">${escHtml(f.description)}</p>` : "";
    return `<div class="apf-field" data-fid="${escHtml(f.id)}"${condAttr}>${title}<hr class="apf-divider" />${desc}</div>`;
  }

  if (f.type === "captcha") {
    return `<div class="apf-field" data-fid="${escHtml(f.id)}"${condAttr}><div class="apf-captcha-placeholder">🤖 CAPTCHA (preview only)</div></div>`;
  }

  const reqStar = f.required ? `<span class="apf-req">*</span>` : "";
  const labelHtml = `<label class="apf-label" for="apf-f-${escHtml(f.id)}">${escHtml(f.label ?? "")}${reqStar}</label>`;
  const hintHtml = f.description ? `<p class="apf-hint">${escHtml(f.description)}</p>` : "";
  const errHtml = `<p class="apf-err" id="apf-err-${escHtml(f.id)}">${escHtml(f.label ?? "This field")} is required.</p>`;

  let inputHtml = "";
  const choices: any[] = f.choices ?? [];

  switch (f.type) {
    case "text":
    case "email":
    case "url":
    case "password":
      inputHtml = `<input class="apf-input" id="apf-f-${escHtml(f.id)}" type="${f.type}" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" placeholder="${escHtml(f.placeholder ?? "")}" />`;
      break;
    case "phone":
      inputHtml = `<input class="apf-input" id="apf-f-${escHtml(f.id)}" type="tel" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" placeholder="${escHtml(f.placeholder ?? "")}" />`;
      break;
    case "number":
      inputHtml = `<input class="apf-input" id="apf-f-${escHtml(f.id)}" type="number" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" ${f.numberMin ? `min="${f.numberMin}"` : ""} ${f.numberMax ? `max="${f.numberMax}"` : ""} />`;
      break;
    case "range_slider":
      inputHtml = `<div><input class="apf-range" id="apf-f-${escHtml(f.id)}" type="range" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" min="${f.min ?? 0}" max="${f.max ?? 100}" step="${f.step ?? 1}" value="${f.defaultValue ?? f.min ?? 0}" oninput="document.getElementById('apf-range-val-${escHtml(f.id)}').textContent=this.value" /><span id="apf-range-val-${escHtml(f.id)}">${f.defaultValue ?? f.min ?? 0}</span></div>`;
      break;
    case "textarea":
      inputHtml = `<textarea class="apf-textarea" id="apf-f-${escHtml(f.id)}" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" rows="4" placeholder="${escHtml(f.placeholder ?? "")}"></textarea>`;
      break;
    case "dropdown":
      inputHtml = `<select class="apf-select" id="apf-f-${escHtml(f.id)}" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}"><option value="">— Select —</option>${choices.map(c => `<option value="${escHtml(c.value)}">${escHtml(c.label)}</option>`).join("")}</select>`;
      break;
    case "multiple_choice":
      inputHtml = `<div class="apf-choices" id="apf-f-${escHtml(f.id)}" data-fid="${escHtml(f.id)}">${choices.map(c => `<label class="apf-choice"><input type="radio" name="${escHtml(f.id)}" value="${escHtml(c.value)}" />${escHtml(c.label)}</label>`).join("")}</div>`;
      break;
    case "checkboxes":
      inputHtml = `<div class="apf-choices" id="apf-f-${escHtml(f.id)}" data-fid="${escHtml(f.id)}">${choices.map(c => `<label class="apf-choice"><input type="checkbox" name="${escHtml(f.id)}[]" value="${escHtml(c.value)}" data-group="${escHtml(f.id)}" />${escHtml(c.label)}</label>`).join("")}</div>`;
      break;
    case "name":
      inputHtml = `<div class="apf-name-row">
        <input class="apf-input" type="text" name="${escHtml(f.id)}[first]" data-namefield="${escHtml(f.id)}" placeholder="${escHtml(f.subLabels?.first ?? "First Name")}" />
        ${f.nameFormat === "first-middle-last" ? `<input class="apf-input" type="text" name="${escHtml(f.id)}[middle]" data-namefield="${escHtml(f.id)}" placeholder="${escHtml(f.subLabels?.middle ?? "Middle")}" />` : ""}
        <input class="apf-input" type="text" name="${escHtml(f.id)}[last]" data-namefield="${escHtml(f.id)}" placeholder="${escHtml(f.subLabels?.last ?? "Last Name")}" />
      </div>`;
      break;
    case "address":
      inputHtml = `<div class="apf-address">
        <input class="apf-input" type="text" name="${escHtml(f.id)}[address1]" placeholder="Address Line 1" style="margin-bottom:8px" />
        <div class="apf-name-row" style="margin-bottom:8px">
          <input class="apf-input" type="text" name="${escHtml(f.id)}[city]" placeholder="City" />
          <input class="apf-input" type="text" name="${escHtml(f.id)}[state]" placeholder="State" />
          <input class="apf-input" type="text" name="${escHtml(f.id)}[zip]" placeholder="ZIP" style="max-width:100px" />
        </div>
        <input class="apf-input" type="text" name="${escHtml(f.id)}[country]" placeholder="Country" />
      </div>`;
      break;
    case "date_time":
      inputHtml = `<div class="apf-name-row">
        ${f.dateEnable !== false ? `<input class="apf-input" type="date" name="${escHtml(f.id)}[date]" data-fid="${escHtml(f.id)}" style="flex:1" />` : ""}
        ${f.timeEnable ? `<input class="apf-input" type="time" name="${escHtml(f.id)}[time]" style="flex:1" />` : ""}
      </div>`;
      break;
    case "file":
      inputHtml = `<input type="file" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" ${f.fileExtensions ? `accept="${f.fileExtensions.split(",").map((e: string) => `.${e.trim()}`).join(",")}"` : ""} ${f.fileMaxCount > 1 ? "multiple" : ""} />`;
      break;
    case "rating":
      inputHtml = `<div class="apf-stars" id="apf-f-${escHtml(f.id)}" data-fid="${escHtml(f.id)}">
        ${Array.from({ length: f.ratingCount ?? 5 }, (_, i) => `<button type="button" class="apf-star" data-val="${i + 1}">★</button>`).join("")}
        <input type="hidden" name="${escHtml(f.id)}" id="apf-star-val-${escHtml(f.id)}" value="" />
      </div>`;
      break;
    case "nps":
      inputHtml = `<div class="apf-nps">
        <div class="apf-nps-nums" id="apf-f-${escHtml(f.id)}" data-fid="${escHtml(f.id)}">
          ${Array.from({ length: 11 }, (_, i) => `<button type="button" class="apf-nps-btn" data-val="${i}">${i}</button>`).join("")}
        </div>
        <div class="apf-nps-labels"><span>${escHtml(f.npsStart ?? "Not at all likely")}</span><span>${escHtml(f.npsEnd ?? "Extremely likely")}</span></div>
        <input type="hidden" name="${escHtml(f.id)}" id="apf-nps-val-${escHtml(f.id)}" value="" />
      </div>`;
      break;
    default:
      inputHtml = `<input class="apf-input" id="apf-f-${escHtml(f.id)}" type="text" name="${escHtml(f.id)}" data-fid="${escHtml(f.id)}" placeholder="${escHtml(f.placeholder ?? "")}" />`;
  }

  return `<div class="apf-field" data-fid="${escHtml(f.id)}"${condAttr}>${labelHtml}${inputHtml}${hintHtml}${errHtml}</div>`;
}

export const APF_STYLES = `
<style>
.apf-wrap{font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1d2327}
.apf-form{display:flex;flex-direction:column;gap:16px}
.apf-page{display:none}.apf-page.apf-active{display:flex;flex-direction:column;gap:16px}
.apf-indicator{display:flex;gap:4px;margin-bottom:4px}
.apf-indicator span{height:5px;flex:1;border-radius:3px;background:#dcdcde}
.apf-indicator span.apf-done{background:#2271b1}
.apf-label{display:block;font-weight:500;font-size:13px;margin-bottom:4px;color:#1d2327}
.apf-req{color:#dc3232;margin-left:2px}
.apf-input,.apf-textarea,.apf-select{width:100%;padding:8px 10px;border:1px solid #dcdcde;border-radius:4px;font-size:14px;font-family:inherit;box-sizing:border-box;outline:none}
.apf-textarea{resize:vertical}
.apf-range{width:100%}
.apf-hint{margin:3px 0 0;font-size:11px;color:#646970}
.apf-err{margin:3px 0 0;font-size:12px;color:#dc3232;display:none}
.apf-field.apf-has-error .apf-input,
.apf-field.apf-has-error .apf-textarea,
.apf-field.apf-has-error .apf-select{border-color:#dc3232}
.apf-field.apf-has-error .apf-err{display:block}
.apf-choices{display:flex;flex-direction:column;gap:6px}
.apf-choice{display:flex;align-items:center;gap:8px;cursor:pointer}
.apf-name-row{display:flex;gap:8px}
.apf-name-row .apf-input{flex:1}
.apf-address .apf-input{width:100%;display:block}
.apf-section-title{margin:0 0 4px;font-size:15px;font-weight:600;border-bottom:1px solid #dcdcde;padding-bottom:8px}
.apf-divider{border:none;border-top:1px solid #dcdcde;margin:4px 0}
.apf-stars{display:flex;align-items:center;gap:2px}
.apf-star{background:none;border:none;cursor:pointer;font-size:26px;color:#dcdcde;padding:0;line-height:1}
.apf-star.apf-on{color:#f59e0b}
.apf-nps{display:flex;flex-direction:column;gap:4px}
.apf-nps-nums{display:flex;gap:4px;flex-wrap:wrap}
.apf-nps-btn{width:36px;height:36px;border:1px solid #dcdcde;border-radius:4px;cursor:pointer;font-size:13px;background:#fff;padding:0}
.apf-nps-btn.apf-on{background:#2271b1;color:#fff;border-color:#2271b1}
.apf-nps-labels{display:flex;justify-content:space-between;font-size:11px;color:#646970}
.apf-captcha-placeholder{padding:12px;border:1px solid #dcdcde;border-radius:4px;background:#f6f7f7;color:#646970}
.apf-submit-row{margin-top:4px}.apf-nav{display:flex;gap:8px;margin-top:4px}
.apf-btn-primary{padding:9px 22px;background:#2271b1;color:#fff;border:none;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer}
.apf-btn-primary:disabled{opacity:.7;cursor:default}
.apf-btn-secondary{padding:9px 18px;background:#f6f7f7;border:1px solid #dcdcde;border-radius:4px;font-size:14px;cursor:pointer}
.apf-error{padding:10px 14px;background:#fce8e8;border:1px solid #dc3232;border-radius:4px;color:#dc3232;font-size:13px;margin-bottom:12px}
.apf-confirmation{padding:16px 20px;background:#f0f7ee;border:1px solid #7ad03a;border-radius:8px}
</style>`;

export const APF_SCRIPT = `
<script>
(function(){
  // Stars
  document.querySelectorAll('.apf-stars').forEach(function(wrap){
    wrap.querySelectorAll('.apf-star').forEach(function(btn){
      btn.addEventListener('click',function(){
        var v=Number(btn.dataset.val);
        document.getElementById('apf-star-val-'+wrap.dataset.fid).value=v;
        wrap.querySelectorAll('.apf-star').forEach(function(s){s.classList.toggle('apf-on',Number(s.dataset.val)<=v);});
      });
    });
  });
  // NPS
  document.querySelectorAll('.apf-nps-nums').forEach(function(wrap){
    wrap.querySelectorAll('.apf-nps-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        var v=btn.dataset.val;
        document.getElementById('apf-nps-val-'+wrap.dataset.fid).value=v;
        wrap.querySelectorAll('.apf-nps-btn').forEach(function(b){b.classList.toggle('apf-on',b.dataset.val===v);});
      });
    });
  });
  // Conditional logic
  function evalCond(){
    document.querySelectorAll('.apf-field[data-cond]').forEach(function(wrap){
      var cl;try{cl=JSON.parse(wrap.dataset.cond);}catch{return;}
      if(!cl||!cl.enabled)return;
      var vals=collectVals(wrap.closest('form'));
      var res=(cl.rules||[]).map(function(r){
        var v=String(vals[r.fieldId]||'');
        switch(r.operator){
          case'is':return v===r.value;case'is_not':return v!==r.value;
          case'contains':return v.includes(r.value);case'not_contains':return!v.includes(r.value);
          case'greater_than':return Number(v)>Number(r.value);case'less_than':return Number(v)<Number(r.value);
          case'is_empty':return v==='';case'is_not_empty':return v!=='';default:return true;
        }
      });
      var pass=cl.logicType==='all'?res.every(Boolean):res.some(Boolean);
      wrap.style.display=(cl.action==='show'?pass:!pass)?'':'none';
    });
  }
  function collectVals(form){
    var v={};
    form.querySelectorAll('input:not([type=radio]):not([type=checkbox])').forEach(function(el){if(el.name)v[el.name]=el.value;});
    form.querySelectorAll('input[type=radio]:checked').forEach(function(el){v[el.name]=el.value;});
    var g={};form.querySelectorAll('input[type=checkbox][data-group]:checked').forEach(function(el){if(!g[el.dataset.group])g[el.dataset.group]=[];g[el.dataset.group].push(el.value);});
    Object.assign(v,g);
    // flatten name[first] etc
    var out={};
    Object.keys(v).forEach(function(k){var m=k.match(/^(.+)\\[(.+)\\]$/);if(m){if(!out[m[1]])out[m[1]]={};out[m[1]][m[2]]=v[k];}else{out[k]=v[k];}});
    return out;
  }
  document.querySelectorAll('.apf-form').forEach(function(form){
    form.addEventListener('input',evalCond);
  });
  evalCond();
  // Multi-page
  function validatePage(pageEl){
    var ok=true;
    pageEl.querySelectorAll('.apf-field[data-fid]').forEach(function(wrap){
      if(wrap.style.display==='none')return;
      var lbl=wrap.querySelector('.apf-req');if(!lbl)return;
      var fid=wrap.dataset.fid;
      var form=wrap.closest('form');
      var val=getVal(form,fid);
      var empty=val===''||val===null||val===undefined||(Array.isArray(val)&&val.length===0);
      wrap.classList.toggle('apf-has-error',empty);
      if(empty)ok=false;
    });
    return ok;
  }
  function getVal(form,fid){
    var star=document.getElementById('apf-star-val-'+fid);if(star)return star.value;
    var nps=document.getElementById('apf-nps-val-'+fid);if(nps)return nps.value;
    var radio=form.querySelector('input[type=radio][name="'+fid+'"]:checked');if(radio)return radio.value;
    var checks=form.querySelectorAll('input[type=checkbox][data-group="'+fid+'"]:checked');
    if(checks.length)return Array.from(checks).map(function(c){return c.value;});
    var el=form.querySelector('[name="'+fid+'"]')||form.querySelector('[name="'+fid+'[first]"]');
    return el?el.value:'';
  }
  document.querySelectorAll('[data-go]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var go=Number(btn.dataset.go);
      var form=btn.closest('form');
      var pages=form.querySelectorAll('.apf-page');
      var curPage=form.querySelector('.apf-page.apf-active');
      var curIdx=Number(curPage.dataset.page);
      if(go>curIdx&&!validatePage(curPage))return;
      pages.forEach(function(p){p.classList.remove('apf-active');});
      pages[go].classList.add('apf-active');
    });
  });
  // Submit
  document.querySelectorAll('.apf-form').forEach(function(form){
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      var formId=form.dataset.formId;
      var allOk=true;
      form.querySelectorAll('.apf-page').forEach(function(p){if(!validatePage(p))allOk=false;});
      if(!allOk)return;
      var btn=form.querySelector('[type=submit]');
      if(btn){btn.disabled=true;btn.textContent='提交中…';}
      var errEl=document.getElementById('apf-error-'+formId);
      if(errEl)errEl.style.display='none';
      var vals=collectVals(form);
      try{
        var res=await fetch('/api/forms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:formId,fields:vals,pageUrl:window.location.href})});
        var data=await res.json();
        if(!res.ok){if(errEl){errEl.textContent=data.error||'提交失败，请稍后再试。';errEl.style.display='block';}if(btn){btn.disabled=false;btn.textContent='提交';}return;}
        form.style.display='none';
        var conf=data.confirmation;
        if(conf&&conf.type==='redirect'&&conf.redirectUrl){window.location.href=conf.redirectUrl;return;}
        var confEl=document.getElementById('apf-conf-'+formId);
        if(confEl){confEl.innerHTML=(conf&&conf.message)||'<p>提交成功，感谢您的填写！</p>';confEl.style.display='block';}
      }catch{if(errEl){errEl.textContent='网络异常，请稍后再试。';errEl.style.display='block';}if(btn){btn.disabled=false;btn.textContent='提交';}}
    });
  });
})();
</script>`;
