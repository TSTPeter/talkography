/* Talkography charts (Apache ECharts, loaded as window.echarts from vendor/). */
import { esc, fmt, plural } from './core.js';
import { topicSlices } from './stats.js';

let charts = [];
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function isDark(c) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c || ''); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) < 128 : false; }

export function disposeCharts() { charts.forEach((c) => c.dispose()); charts = []; }
export function resizeCharts(opts) { charts.forEach((c) => c.resize(opts)); }

function palette(typeList) {
  const C = { ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'), panel: cssVar('--panel'), accent: cssVar('--accent'), edge: cssVar('--edge'), teacher: cssVar('--teacher'),
    seq: [cssVar('--seq-lo'), cssVar('--seq-mid'), cssVar('--seq-hi')] };
  typeList.forEach((t) => { C[t.k] = cssVar('--' + t.k); });
  C.dark = isDark(C.panel);
  return C;
}
function kit(C) {
  return {
    axis: { axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.line, opacity: .7 } } },
    tip: { backgroundColor: C.panel, borderColor: C.line, textStyle: { color: C.ink, fontFamily: FONT }, confine: true },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 12, textStyle: { color: C.muted, fontFamily: FONT } }
  };
}
function mk(id, opt, C, height) {
  const el = document.getElementById(id);
  if (!el || !window.echarts) return;
  if (height) el.style.height = height + 'px';
  const c = window.echarts.init(el, null, { renderer: 'svg' });
  opt.textStyle = { fontFamily: FONT, color: C.muted }; opt.animationDuration = 400;
  c.setOption(opt); charts.push(c);
}
function missing() {
  document.querySelectorAll('.chart').forEach((el) => { el.style.height = 'auto'; el.innerHTML = '<p class="hint">The chart library did not load. Reload the page while online once, and it will then work offline.</p>'; });
}

/* The five report charts for one discussion. */
export function drawReport(session, st, typeList) {
  disposeCharts();
  if (!session.turns.length || !document.getElementById('ch-map')) return;
  if (!window.echarts) return missing();
  const C = palette(typeList), K = kit(C), per = st.per, T = session.turns, n = per.length;
  const used = typeList.filter((t) => t.on || st.typeTotal(t.k));
  const label = (k) => { const t = typeList.filter((x) => x.k === k)[0]; return t ? t.label : k; };
  const names = per.map((p) => p.name);

  // 1. Conversation map, laid out as the room
  const maxT = Math.max(1, ...per.map((p) => p.turns)), maxPair = Math.max(1, ...Object.values(st.pairs));
  mk('ch-map', {
    tooltip: Object.assign({ formatter: (p) => {
      if (p.dataType === 'edge') return esc(names[+p.data.source]) + ' and ' + esc(names[+p.data.target]) + ': ' + plural(p.data.value, 'exchange');
      const q = per[+p.data.id];
      return '<b>' + esc(q.name) + '</b><br>' + plural(q.turns, 'contribution') + used.filter((t) => q.types[t.k]).map((t) => '<br>' + esc(t.label) + ': ' + q.types[t.k]).join('');
    } }, K.tip),
    series: [{
      type: 'graph', layout: 'none', roam: false, top: 30, bottom: 40, left: 50, right: 50,
      emphasis: { focus: 'adjacency', lineStyle: { opacity: .9 } },
      data: per.map((p) => {
        const s = session.seats[p.i];
        return { id: String(p.i), name: p.name, x: s.x, y: s.y, value: p.turns,
          symbolSize: p.turns ? 18 + 34 * Math.sqrt(p.turns / maxT) : 14,
          itemStyle: { color: p.turns ? (p.me ? C.teacher : C.accent) : C.panel, borderColor: p.turns ? C.panel : C.muted, borderWidth: 2, borderType: p.turns ? 'solid' : 'dashed' },
          label: { show: true, position: 'bottom', distance: 4, color: C.ink, fontWeight: 600, formatter: p.name + ' · ' + p.turns } };
      }),
      links: Object.keys(st.pairs).map((k) => {
        const ab = k.split('-'), c = st.pairs[k], viaMe = per[+ab[0]].me || per[+ab[1]].me;
        return { source: ab[0], target: ab[1], value: c, lineStyle: { width: 1.5 + 8 * (c - 1) / Math.max(1, maxPair - 1), color: viaMe ? C.teacher : C.edge, opacity: .5, type: viaMe ? 'dashed' : 'solid' } };
      })
    }]
  }, C);

  // 2. Participation, stacked by type, biggest at the top
  const order = per.slice().sort((a, b) => a.turns - b.turns || b.i - a.i);
  const even = st.students.length ? st.studentTurns / st.students.length : 0;
  const partSeries = used.map((t) => ({ name: t.label, type: 'bar', stack: 'all', barWidth: 14, emphasis: { focus: 'series' },
    itemStyle: { color: C[t.k], borderColor: C.panel, borderWidth: 1 }, data: order.map((p) => p.types[t.k] || null) }));
  if (partSeries.length) partSeries[0].markLine = { symbol: 'none', silent: true, data: [{ xAxis: +even.toFixed(2) }],
    lineStyle: { color: C.ink, type: 'solid', width: 1, opacity: .55 }, label: { formatter: 'even share', color: C.muted, position: 'end' } };
  mk('ch-part', {
    legend: K.legend, tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, K.tip),
    grid: { left: 4, right: 36, top: 60, bottom: 4, containLabel: true },
    xAxis: Object.assign({ type: 'value', minInterval: 1 }, K.axis),
    yAxis: Object.assign({ type: 'category', data: order.map((p) => p.name) }, K.axis, { axisLabel: { color: C.ink } }),
    series: partSeries
  }, C, Math.max(280, n * 30 + 100));

  // 3. Timeline: a row per person, a dot per contribution, a line through the hand-overs, topics as bands
  const slices = topicSlices(session, st);
  const bands = slices.length > 1 ? slices.map((s) => [{ name: s.label, xAxis: s.from / 1000 }, { xAxis: s.to / 1000 }]) : [];
  const timeSeries = [{ name: 'hand-overs', type: 'line', silent: true, symbol: 'none', z: 1, lineStyle: { color: C.muted, width: 1, opacity: .45 },
    data: T.map((t) => [t.t / 1000, names[t.seat]]),
    markArea: { silent: true, itemStyle: { color: C.line, opacity: .35, borderColor: C.panel, borderWidth: 2 }, label: { color: C.muted, fontSize: 11, position: 'top', distance: 4 }, data: bands } }];
  used.forEach((t) => {
    const plain = t.k === 'S';
    timeSeries.push({ name: t.label, type: 'scatter', z: 3, symbolSize: (v, p) => (p.data.star ? 24 : plain ? 11 : 19),
      itemStyle: { color: C[t.k], borderColor: C.panel, borderWidth: 1.5 },
      label: { show: true, formatter: (p) => (p.data.star ? '★' : plain ? '' : t.k), color: '#fff', fontSize: 10, fontWeight: 700 },
      data: T.map((x, k) => (x.type === t.k ? { value: [x.t / 1000, names[x.seat]], k, star: !!x.star } : null)).filter(Boolean) });
  });
  mk('ch-time', {
    legend: Object.assign({ data: used.map((t) => t.label) }, K.legend),
    tooltip: Object.assign({ trigger: 'item', formatter: (p) => {
      if (!p.data || p.data.k == null) return '';
      const k = p.data.k, t = T[k];
      return '#' + (k + 1) + ' at ' + fmt(t.t) + '<br><b>' + esc(names[t.seat]) + '</b>: ' + esc(label(t.type)) + (t.star ? ' ★' : '') + (t.note ? '<br>' + esc(t.note) : '') + (k ? '<br>after ' + esc(names[T[k - 1].seat]) : '');
    } }, K.tip),
    grid: { left: 4, right: 20, top: 58, bottom: 8, containLabel: true },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
    xAxis: { type: 'value', min: 0, max: Math.max(10, Math.ceil(st.end / 1000)), axisLabel: { color: C.muted, formatter: (v) => fmt(v * 1000) }, axisLine: K.axis.axisLine, splitLine: K.axis.splitLine, axisTick: { show: false } },
    yAxis: { type: 'category', data: names, inverse: true, axisLabel: { color: C.ink }, axisLine: K.axis.axisLine, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: C.line, opacity: .5 } } },
    series: timeSeries
  }, C, Math.max(260, n * 30 + 80));

  // 4. Who responds to whom
  let maxM = 1; const heat = [];
  st.matrix.forEach((row, from) => row.forEach((v, to) => { if (v) maxM = Math.max(maxM, v); }));
  st.matrix.forEach((row, from) => row.forEach((v, to) => {
    if (v) heat.push({ value: [to, from, v], label: { color: ((v / maxM > 0.55) !== C.dark) ? '#ffffff' : '#0b0b0d' } });
  }));
  const stripe = [C.panel, C.dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.025)'];
  mk('ch-heat', {
    tooltip: Object.assign({ formatter: (p) => esc(names[p.value[1]]) + ' then ' + esc(names[p.value[0]]) + ': ' + plural(p.value[2], 'time') }, K.tip),
    grid: { left: 4, right: 12, top: 10, bottom: 56, containLabel: true },
    xAxis: { type: 'category', data: names, name: 'spoke next', nameLocation: 'middle', nameGap: n > 7 ? 52 : 30, nameTextStyle: { color: C.muted },
      axisLabel: { color: C.ink, rotate: n > 7 ? 40 : 0, interval: 0 }, axisLine: K.axis.axisLine, axisTick: { show: false }, splitArea: { show: true, areaStyle: { color: stripe } } },
    yAxis: { type: 'category', data: names, inverse: true, axisLabel: { color: C.ink }, axisLine: K.axis.axisLine, axisTick: { show: false }, splitArea: { show: true, areaStyle: { color: stripe } } },
    visualMap: { min: 1, max: maxM, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, inRange: { color: C.seq }, textStyle: { color: C.muted }, show: maxM > 1 },
    series: [{ type: 'heatmap', data: heat, label: { show: true, fontWeight: 600 }, itemStyle: { borderColor: C.panel, borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1 } } }]
  }, C, Math.max(300, n * 32 + 110));

  // 5. Pace
  const slice = st.end <= 20 * 60000 ? 60000 : st.end <= 45 * 60000 ? 120000 : 300000;
  const nb = Math.max(1, Math.ceil(st.end / slice)), cats = [];
  for (let b = 0; b < nb; b++) cats.push(fmt(b * slice));
  const paceSeries = used.map((t) => {
    const arr = cats.map(() => 0);
    T.forEach((x) => { if (x.type === t.k) arr[Math.min(nb - 1, Math.floor(x.t / slice))]++; });
    return { name: t.label, type: 'bar', stack: 'all', barMaxWidth: 28, emphasis: { focus: 'series' }, itemStyle: { color: C[t.k], borderColor: C.panel, borderWidth: 1 }, data: arr.map((v) => v || null) };
  });
  mk('ch-pace', {
    legend: K.legend, tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => {
      const i = ps[0].dataIndex, tot = ps.reduce((s, p) => s + (p.value || 0), 0);
      return '<b>' + fmt(i * slice) + ' to ' + fmt((i + 1) * slice) + '</b>: ' + plural(tot, 'contribution') + ps.filter((p) => p.value).map((p) => '<br>' + p.marker + esc(p.seriesName) + ': ' + p.value).join('');
    } }, K.tip),
    grid: { left: 4, right: 12, top: 60, bottom: 4, containLabel: true },
    xAxis: Object.assign({ type: 'category', data: cats }, K.axis, { splitLine: { show: false } }),
    yAxis: Object.assign({ type: 'value', minInterval: 1 }, K.axis),
    series: paceSeries
  }, C, 300);
}

/* Trends across the discussions of one group: who took what share each time, and how even it was. */
export function drawTrend(tr, typeList) {
  disposeCharts();
  if (!document.getElementById('ch-share') || tr.rows.length < 2) return;
  if (!window.echarts) return missing();
  const C = palette(typeList), K = kit(C);
  const cols = tr.rows.map((r, i) => (i + 1) + '. ' + new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  const people = tr.names.map((x) => x.name);
  const cells = [];
  tr.rows.forEach((r, x) => tr.names.forEach((p, y) => { if (r.share[p.key] !== undefined) cells.push({ value: [x, y, r.share[p.key]], label: { color: ((r.share[p.key] > 28) !== C.dark) ? '#ffffff' : '#0b0b0d' } }); }));
  mk('ch-share', {
    tooltip: Object.assign({ formatter: (p) => '<b>' + esc(people[p.value[1]]) + '</b><br>' + esc(tr.rows[p.value[0]].title || cols[p.value[0]]) + ': ' + p.value[2] + '% of student contributions' }, K.tip),
    grid: { left: 4, right: 12, top: 10, bottom: 50, containLabel: true },
    xAxis: { type: 'category', data: cols, axisLabel: { color: C.ink, interval: 0, rotate: cols.length > 6 ? 40 : 0 }, axisLine: K.axis.axisLine, axisTick: { show: false } },
    yAxis: { type: 'category', data: people, inverse: true, axisLabel: { color: C.ink }, axisLine: K.axis.axisLine, axisTick: { show: false } },
    visualMap: { min: 0, max: 50, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, inRange: { color: C.seq }, textStyle: { color: C.muted }, text: ['50%+', '0%'] },
    series: [{ type: 'heatmap', data: cells, label: { show: true, fontWeight: 600, formatter: (p) => p.value[2] + '%' }, itemStyle: { borderColor: C.panel, borderWidth: 2, borderRadius: 4 } }]
  }, C, Math.max(260, people.length * 32 + 90));

  const line = (name, key, color) => ({ name, type: 'line', symbolSize: 8, lineStyle: { width: 2, color }, itemStyle: { color }, connectNulls: true, data: tr.rows.map((r) => r[key]) });
  const series = [line('Balance', 'balance', C.accent), line('Voices heard', 'heard', C.B)];
  if (tr.rows.some((r) => r.s2s !== null)) series.push(line('Student to student', 's2s', C.C));
  mk('ch-balance', {
    legend: K.legend, tooltip: Object.assign({ trigger: 'axis', valueFormatter: (v) => (v == null ? 'n/a' : v + '%') }, K.tip),
    grid: { left: 4, right: 34, top: 44, bottom: 4, containLabel: true },
    xAxis: Object.assign({ type: 'category', data: cols, boundaryGap: false }, K.axis, { splitLine: { show: false } }),
    yAxis: Object.assign({ type: 'value', min: 0, max: 100, axisLabel: { color: C.muted, formatter: '{value}%' } }, { axisLine: K.axis.axisLine, splitLine: K.axis.splitLine, axisTick: { show: false } }),
    series
  }, C, 300);
}
