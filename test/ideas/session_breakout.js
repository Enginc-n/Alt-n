IDEAS.push({name: 'session_breakout', desc: 'Asya seansı (00-07 UTC) aralığının Londra/New York saatlerinde ilk kapanışla kırılması yönünde, aralık dar ve üst zaman dilimi trendi ters değilse işleme girilir.', entry(d, i, A) {
  if (i < 50 || !A || !(A.atr > 0)) return null;
  var iv = d[i].time - d[i - 1].time;
  if (!(iv > 0) || iv > 3600) return null;
  var t = d[i].time, day = Math.floor(t / 86400) * 86400, h = (t - day) / 3600;
  // bar must CLOSE within 07:00-16:00 UTC
  var hc = h + iv / 3600;
  if (hc <= 7 || hc > 16) return null;
  var asEnd = day + 7 * 3600, hi = -Infinity, lo = Infinity, n = 0, j;
  for (j = i; j >= 0 && d[j].time >= day; j--) {
    if (d[j].time < asEnd) { if (d[j].high > hi) hi = d[j].high; if (d[j].low < lo) lo = d[j].low; n++; }
  }
  if (n < Math.floor(5 * 3600 / iv)) return null;
  var w = hi - lo;
  if (!(w > 0) || w > 4 * A.atr * Math.sqrt(3600 / iv) || w < 0.5 * A.atr) return null;
  // first breakout of the day: no earlier post-Asia close outside the range
  for (j = i - 1; j >= 0 && d[j].time >= asEnd; j--) if (d[j].close > hi || d[j].close < lo) return null;
  var c = d[i].close, dir = c > hi ? 1 : c < lo ? -1 : 0;
  if (!dir) return null;
  if (A.htfT === -dir) return null;
  if (Math.abs(c - (dir > 0 ? hi : lo)) > 1.0 * A.atr) return null; // avoid chasing
  var max = Math.max(2, Math.round((20 - hc) * 3600 / iv));
  return {dir: dir, sl: 1.5, tp: 1.5, max: max};
}});
