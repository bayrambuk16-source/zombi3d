import { IKON } from './ikon.js';
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
  agirTabanca: {
    ad: 'Ağır Tabanca',
    model: '../silah/optim/agir-tabanca.glb', nadirlik: 'uzman', acilis: 2,
    sinif: 'Ağır tabanca', boy: 0.34, elSayisi: 1,
    aciklama: 'Revolverin yükseltmesi. Sekiz mermilik şarjör ve 1,05 sn reload: ' +
              'ölçümde en kısa reload boşluğuna sahip silah (%9). Şarjör başına ' +
              'bir yürüyeni rahat düşürür — revolver düşüremiyordu.',
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

/* Build özeti ELLE YAZILMAZ, motordan üretilir.
   Sebep: elle yazılan metin ölçümle güncellenen motorun gerisinde kalıyordu —
   Marksman "menzil +15% / uzak +30%" diyordu, motor +10% / +22% uyguluyordu.
   Sunum katmanı denge sayısını kopyalamaz, OKUR; böylece sapma imkânsızlaşır. */
const BUILD_ETIKET = {
  hasar:     'hasar',
  atis:      'atış',
  menzil:    'menzil',
  sarjor:    'şarjör',
  hareket:   'hareket',
  agir:      'ağır hedef',
  uzakBonus: 'uzak mesafe',
  reload:    'reload',
};

function yuzdeMetni(v) {
  return (v < 0 ? '−' : '+') + Math.round(Math.abs(v) * 100) + '%';
}

/** BUILDLER kaydını okunur özete çevirir. Alan sırası motordaki yazım
 *  sırasıdır — build'in kimliğini taşıyan bonus orada zaten önde durur. */
export function buildOzet(buildAd) {
  const b = BUILDLER[buildAd];
  if (!b) return '';
  const parca = [];
  for (const alan of Object.keys(b)) {
    const etiket = BUILD_ETIKET[alan];
    if (!etiket || typeof b[alan] !== 'number') continue;
    /* reload'da işaret ters okunur: artı değer süreyi UZATIR, yani cezadır. */
    parca.push(alan === 'reload' && b[alan] > 0
      ? 'reload cezası ' + yuzdeMetni(b[alan])
      : etiket + ' ' + yuzdeMetni(b[alan]));
  }
  if (!parca.length) return '';
  parca[0] = parca[0][0].toLocaleUpperCase('tr') + parca[0].slice(1);
  return parca.join(' · ');
}

export const BUILD_SUNUM = {
  assault:  { renk: '#e0563a', simge: IKON['savas/build-assault'], ad: 'Assault',
              ozet: buildOzet('assault') },
  marksman: { renk: '#4a9de0', simge: IKON['savas/build-marksman'], ad: 'Marksman',
              ozet: buildOzet('marksman') },
  operator: { renk: '#e0c02a', simge: IKON['savas/build-operator'], ad: 'Operator',
              ozet: buildOzet('operator') },
  ranger:   { renk: '#57c15a', simge: IKON['savas/build-ranger'], ad: 'Ranger',
              ozet: buildOzet('ranger') },
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
   Renk + sis + ışık, ARTI mekâna özgü mimari siluet (`sahne.js _mekanKur`).
   Önce yalnız renk değişiyordu; dışarıdan bakan biri dört mekânı ayırt
   edemedi ("hepsi aynı koridor"). Renk mekânı SÖYLER, siluet GÖSTERİR.
   `anahtar` alanı sahnedeki mekân grubunu seçer.

   Işık dili de mekâna göre değişir: `lamba` duvar lambasının rengi,
   `rimRenk`/`rimGuc` siluet ayıran arka ışık. Gerçek ışık SAYISI artmıyor —
   yalnız mevcut ışıkların rengi ve şiddeti temayla geliyor. */
export const TEMALAR = [
  { bolum: 1,  anahtar: 'otopark', ad: 'Otopark',  zemin: 0x3d4048, duvar: 0x2a2d33, sis: 0x14161a,
    gunes: 0xffe8c8, ortam: 0x8fa4bc, yogunluk: 2.0,
    lamba: 0xcfe6ff, rimRenk: 0xbcd8ff, rimGuc: 1.4 },   /* soğuk floresan */
  { bolum: 6,  anahtar: 'sokak',   ad: 'Sokak',    zemin: 0x4a4a3e, duvar: 0x33352b, sis: 0x191b14,
    gunes: 0xffd9a0, ortam: 0xa8bccc, yogunluk: 2.3,
    lamba: 0xffb45a, rimRenk: 0xffd0a0, rimGuc: 1.2 },   /* sıcak sokak lambası */
  { bolum: 11, anahtar: 'metro',   ad: 'Metro',    zemin: 0x2e3138, duvar: 0x212429, sis: 0x0d0f12,
    gunes: 0xc8d8ff, ortam: 0x6a7c94, yogunluk: 1.6,
    lamba: 0xe8f2ff, rimRenk: 0xa8c0e8, rimGuc: 1.9 },   /* sert aralıklı tavan ışığı */
  { bolum: 16, anahtar: 'hastane', ad: 'Hastane',  zemin: 0x424a48, duvar: 0x2c3433, sis: 0x121816,
    gunes: 0xd8fff0, ortam: 0x7ea0a0, yogunluk: 1.9,
    lamba: 0xdaffe6, rimRenk: 0xc8ffe8, rimGuc: 1.5 },   /* kirli yeşil klinik */
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

/* ═══ KLİP PENCERELERİ ═══
   Mixamo klipleri "eylem" değil "sahne"dir: tabancaAtes 5,33 sn, zombie
   biting 6,60 sn. Oyun bunları 0,2-0,7 sn'lik pencerede oynatınca yalnız
   BAŞLANGIÇ duruşu görünüyordu — nötr/T poz. Aşağıdaki aralıklar
   `tools/zombi-klip-pencere.mjs` ile ÖLÇÜLDÜ (kol kemiklerinin hareket
   enerjisinin tepe noktası) ve klipler yüklenirken kesiliyor.
   Yürüyüş/idle klipleri döngü olduğu için kesilmez. */
export const KLIP_PENCERE = {
  /* kurtulan */
  /* tabancaAtes penceresi v2 setiyle YENİDEN ölçüldü. Eski değer
     [1,55-2,45] eski klibe göreydi; yeni klip 2,70 sn ve enerji tepesi
     0,60 sn'de. Eski pencere uygulansaydı atışın bittiği yeri gösterirdi.
     Klip kaynağı değişince penceresi de değişir — ikisi ayrılamaz. */
  tabancaAtes:   [0.30, 1.10],
  /* zombi — vuruşun gerçekten göründüğü aralık */
  saldiri:       [0.55, 1.45],
  saldiri2:      [4.90, 5.90],
  saldiri3:      [0.25, 1.15],
  vurus:         [0.30, 1.00],
  olum3:         [0.00, 3.20],   /* 11,57 sn; gövde 3,4 sn'de kalkıyor */
  /* Aşama 2 — ağır zombi (tank/boss) ve tabanca eylem klipleri.
     Pencereler `tools/zombi-klip-pencere.mjs` ölçümüyle bulundu; sayılar
     enerji tepesini ortalar. agirYuru ve agirIdle DÖNGÜ klibidir, kesilmez. */
  agirSaldiri:   [0.20, 1.10],   /* 2,60 sn · tepe 0,60 */
  bossSaldiri:   [1.25, 2.15],   /* 3,40 sn · tepe 1,70 */
  agirVurus:     [0.30, 1.10],   /* 11,57 sn — kesilmezse yalnız başı görünür */
  tabancaHasar:  [0.45, 1.25],   /* 2,77 sn · tepe 0,73 */
  tabancaHasar2: [0.45, 1.25],   /* 2,63 sn · tepe 0,73 */
  /* tabancaOlum: gövde 2,27 sn'de yere iniyor — kesilmezse düşen kurtulan
     iki saniye dimdik bekliyor. İki bağımsız ölçüm (enerji tepesi 2,33 ·
     kalça yüksekliği 2,27) aynı yeri gösterdi.
     tabancaOlum2 KESİLMEZ: 0,03 sn'de düşüyor, tüfek ölümleriyle aynı. */
  tabancaOlum:   [1.70, 3.67],
};

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
