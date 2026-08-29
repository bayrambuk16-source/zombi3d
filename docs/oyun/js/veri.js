/** Sunum verisi ve ilerleme durumu.
 *
 *  DENGE SAYILARI BURADA YOKTUR. Hasar/menzil/şarjör vb. tek kaynaktan,
 *  `denge/motor.mjs`ten gelir — simülatörle oyun aynı tabloyu kullansın diye.
 *  Bu dosya yalnız "nasıl görünür, nasıl adlanır, ne zaman açılır" bilgisini
 *  ve oyuncunun kaydını tutar.
 */
import { SILAHLAR, BUILDLER, silahHesapla, surekliDps } from '../../denge/motor.mjs';

/* ═══ SİLAH SUNUMU ═══
   Nadirlik The Division'daki kademelendirmeyi izler; burada anlamı
   "ne kadar geç açılır + envanterde hangi renkle çerçevelenir"dir.
   Denge açısından bir çarpanı YOKTUR — güç farkı silah tablosundadır. */
export const NADIRLIK = {
  standart:   { ad: 'Standart',   renk: '#9aa4ad' },
  uzman:      { ad: 'Uzman',      renk: '#57c15a' },
  ustun:      { ad: 'Üstün',      renk: '#4a9de0' },
  yuksek:     { ad: 'Yüksek Sınıf', renk: '#e0a12a' },
};

export const SILAH_SUNUM = {
  revolver: {
    ad: 'Revolver',
    model: '../silah/optim/revolver.glb', nadirlik: 'standart', acilis: 1,
    sinif: 'Tabanca', boy: 0.30, elSayisi: 1,
    aciklama: 'Başlangıç silahı. Altı mermilik şarjör, uzun reload. ' +
              'Şarjör bitmeden zombi hatta varır — gerilim buradan doğar.',
  },
  smg: {
    ad: 'SMG',
    model: '../silah/optim/smg.glb', nadirlik: 'uzman', acilis: 3,
    sinif: 'Hafif makineli', boy: 0.46, elSayisi: 2,
    aciklama: 'En yakın, en hızlı. Koşucu sürülerine karşı ölçülen en iyi silah. ' +
              'Menzili kısa: taşıyıcısı öne çıkar ve hasar yer.',
  },
  avTufegi: {
    ad: 'Av Tüfeği',
    model: '../silah/optim/av-tufegi.glb', nadirlik: 'uzman', acilis: 4,
    sinif: 'Av tüfeği', boy: 0.78, elSayisi: 2,
    aciklama: 'Saçma yayılımı arka arkaya dizilen iki hedefi birden tarar. ' +
              'Mesafeyle hasarı düşer; taşıyıcısı bilerek yakın durur.',
  },
  saldiri: {
    ad: 'Saldırı Tüfeği',
    model: '../silah/optim/saldiri-tufegi.glb', nadirlik: 'ustun', acilis: 6,
    sinif: 'Saldırı tüfeği', boy: 0.80,
    aciklama: 'Ölçümde en dengeli silah. Menzil, atış hızı ve şarjör ' +
              'arasında ödün vermez; her bölümde işe yarar.',
  },
  lmg: {
    ad: 'LMG',
    model: '../silah/optim/lmg.glb', nadirlik: 'ustun', acilis: 9,
    sinif: 'Ağır makineli', boy: 0.92, elSayisi: 2,
    aciklama: '60 mermilik şarjör, 4,2 saniyelik reload. Uzun bir boşluk ' +
              'bırakır — reload anında hat delinir.',
  },
  sniper: {
    ad: 'Keskin Nişancı',
    model: '../silah/optim/keskin-nisanci.glb', nadirlik: 'yuksek', acilis: 12,
    sinif: 'Keskin nişancı', boy: 1.05, elSayisi: 2,
    aciklama: 'Tehdit temizleyici. Tanka karşı belirgin birinci, kalabalıkta ' +
              'orta. Delici atış ikinci hedefi de vurur.',
  },
};

export const BUILD_SUNUM = {
  assault:  { renk: '#e0563a', simge: '◆', ad: 'Assault',
              ozet: 'Hasar +18% · atış +8% · reload cezası +15%' },
  marksman: { renk: '#4a9de0', simge: '✛', ad: 'Marksman',
              ozet: 'Menzil +15% · ağır hedef +45% · uzak mesafe +30% · atış −8%' },
  operator: { renk: '#e0c02a', simge: '⬢', ad: 'Operator',
              ozet: 'Şarjör +25% · reload −20% · atış +8% · hasar −8%' },
  ranger:   { renk: '#57c15a', simge: '▲', ad: 'Ranger',
              ozet: 'Hasar +7% · reload −10% · menzil +8% · hareket +8%' },
};

export const KURTULANLAR = [
  { ad: 'AHMET',  rol: 'İtfaiyeci' },
  { ad: 'DERYA',  rol: 'Hemşire' },
  { ad: 'KEREM',  rol: 'Kurye' },
  { ad: 'SELİN',  rol: 'Öğretmen' },
];

/* ═══ CHAPTER 1 — kalibre tablo ═══
   `denge/kalibre.mjs` tarafından ÖLÇÜLEREK üretildi (bkz. denge/CHAPTER1.md).
   Elle değiştirmeyin; zorluk değişecekse önce orada ölçün. */
export const CHAPTER1 = [
  { no:  1, sure: 30, atak: 2, toplam: 12, bosluk: 17 },
  { no:  2, sure: 31, atak: 2, toplam: 12, bosluk: 18 },
  { no:  3, sure: 32, atak: 2, toplam: 12, bosluk: 19 },
  { no:  4, sure: 32, atak: 2, toplam: 16, bosluk: 19 },
  { no:  5, sure: 33, atak: 2, toplam: 16, bosluk: 20, bossCan: 2400 },
  { no:  6, sure: 34, atak: 2, toplam: 35, bosluk: 20 },
  { no:  7, sure: 35, atak: 2, toplam: 37, bosluk: 21 },
  { no:  8, sure: 36, atak: 2, toplam: 40, bosluk: 22 },
  { no:  9, sure: 36, atak: 2, toplam: 41, bosluk: 22 },
  { no: 10, sure: 37, atak: 2, toplam: 41, bosluk: 23, bossCan: 4600 },
  { no: 11, sure: 38, atak: 3, toplam: 62, bosluk: 12 },
  { no: 12, sure: 39, atak: 3, toplam: 65, bosluk: 12 },
  { no: 13, sure: 39, atak: 3, toplam: 64, bosluk: 12 },
  { no: 14, sure: 40, atak: 3, toplam: 69, bosluk: 13 },
  { no: 15, sure: 41, atak: 3, toplam: 69, bosluk: 13, bossCan: 4000 },
  { no: 16, sure: 42, atak: 3, toplam: 58, bosluk: 14 },
  { no: 17, sure: 43, atak: 3, toplam: 58, bosluk: 14 },
  { no: 18, sure: 43, atak: 3, toplam: 56, bosluk: 14 },
  { no: 19, sure: 44, atak: 3, toplam: 57, bosluk: 14 },
  { no: 20, sure: 45, atak: 3, toplam: 57, bosluk: 15, bossCan: 3800 },
];

/* ═══ ÇEVRE TEMALARI ═══
   3D çevre modeli YOK — chapter ilerledikçe koridorun rengi, sisi ve ışığı
   değişir. Ucuz ama okunur: oyuncu nerede olduğunu renkten anlar. */
export const TEMALAR = [
  { bolum: 1,  ad: 'Otopark',      zemin: 0x3d4048, duvar: 0x2a2d33, sis: 0x14161a,
    gunes: 0xffe8c8, ortam: 0x8fa4bc, yogunluk: 2.0 },
  { bolum: 6,  ad: 'Sokak',        zemin: 0x4a4a3e, duvar: 0x33352b, sis: 0x191b14,
    gunes: 0xffd9a0, ortam: 0xa8bccc, yogunluk: 2.3 },
  { bolum: 11, ad: 'Metro',        zemin: 0x2e3138, duvar: 0x212429, sis: 0x0d0f12,
    gunes: 0xc8d8ff, ortam: 0x6a7c94, yogunluk: 1.6 },
  { bolum: 16, ad: 'Hastane',      zemin: 0x424a48, duvar: 0x2c3433, sis: 0x121816,
    gunes: 0xd8fff0, ortam: 0x7ea0a0, yogunluk: 1.9 },
];

/** Arayüzde gösterilecek ad. motor.mjs ASCII tutar; Türkçe ad burada. */
export function silahAdi(anahtar) {
  return (SILAH_SUNUM[anahtar] && SILAH_SUNUM[anahtar].ad) || SILAHLAR[anahtar].ad;
}

export function temaBul(bolum) {
  let t = TEMALAR[0];
  for (const x of TEMALAR) if (bolum >= x.bolum) t = x;
  return t;
}

/* ═══ ZOMBİ SUNUMU ═══ */
export const ZOMBI_SUNUM = {
  yuruyen: { ad: 'Yürüyen', olcek: 1.00, renk: 0x8fa07a },
  kosucu:  { ad: 'Koşucu',  olcek: 0.94, renk: 0xc09a5a },
  tank:    { ad: 'Tank',    olcek: 1.28, renk: 0x7a8a9a },
  boss:    { ad: 'BOSS',    olcek: 1.65, renk: 0xb05a4a },
};

/* ═══ KAYIT ═══ */
const ANAHTAR = 'zombi3d.kayit.v1';

export function varsayilanKayit() {
  return {
    bolum: 1,
    checkpoint: 1,
    acikSilahlar: ['revolver'],
    kadro: [
      { silah: 'revolver', build: 'ranger' },
      { silah: 'revolver', build: 'assault' },
      { silah: 'revolver', build: 'operator' },
      { silah: 'revolver', build: 'marksman' },
    ],
  };
}

export function kayitYukle() {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (!ham) return varsayilanKayit();
    const k = JSON.parse(ham);
    /* eksik alan gelirse varsayılanla tamamla — eski kayıt bozulmasın */
    return Object.assign(varsayilanKayit(), k);
  } catch (e) { return varsayilanKayit(); }
}

export function kayitYaz(k) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(k)); } catch (e) {}
}

/** Bölüme ulaşınca açılan silahları kayda ekler; açılan listesini döner. */
export function silahAcilisiUygula(kayit, bolum) {
  const yeni = [];
  for (const [anahtar, s] of Object.entries(SILAH_SUNUM)) {
    if (s.acilis <= bolum && !kayit.acikSilahlar.includes(anahtar)) {
      kayit.acikSilahlar.push(anahtar);
      yeni.push(anahtar);
    }
  }
  return yeni;
}

/** Envanter kartı için hesaplanmış değerler — build uygulanmış hâliyle. */
export function silahKunye(silahAd, buildAd) {
  const s = silahHesapla(silahAd, buildAd);
  const ham = SILAHLAR[silahAd];
  return {
    dps: surekliDps({ sarjor: s.sarjor, hasar: s.hasar, ara: s.ara, reload: s.reload }),
    hasar: s.hasar, ara: s.ara, sarjor: s.sarjor, reload: s.reload, menzil: s.menzil,
    hamDps: surekliDps(ham),
    /* KOŞULLU bonuslar. Panelde ayrı satır olarak gösterilmeleri şart:
       sürekli DPS tek başına Marksman'ı her silahta en kötü gösteriyor,
       oysa ölçümde ortalamada en iyi build. Sayı yalan söylememeli. */
    agirCarpan: s.agir || 0,
    uzakCarpan: s.uzakBonus || 0,
    uzakEsik: s.uzakEsik || 0,
  };
}

export { SILAHLAR, BUILDLER };
