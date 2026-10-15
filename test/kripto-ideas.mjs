// Kripto perpetual futures (BTC/ETH/SOL USDT, 15m/1H/4H) için üç mekanik giriş fikri.
// Sözleşme: entry(d, i, F) yalnızca d[0..i] ve F.*[0..i] okur (geleceğe bakmaz) ve
// {dir: 1|-1, sl (ATR katı), tp1, tp2 (risk katı)} ya da null döndürür.
// Ortak komisyon koruması: gidiş-dönüş %0,1 taker ücreti R'yi yemesin diye stop mesafesi en az
// fiyatın %0,6'sı olacak şekilde genişletilir (ücret ≤ ~0,17R). 4H'de neredeyse hiç devreye girmez.

const WARM = 130;          // tüm fikirler için ısınma (ATR yüzdeliği 120 mum geriye bakar)
const MIN_RISK = 0.006;    // stop mesafesinin fiyata oranı için alt sınır
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const feeSafe = (sl, price, atr) => Math.max(sl, MIN_RISK * price / atr);

// --- Çapalı VWAP önbelleği (d dizisinin kimliğine bağlı, eklenen mumlarla artımlı uzar) ---
const VW = new WeakMap();
function anchoredVwap(d) {
  let s = VW.get(d);
  if (!s) { s = {n: 0, bs: 0, sid: [], cpv: [], cv: [], cnt: [], vw: []}; VW.set(d, s); }
  if (s.n === d.length) return s;
  if (!s.bs && d.length > 1) { // mum süresi: ilk 50 aralığın en küçüğü (boşluklara dayanıklı)
    let m = Infinity;
    for (let j = 1; j < Math.min(d.length, 51); j++) { const g = d[j].t - d[j - 1].t; if (g > 0 && g < m) m = g; }
    s.bs = m === Infinity ? 0 : m;
  }
  // 1H'den kısa mumlarda UTC gün, diğerlerinde UTC hafta (Pazartesi 00:00) çapası
  const per = s.bs && s.bs < 3600 ? 86400 : 604800, off = per === 604800 ? 345600 : 0;
  for (let j = Math.max(0, s.n - 1); j < d.length; j++) { // son mumu yeniden hesapla (yerinde güncelleme)
    const k = d[j], id = Math.floor((k.t - off) / per), tp = (k.h + k.l + k.c) / 3, v = k.v > 0 ? k.v : 0;
    const same = j > 0 && s.sid[j - 1] === id;
    s.sid[j] = id;
    s.cpv[j] = (same ? s.cpv[j - 1] : 0) + tp * v;
    s.cv[j] = (same ? s.cv[j - 1] : 0) + v;
    s.cnt[j] = (same ? s.cnt[j - 1] : 0) + 1;
    s.vw[j] = s.cv[j] > 0 ? s.cpv[j] / s.cv[j] : tp;
  }
  s.n = d.length;
  return s;
}

export const IDEAS = [
  {
    // 1) Order-flow / hacim uzmanı: trend içinde VWAP'a geri çekilme + gizli alım/satım baskısı
    name: 'VWAP-Akis-Geri-Cekilme',
    desc: "Üst zaman dilimi trendi yönünde, fiyat gün/hafta başına çapalı VWAP'tan en az 1 ATR uzaklaşıp aynı seansta VWAP'a geri çekildikten sonra güçlü bir mumla VWAP'ı geri aldığında ve 20 mumluk işaretli hacim akışı geri çekilmeye rağmen hâlâ trend yönündeyken trend yönünde girer.",
    entry(d, i, F) {
      if (i < WARM) return null;
      const dir = F.hdir[i]; if (dir !== 1 && dir !== -1) return null;
      if (dir * F.flow[i] < 0.05) return null;                 // geri çekilmede net akış trendden yana
      const k = d[i], a = F.atr[i], rng = k.h - k.l;
      if (!(a > 0) || !(rng > 0)) return null;
      const pos = (k.c - k.l) / rng;                           // kapanışın mum içindeki yeri (0 dip, 1 tepe)
      const S = anchoredVwap(d);
      if (S.cnt[i] < 8) return null;                           // seans VWAP'ı oturmuş olsun
      const vw = S.vw[i];
      const touch = dir > 0 ? k.l <= vw + 0.2 * a && k.c > vw && k.c > k.o && pos >= 0.6
                            : k.h >= vw - 0.2 * a && k.c < vw && k.c < k.o && pos <= 0.4;
      if (!touch) return null;
      let ext = false;                                         // aynı seansta önce trend yönünde ≥1 ATR uzaklaşmış olmalı
      for (let j = i - 1; j >= i - 12 && S.sid[j] === S.sid[i]; j--) if (dir * (d[j].c - S.vw[j]) >= a) { ext = true; break; }
      if (!ext) return null;
      const lvl = dir > 0 ? Math.min(k.l, vw) : Math.max(k.h, vw); // stop VWAP/mum ucunun 0,3 ATR ötesinde
      const sl = Math.max(1, (dir * (k.c - lvl) + 0.3 * a) / a);
      return {dir, sl: feeSafe(sl, k.c, a), tp1: 1, tp2: 3};
    },
  },
  {
    // 2) Volatilite / kırılım uzmanı: iki ölçekli sıkışma (dar kutu + düşük ATR yüzdeliği) sonrası hacimli kırılım
    name: 'Sikisma-Kirilimi',
    desc: "Son 12 mumun aralığı 3,5 ATR'nin altına sıkışmış ve ATR/fiyat oranı son 120 mumun en düşük %40'ında iken, kutunun dışında mumun uç %30'unda kapanan ve hacmi 20 mumluk ortalamanın 1,5 katını aşan mumla, üst zaman dilimi trendine ters olmamak kaydıyla kırılım yönünde girer.",
    entry(d, i, F) {
      if (i < WARM) return null;
      if (!(F.rel[i] >= 1.5)) return null;
      const k = d[i], a = F.atr[i], a1 = F.atr[i - 1], rng = k.h - k.l;
      if (!(a > 0) || !(a1 > 0) || !(rng > 0)) return null;
      let H = -Infinity, L = Infinity;
      for (let j = i - 12; j < i; j++) { if (d[j].h > H) H = d[j].h; if (d[j].l < L) L = d[j].l; }
      if (H - L > 3.5 * a1) return null;                       // dar kutu
      const dir = k.c > H + 0.1 * a1 ? 1 : k.c < L - 0.1 * a1 ? -1 : 0;
      if (!dir) return null;
      const pos = (k.c - k.l) / rng;
      if (dir > 0 ? pos < 0.7 : pos > 0.3) return null;        // güçlü kapanış
      if (F.hdir[i] === -dir) return null;                     // üst zaman dilimine karşı kırılım alma
      const x = a1 / d[i - 1].c; let below = 0;                // ATR/fiyat yüzdeliği (önceki mumda, 120 mum)
      for (let j = i - 120; j < i; j++) if (F.atr[j] / d[j].c < x) below++;
      if (below > 48) return null;
      const mid = (H + L) / 2;                                 // stop kutunun ortasında
      const sl = clamp(dir * (k.c - mid) / a, 1.2, 3);
      return {dir, sl: feeSafe(sl, k.c, a), tp1: 1, tp2: 3};
    },
  },
  {
    // 3) Ortalamaya dönüş / likidasyon fitili uzmanı: hacim zirvesiyle likidite süpürüp geri dönen mum
    name: 'Likidasyon-Fitili-Donus',
    desc: "Hacmi 20 mumluk ortalamanın 2,5 katı, boyu 1,8 ATR'den uzun olan, son 20 mumun dibini (tepesini) süpürüp aralığının en az yarısı alt (üst) fitil kalacak şekilde mumun üst (alt) %40'ında kapanan likidasyon mumunda ters yöne girer ve stopu fitil ucunun 0,25 ATR ötesine koyar.",
    entry(d, i, F) {
      if (i < WARM) return null;
      if (!(F.rel[i] >= 2.5)) return null;                     // hacim zirvesi
      const k = d[i], a = F.atr[i], a1 = F.atr[i - 1], rng = k.h - k.l;
      if (!(a > 0) || !(a1 > 0) || !(rng >= 1.8 * a1)) return null;
      const lw = (Math.min(k.o, k.c) - k.l) / rng, uw = (k.h - Math.max(k.o, k.c)) / rng;
      const dir = lw >= 0.5 && (k.c - k.l) / rng >= 0.6 ? 1 : uw >= 0.5 && (k.h - k.c) / rng >= 0.6 ? -1 : 0;
      if (!dir) return null;
      for (let j = i - 20; j < i; j++) if (dir > 0 ? d[j].l <= k.l : d[j].h >= k.h) return null; // süpürme şartı
      const tip = dir > 0 ? k.l : k.h;
      const sl = Math.max(1, (dir * (k.c - tip) + 0.25 * a) / a);
      return {dir, sl: feeSafe(sl, k.c, a), tp1: 1, tp2: 2};
    },
  },
];
