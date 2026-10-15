IDEAS.push({name: 'trend_pullback', desc: 'Üst zaman dilimi trendi ve EMA20/50 hizalıyken fiyat EMA20-50 değer bölgesine geri çekilip trend yönünde güçlü kapanışla dönünce trend yönünde işlem açar.', entry(d, i, A) {
  if (i < 210 || !A || !A.atr || !A.htfT) return null;
  const c = []; for (let k = Math.max(0, i - 300); k <= i; k++) c.push(d[k].close);
  const e20 = ema(c, 20), e50 = ema(c, 50), s200 = sma(c, 200), L = c.length - 1;
  const t = A.htfT, x = d[i], a = A.atr;
  if (!(e20[L] && e50[L] && s200[L])) return null;
  // trend alignment: HTF, EMA stack, price vs SMA200, EMA50 sloping
  if (t * (e20[L] - e50[L]) <= 0 || t * (x.close - s200[L]) <= 0 || t * (e50[L] - e50[L - 10]) <= 0) return null;
  // pullback: within last 5 bars price traded into the EMA20-EMA50 value zone (discount in uptrend / premium in downtrend)
  let touched = false;
  for (let k = 0; k < 5; k++) { const b = d[i - k], j = L - k; if (t > 0 ? b.low <= e20[j] : b.high >= e20[j]) touched = true; }
  if (!touched) return null;
  // not broken: close still on trend side of EMA50
  if (t * (x.close - e50[L]) <= 0) return null;
  // rejection/trigger: trend-direction candle closing beyond prior close and back past EMA20
  const p = d[i - 1], body = (x.close - x.open) * t;
  if (body < 0.1 * a || t * (x.close - e20[L]) <= 0) return null;
  if (t > 0 ? x.close <= p.close : x.close >= p.close) return null;
  if (a < 0.6 / 0.5) return null; // cost guard: risk must dwarf 0.30$ cost
  return {dir: t, sl: 1.5, tp: 2, max: 40};
}});
