// 7/24 Telegram bildirimi: GitHub Actions her 15 dakikada bir uygulamanın kendi tarayıcısını (5 strateji + AI skoru)
// gerçek veriyle çalıştırır; YENİ sinyalleri Telegram'a gönderir. Gönderilenler .tg-sent.json'da tutulur (tekrar yok).
import {chromium} from 'playwright';
import {readFileSync, writeFileSync, existsSync} from 'fs';

const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT;
if (!TOKEN || !CHAT) { console.log('TELEGRAM_TOKEN / TELEGRAM_CHAT tanımlı değil – atlanıyor.'); process.exit(0); }
const sent = existsSync('.tg-sent.json') ? JSON.parse(readFileSync('.tg-sent.json', 'utf8')) : [];

const b = await chromium.launch({args: ['--disable-dev-shm-usage']});
const p = await b.newPage();
await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForFunction(() => /Son tarama/.test(document.getElementById('scanStat').textContent), null, {timeout: 120000});
await p.waitForTimeout(3000);
const sigs = await p.evaluate(() => sigs.filter(x => x.res == null).map(x => ({...x, price: lastPrice})));
await b.close();

const now = Date.now() / 1000, fmt = v => v.toLocaleString('tr-TR', {maximumFractionDigits: 2});
for (const x of sigs) {
  if (sent.includes(x.id) || now - x.bar > 3 * 3600) continue; // eski veya gönderilmiş
  const dir = x.long ? '🟢 ALIM' : '🔴 SATIM';
  const txt = `${dir} SİNYALİ – Altın (PAXG/XAU) | ${x.ad} (${x.tf})\n` +
    `Giriş: $${fmt(x.entry)}  (şu an $${fmt(x.price)})\nStop: $${fmt(x.stop)}\nHedef 1: $${fmt(x.tp)}  (yarısını kapat, stopu girişe çek)\nHedef 2: $${fmt(x.tp + (x.tp - x.entry))}\n` +
    (x.ai != null ? `🤖 AI skoru (bilgi amaçlı): %${(x.ai * 100).toFixed(0)} (ortalama %${(x.aiBase * 100).toFixed(0)})\n` : '') +
    `Risk: kasanın %1'i – lotu uygulamadan hesaplayın.\nhttps://enginc-n.github.io/Alt-n/\n⚠️ Yatırım tavsiyesi değildir.`;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chat_id: CHAT, text: txt})});
  console.log(x.id, r.status);
  if (r.ok) sent.push(x.id);
}
writeFileSync('.tg-sent.json', JSON.stringify(sent.slice(-300)));
console.log(`${sigs.length} açık sinyal, gönderilen toplam ${sent.length}`);
