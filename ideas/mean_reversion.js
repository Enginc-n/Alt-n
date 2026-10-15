IDEAS.push({name: 'mean_reversion', desc: 'Yatay rejimde fiyat Bollinger bandının dışına taşıp RSI aşırı bölgedeyken bant içine geri kapanırsa ters yöne işlem açılır.', entry(d, i, A) {
  const L = i, bb = A.bb, r = A.r;
  if (!bb || !bb[L] || !bb[L - 1] || !r || r[L - 1] == null || !A.atr) return null;
  const adx = A.i2 && A.i2.adx;
  if (adx != null && adx > 25) return null; // only non-trending conditions
  const c = d[L], p = d[L - 1];
  const w = (bb[L].up - bb[L].lo) / bb[L].mid;
  if (!(w > 0) || (bb[L].up - bb[L].lo) < 1.0 * A.atr) return null; // band wide enough to pay costs
  // long: previous bar pierced below lower band with oversold RSI, current bar closes back inside and bullish
  if ((p.low < bb[L - 1].lo) && r[L - 1] < 40 && c.close > bb[L].lo && c.close > c.open && A.htfT !== -1)
    return {dir: 1, sl: 1.2, tp: 1.2, max: 12};
  if ((p.high > bb[L - 1].up) && r[L - 1] > 60 && c.close < bb[L].up && c.close < c.open && A.htfT !== 1)
    return {dir: -1, sl: 1.2, tp: 1.2, max: 12};
  return null;
}});
