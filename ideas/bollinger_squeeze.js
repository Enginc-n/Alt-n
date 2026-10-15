// John Bollinger – "Bollinger on Bollinger Bands": bant genişliği 120 mumun en dar seviyesindeyken bant dışı kapanış.
IDEAS.push({name: 'bollinger_squeeze', desc: 'Bollinger sıkışması: bant genişliği son 120 mumun en darına yakınken fiyat bandın dışına kapanırsa o yönde işlem.', entry(d, i, A) {
  const bb = A.bb, L = bb.length - 1;
  if (L < 130 || !bb[L]) return null;
  const w = j => bb[j] ? (bb[j].up - bb[j].lo) / bb[j].mid : Infinity;
  let mn = Infinity; for (let j = L - 120; j < L; j++) mn = Math.min(mn, w(j));
  if (w(L - 1) > mn * 1.15) return null; // bir önceki mumda sıkışma vardı
  const c = d[i].close;
  if (c > bb[L].up) return {dir: 1, sl: 1.5, tp: 2, max: 24};
  if (c < bb[L].lo) return {dir: -1, sl: 1.5, tp: 2, max: 24};
  return null;
}});
