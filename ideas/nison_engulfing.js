// Steve Nison – "Japanese Candlestick Charting Techniques": destek/dirençte yutan formasyon.
IDEAS.push({name: 'nison_engulfing', desc: 'Nison yutan formasyon: destek yakınında boğa yutanı al, direnç yakınında ayı yutanı sat.', entry(d, i, A) {
  if (i < 2) return null;
  const k = d[i], p = d[i - 1], at = A.atr;
  const bull = k.close > k.open && p.close < p.open && k.close >= p.open && k.open <= p.close;
  const bear = k.close < k.open && p.close > p.open && k.close <= p.open && k.open >= p.close;
  const nearS = A.sup.some(s => Math.abs(Math.min(k.low, p.low) - s) < 0.5 * at);
  const nearR = A.res.concat(A.sup).some(s => Math.abs(Math.max(k.high, p.high) - s) < 0.5 * at);
  if (bull && nearS) return {dir: 1, sl: 1.2, tp: 1.5, max: 12};
  if (bear && nearR) return {dir: -1, sl: 1.2, tp: 1.5, max: 12};
  return null;
}});
