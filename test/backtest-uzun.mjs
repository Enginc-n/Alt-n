// Uzun dönem geriye dönük test: gerçek Binance geçmişini (binlerce mum) uygulamanın kendi
// analyze/backtest koduna verir. Sonuçları dönem yarılarına ve Türkiye saatine göre de ayırır.
import {chromium} from 'playwright';
import {appendFileSync} from 'fs';

const N = {'1m': 5000, '5m': 5000, '15m': 4000, '1h': 3000, '4h': 1500, '1d': 500};
const cache = {};
async function hist(tf) {
  if (cache[tf]) return cache[tf];
  if (process.env.SAHTE) { // yerel deneme: rastgele yürüyüş
    const sec = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400}[tf]; let px = 4000, t = Math.floor(Date.now() / 1000 / sec) * sec - N[tf] * sec;
    return (cache[tf] = Array.from({length: N[tf]}, () => { const o = px; px *= 1 + (Math.random() - 0.5) * 0.004; t += sec; return [t * 1000, '' + o, '' + Math.max(o, px) * 1.001, '' + Math.min(o, px) * 0.999, '' + px]; }));
  }
  let out = [], end = Date.now();
  while (out.length < N[tf]) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${tf}&limit=1000&endTime=${end}`);
    const k = await r.json();
    if (!Array.isArray(k) || !k.length) break;
    out = k.concat(out); end = k[0][0] - 1;
  }
  return (cache[tf] = out.slice(-N[tf]));
}

const CONFIGS = [['scalp', '1m'], ['scalp', '5m'], ['scalp', '15m'], ['normal', '5m'], ['normal', '15m'], ['normal', '1h'], ['scalp', '1h'], ['isabet', '1h'], ['dengeli', '1h'], ['seans', '1h'], ['donus', '15m'], ['kaplumbaga', '1h'], ['elder', '15m']];
const b = await chromium.launch({args: ['--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096']});
const rows = [], hours = {};
for (const [mode, tf] of CONFIGS) {
  const p = await b.newPage();
  p.on('pageerror', e => console.log('HATA', e.message));
  await p.route(/\/api\/v3\/klines/, async route => {
    const tfq = new URL(route.request().url()).searchParams.get('interval');
    route.fulfill({contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(await hist(tfq))}).catch(() => {}); // sayfa kapandıysa yok say
  });
  await p.routeWebSocket?.(/binance/, ws => {}); // canlı akışı kapat: test sabit veriyle yapılır
  await p.goto('file://' + process.cwd() + '/index.html');
  // ilk açılıştaki analizin bitmesini bekle, sonra ayarı olay tetiklemeden değiştirip tek bir run() çalıştır
  await p.waitForFunction(() => document.getElementById('verdict').textContent !== '…', null, {timeout: 300000});
  await p.evaluate(async ([m, t]) => { $('mode').value = m; $('tf').value = t; await run(); }, [mode, tf]);
  const res = await p.evaluate(() => {
    const s = B => ({n: B.n, win: +B.win.toFixed(0), total: +B.total.toFixed(1), pf: isFinite(B.pf) ? +B.pf.toFixed(2) : null, dd: +B.dd.toFixed(1)});
    const all = backtest(data), mid = Math.floor(data.length / 2);
    const h1 = backtest(data.slice(0, mid)), h2 = backtest(data.slice(mid - 250));
    return {all: s(all), h1: s(h1), h2: s(h2), from: data[0].time, to: data[data.length - 1].time,
      trades: all.trades.map(t => ({t: t.time, R: t.R, long: t.long}))};
  });
  const days = ((res.to - res.from) / 86400).toFixed(1);
  const longs = res.trades.filter(t => t.long), shorts = res.trades.filter(t => !t.long), sum = a => a.reduce((x, t) => x + t.R, 0).toFixed(1);
  rows.push(`| ${mode} | ${tf} | ${days} gün | ${res.all.n} | %${res.all.win} | **${res.all.total}R** | ${res.all.pf ?? '∞'} | ${res.all.dd}R | ${res.h1.total}R / ${res.h2.total}R | ${sum(longs)}R / ${sum(shorts)}R |`);
  for (const t of res.trades) {
    const h = (new Date(t.t * 1000).getUTCHours() + 3) % 24, k = `${mode}-${tf}`;
    (hours[k] ??= {})[h] ??= {n: 0, R: 0}; hours[k][h].n++; hours[k][h].R += t.R;
  }
  console.log(mode, tf, JSON.stringify(res.all), 'yarılar', res.h1.total, res.h2.total);
  await p.close();
}
await b.close();
let md = '## Uzun dönem geriye dönük test (spread 0,30$ dahil)\n\n| Mod | Zaman | Dönem | İşlem | Kazanma | Toplam | Kâr faktörü | Maks. düşüş | 1. yarı / 2. yarı | Long / Short |\n|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n');
md += '\n\n### Saate göre (TSİ) toplam R\n\n| Ayar | ' + [...Array(24).keys()].map(h => String(h).padStart(2, '0')).join(' | ') + ' |\n|---|' + '---|'.repeat(24) + '\n';
for (const [k, hs] of Object.entries(hours)) md += `| ${k} | ` + [...Array(24).keys()].map(h => hs[h] ? `${hs[h].R.toFixed(1)} (${hs[h].n})` : '').join(' | ') + ' |\n';
console.log('\n' + md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
