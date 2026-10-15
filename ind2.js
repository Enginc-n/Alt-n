// ---------- Ek göstergeler (ind2) — lookahead yok: i. değer yalnızca 0..i barlarını kullanır ----------
function adx(d, n = 14) {
  const L = d.length, A = Array(L).fill(null), P = Array(L).fill(null), M = Array(L).fill(null);
  let tr = 0, pp = 0, mm = 0, dxs = 0, ax = null;
  for (let i = 1; i < L; i++) {
    const h = d[i].high, l = d[i].low, pc = d[i - 1].close, up = h - d[i - 1].high, dn = d[i - 1].low - l;
    const t = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)), p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { tr += t; pp += p; mm += m; } else { tr = tr - tr / n + t; pp = pp - pp / n + p; mm = mm - mm / n + m; }
    if (i < n) continue;
    const pdi = tr ? 100 * pp / tr : 0, mdi = tr ? 100 * mm / tr : 0, dx = pdi + mdi ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    P[i] = pdi; M[i] = mdi;
    if (i < 2 * n - 1) dxs += dx; else if (i === 2 * n - 1) ax = (dxs + dx) / n; else ax = (ax * (n - 1) + dx) / n;
    A[i] = ax;
  }
  return {adx: A, pdi: P, mdi: M};
}
// null-güvenli kayan ortalama
function _smaN(a, n) {
  const o = Array(a.length).fill(null); let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null) { s = 0; c = 0; continue; }
    s += a[i]; c++; if (c > n) { s -= a[i - n]; c = n; }
    if (c === n) o[i] = s / n;
  }
  return o;
}
function stochRsi(closes, n = 14, k = 3, dd = 3) {
  const r = rsi(closes, n), st = Array(r.length).fill(null);
  for (let i = 0; i < r.length; i++) {
    if (i < 2 * n - 1 || r[i - n + 1] == null) continue;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) { if (r[j] > hi) hi = r[j]; if (r[j] < lo) lo = r[j]; }
    st[i] = hi === lo ? 50 : 100 * (r[i] - lo) / (hi - lo);
  }
  const K = _smaN(st, k); return {k: K, d: _smaN(K, dd)};
}
function _mid(d, i, n) { if (i < n - 1) return null; let h = -Infinity, l = Infinity; for (let j = i - n + 1; j <= i; j++) { if (d[j].high > h) h = d[j].high; if (d[j].low < l) l = d[j].low; } return (h + l) / 2; }
function ichimoku(d, t = 9, kj = 26, sb = 52, sh = 26) {
  const L = d.length, T = [], K = [], B = [], SA = Array(L).fill(null), SB = Array(L).fill(null);
  for (let i = 0; i < L; i++) { T[i] = _mid(d, i, t); K[i] = _mid(d, i, kj); B[i] = _mid(d, i, sb); }
  for (let i = sh; i < L; i++) { const j = i - sh; if (T[j] != null && K[j] != null) SA[i] = (T[j] + K[j]) / 2; SB[i] = B[j]; } // i'de görünen bulut (i-26'dan)
  return {tenkan: T, kijun: K, spanA: SA, spanB: SB};
}
// Hacim yok → eşit ağırlıklı tipik fiyat ortalaması (VWAP proxy), UTC gününde sıfırlanır
function vwapProxy(d) {
  let day = null, s = 0, c = 0;
  return d.map(k => { const dy = Math.floor(k.time / 86400); if (dy !== day) { day = dy; s = 0; c = 0; } s += (k.high + k.low + k.close) / 3; c++; return s / c; });
}
function fibLevels(d, lookback = 100) {
  if (!d.length) return null;
  const st = Math.max(0, d.length - lookback); let hi = -Infinity, lo = Infinity, hiI = st, loI = st;
  for (let i = st; i < d.length; i++) { if (d[i].high > hi) { hi = d[i].high; hiI = i; } if (d[i].low < lo) { lo = d[i].low; loI = i; } }
  const dir = loI < hiI ? 1 : -1, rg = hi - lo;
  // up-swing: geri çekilme tepeden aşağı; down-swing: dipten yukarı
  return {hi, lo, dir, levels: [0.382, 0.5, 0.618, 0.786].map(r => ({r, price: dir === 1 ? hi - rg * r : lo + rg * r}))};
}
function ind2Signal(d) {
  const out = {score: 0, regime: 'range', adx: 0, reasons: [], fib: null, ichimoku: 'inside'};
  if (!d || d.length < 30) { out.reasons.push('⚪ Yetersiz veri (ind2)'); return out; }
  const L = d.length, i = L - 1, c = d[i].close, closes = d.map(k => k.close), R = out.reasons; let s = 0;
  const A = adx(d), ax = A.adx[i];
  out.adx = ax == null ? 0 : +ax.toFixed(1);
  if (ax != null && ax > 25) {
    out.regime = 'trend';
    if (A.pdi[i] > A.mdi[i]) { s += 1; R.push(`🟢 ADX ${out.adx}: güçlü trend, +DI > -DI`); } else { s -= 1; R.push(`🔴 ADX ${out.adx}: güçlü trend, -DI > +DI`); }
  } else if (ax != null && ax < 20) R.push(`⚪ ADX ${out.adx}: yatay piyasa (range)`);
  else { out.regime = ax != null && ax >= 20 && A.pdi[i] != null && Math.abs(A.pdi[i] - A.mdi[i]) > 10 ? 'trend' : 'range'; R.push(`⚪ ADX ${out.adx}: kararsız bölge`); }
  const I = ichimoku(d), sa = I.spanA[i], sb = I.spanB[i];
  if (sa != null && sb != null) {
    const top = Math.max(sa, sb), bot = Math.min(sa, sb);
    if (c > top) { out.ichimoku = 'above'; s += 1; R.push('🟢 Fiyat Ichimoku bulutunun üstünde'); }
    else if (c < bot) { out.ichimoku = 'below'; s -= 1; R.push('🔴 Fiyat Ichimoku bulutunun altında'); }
    else R.push('⚪ Fiyat Ichimoku bulutunun içinde');
  }
  const t1 = I.tenkan[i], k1 = I.kijun[i], t0 = I.tenkan[i - 1], k0 = I.kijun[i - 1];
  if (t1 != null && k1 != null && t0 != null && k0 != null) {
    if (t0 <= k0 && t1 > k1) { s += 0.5; R.push('🟢 Tenkan, Kijun\'u yukarı kesti'); }
    else if (t0 >= k0 && t1 < k1) { s -= 0.5; R.push('🔴 Tenkan, Kijun\'u aşağı kesti'); }
  }
  const S = stochRsi(closes), kk = S.k[i], dk = S.d[i], kp = S.k[i - 1], dp = S.d[i - 1];
  if (kk != null && dk != null && kp != null && dp != null) {
    if (kp <= dp && kk > dk && Math.min(kp, dp) < 20) { s += 0.5; R.push(`🟢 StochRSI aşırı satımdan yukarı kesişim (${kk.toFixed(0)})`); }
    else if (kp >= dp && kk < dk && Math.max(kp, dp) > 80) { s -= 0.5; R.push(`🔴 StochRSI aşırı alımdan aşağı kesişim (${kk.toFixed(0)})`); }
  }
  const f = out.fib = fibLevels(d), at = atr(d)[i];
  if (f && at > 0) {
    const gp = f.levels.filter(x => x.r === 0.5 || x.r === 0.618).find(x => Math.abs(c - x.price) <= 0.25 * at);
    if (gp) { s += 0.5 * f.dir; R.push(`${f.dir > 0 ? '🟢' : '🔴'} Fiyat Fib ${gp.r} seviyesinde (golden pocket, ${f.dir > 0 ? 'yükseliş' : 'düşüş'} salınımı)`); }
  }
  out.score = Math.max(-3, Math.min(3, s));
  return out;
}
