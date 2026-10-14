// Uygulamayı gerçek Binance verisiyle başsız tarayıcıda açar ve sonuçları raporlar.
import {chromium} from 'playwright';
import {appendFileSync} from 'fs';
const url = 'file://' + process.cwd() + '/index.html';
const b = await chromium.launch();
const rows = [];
let fail = false;
for (const mode of ['normal', 'scalp']) {
  for (const tf of mode === 'scalp' ? ['1m', '5m', '15m'] : ['15m', '1h', '4h', '1d']) {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => document.getElementById('verdict').textContent !== '…', null, {timeout: 60000});
    await p.selectOption('#mode', mode); await p.selectOption('#tf', tf);
    await p.waitForTimeout(8000);
    const g = id => p.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim());
    const r = {mode, tf, src: await g('src'), live: await g('live'), price: await g('price'), verdict: await g('verdict'), score: await g('score'), plan: await g('plan'), bt: await g('bt'), events: await g('events'), scen: await g('scen'), errs: errs.join('; ')};
    if (r.src.startsWith('⚠️') || errs.length) fail = true;
    rows.push(r); console.log(JSON.stringify(r, null, 1));
    await p.close();
  }
}
await b.close();
const md = ['| Mod | Zaman | Fiyat | Karar | Canlı | Geriye dönük test |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.mode} | ${r.tf} | ${r.price} | ${r.verdict} (${r.score}) | ${r.live} | ${r.bt} |`)].join('\n');
console.log('\n' + md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
process.exit(fail ? 1 : 0);
