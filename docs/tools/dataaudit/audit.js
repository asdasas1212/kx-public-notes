(function (root) {
  'use strict';
  const VERSION = '0.1.0';
  const LIMIT = 100;
  function parseCSV(text, delimiter = ',') {
    if (![';', ',', '\t'].includes(delimiter)) throw new Error('请选择逗号、分号或制表符。');
    text = text.replace(/^\uFEFF/, '');
    const records = []; let cells = [], cell = '', quoted = false, closed = false;
    let line = 1, recordLine = 1, started = false;
    function finish() {
      cells.push(cell);
      if (started || cells.length > 1 || cell !== '') records.push({ cells, line: recordLine });
      cells = []; cell = ''; closed = false; started = false; recordLine = line + 1;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { quoted = false; closed = true; }
        } else {
          if (c === '\r' && text[i + 1] === '\n') { cell += '\n'; i++; line++; }
          else { cell += c; if (c === '\n' || c === '\r') line++; }
        }
      } else if (c === delimiter) { cells.push(cell); cell = ''; closed = false; started = true; }
      else if (c === '\r' || c === '\n') {
        finish(); if (c === '\r' && text[i + 1] === '\n') i++; line++; recordLine = line;
      } else if (c === '"') {
        if (cell !== '' || closed) throw new Error(`第 ${line} 行引号位置不合法。`);
        quoted = true; started = true;
      } else {
        if (closed) throw new Error(`第 ${line} 行闭合引号后存在多余字符。`);
        cell += c; started = true;
      }
    }
    if (quoted) throw new Error(`第 ${recordLine} 行的引号没有闭合。`);
    finish();
    if (!records.length) throw new Error('CSV 为空，请提供表头和至少一行数据。');
    const header = records.shift();
    return { headers: header.cells.map(c => c.trim()), rows: records, headerLine: header.line };
  }
  function number(value) {
    const s = String(value ?? '').trim();
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
  }
  function time(value, unit) {
    if (unit !== 'iso') {
      const n = number(value);
      return n === null ? null : n * ({ s: 1000, ms: 1, us: 0.001 }[unit] ?? NaN);
    }
    const s = String(value ?? '').trim();
    // No locale-dependent formats; a datetime must include an explicit zone.
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(s);
    if (!m) return null;
    const y = +m[1], month = +m[2], day = +m[3];
    const days = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
    if (m[4] && (+m[4] > 23 || +m[5] > 59 || +m[6] > 59)) return null;
    if (m[8] && m[8] !== 'Z' && (+m[8].slice(1,3) > 23 || +m[8].slice(4,6) > 59)) return null;
    const parsed = Date.parse(m[4] ? s.replace(' ', 'T') : s + 'T00:00:00Z');
    return Number.isFinite(parsed) ? parsed : null;
  }
  function audit(text, options = {}) {
    const parsed = parseCSV(text, options.delimiter || ',');
    const { headers, rows } = parsed;
    const issues = new Map(), duplicateRows = new Map();
    const stats = headers.map((name, index) => ({ name, index, missing: 0, numeric: 0, text: 0 }));
    function add(code, severity, title, row, detail, fix) {
      if (!issues.has(code)) issues.set(code, { code, severity, title, count: 0, examples: [], fix });
      const issue = issues.get(code); issue.count++;
      if (issue.examples.length < LIMIT) issue.examples.push({ line: row, detail });
    }
    const seenHeaders = new Set();
    headers.forEach(h => {
      if (!h) add('EMPTY_HEADER', 'error', '列名为空', parsed.headerLine, '空列名不能可靠映射字段。', '为每一列设置非空且唯一的列名。');
      if (seenHeaders.has(h)) add('DUPLICATE_HEADER', 'error', '列名重复', parsed.headerLine, h, '为同名列分别命名。');
      seenHeaders.add(h);
    });
    if (!rows.length) add('NO_DATA', 'error', '没有数据记录', parsed.headerLine, '文件只有表头。', '补充数据记录后重新检查。');
    const lower = headers.map(h => h.toLowerCase());
    const match = names => lower.findIndex(h => names.includes(h));
    function selected(name, defaults) {
      const value = options[name];
      if (value === '') return -1;
      if (value === undefined || value === 'auto') return match(defaults);
      const idx = headers.indexOf(value);
      if (idx < 0) throw new Error(`不存在配置列：${value}`);
      return idx;
    }
    const mode = options.mode || 'general';
    if (!['general', 'quant', 'robot'].includes(mode)) throw new Error('检查模式无效。');
    const ti = selected('timeColumn', ['timestamp','datetime','date','time']);
    const gi = selected('groupColumn', mode === 'robot' ? ['episode_index','episode_id','episode'] : ['symbol','instrument','ticker','asset']);
    const fi = mode === 'robot' ? selected('frameColumn', ['frame_index','frame_id','frame']) : -1;
    const unit = options.timeUnit || (mode === 'robot' ? 's' : 'iso');
    if (!['iso','s','ms','us'].includes(unit)) throw new Error('时间单位无效。');
    const interval = options.expectedInterval === undefined || options.expectedInterval === '' ? null : number(options.expectedInterval);
    if (interval !== null && interval <= 0) throw new Error('预期间隔必须大于 0。');
    if (options.expectedInterval !== undefined && options.expectedInterval !== '' && interval === null) throw new Error('预期间隔必须是有效数字。');
    const prices = ['open','high','low','close'].map(h => lower.indexOf(h));
    const volume = match(['volume','vol']);
    const sequences = new Map(), frames = new Map();
    const timeKeys = new Map(), frameKeys = new Map();
    const skipped = [];
    if (ti < 0) skipped.push('未映射时间列：未检查时间格式、排序和重复时间。');
    if (gi < 0 && ti >= 0) skipped.push('未映射分组列：所有记录按同一条序列检查；多资产或多 episode 数据应选择分组列。');
    if (interval === null) skipped.push('未设置预期间隔：未检查时间缺口。');
    if (mode === 'quant' && prices.some(i => i < 0)) skipped.push('缺少完整 open/high/low/close 列：未检查 OHLC 一致性。');
    if (mode === 'robot' && fi < 0) skipped.push('未映射帧号列：未检查帧号顺序、重复和缺口。');
    rows.forEach(row => {
      const { cells, line } = row;
      if (cells.length !== headers.length) {
        add('ROW_WIDTH', 'error', '行的列数与表头不符', line, `应有 ${headers.length} 列，实际 ${cells.length} 列。`, '修复分隔符、引号或缺失字段。');
        return;
      }
      const rowKey = JSON.stringify(cells);
      if (duplicateRows.has(rowKey)) add('DUPLICATE_ROW', 'warning', '整行重复', line, `与第 ${duplicateRows.get(rowKey)} 行相同。`, '确认重复是否合法，再决定去重；工具不修改原始数据。');
      else duplicateRows.set(rowKey, line);
      cells.forEach((c, i) => {
        if (c.trim() === '') {
          stats[i].missing++;
          add('MISSING_CELL', 'warning', '空字段', line, headers[i] || `第 ${i + 1} 列`, '按字段语义处理缺失值；不要默认填 0。');
        } else if (number(c) !== null) stats[i].numeric++;
        else stats[i].text++;
      });
      const group = gi < 0 ? '' : cells[gi].trim();
      if (gi >= 0 && group === '') {
        add('MISSING_GROUP', 'error', '分组标识为空', line, headers[gi], '补齐资产或 episode 标识，避免混合检查不同序列。');
      }
      if (ti >= 0 && (gi < 0 || group !== '')) {
        const t = time(cells[ti], unit);
        if (t === null || !Number.isFinite(t)) add('INVALID_TIME', 'error', '时间值无效', line, `${headers[ti]}=${cells[ti]}`, '数字时间请选择秒/毫秒/微秒；日期用 YYYY-MM-DD，日期时间需显式时区。');
        else {
          const key = JSON.stringify([group, t]);
          if (timeKeys.has(key)) add('DUPLICATE_TIME', 'error', '同组时间重复', line, `与第 ${timeKeys.get(key)} 行时间相同。`, '检查是否重复采样或选择了不够精细的时间列。');
          else timeKeys.set(key, line);
          const prev = sequences.get(group);
          if (prev && t < prev.t) add('TIME_REVERSED', 'error', '同组时间倒序', line, `晚于文件中第 ${prev.line} 行出现，但时间更早。`, '按分组和时间排序后再次检查。');
          if (prev && interval !== null && t > prev.t) {
            const expectedMs = interval * 1000;
            if (t - prev.t > expectedMs * 1.5) add('TIME_GAP', 'warning', '时间间隔超出设置', line, `与第 ${prev.line} 行相差 ${((t - prev.t) / 1000).toPrecision(6)} 秒，设置为 ${interval} 秒。`, '核对采样频率；交易时段、周末和休市需额外交易日历，当前未接入。');
          }
          sequences.set(group, { t, line });
        }
      }
      if (mode === 'robot' && fi >= 0 && (gi < 0 || group !== '')) {
        const f = number(cells[fi]);
        if (f === null || !Number.isSafeInteger(f) || f < 0) add('INVALID_FRAME', 'error', '帧号不是非负安全整数', line, `${headers[fi]}=${cells[fi]}`, '使用从 0 或 1 起始的整数帧号。');
        else {
          const key = JSON.stringify([group,f]);
          if (frameKeys.has(key)) add('DUPLICATE_FRAME', 'error', '同组帧号重复', line, `与第 ${frameKeys.get(key)} 行重复。`, '确认 episode 标识和帧号唯一。');
          else frameKeys.set(key,line);
          const prev = frames.get(group);
          if (prev && f < prev.f) add('FRAME_REVERSED', 'error', '同组帧号倒序', line, `第 ${prev.line} 行帧号为 ${prev.f}。`, '按 episode 和帧号排序。');
          if (prev && f > prev.f + 1) add('FRAME_GAP','warning','同组帧号不连续',line,`第 ${prev.line} 行帧号为 ${prev.f}，本行为 ${f}。`,'核对是否有丢帧；有意降采样时可以忽略此提示。');
          frames.set(group,{f,line});
        }
      }
      if (mode === 'quant') {
        const indices = prices.filter(i => i >= 0).concat(volume >= 0 ? [volume] : []);
        indices.forEach(i => {
          const n = number(cells[i]);
          if (n === null) add('INVALID_MARKET_NUMBER','error','行情数值无效',line,`${headers[i]}=${cells[i]}`,'价格和成交量应为有限数字；去掉千分位分隔、单位或异常标记。');
          else if (i === volume && n < 0) add('NEGATIVE_VOLUME','error','成交量为负数',line,`${headers[i]}=${cells[i]}`,'核对数据源和转换过程。');
        });
        if (prices.every(i => i >= 0)) {
          const [o,h,l,c] = prices.map(i => number(cells[i]));
          if ([o,h,l,c].every(n => n !== null) && (h < l || h < Math.max(o,c) || l > Math.min(o,c))) {
            add('OHLC_INCONSISTENT','error','OHLC 价格关系矛盾',line,`open=${o}, high=${h}, low=${l}, close=${c}`,'核对价格字段顺序与复权口径；high 应不低于 open/close/low，low 应不高于 open/close/high。');
          }
        }
      }
    });
    stats.forEach(s => {
      const total = s.numeric + s.text;
      if (s.numeric > 0 && s.text > 0 && s.numeric / total >= 0.8) {
        add('MIXED_NUMERIC_COLUMN','warning','以数字为主的列混有文本',parsed.headerLine,`${s.name}：${s.numeric} 个数字，${s.text} 个文本。`,'核对异常值；代码、编号和标识列可以合法混合，原始字符串会保留。');
      }
    });
    return {
      version: VERSION, status: [...issues.values()].some(i => i.severity === 'error') ? 'needs_fix' : 'reviewed',
      rows: rows.length, columns: headers.length, groups: gi >= 0 ? new Set(rows.filter(r => r.cells.length === headers.length).map(r => r.cells[gi].trim()).filter(Boolean)).size : null,
      options: { mode, delimiter: options.delimiter || ',', timeColumn: headers[ti] ?? null, groupColumn: headers[gi] ?? null, frameColumn: headers[fi] ?? null, timeUnit: unit, expectedInterval: interval },
      columnStats: stats, issues: [...issues.values()].sort((a,b) => (a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === 'error' ? -1 : 1)),
      skipped, exampleLimit: LIMIT,
      limitations: ['只检查本次 CSV 的结构和配置规则；不验证来源真实性、收益、交易策略或机器人动作安全。', '未映射或跳过的检查不代表通过。机器人模式只检查表格元信息，不读取视频、动作张量或 Parquet。', '每类问题最多展示 100 个例子，count 为完整扫描的出现次数；同一行可以触发多类问题。']
    };
  }
  const api = { VERSION, parseCSV, audit, number, time };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
