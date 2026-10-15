// Kripto Ajan (pine/kripto_ajan.pine) mantığının birebir JS kopyası ile gerçek perpetual futures (OKX) verisinde test.
// Maliyet: futures taker %0,05 giriş + %0,05 çıkış. Seçim ilk %60 (örneklem içi), doğrulama son %40 (örneklem dışı).
import {appendFileSync} from 'fs';

const SEC = {'15m': 900, '1H': 3600, '4H': 14400, '1D': 86400};
async function okx(inst, bar, n) {
  let out = [], after = '';
  while (out.length < n) {
    const r = await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${bar}&limit=100${after ? '&after=' + after : ''}`);
    const j = await r.json(); if (!j.data || !j.data.length) break;
    out = out.concat(j.data); after = j.data[j.data.length - 1][0];
    await new Promise(z => setTimeout(z, 120)); // hız sınırı
  }
  return out.slice(0, n).reverse().map(k => ({t: +k[0] / 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]}));
}
const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((x, i) => (e = i ? x * k + e * (1 - k) : x)); };
const rma = (a, n) => { let e = null; return a.map((x, i) => (e = i < n ? (i ? (e * i + x) / (i + 1) : x) : (e * (n - 1) + x) / n)); };
const sma = (a, n) => { let s = 0; return a.map((x, i) => { s += x; if (i >= n) s -= a[i - n]; return i >= n - 1 ? s / n : null; }); };
const sum = (a, n) => { let s = 0; return a.map((x, i) => { s += x; if (i >= n) s -= a[i - n]; return s; }); };

function features(d, h, P) {
  const c = d.map(k => k.c), tr = d.map((k, i) => i ? Math.max(k.h - k.l, Math.abs(k.h - d[i - 1].c), Math.abs(k.l - d[i - 1].c)) : k.h - k.l);
  const atr = rma(tr, 14), e34 = ema(c, P.emaLen), mom = ema(c.map((x, i) => (x - e34[i]) / Math.max(atr[i], 1e-9)), 5);
  const bf = d.map(k => k.h > k.l ? (k.c - k.o) / (k.h - k.l) : 0), sv = d.map((k, i) => k.v * bf[i]);
  const vs = sma(d.map(k => k.v), 20), fs = sum(sv, 20);
  const flow = d.map((k, i) => vs[i] > 0 ? fs[i] / (vs[i] * 20) : 0), rel = d.map((k, i) => vs[i] > 0 ? k.v / vs[i] : 0);
  const ad = c.map((x, i) => i ? Math.abs(x - c[i - 1]) : 0), noise = sum(ad, 20);
  const er = c.map((x, i) => i >= 20 && noise[i] > 0 ? Math.abs(x - c[i - 20]) / noise[i] : 0);
  // Üst zaman dilimi: içinde bulunulan ÜZD mumundan önceki iki KAPANMIŞ mumun EMA50'si (Pine: lookahead_off + [1],[2])
  const he = ema(h.map(k => k.c), 50), hs = SEC[P.htf], idx = new Map(h.map((k, i) => [k.t, i]));
  const hdir = d.map(k => { const cur = Math.floor(k.t / hs) * hs, i = idx.get(cur); if (i == null || i < 2) return 0; return he[i - 1] > he[i - 2] ? 1 : he[i - 1] < he[i - 2] ? -1 : 0; });
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const score = d.map((k, i) => cl(cl(mom[i] / 2, -1, 1) * 40 + cl(flow[i] * 2.5, -1, 1) * 30 + hdir[i] * 20 + Math.sign(mom[i]) * er[i] * 10, -100, 100));
  return {atr, flow, rel, er, hdir, score};
}
function sim(d, F, p, from, to) {
  const fee = 0.0005; let pos = 0, e, sl, t1, t2, risk, hit1, eb; const tr = [];
  for (let i = Math.max(60, from); i < to; i++) {
    const k = d[i], s = F.score[i], s0 = F.score[i - 1];
    const L = s0 <= p.thr && s > p.thr && F.er[i] >= p.er && (!p.vol || F.rel[i] >= 1.2) && F.hdir[i] === 1 && F.flow[i] > 0;
    const S = s0 >= -p.thr && s < -p.thr && F.er[i] >= p.er && (!p.vol || F.rel[i] >= 1.2) && F.hdir[i] === -1 && F.flow[i] < 0;
    if (pos && i > eb) {
      let r = null;
      const hSL = pos > 0 ? k.l <= sl : k.h >= sl, h1 = pos > 0 ? k.h >= t1 : k.l <= t1, h2 = pos > 0 ? k.h >= t2 : k.l <= t2;
      if (!hit1) { if (hSL) r = -1; else if (h1) { hit1 = true; sl = e; if (h2) r = 0.5 * p.tp1 + 0.5 * p.tp2; } }
      else { if (hSL) r = 0.5 * p.tp1; else if (h2) r = 0.5 * p.tp1 + 0.5 * p.tp2; }
      if (r == null && ((pos > 0 && S) || (pos < 0 && L))) { const rem = pos * (k.c - e) / risk; r = hit1 ? 0.5 * p.tp1 + 0.5 * rem : rem; }
      if (r != null) { tr.push({i, R: r - 2 * fee * e / risk}); pos = 0; }
      continue;
    }
    if (!pos && (L || S)) { pos = L ? 1 : -1; e = k.c; risk = p.sl * F.atr[i]; sl = e - pos * risk; t1 = e + pos * p.tp1 * risk; t2 = e + pos * p.tp2 * risk; hit1 = false; eb = i; }
  }
  const n = tr.length, w = tr.filter(t => t.R > 0).length, R = tr.reduce((a, t) => a + t.R, 0);
  let pk = 0, eq = 0, dd = 0; for (const t of tr) { eq += t.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return {n, win: n ? w / n * 100 : 0, R, exp: n ? R / n : 0, dd};
}

const DEF = {thr: 55, er: 0.3, vol: true, sl: 1.5, tp1: 1, tp2: 2.5};
const f = x => `${x.n} / %${x.win.toFixed(0)} / ${x.R >= 0 ? '+' : ''}${x.R.toFixed(1)}R (${x.exp.toFixed(2)})`;
let md = '## Kripto Ajan – perpetual futures testi (OKX, %0,05+%0,05 komisyon dahil)\n';
const pooled = {};
for (const inst of ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP']) for (const [bar, htf, n] of [['15m', '4H', 8000], ['1H', '4H', 6000], ['4H', '1D', 3000]]) {
  const d = await okx(inst, bar, n), h = await okx(inst, htf, Math.ceil(n * SEC[bar] / SEC[htf]) + 120);
  if (d.length < 1000) { md += `\n${inst} ${bar}: veri yetersiz (${d.length})\n`; continue; }
  const F = features(d, h, {emaLen: 34, htf}), split = Math.floor(d.length * 0.6), days = ((d[d.length - 1].t - d[0].t) / 86400).toFixed(0);
  const grid = [];
  for (const thr of [40, 55, 70]) for (const er of [0.2, 0.3, 0.4]) for (const vol of [true, false]) for (const sl of [1.5, 2, 2.5]) for (const tp1 of [1, 1.5]) for (const tp2 of [2, 2.5, 3])
    grid.push({thr, er, vol, sl, tp1, tp2});
  const res = grid.map(p => ({p, is: sim(d, F, p, 0, split), oos: sim(d, F, p, split, d.length)}));
  const key = `${bar}`; (pooled[key] ??= res.map(r => ({p: r.p, is: 0, oos: 0, nis: 0, noos: 0})));
  res.forEach((r, k) => { pooled[key][k].is += r.is.R; pooled[key][k].oos += r.oos.R; pooled[key][k].nis += r.is.n; pooled[key][k].noos += r.oos.n; });
  const def = res.find(r => JSON.stringify(r.p) === JSON.stringify(DEF));
  const best = [...res].filter(r => r.is.n >= 25).sort((a, b) => b.is.exp - a.is.exp)[0];
  const posBoth = res.filter(r => r.is.n >= 25 && r.is.exp > 0 && r.oos.exp > 0).length;
  md += `\n### ${inst} ${bar} (${days} gün)\nVarsayılan: seçim ${f(def.is)} · doğrulama ${f(def.oos)}\n`;
  if (best) md += `En iyi (seçim dönemine göre) ${JSON.stringify(best.p)}: seçim ${f(best.is)} · doğrulama ${f(best.oos)}\n`;
  md += `Her iki dönemde kârlı kombinasyon: ${posBoth}/${grid.length}\n`;
  console.log(inst, bar, 'tamam');
}
md += '\n## Tüm coinler birlikte (aynı ayar her coinde) – seçim dönemine göre en iyi 5 ayar\n';
for (const [bar, arr] of Object.entries(pooled)) {
  const top = arr.filter(x => x.nis >= 60).sort((a, b) => b.is / b.nis - a.is / a.nis).slice(0, 5);
  md += `\n### ${bar}\n| Ayar | Seçim (işlem / toplam R) | Doğrulama (işlem / toplam R) |\n|---|---|---|\n`;
  for (const x of top) md += `| ${JSON.stringify(x.p)} | ${x.nis} / ${x.is.toFixed(1)}R | ${x.noos} / ${x.oos.toFixed(1)}R |\n`;
  const dd = arr.find(x => JSON.stringify(x.p) === JSON.stringify(DEF));
  md += `| varsayılan | ${dd.nis} / ${dd.is.toFixed(1)}R | ${dd.noos} / ${dd.oos.toFixed(1)}R |\n`;
}
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
