// Alexander Elder – "Trading for a Living" üçlü ekran: üst trend yönünde, osilatör geri çekilmesinden dönüş.
IDEAS.push({name: 'elder_triple', desc: 'Elder üçlü ekran: üst zaman dilimi yukarıyken RSI 40 altına çekilip yukarı dönünce al (aşağıyken 60 üstünden dönünce sat).', entry(d, i, A) {
  const r = A.r, L = r.length - 1;
  if (r[L] == null || r[L - 1] == null) return null;
  if (A.htfT > 0 && r[L - 1] < 40 && r[L] > r[L - 1] && d[i].close > d[i].open) return {dir: 1, sl: 1.5, tp: 1.5, max: 24};
  if (A.htfT < 0 && r[L - 1] > 60 && r[L] < r[L - 1] && d[i].close < d[i].open) return {dir: -1, sl: 1.5, tp: 1.5, max: 24};
  return null;
}});
