// Larry Connors & Cesar Alvarez – "Short Term Trading Strategies That Work": RSI(2) aşırı uçları, 200 SMA yönünde.
IDEAS.push({name: 'connors_rsi2', desc: 'Connors RSI(2): fiyat 200 SMA üstündeyken RSI(2) 10 altına inince al, altındayken 90 üstüne çıkınca sat.', entry(d, i, A) {
  if (i < 210) return null;
  const c = d.slice(i - 60, i + 1).map(k => k.close), r2 = rsi(c, 2), r = r2[r2.length - 1], s200 = A.s200[A.s200.length - 1];
  if (r == null || s200 == null) return null;
  if (d[i].close > s200 && r < 10) return {dir: 1, sl: 2, tp: 1, max: 10};
  if (d[i].close < s200 && r > 90) return {dir: -1, sl: 2, tp: 1, max: 10};
  return null;
}});
