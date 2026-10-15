// Curtis Faith – "Way of the Turtle": 20 mumluk Donchian kanal kırılımı, üst zaman dilimi yönünde.
IDEAS.push({name: 'donchian_turtle', desc: 'Kaplumbağa sistemi: fiyat son 20 mumun en yükseğini (en düşüğünü) kapanışla kırarsa, üst trend aynı yöndeyse kırılım yönünde işlem.', entry(d, i, A) {
  if (i < 25) return null;
  let hi = -Infinity, lo = Infinity;
  for (let j = i - 20; j < i; j++) { hi = Math.max(hi, d[j].high); lo = Math.min(lo, d[j].low); }
  const k = d[i], p = d[i - 1];
  if (k.close > hi && p.close <= hi && A.htfT >= 0) return {dir: 1, sl: 2, tp: 2, max: 40};
  if (k.close < lo && p.close >= lo && A.htfT <= 0) return {dir: -1, sl: 2, tp: 2, max: 40};
  return null;
}});
