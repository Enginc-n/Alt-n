// Smart Money Concepts (ICT) – swing, yapı (BOS/CHoCH), FVG, Order Block, likidite avı. Lookahead yok.
function swings(d, w = 3) {
  const out = [];
  for (let i = w; i < d.length - w; i++) {
    let h = true, l = true;
    for (let j = 1; j <= w && (h || l); j++) {
      if (d[i - j].high >= d[i].high || d[i + j].high > d[i].high) h = false;
      if (d[i - j].low <= d[i].low || d[i + j].low < d[i].low) l = false;
    }
    if (h) out.push({ i, price: d[i].high, type: 'H' });
    if (l) out.push({ i, price: d[i].low, type: 'L' });
  }
  return out;
}
// Yapı: kapanış swing seviyesini kırınca BOS (trend yönünde) / CHoCH (tersine). Swing yalnızca i+w barında onaylanır.
function structure(d, w = 3) {
  const res = { trend: 0, lastEvent: null, events: [] };
  if (!d || d.length < 20) return res;
  const sw = swings(d, w); let k = 0, hi = null, lo = null;
  for (let b = 0; b < d.length; b++) {
    while (k < sw.length && sw[k].i + w <= b) { const s = sw[k++]; if (s.type === 'H') hi = s; else lo = s; }
    const c = d[b].close;
    if (hi && c > hi.price) { const e = { type: res.trend === -1 ? 'CHoCH' : 'BOS', dir: 1, i: b, level: hi.price, src: hi.i }; res.trend = 1; res.lastEvent = e; res.events.push(e); hi = null; }
    else if (lo && c < lo.price) { const e = { type: res.trend === 1 ? 'CHoCH' : 'BOS', dir: -1, i: b, level: lo.price, src: lo.i }; res.trend = -1; res.lastEvent = e; res.events.push(e); lo = null; }
  }
  return res;
}
function fvgs(d, atrArr) {
  const L = d.length - 1; if (L < 19) return [];
  let open = [];
  for (let i = 2; i <= L; i++) {
    const c = d[i];
    open = open.filter(g => g.dir === 1 ? c.low > g.bottom : c.high < g.top); // içinden geçilince dolmuş say
    const a = atrArr[i] || 0, min = 0.1 * a;
    if (c.low - d[i - 2].high > min) open.push({ dir: 1, top: c.low, bottom: d[i - 2].high, i });
    else if (d[i - 2].low - c.high > min) open.push({ dir: -1, top: d[i - 2].low, bottom: c.high, i });
    if (open.length > 60) open.shift();
  }
  const p = d[L].close, dist = g => p > g.top ? p - g.top : p < g.bottom ? g.bottom - p : 0;
  return open.sort((x, y) => dist(x) - dist(y)).slice(0, 3);
}
// OB: itici hareketten (BOS ya da >1.5 ATR) önceki son ters mum; fiyat bloğun öbür ucunu kapanışla geçince geçersiz.
function orderBlocks(d, atrArr, st) {
  const L = d.length - 1; if (L < 19) return [];
  st = st || structure(d); let bull = null, bear = null, lastDn = -1, lastUp = -1, ei = 0;
  for (let b = 1; b <= L; b++) {
    const c = d[b], a = atrArr[b] || 0;
    if (bull && c.close < bull.bottom) bull = null;
    if (bear && c.close > bear.top) bear = null;
    let bos = 0; while (ei < st.events.length && st.events[ei].i <= b) { if (st.events[ei].i === b) bos = st.events[ei].dir; ei++; }
    if (lastDn >= 0 && b - lastDn <= 5 && (bos === 1 || (a && c.close - d[lastDn].low > 1.5 * a))) { const o = d[lastDn]; bull = { dir: 1, top: o.high, bottom: o.low, i: lastDn }; lastDn = -1; }
    if (lastUp >= 0 && b - lastUp <= 5 && (bos === -1 || (a && d[lastUp].high - c.close > 1.5 * a))) { const o = d[lastUp]; bear = { dir: -1, top: o.high, bottom: o.low, i: lastUp }; lastUp = -1; }
    if (c.close < c.open) lastDn = b; else if (c.close > c.open) lastUp = b;
  }
  return [bull, bear].filter(Boolean);
}
// Son bar: son onaylı swing'in ötesine fitil atıp içeride kapandı mı?
function liquiditySweep(d, w = 3) {
  const L = d.length - 1; if (L < 19) return null;
  const sw = swings(d.slice(0, L), w), c = d[L]; let hi = null, lo = null;
  for (let k = sw.length - 1; k >= 0 && (!hi || !lo); k--) { const s = sw[k]; if (L - s.i > 50) break; if (s.type === 'H' && !hi) hi = s; if (s.type === 'L' && !lo) lo = s; }
  if (lo && c.low < lo.price && c.close > lo.price) return { dir: 1, level: lo.price };
  if (hi && c.high > hi.price && c.close < hi.price) return { dir: -1, level: hi.price };
  return null;
}
function smcSignal(d, atrArr) {
  const neutral = { score: 0, reasons: [], zones: [], sweep: null, structure: { trend: 0, lastEvent: null } };
  if (!d || d.length < 20) return neutral;
  atrArr = atrArr || atr(d);
  const L = d.length - 1, p = d[L].close, a = atrArr[L] || 0, f = x => (+x).toFixed(2);
  const st = structure(d), sweep = liquiditySweep(d), reasons = []; let score = 0;
  const add = (v, t) => { score += v; reasons.push((v > 0 ? '🟢 ' : '🔴 ') + t); };
  if (st.trend) add(st.trend, st.trend > 0 ? 'SMC yapı yükselişte (HH/HL)' : 'SMC yapı düşüşte (LH/LL)');
  const ev = st.lastEvent;
  if (ev && ev.type === 'CHoCH' && L - ev.i <= 10) add(ev.dir, `${ev.dir > 0 ? 'Boğa' : 'Ayı'} CHoCH – ${f(ev.level)} kırıldı, karakter değişimi`);
  const zones = [...fvgs(d, atrArr).map(z => ({ ...z, label: 'FVG' })), ...orderBlocks(d, atrArr, st).map(z => ({ ...z, label: 'OB' }))];
  const tol = 0.25 * a, at = zones.find(z => p >= z.bottom - tol && p <= z.top + tol && (!st.trend || z.dir === st.trend));
  if (at) add(at.dir, `Fiyat ${at.dir > 0 ? 'boğa' : 'ayı'} ${at.label} bölgesinde (${f(at.bottom)}–${f(at.top)})`);
  if (sweep) add(1.5 * sweep.dir, sweep.dir > 0 ? `Likidite avı: ${f(sweep.level)} altı süpürüldü, geri kapandı` : `Likidite avı: ${f(sweep.level)} üstü süpürüldü, geri kapandı`);
  score = Math.max(-3, Math.min(3, score));
  return { score, reasons, zones: zones.map(({ dir, top, bottom, label }) => ({ dir, top, bottom, label })), sweep, structure: { trend: st.trend, lastEvent: ev } };
}
