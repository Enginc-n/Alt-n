// Parametre araştırması: sinyaller uygulamanın kendi analyze() fonksiyonuyla bir kez hesaplanır,
// sonra farklı stop/hedef/eşik/filtre kombinasyonları hızlıca simüle edilir.
// Seçim yalnızca ilk %60'ta (örneklem içi) yapılır; son %40 (örneklem dışı) sadece doğrulama içindir.
import {chromium} from 'playwright';
import {appendFileSync} from 'fs';

const N = {'5m': 5000, '15m': 5000, '1h': 4000, '4h': 2000, '1d': 1000};
const cache = {};
async function hist(tf) {
  if (cache[tf]) return cache[tf];
  let out = [], end = Date.now();
  while (out.length < (N[tf] || 1000)) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${tf}&limit=1000&endTime=${end}`);
    const k = await r.json(); if (!Array.isArray(k) || !k.length) break;
    out = k.concat(out); end = k[0][0] - 1;
  }
  return (cache[tf] = out.slice(-(N[tf] || 1000)));
}

const b = await chromium.launch({args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096']});
let md = '## Parametre araştırması (seçim: ilk %60, doğrulama: son %40, spread dahil)\n';
for (const [mode, tf] of [['normal', '15m'], ['normal', '1h'], ['scalp', '15m'], ['scalp', '1h']]) {
  const p = await b.newPage();
  p.on('pageerror', e => console.log('HATA', e.message));
  await p.route(/\/api\/v3\/klines/, async route => {
    const q = new URL(route.request().url()).searchParams.get('interval');
    route.fulfill({contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(await hist(q))}).catch(() => {}); // sayfa kapandıysa yok say
  });
  await p.routeWebSocket?.(/binance/, () => {});
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForFunction(() => document.getElementById('verdict').textContent !== '…', null, {timeout: 300000});
  const out = await p.evaluate(async ([m, t]) => {
    $('mode').value = m; $('tf').value = t; await run();
    const d = data, sig = [];
    for (let i = 250; i < d.length - 1; i++) {
      const A = analyze(d.slice(0, i + 1));
      sig[i] = {s: A.score, h: A.htfT, rg: A.i2.regime, sw: !!A.sm.sweep, atr: A.atr, hr: (new Date(A.barClose * 1000).getUTCHours() + 3) % 24};
    }
    const cost = 0.3, split = Math.floor(250 + (d.length - 251) * 0.6);
    function sim(P, from, to) {
      let n = 0, w = 0, R = 0, peak = 0, dd = 0;
      for (let i = from; i < to; i++) {
        const g = sig[i]; if (!g) continue;
        const dir = Math.sign(g.s);
        if (Math.abs(g.s) < P.th || !dir) continue;
        if (P.htf && g.h !== dir) continue;
        if (P.reg && g.rg === 'range' && !g.sw) continue;
        if (P.sess && (g.hr < 10 || g.hr >= 20)) continue;
        const e = d[i + 1].open, risk = P.sl * g.atr, stop = e - dir * risk, tp = e + dir * P.tp * risk;
        let r = null, j = i + 1;
        for (; j < d.length && j < i + 1 + P.max; j++) {
          const k = d[j];
          if (dir > 0 ? k.low <= stop : k.high >= stop) { r = ((dir > 0 ? Math.min(k.open, stop) : Math.max(k.open, stop)) - e) * dir / risk; break; }
          if (dir > 0 ? k.high >= tp : k.low <= tp) { r = P.tp; break; }
        }
        if (r == null) { if (j >= d.length) break; r = (d[j - 1].close - e) * dir / risk; } // süre doldu: kapanışta çık
        r -= cost / risk; n++; if (r > 0) w++; R += r; peak = Math.max(peak, R); dd = Math.max(dd, peak - R);
        i = j; // pozisyon kapanana kadar yeni işlem yok
      }
      return {n, win: n ? w / n * 100 : 0, R, exp: n ? R / n : 0, dd};
    }
    const grid = [];
    for (const th of [3, 4, 5, 6, 7]) for (const sl of [1, 1.5, 2, 3]) for (const tp of [0.5, 0.75, 1, 1.5, 2])
      for (const htf of [true, false]) for (const reg of [true, false]) for (const sess of [true, false]) for (const max of [12, 48])
        grid.push({th, sl, tp, htf, reg, sess, max});
    const res = grid.map(P => ({P, is: sim(P, 250, split), oos: sim(P, split, d.length - 1)}));
    const days = x => ((d[x].time - d[250].time) / 86400).toFixed(0);
    return {isDays: days(split), oosDays: ((d[d.length - 1].time - d[split].time) / 86400).toFixed(0), res,
      base: res.find(r => r.P.th === 4 && r.P.sl === 1.5 && r.P.tp === 1.5 && r.P.htf && r.P.reg && !r.P.sess && r.P.max === 48)};
  }, [mode, tf]);
  const f = x => `${x.n} işlem, %${x.win.toFixed(0)}, ${x.R >= 0 ? '+' : ''}${x.R.toFixed(1)}R (${x.exp.toFixed(2)}R/işlem)`;
  const ok = out.res.filter(r => r.is.n >= 25);
  const byExp = [...ok].sort((a, b) => b.is.exp - a.is.exp).slice(0, 5);
  const hi = ok.filter(r => r.is.win >= 65).sort((a, b) => b.is.exp - a.is.exp).slice(0, 5);
  const P = r => `eşik ${r.P.th}, stop ${r.P.sl}×ATR, hedef ${r.P.tp}R, üstTF ${r.P.htf ? '✓' : '–'}, rejim ${r.P.reg ? '✓' : '–'}, seans ${r.P.sess ? '✓' : '–'}, maks ${r.P.max} mum`;
  const posOos = ok.filter(r => r.is.exp > 0).length, bothPos = ok.filter(r => r.is.exp > 0 && r.oos.exp > 0).length;
  md += `\n### ${mode} ${tf} (seçim ${out.isDays} gün, doğrulama ${out.oosDays} gün)\n`;
  md += `Örneklem içinde kârlı ${posOos}/${ok.length} kombinasyonun ${bothPos} tanesi doğrulamada da kârlı.\n\n`;
  md += `| Grup | Ayar | Seçim dönemi | Doğrulama dönemi |\n|---|---|---|---|\n`;
  if (out.base) md += `| Mevcut ayar | ${P(out.base)} | ${f(out.base.is)} | ${f(out.base.oos)} |\n`;
  for (const r of byExp) md += `| En iyi beklenti | ${P(r)} | ${f(r.is)} | ${f(r.oos)} |\n`;
  for (const r of hi) md += `| Kazanma ≥%65 | ${P(r)} | ${f(r.is)} | ${f(r.oos)} |\n`;
  console.log(md.split('\n### ').pop());
  await p.close();
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
