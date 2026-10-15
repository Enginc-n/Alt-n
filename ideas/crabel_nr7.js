// Toby Crabel – "Day Trading with Short Term Price Patterns": NR7 (son 7 mumun en dar aralığı) sonrası kırılım.
IDEAS.push({name: 'crabel_nr7', desc: 'Crabel NR7: son 7 mumun en dar mumundan sonra gelen mum onun tepesini/dibini kapanışla kırarsa kırılım yönünde işlem.', entry(d, i, A) {
  if (i < 10) return null;
  const n = d[i - 1], rn = n.high - n.low;
  for (let j = i - 7; j < i - 1; j++) if (d[j].high - d[j].low <= rn) return null;
  const k = d[i];
  if (k.close > n.high) return {dir: 1, sl: 1, tp: 1.5, max: 12};
  if (k.close < n.low) return {dir: -1, sl: 1, tp: 1.5, max: 12};
  return null;
}});
