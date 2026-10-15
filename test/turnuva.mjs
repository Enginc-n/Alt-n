// Fikir turnuvası: test/ideas/*.js içindeki her strateji, gerçek PAXG geçmişinde aynı kurallarla
// (sonraki mum açılışında giriş, ATR stop, R hedef, süre sınırı, 0,30$ maliyet) yarıştırılır.
// Fikirler veriye bakmadan yazıldığı için tüm dönem örneklem dışıdır; ayrıca ilk/son yarı ayrı raporlanır.
import {chromium} from 'playwright';
import {appendFileSync, readdirSync, readFileSync} from 'fs';

const N = {'5m': 6000, '15m': 6000, '1h': 4000, '4h': 2000, '1d': 1000};
const cache = {};
async function hist(tf, sym = 'PAXGUSDT') {
  const key = sym + tf; if (cache[key]) return cache[key];
  let out = [], end = Date.now();
  while (out.length < (N[tf] || 1000)) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000&endTime=${end}`);
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    out = k.concat(out); end = k[0][0] - 1;
  }
  return (cache[key] = out.slice(-(N[tf] || 1000)));
}
const ideaSrc = readdirSync('ideas').filter(f => f.endsWith('.js')).map(f => readFileSync('ideas/' + f, 'utf8')).join('\n');

process.on('unhandledRejection', e => console.log('YAKALANMAMIŞ', e?.message));
const b = await chromium.launch({args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096']});
const rows = [], aiRes = [];
for (const tf of ['5m', '15m', '1h']) for (const mode of ['normal', 'dengeli']) {
  if (mode === 'dengeli' && tf !== '1h') continue;
  const p = await b.newPage();
  p.on('pageerror', e => console.log('HATA', e.message)); p.on('crash', () => console.log('SAYFA ÇÖKTÜ'));
  await p.route(/\/api\/v3\/klines/, async route => {
    const q = new URL(route.request().url()).searchParams.get('interval');
    route.fulfill({contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(await hist(q))}).catch(() => {}); // sayfa kapandıysa yok say
  });
  await p.routeWebSocket?.(/binance/, () => {});
  await p.goto('file://' + process.cwd() + '/index.html?noscan', {waitUntil: 'domcontentloaded', timeout: 120000});
  await p.waitForFunction(() => document.getElementById('verdict').textContent !== '…', null, {timeout: 300000});
  if (mode === 'normal') await p.addScriptTag({content: 'window.IDEAS = [];\n' + ideaSrc});
  const eurK = (await hist(tf, 'EURUSDT')).map(k => ({time: k[0] / 1000, close: +k[4]}));
  const res = await p.evaluate(async ([m, t, eur]) => {
    $('mode').value = m; $('tf').value = t; await run();
    const d = data, cost = 0.3, mid = Math.floor((250 + d.length) / 2);
    const ideas = m === 'normal' ? IDEAS : [{name: 'mevcut_dengeli', entry: (d, i, A) => entryCheck(A).ok ? {dir: A.long ? 1 : -1, sl: 3, tp: 1.5, max: 48} : null}];
    const st = ideas.map(() => ({open: null, tr: []}));
    for (let i = 250; i < d.length - 1; i++) {
      let A = null;
      ideas.forEach((idea, n) => {
        const s = st[n];
        if (s.open && i <= s.open.until) return;
        try {
          A = A || analyze(d.slice(0, i + 1));
          const sig = idea.entry(d, i, A); if (!sig || !sig.dir) return;
          const e = d[i + 1].open, risk = sig.sl * A.atr, stop = e - sig.dir * risk, tp = e + sig.dir * sig.tp * risk;
          let r = null, j = i + 1;
          for (; j < d.length && j < i + 1 + (sig.max || 48); j++) {
            const k = d[j];
            if (sig.dir > 0 ? k.low <= stop : k.high >= stop) { r = ((sig.dir > 0 ? Math.min(k.open, stop) : Math.max(k.open, stop)) - e) * sig.dir / risk; break; }
            if (sig.dir > 0 ? k.high >= tp : k.low <= tp) { r = sig.tp; break; }
          }
          if (r == null) { if (j >= d.length) return; r = (d[j - 1].close - e) * sig.dir / risk; }
          // Kısmi plan: TP1'de yarısı kapanır + stop girişe; kalanı TP2 (2×TP1 mesafesi), başabaş veya süre sonu
          let rp = null, h1 = false, jj = i + 1; const tp2 = e + sig.dir * 2 * sig.tp * risk;
          for (; jj < d.length && jj < i + 1 + (sig.max || 48); jj++) {
            const k = d[jj];
            if (!h1) {
              if (sig.dir > 0 ? k.low <= stop : k.high >= stop) { rp = ((sig.dir > 0 ? Math.min(k.open, stop) : Math.max(k.open, stop)) - e) * sig.dir / risk; break; }
              if (sig.dir > 0 ? k.high >= tp : k.low <= tp) { h1 = true; if (sig.dir > 0 ? k.high >= tp2 : k.low <= tp2) { rp = 1.5 * sig.tp; break; } }
            } else {
              if (sig.dir > 0 ? k.low <= e : k.high >= e) { rp = 0.5 * sig.tp; break; }
              if (sig.dir > 0 ? k.high >= tp2 : k.low <= tp2) { rp = 1.5 * sig.tp; break; }
            }
          }
          if (rp == null) { const cl = (d[Math.min(jj, d.length) - 1].close - e) * sig.dir / risk; rp = h1 ? 0.5 * sig.tp + 0.5 * cl : cl; }
          s.tr.push({i, R: r - cost / risk, Rp: rp - cost / risk, dir: sig.dir}); s.open = {until: Math.max(j, jj)};
        } catch (err) { s.err = String(err); }
      });
    }
    const sum = tr => { const n = tr.length, w = tr.filter(t => t.R > 0).length, R = tr.reduce((a, t) => a + t.R, 0); let pk = 0, eq = 0, dd = 0; for (const t of tr) { eq += t.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return {n, win: n ? w / n * 100 : 0, R, exp: n ? R / n : 0, dd}; };
    // Yapay zeka filtresi: ilk %60 ile eğit, yalnızca son %40'taki işlemlerde dene
    const split = Math.floor(250 + (d.length - 251) * 0.6), P = AI.prep(d, eur), M = AI.fit(P, d, 250, split);
    let ai = null;
    if (M) {
      let n = 0, hit = 0, bw = 0, bl = 0, nw = 0, nl = 0;
      for (let i = split; i < d.length - 26; i += 3) for (const dir of [1, -1]) {
        const pr = AI.prob(M, AI.feat(P, d, i, dir)), y = AI.label(d, i, dir, P.a[i]);
        n++; if ((pr >= 0.5) === (y === 1)) hit++; if (y) { bw += pr; nw++; } else { bl += pr; nl++; }
      }
      ai = {base: M.base, acc: hit / n, pw: bw / (nw || 1), pl: bl / (nl || 1), ideas: ideas.map((idea, k) => {
        const oos = st[k].tr.filter(t => t.i >= split).map(t => ({...t, p: AI.prob(M, AI.feat(P, d, t.i, t.dir))}));
        return {name: idea.name, rows: [0, M.base, M.base + 0.05, M.base + 0.1].map(th => ({th, ...sum(oos.filter(t => t.p >= th))}))};
      })};
    }
    return {ai, days: ((d[d.length - 1].time - d[250].time) / 86400).toFixed(0), out: ideas.map((idea, n) => ({name: idea.name, desc: idea.desc || '', err: st[n].err,
      allP: sum(st[n].tr.map(t => ({...t, R: t.Rp}))), all: sum(st[n].tr), h1: sum(st[n].tr.filter(t => t.i < mid)), h2: sum(st[n].tr.filter(t => t.i >= mid))}))};
  }, [mode, tf, eurK]);
  if (res.ai) aiRes.push({tf, mode, ...res.ai});
  for (const o of res.out) rows.push({tf, days: res.days, ...o});
  await p.close();
}
await b.close();
const f = x => `${x.n} / %${x.win.toFixed(0)} / ${x.R >= 0 ? '+' : ''}${x.R.toFixed(1)}R`;
rows.sort((a, b) => (b.all.n >= 20) - (a.all.n >= 20) || b.all.exp - a.all.exp);
let md = '## Fikir turnuvası (gerçek PAXG, 0,30$ maliyet dahil)\n\n| Sıra | Fikir | Zaman | Gün | İşlem / Kazanma / Toplam | R/işlem | Maks. düşüş | 1. yarı | 2. yarı | Kısmi plan (TP1 yarı+başabaş, TP2) |\n|---|---|---|---|---|---|---|---|---|---|\n';
rows.forEach((r, k) => { md += `| ${k + 1} | ${r.name}${r.err ? ' ⚠️' + r.err.slice(0, 60) : ''} | ${r.tf} | ${r.days} | ${f(r.all)} | ${r.all.exp.toFixed(3)} | ${r.all.dd.toFixed(1)}R | ${f(r.h1)} | ${f(r.h2)} | ${f(r.allP)} (${r.allP.exp.toFixed(3)}/işlem) |\n`; });
md += '\n' + [...new Set(rows.map(r => `- **${r.name}**: ${r.desc}`))].join('\n') + '\n';
md += '\n## Yapay zeka filtresi (eğitim: ilk %60, test: son %40)\n';
for (const a of aiRes) {
  md += `\n### ${a.tf} ${a.mode}: test isabeti %${(a.acc * 100).toFixed(1)} (temel oran %${(a.base * 100).toFixed(1)}), kazananlara ort. skor %${(a.pw * 100).toFixed(1)}, kaybedenlere %${(a.pl * 100).toFixed(1)}\n\n| Strateji | Filtresiz | Skor ≥ temel oran | ≥ temel +5 puan | ≥ temel +10 puan |\n|---|---|---|---|---|\n`;
  for (const it of a.ideas) md += `| ${it.name} | ` + it.rows.map(r => `${r.n} / %${r.win.toFixed(0)} / ${r.R >= 0 ? '+' : ''}${r.R.toFixed(1)}R`).join(' | ') + ' |\n';
}
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
