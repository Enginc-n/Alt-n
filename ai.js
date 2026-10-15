// Yapay zeka güven skoru (tarayıcıda çalışır, sunucu gerekmez).
// Yöntem: üçlü bariyer etiketleme + lojistik regresyon.
//  - Etiket: sinyal yönünde fiyat, sonraki H mum içinde ÖNCE +1,5 ATR'ye mi (1) yoksa −1,5 ATR'ye mi (0) gidiyor? Süre dolarsa 0.
//    Kâr ve zarar bariyeri eşit olduğu için rastgele tahmin ≈ %50; skor %50'nin ne kadar üstündeyse kurulum o kadar iyi.
//  - Özellikler: trend (EMA20/50/200), RSI, Bollinger konumu ve genişliği, ADX, volatilite, Heikin Ashi gövde oranı ve seri uzunluğu,
//    kısa/orta momentum, günün saati (seans), EUR/USD değişimi (dolar endeksi vekili; DXY'nin %57'si euro).
//  - Tüm göstergeler yalnızca geçmiş mumlardan hesaplanır (geleceği görme hatası yok).
const AI = (() => {
  function prep(d, eur) {
    const c = d.map(k => k.close);
    const P = {c, e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), r: rsi(c, 14), a: atr(d, 14), bb: bollinger(c, 20, 2), ax: adx(d, 14).adx, ha: [], st: [], eur: null};
    for (let i = 0; i < d.length; i++) { // Heikin Ashi
      const k = d[i], hc = (k.open + k.high + k.low + k.close) / 4, ho = i ? (P.ha[i - 1].o + P.ha[i - 1].c) / 2 : (k.open + k.close) / 2;
      P.ha.push({o: ho, c: hc, h: Math.max(k.high, ho, hc), l: Math.min(k.low, ho, hc)});
      const up = hc >= ho, prev = i ? P.st[i - 1] : 0;
      P.st.push(up ? (prev > 0 ? prev + 1 : 1) : (prev < 0 ? prev - 1 : -1));
    }
    if (eur && eur.length) { // EUR/USD kapanışını zamana göre hizala (yalnızca o ana kadar bilinen son değer)
      const m = new Map(eur.map(k => [k.time, k.close])); let last = null;
      P.eur = d.map(k => (last = m.has(k.time) ? m.get(k.time) : last));
    }
    return P;
  }
  function feat(P, d, i, dir) {
    const A = P.a[i] || 1e-9, c = P.c[i], b = P.bb[i], ha = P.ha[i], rng = (ha.h - ha.l) || 1e-9;
    const h = new Date(d[i].time * 1000).getUTCHours();
    const er = P.eur && P.eur[i] != null && P.eur[i - 20] != null ? (P.eur[i] / P.eur[i - 20] - 1) * 100 : 0;
    return [
      dir * (c - P.e20[i]) / A, dir * (P.e20[i] - P.e50[i]) / A, dir * (c - P.e200[i]) / A,
      dir * ((P.r[i] ?? 50) - 50) / 50, A / c * 100,
      b ? dir * (c - b.mid) / (((b.up - b.lo) / 2) || 1e-9) : 0, b ? (b.up - b.lo) / A : 0, (P.ax[i] || 0) / 100,
      dir * (ha.c - ha.o) / rng, dir * Math.max(-5, Math.min(5, P.st[i])) / 5,
      dir * (c - P.c[i - 5]) / A, dir * (c - P.c[i - 20]) / A,
      Math.sin(h / 24 * 2 * Math.PI), Math.cos(h / 24 * 2 * Math.PI),
      dir * er * 10,
    ];
  }
  // Üçlü bariyer: giriş sonraki mumun açılışı
  function label(d, i, dir, A, k = 1.5, H = 24) {
    const e = d[i + 1].open, stop = e - dir * k * A, tgt = e + dir * k * A;
    for (let j = i + 1; j <= i + H && j < d.length; j++) {
      if (dir > 0 ? d[j].low <= stop : d[j].high >= stop) return 0;
      if (dir > 0 ? d[j].high >= tgt : d[j].low <= tgt) return 1;
    }
    return 0;
  }
  // Lojistik regresyon (standartlaştırma + L2, toplu gradyan inişi)
  function train(X, y, l2 = 0.01, epochs = 400, lr = 0.3) {
    const n = X.length, m = X[0].length, mu = Array(m).fill(0), sd = Array(m).fill(0);
    for (const x of X) x.forEach((v, j) => mu[j] += v / n);
    for (const x of X) x.forEach((v, j) => sd[j] += (v - mu[j]) ** 2 / n);
    sd.forEach((v, j) => sd[j] = Math.sqrt(v) || 1);
    const Z = X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
    const w = Array(m).fill(0); let b = 0;
    for (let ep = 0; ep < epochs; ep++) {
      const g = Array(m).fill(0); let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = b; for (let j = 0; j < m; j++) z += w[j] * Z[i][j];
        const e = 1 / (1 + Math.exp(-z)) - y[i];
        for (let j = 0; j < m; j++) g[j] += e * Z[i][j];
        gb += e;
      }
      for (let j = 0; j < m; j++) w[j] -= lr * (g[j] / n + l2 * w[j]);
      b -= lr * gb / n;
    }
    return {mu, sd, w, b, n};
  }
  function prob(M, x) {
    let z = M.b; for (let j = 0; j < x.length; j++) z += M.w[j] * (x[j] - M.mu[j]) / M.sd[j];
    return 1 / (1 + Math.exp(-z));
  }
  // [from, to) aralığındaki mumlarla eğit; etiketin geleceği 'to'yu aşmaz (test dönemine sızıntı yok)
  function fit(P, d, from, to, H = 24, step = 1) {
    const X = [], y = [];
    for (let i = Math.max(210, from); i < to - H - 1; i += step) {
      for (const dir of [1, -1]) { X.push(feat(P, d, i, dir)); y.push(label(d, i, dir, P.a[i], 1.5, H)); }
    }
    if (X.length < 200) return null;
    const M = train(X, y); M.base = y.reduce((a, v) => a + v, 0) / y.length;
    return M;
  }
  return {prep, feat, label, train, prob, fit};
})();
