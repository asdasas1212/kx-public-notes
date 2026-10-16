(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let source = '', name = '', report = null, revision = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const delimiter = () => $('delimiter').value === 'tab' ? '\t' : $('delimiter').value;
  function clearReport() { revision++; report = null; $('json').disabled = $('html').disabled = true; $('report').hidden = true; $('empty').hidden = false; }
  function columns() {
    try {
      const parsed = DataAudit.parseCSV(source, delimiter());
      ['timeColumn','groupColumn','frameColumn'].forEach(id => {
        const select = $(id), old = select.value;
        select.innerHTML = '<option value="auto">自动识别</option><option value="">跳过此项</option>' + [...new Set(parsed.headers)].filter(Boolean).map(h => `<option value="${escape(h)}">${escape(h)}</option>`).join('');
        if (Array.from(select.options).some(o => o.value === old)) select.value = old;
      });
      $('error').textContent = ''; $('run').disabled = false;
    } catch (e) { $('error').textContent = e.message; $('run').disabled = true; }
  }
  function load(text, filename) {
    clearReport(); source = text; name = filename; $('filename').textContent = filename;
    $('file').value = ''; columns();
  }
  async function file(file) {
    if (!file) return;
    clearReport(); const loadingRevision = revision; $('run').disabled = true;
    if (file.size > 10 * 1024 * 1024) { $('error').textContent = '文件超过 10 MB，请拆分后检查。'; source = ''; return; }
    try {
      const bytes = await file.arrayBuffer();
      if (loadingRevision !== revision) return;
      const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      if (text.includes('\u0000')) throw new Error('检测到二进制或非 UTF-8 文件，请导出 UTF-8 CSV。');
      load(text,file.name);
    } catch (e) { source = ''; $('error').textContent = e instanceof TypeError ? '无法解码，请将文件另存为 UTF-8 CSV。' : e.message; }
  }
  $('file').addEventListener('change', e => file(e.target.files[0]));
  $('drop').addEventListener('dragover', e => {e.preventDefault(); $('drop').classList.add('drag');});
  $('drop').addEventListener('dragleave', () => $('drop').classList.remove('drag'));
  $('drop').addEventListener('drop', e => {e.preventDefault(); $('drop').classList.remove('drag'); file(e.dataTransfer.files[0]);});
  function mode() { $('frameLabel').hidden = $('mode').value !== 'robot'; }
  ['mode','delimiter','unit','timeColumn','groupColumn','frameColumn','interval'].forEach(id => $(id).addEventListener('change', () => {clearReport(); mode(); if (id === 'delimiter' && source) columns();}));
  $('interval').addEventListener('input',clearReport);
  document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
    $('delimiter').value = ','; ['timeColumn','groupColumn','frameColumn'].forEach(id => $(id).value = 'auto');
    const robot = button.dataset.sample === 'robot'; $('mode').value = robot ? 'robot' : 'quant'; $('unit').value = robot ? 's' : 'iso'; $('interval').value = robot ? '0.0333333333' : ''; mode();
    load(robot ? 'episode_index,frame_index,timestamp,action_norm\n0,0,0,0.4\n0,1,0.033333,0.5\n0,3,0.10,\n1,0,0,0.3\n1,1,0.033333,0.4\n1,1,0.033333,0.4\n' : 'symbol,date,open,high,low,close,volume\nDEMO,2026-10-12,10,11,9,10.8,1000\nDEMO,2026-10-13,10.8,10.5,10,11,-20\nDEMO,2026-10-12,10,11,9,10.8,1000\nOTHER,2026-10-12,20,21,19,,800\n',robot ? '演示-episode.csv' : '演示-行情.csv');
  }));
  function markup(r) {
    const errors = r.issues.filter(i => i.severity === 'error').length, warnings = r.issues.length - errors;
    return `<div class="summary"><div><strong>${r.rows.toLocaleString()}</strong><span>数据行</span></div><div><strong>${r.columns}</strong><span>列</span></div><div><strong>${errors}</strong><span>错误类型</span></div><div><strong>${warnings}</strong><span>需核对类型</span></div></div>` +
      `<div class="status ${errors ? 'bad' : ''}">${errors ? '发现需要修复的问题' : r.issues.length ? '未发现阻断错误，仍有提示需核对' : '本次已配置规则未发现问题'} · ${escape(r.file)}<br>检查模式：${escape(r.options.mode)} · 时间列：${escape(r.options.timeColumn || '未配置')} · 分组列：${escape(r.options.groupColumn || '未配置')}</div>` +
      r.issues.map(i => `<article class="issue"><div class="issue-top"><h3><span class="badge ${i.severity === 'error' ? 'error' : ''}">${i.severity === 'error' ? '错误' : '核对'}</span>${escape(i.title)}</h3><span class="count">${i.count} 次</span></div><p>${escape(i.fix)}</p><details><summary>查看原始行号与例子（${i.examples.length} / ${i.count}）</summary>${i.examples.map(e => `<div class="example">行 ${e.line} · ${escape(e.detail)}</div>`).join('')}</details></article>`).join('') +
      `<div class="notes"><h3>已跳过的检查</h3>${r.skipped.length ? '<ul>'+r.skipped.map(s => `<li>${escape(s)}</li>`).join('')+'</ul>' : '<p>无配置跳过项；仍受下列范围限制。</p>'}<h3>检查范围与限制</h3><ul>${r.limitations.map(s => `<li>${escape(s)}</li>`).join('')}</ul><details><summary>逐列概况</summary>${r.columnStats.map(c => `<div class="example">${escape(c.name)} · 空值 ${c.missing} / 数字 ${c.numeric} / 文本 ${c.text}</div>`).join('')}</details><p>文件 SHA-256：${escape(r.sha256 || '此环境不支持文件指纹计算')}<br>DataAudit ${r.version} · ${escape(r.checkedAt)}</p></div>`;
  }
  $('run').addEventListener('click', async () => {
    const current = revision; $('run').disabled = true; $('run').textContent = '正在检查…'; $('error').textContent = '';
    try {
      await new Promise(resolve => setTimeout(resolve,20));
      if (current !== revision) return;
      const options = {mode:$('mode').value,delimiter:delimiter(),timeUnit:$('unit').value,timeColumn:$('timeColumn').value,groupColumn:$('groupColumn').value,frameColumn:$('frameColumn').value,expectedInterval:$('interval').value};
      const parsed = DataAudit.parseCSV(source,delimiter());
      if (parsed.rows.length > 100000) throw new Error('超过 100,000 行，请拆分后检查。');
      const result = DataAudit.audit(source,options); result.file = name; result.checkedAt = new Date().toISOString();
      if (globalThis.crypto?.subtle) result.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))).map(x => x.toString(16).padStart(2,'0')).join('');
      if (current !== revision) return;
      report = result; $('report').innerHTML = markup(result); $('report').hidden = false; $('empty').hidden = true; $('json').disabled = $('html').disabled = false;
    } catch (e) { $('error').textContent = e.message; }
    finally { $('run').disabled = !source; $('run').textContent = '检查数据'; }
  });
  function download(content,type,ext) {
    const url = URL.createObjectURL(new Blob([content],{type})), a = document.createElement('a');
    a.href = url; a.download = name.replace(/\.[^.]+$/,'') + '.audit.' + ext; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  $('json').addEventListener('click',() => {if(report) download(JSON.stringify(report,null,2),'application/json','json');});
  $('html').addEventListener('click',() => {
    if (!report) return;
    download('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DataAudit 检查报告</title><style>body{font-family:system-ui,sans-serif;max-width:880px;margin:36px auto;padding:20px;color:#18364d}.summary{display:flex;gap:35px}.summary strong{display:block;font-size:26px}.issue{border-top:1px solid #ddd;padding:14px 0}.issue-top{display:flex;justify-content:space-between}p,li{line-height:1.8}.badge,.count{font-size:12px}.example{font:12px monospace;line-height:1.8;overflow-wrap:anywhere}.notes{font-size:12px}.status{background:#e3f2f6;padding:15px;margin:20px 0}details{margin:12px 0}h3{font-size:16px}</style><h1>DataAudit · 数据检查报告</h1>'+markup(report)+'</html>','text/html','html');
  });
})();
