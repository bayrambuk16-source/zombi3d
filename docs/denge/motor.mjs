/** Zombi3D denge motoru — saf, tohumlu, tarayıcısız savaş simülasyonu.
 *
 *  NEDEN: sniper dominansı ve Ranger'ın cezasızlığı 3D prototipte ölçülemez —
 *  tek koşu gürültülü, 20 bölümü elle izlemek saatler alır. Burada aynı savaş
 *  modeli 1D koridorda çalışır: overkill, reload boşluğu, menzil farkı ve
 *  zombinin hedef seçimi korunur; sadece görsel katman yoktur.
 *
 *  Koridor ekseni: zombi z=-20'de doğar, +z yönüne yürür. Kurtulan z~2.5'te.
 *  mesafe = kurtulanZ - zombiZ.
 */

/* ═══════ tohumlu rastgele — aynı tohum aynı sonucu verir ═══════ */
export function rng(tohum) {
  let a = tohum >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════ SİLAHLAR ═══════
   İki sabit çıpa var, gerisi bunlara göre türetildi:
     revolver — DURUM'da ÖLÇÜLMÜŞ temel (34/0,85/6/1,9, menzil 9)
     keskin nişancı — ChatGPT + Claude ortak önerisi (225/2,8/4/3,4)
   Sürekli DPS = (şarjör × hasar) / ((şarjör-1) × atışAra + reload)
   Bu formül DURUM'daki 33 ve 76 sayılarını birebir üretir; çıpa doğru. */
export const SILAHLAR = {
  revolver:  { ad:'Revolver',       hasar:34,  ara:0.85, sarjor:6,  reload:1.9, menzil:9   },
  /* Koridor tasarımı doğası gereği MENZİLİ ödüllendirir: uzun menzil = bedava
     atış süresi. Ölçümde kısa menzilli iki silah (SMG, av tüfeği) yüksek
     DPS'lerine rağmen AR/LMG'nin altında kaldı. Telafi, yakın mesafede
     BELİRGİN üstünlük olmalı — bedeli maruz kalma. */
  smg:       { ad:'SMG',            hasar:17,  ara:0.11, sarjor:32, reload:1.7, menzil:6.5 },
  saldiri:   { ad:'Saldiri tufegi', hasar:14,  ara:0.16, sarjor:30, reload:2.2, menzil:11  },
  /* Av tüfeği ideal mesafesi ayrıdır: genel %67,5 kuralı uygulanınca taşıyıcı
     kendini hasarın %53'e düştüğü mesafede tutuyor ve silah ölçümde en zayıf
     çıkıyordu. "Yakında yıkıcı" kimliği pozisyon AI'ında da karşılığını
     bulmalı — bu taşıyıcı öne çıkar, DURUM'un "kısa menzil önde" kuralıyla
     da uyumlu.
     Saçma yayılımı (coklu) silahın tanımlayıcı mekaniğidir: koridorda arka
     arkaya dizilen hedefleri aynı tetikte tarar. Bu olmadan av tüfeği sadece
     "menzili kısa revolver" oluyordu. */
  avTufegi:  { ad:'Av tufegi',      hasar:132, ara:0.95, sarjor:6,  reload:2.6, menzil:7,
               dusum:0.35, idealOran:0.35, coklu:{ adet:2, aralik:1.5, oran:0.55 } },
  lmg:       { ad:'LMG',            hasar:12,  ara:0.12, sarjor:60, reload:4.2, menzil:10  },
  /* SNIPER — ölçümle yeniden ayarlandı (bkz. denge/RAPOR.md).
     Eski 225/2,8/16/delici0,60/elit+35 her kategoride 1.'ydi; kimliği
     "tehdit temizleyici" değil "her şeyin en iyisi"ydi. Üç kaynak vardı:
       1) delici hasar 135 > koşucu canı 130 → tek tetikte iki koşucu.
       2) atış hızı — kırılma oranındaki en güçlü levye.
       3) elit bonusu boss'a da işliyordu; 4 sniper boss'u tek volede düşürdü.
     Yeni ayar: delici 0,40 (76 hasar — hiçbir zombiyi tek vurmaz),
     ara 3,5, hasar 190 (210 canlı yürüyeni TEK vurmaz), menzil 14,
     bonus artık boss'a değil AĞIR hedefe (tank) bağlı. */
  sniper:    { ad:'Keskin nisanci', hasar:190, ara:3.5,  sarjor:4,  reload:3.4, menzil:14,
               delici:0.40, agirBonus:0.30 },
};

export function surekliDps(s) {
  return (s.sarjor * s.hasar) / ((s.sarjor - 1) * s.ara + s.reload);
}

/* ═══════ BUILD'LER ═══════ (DURUM §6 "Ortak tasarım" — ölçülecek olan bu) */
export const BUILDLER = {
  assault:  { ad:'Assault',  hasar:+0.18, atis:+0.08, reload:+0.15 },
  /* MARKSMAN — ölçümle yeniden yazıldı. Eski hali (menzil+25, ilkAtış+20,
     ağır+20, atış−8) ölçümde +%4 veriyordu: ölü build. Nedeni, üç bonusun da
     ölçülemez olması — menzil zayıf levye, "ilk atış" 30-60 mermilik şarjörde
     bir kez işliyor, ağır hedef nadir. Yeni kimlik MESAFE ÖDÜLÜ: uzakta
     dururken vuran kazanır. Bu, squad hareket sistemiyle doğrudan etkileşir.
     Eşik 0,80: squad ideal mesafesi menzilin %67,5'i olduğu için bonus
     "bedava" değildir — ancak menzilin dış kuşağındaki, yeni giren hedeflere
     işler. Eşik 0,60'ta neredeyse her atışta açılıyordu ve build %29 ile
     diğerlerinin iki katı çıkmıştı. */
  marksman: { ad:'Marksman', menzil:+0.10, agir:+0.45, atis:-0.08,
              uzakBonus:+0.22, uzakEsik:0.80 },
  operator: { ad:'Operator', sarjor:+0.25, reload:-0.20, atis:+0.08, hasar:-0.08 },
  ranger:   { ad:'Ranger',   hasar:+0.07, reload:-0.10, menzil:+0.08, hareket:+0.08 },
  yok:      { ad:'buildsiz' },
};

/* ═══════ ZOMBİLER ═══════ (hız / dayanıklılık ekseni — DURUM sabit kararı) */
export const ZOMBILER = {
  yuruyen: { ad:'Yuruyen', can:210,  hiz:1.35, hasar:9,  vurAra:1.6 },
  kosucu:  { ad:'Kosucu',  can:130,  hiz:2.40, hasar:7,  vurAra:1.2 },
  tank:    { ad:'Tank',    can:520,  hiz:0.85, hasar:16, vurAra:2.0, agir:true },
  /* Boss AĞIR değildir: "ağır hedef" bonusları tanka gitsin, boss'a değil.
     Yoksa anti-tank kimliği olan her şey otomatik boss silahı olur.
     Can 1050 (5 zombi eşdeğeri) ölçümde tek volede düşüyordu — dalga
     bütçesinde hâlâ 5 sayılır ama canı ayrı ayarlanır. */
  boss:    { ad:'Boss',    can:2600, hiz:1.00, hasar:16, vurAra:2.4, elit:true },
};

/* ═══════ SABİTLER ═══════ */
const S = {
  dt: 0.05,
  dogumZ: -20,
  hatZ: 2.5,
  vurMesafe: 1.7,
  kurtulanCan: 160,
  idealOran: 0.675,   /* menzilin %65-70'i — DURUM ortak tasarım */
  ileri: 0.55, geri: 0.85, acilGeri: 1.05,
  acilMesafe: 3.0,    /* bundan yakınsa acil geri çekilme */
  reloadGeri: 0.85,   /* reload sırasında geri düşüş */
  zMaks: 8.0,        /* arka duvar */
  ileriPay: 1.2,     /* hattın en fazla bu kadar önüne çıkılır */
};

/** Bir zombinin doğduğu yerden hatta ulaşma süresi (sn).
 *  Dalga tasarımının ana sabiti: kadro bu süre içinde öldürebildiğinden
 *  BÜYÜK bir öbek gelmezse hiçbir zombi hatta ulaşmaz ve bölüm hasarsız
 *  geçer. Zorluk bu eşiğin katı olarak tanımlanır. */
export function yaklasmaSuresi(tur) {
  const z = ZOMBILER[tur || 'yuruyen'];
  return (S.hatZ - S.dogumZ - S.vurMesafe) / z.hiz;
}

function carp(v) { return 1 + (v || 0); }

export function silahHesapla(silahAd, buildAd) {
  const s = SILAHLAR[silahAd], b = BUILDLER[buildAd] || {};
  return {
    ad: s.ad, kaynak: s,
    hasar:  s.hasar * carp(b.hasar),
    ara:    s.ara / carp(b.atis),
    sarjor: Math.max(1, Math.round(s.sarjor * carp(b.sarjor))),
    reload: s.reload * carp(b.reload),
    menzil: s.menzil * carp(b.menzil),
    ilkAtis: b.ilkAtis || 0,
    /* ağır hedef bonusu iki kaynaktan gelir: silahın kendi kimliği (sniper)
       ve build (Marksman). Toplanır, çarpılmaz — üst üste binmeleri
       kontrolsüz büyümesin. */
    agir:    (b.agir || 0) + (s.agirBonus || 0),
    uzakBonus: b.uzakBonus || 0,
    uzakEsik:  b.uzakEsik || 0,
    hareket: carp(b.hareket),
    dusum:   s.dusum || null,
    coklu:   s.coklu || null,
    delici:  s.delici || null,
    elitBonus: s.elitBonus || 0,
  };
}

/* ═══════ SAVAŞ — ortak gerçek zamanlı motor ═══════
 *
 *  Hem tohumlu ölçüm (bolumKos) hem oynanan oyun (prototip) BU sınıfı
 *  kullanır. İki ayrı uygulama olsaydı ölçülen denge ile oynanan denge
 *  sessizce ayrışırdı — dengeyi ölçmenin anlamı kalmazdı.
 *
 *  Sabit adım (S.dt) ile ilerler; oyun tarafı gerçek kare süresini biriktirip
 *  sabit adımlara böler. Böylece FPS ne olursa olsun sonuç aynıdır.
 *
 *  Görsel katman `olaylar` kuyruğunu her karede boşaltır: ateş, isabet,
 *  ölüm, reload, kurtulanın hasar alması. Motor hiçbir şey çizmez.
 */
export class Savas {
  constructor(ayar) {
    const r = rng(ayar.tohum || 1);
    this.r = r;
    this.olaylar = [];
    this.t = 0;
    this.alinanHasar = 0;
    this.sonrakiId = 1;
    this.sure = ayar.sure;
    this.tolerans = ayar.tolerans !== undefined ? ayar.tolerans : 90;

    this.kurtulanlar = ayar.kadro.map((k, i) => {
      const s = silahHesapla(k.silah, k.build);
      return {
        i, s, silahAd: k.silah, buildAd: k.build,
        ad: s.ad + ' / ' + (BUILDLER[k.build] || {}).ad,
        /* şerit: dört kurtulan koridorda yan yana dizilir. Gameplay 1B'dir,
           şerit yalnız görsel ve zombinin hedef seçimini etkilemez. */
        serit: [-1.65, -0.55, 0.55, 1.65][i % 4],
        z: S.hatZ + i * 0.001,
        /* Faz kaydırması ZORUNLU: dört kurtulan aynı tick'te ateş ederse
           hepsi aynı hedefe yüklenir ve overkill yapay olarak patlar. */
        can: S.kurtulanCan, maxCan: S.kurtulanCan,
        mermi: s.sarjor, reloadKalan: 0, atesKalan: r() * s.ara,
        ilk: true, olu: false,
        atilanHasar: 0, israf: 0, kesim: 0, atisSayisi: 0, reloadSuresi: 0,
      };
    });

    /* Dalga girişi tip değerlerini EZEBİLİR (can/hasar). Boss'un canı bölüme
       göre ölçeklenir: sabit can, başlangıç kadrosu için aşılmaz duvar,
       son kadro için formalite oluyordu. */
    this.kuyruk = ayar.dalga.map(z => ({
      tur: z.tur, can: z.can, hasar: z.hasar,
      zaman: z.zaman !== undefined ? z.zaman : r() * ayar.sure,
    })).sort((a, b) => a.zaman - b.zaman);

    this.zombiler = [];
    this.sonraki = 0;
    /* OYUNCU EMRİ — ölçüm bunu ASLA doldurmaz. Doldurulmadığında davranış
       tam otomatiktir ve ölçülen dengeyle birebir aynıdır. Oyun tarafı
       kontrol moduna göre alanları açar:
         hedefId · elleAtes/atesSerbest · elleReload/reloadIstegi · elleHareket/yon */
    this.emir = null;
  }

  get bitti() {
    if (this.kurtulanlar.every(k => k.olu)) return true;
    if (this.t >= this.sure + this.tolerans) return true;
    return this.sonraki >= this.kuyruk.length && this.zombiler.every(z => z.olu);
  }

  /** Gerçek kare süresini sabit adımlara bölerek ilerletir. */
  ilerlet(dtGercek) {
    this.birikim = (this.birikim || 0) + Math.min(dtGercek, 0.25);
    let adet = 0;
    while (this.birikim >= S.dt && adet < 12) {
      this.birikim -= S.dt;
      this.adim();
      adet++;
      if (this.bitti) break;
    }
  }

  adim() {
    const r = this.r;
    this.t += S.dt;

    while (this.sonraki < this.kuyruk.length && this.kuyruk[this.sonraki].zaman <= this.t) {
      const g = this.kuyruk[this.sonraki];
      const tip = ZOMBILER[g.tur];
      const z = {
        id: this.sonrakiId++, tur: g.tur, tip,
        can: g.can || tip.can, maxCan: g.can || tip.can,
        hasar: g.hasar || tip.hasar,
        z: S.dogumZ - r() * 6,
        /* Şerit RNG akışından ÇEKİLMEZ: yalnız görsel bir değer, ama akışı
           kaydırırsa daha önce ölçülmüş tüm sayılar sessizce değişir.
           id'den türetiliyor — deterministik ve ölçüme etkisiz.
           Beş sabit şerit + küçük kayma: saf hash ardışık id'leri yan yana
           düşürüp zombileri üst üste bindiriyordu. */
        serit: ((this.sonrakiId % 5) - 2) * 1.32 +
               (((this.sonrakiId * 2654435761) % 101) / 101 - 0.5) * 0.7,
        vurZaman: 0, olu: false, olumT: 0,
      };
      this.zombiler.push(z);
      this.olaylar.push({ tip: 'dogum', zombi: z });
      this.sonraki++;
    }

    const canliZombi = this.zombiler.filter(z => !z.olu);
    const canliKurtulan = this.kurtulanlar.filter(k => !k.olu);

    /* ── kurtulanlar ── */
    for (const k of canliKurtulan) {
      let yakinD = Infinity;
      for (const z of canliZombi) {
        if (z.olu) continue;
        const d = k.z - z.z;
        if (d < yakinD) yakinD = d;
      }

      /* hareket: squad anchor — ideal mesafeyi korur, reload'da geri düşer */
      if (yakinD < Infinity) {
        const ideal = k.s.menzil * (k.s.kaynak.idealOran || S.idealOran);
        let hiz = 0;
        if (k.reloadKalan > 0) hiz = S.reloadGeri;
        /* Acil geri çekilme eşiği ideal mesafeyi GEÇMEMELİ: sabit 3,0 m,
           ideali 2,45 m olan av tüfeğini sürekli geri itip salınıma
           sokuyordu. Eşik idealin hemen altına çekilir. */
        else if (yakinD < Math.min(S.acilMesafe, ideal - 0.3)) hiz = S.acilGeri;
        else if (yakinD < ideal - 0.5) hiz = S.geri;
        /* İlerleme yalnız hedef MENZİL İÇİNDEYKEN yapılır. Eski kural
           mesafeye bakmadan ilerlettiği için kadro her dalga arasında
           koridorda yukarı yürüyüp zombileri karşılıyor, sonra geri
           dönüyordu (ölçüm: zamanın %56'sı ilerleme, konumların çoğu
           ilerleme sınırında). Savunma hattı terk edilip kimse kovalanmaz. */
        else if (yakinD > ideal + 0.5 && yakinD <= k.s.menzil) hiz = -S.ileri;
        /* Manuel modda pozisyonu oyuncu verir; ideal mesafe AI kapanır. */
        if (this.emir && this.emir.elleHareket) hiz = this.emir.yon || 0;
        k.hareket = hiz;
        /* İlerleme hattın en fazla ileriPay kadar önüne gider; geri çekilme
           arka duvara kadar serbesttir — baskı altında yer vermek tasarımın
           parçası, alan kazanmak için koşmak değil. */
        const onSinir = S.hatZ - S.ileriPay;
        k.z = Math.max(onSinir, Math.min(S.zMaks, k.z + hiz * k.s.hareket * S.dt));
        /* Baskı kalkınca hatta geri süzül; yoksa kadro bölüm boyunca geride
           kalır ve bir daha öne gelmez. */
        if (hiz === 0 && k.z > S.hatZ + 0.05 && yakinD > ideal + 1)
          k.z = Math.max(S.hatZ, k.z - S.ileri * 0.6 * S.dt);
      } else {
        k.hareket = 0;
        /* Hiç zombi yokken de hatta dön. */
        if (k.z > S.hatZ + 0.05) k.z = Math.max(S.hatZ, k.z - S.ileri * 0.6 * S.dt);
        else if (k.z < S.hatZ - 0.05) k.z = Math.min(S.hatZ, k.z + S.ileri * 0.6 * S.dt);
      }

      /* ateş döngüsü — AI kusurlu: şarjör bitmeden reload YAPMAZ.
         DURUM kuralı: kusursuz AI gerilimi öldürür. */
      if (k.reloadKalan > 0) {
        k.reloadKalan -= S.dt; k.reloadSuresi += S.dt;
        if (k.reloadKalan <= 0) { k.mermi = k.s.sarjor; k.ilk = true; }
        continue;
      }
      /* Elle reload: şarjör bitse bile oyuncu istemeden doldurulmaz.
         "AI kusursuz olmamalı" kuralının oyuncuya devredilmiş hâli. */
      if (k.mermi <= 0 && this.emir && this.emir.elleReload && !this.emir.reloadIstegi) continue;
      if (k.mermi > 0 && this.emir && this.emir.reloadIstegi && k.mermi < k.s.sarjor) {
        k.reloadKalan = k.s.reload;
        this.olaylar.push({ tip: 'reload', kurtulan: k, sure: k.s.reload });
        continue;
      }
      if (k.mermi <= 0) {
        k.reloadKalan = k.s.reload;
        this.olaylar.push({ tip: 'reload', kurtulan: k, sure: k.s.reload });
        continue;
      }

      k.atesKalan -= S.dt;
      if (k.atesKalan > 0) continue;

      let hedef = null, hd = Infinity;
      /* Oyuncunun işaretlediği hedef önceliklidir; menzil dışındaysa yok
         sayılır ve en yakına dönülür. Odaklı ateş overkill artırır — manuel
         oynamanın gerçek ödünü budur. */
      if (this.emir && this.emir.hedefId) {
        for (const z of canliZombi) {
          if (z.olu || z.id !== this.emir.hedefId) continue;
          const d = k.z - z.z;
          if (d >= 0 && d <= k.s.menzil) { hedef = z; hd = d; }
          break;
        }
      }
      if (!hedef) for (const z of canliZombi) {
        if (z.olu) continue;   /* aynı tick içinde düşen hedefe ateş etme */
        const d = k.z - z.z;
        if (d >= 0 && d <= k.s.menzil && d < hd) { hd = d; hedef = z; }
      }
      k.hedef = hedef;
      if (!hedef) continue;

      /* Elle ateş: tetik oyuncudadır. Serbest bırakılan atış sayacı
         tüketilir; sayaç boşsa kurtulan bekler. */
      if (this.emir && this.emir.elleAtes && !this.emir.atesSerbest) continue;
      k.mermi--; k.atesKalan = k.s.ara; k.atisSayisi++;
      this.olaylar.push({ tip: 'ates', kurtulan: k, hedef });

      let h = k.s.hasar;
      if (k.ilk) { h *= 1 + k.s.ilkAtis; k.ilk = false; }
      if (hedef.tip.agir) h *= 1 + k.s.agir;
      if (hedef.tip.elit) h *= 1 + k.s.elitBonus;
      /* Marksman mesafe ödülü: menzilin eşiğinden UZAKTAKİ hedefe bonus. */
      if (k.s.uzakBonus && hd >= k.s.menzil * k.s.uzakEsik) h *= 1 + k.s.uzakBonus;
      if (k.s.dusum) h *= 1 - (1 - k.s.dusum) * Math.min(1, hd / k.s.menzil);
      this.vur(k, hedef, h);

      /* av tüfeği saçma yayılımı: birincil hedefin hemen ardındaki en fazla
         (adet-1) zombiye azaltılmış hasar. Koridor dizilimini ödüllendirir. */
      if (k.s.coklu) {
        const yakinlar = [];
        for (const z of canliZombi) {
          if (z === hedef || z.olu) continue;
          const d = k.z - z.z;
          if (d > hd && d <= hd + k.s.coklu.aralik) yakinlar.push({ z, d });
        }
        yakinlar.sort((a, b) => a.d - b.d);
        for (let n = 0; n < Math.min(k.s.coklu.adet - 1, yakinlar.length); n++)
          this.vur(k, yakinlar[n].z, h * k.s.coklu.oran);
      }

      /* sniper delici: menzildeki 2. hedefe azaltılmış hasar */
      if (k.s.delici) {
        let ikinci = null, id = Infinity;
        for (const z of canliZombi) {
          if (z === hedef || z.olu) continue;
          const d = k.z - z.z;
          if (d >= 0 && d <= k.s.menzil && d < id) { id = d; ikinci = z; }
        }
        if (ikinci) this.vur(k, ikinci, h * k.s.delici);
      }
    }

    /* ── zombiler ── */
    for (const z of canliZombi) {
      if (z.olu) continue;
      let hedef = null, hd = Infinity;
      for (const k of this.kurtulanlar) {
        if (k.olu) continue;
        const d = k.z - z.z;
        if (d < hd) { hd = d; hedef = k; }
      }
      if (!hedef) continue;
      z.hedef = hedef;
      if (hd > S.vurMesafe) {
        z.z += z.tip.hiz * S.dt;
        z.yuruyor = true;
      } else {
        z.yuruyor = false;
        z.vurZaman -= S.dt;
        if (z.vurZaman <= 0) {
          z.vurZaman = z.tip.vurAra;
          hedef.can -= z.hasar;
          this.alinanHasar += z.hasar;
          this.olaylar.push({ tip: 'saldiri', zombi: z, kurtulan: hedef });
          if (hedef.can <= 0 && !hedef.olu) {
            hedef.olu = true;
            this.olaylar.push({ tip: 'kurtulanOldu', kurtulan: hedef });
          }
        }
      }
    }
  }

  vur(k, z, h) {
    const etkin = Math.min(h, z.can);
    k.atilanHasar += h;
    k.israf += h - etkin;      /* overkill — sniper itirazının çekirdek ölçüsü */
    z.can -= h;
    this.olaylar.push({ tip: 'isabet', zombi: z, hasar: h, kurtulan: k });
    if (z.can <= 0 && !z.olu) {
      z.olu = true; k.kesim++;
      /* oran = öldüren vuruşun canına göre büyüklüğü. Görsel katman buna
         bakarak ağır/hafif ölüm klibi seçer; gameplay'e etkisi yoktur. */
      this.olaylar.push({ tip: 'olum', zombi: z, kurtulan: k, hasar: h,
                          oran: z.maxCan ? h / z.maxCan : 1 });
    }
  }

  ozet() {
    const kalanZombi = this.zombiler.filter(z => !z.olu).length +
                       (this.kuyruk.length - this.sonraki);
    const olen = this.kurtulanlar.filter(k => k.olu).length;
    const toplamCan = this.kurtulanlar.reduce((a, k) => a + Math.max(0, k.can), 0);
    return {
      basarili: kalanZombi === 0 && olen === 0,
      temizlendi: kalanZombi === 0,
      sure: this.t, kalanZombi, olen,
      canYuzde: toplamCan / (S.kurtulanCan * this.kurtulanlar.length),
      alinanHasar: this.alinanHasar,
      kurtulanlar: this.kurtulanlar.map(k => ({
        ad: k.ad, kesim: k.kesim, atilanHasar: k.atilanHasar, israf: k.israf,
        israfYuzde: k.atilanHasar ? k.israf / k.atilanHasar : 0,
        atisSayisi: k.atisSayisi, reloadSuresi: k.reloadSuresi,
        can: Math.max(0, k.can), olu: k.olu,
      })),
    };
  }
}

/** Ölçüm sarmalayıcısı: bölümü sonuna kadar koşturur, özeti döner. */
export function bolumKos(ayar) {
  const s = new Savas(ayar);
  const enFazla = Math.ceil((ayar.sure + (ayar.tolerans !== undefined ? ayar.tolerans : 90)) / S.dt);
  for (let i = 0; i < enFazla && !s.bitti; i++) { s.adim(); s.olaylar.length = 0; }
  return s.ozet();
}

export { S as SABIT };

/* ═══════ CHAPTER 1 EĞRİSİ ═══════ (DURUM: bölüm 1 = 10/30sn → 20 = 26/45sn) */
export function bolumDalgasi(no, tohum) {
  const r = rng(tohum * 7919 + no);
  const oran = (no - 1) / 19;
  const adet = Math.round(10 + 16 * oran);
  const sure = 30 + 15 * oran;
  const bossVar = no % 5 === 0;
  const dalga = [];
  let kalan = adet;
  if (bossVar) { dalga.push({ tur: 'boss', zaman: sure * 0.45 }); kalan -= 5; }
  /* koşucu bölüm 6'dan, tank bölüm 11'den itibaren girer */
  const kosucuPay = no >= 6 ? Math.min(0.35, (no - 5) * 0.035) : 0;
  const tankPay   = no >= 11 ? Math.min(0.20, (no - 10) * 0.025) : 0;
  for (let i = 0; i < kalan; i++) {
    const p = r();
    const tur = p < tankPay ? 'tank' : p < tankPay + kosucuPay ? 'kosucu' : 'yuruyen';
    dalga.push({ tur, zaman: (i / kalan) * sure * 0.85 + r() * 2 });
  }
  return { dalga, sure, adet, bossVar };
}

export function chapterKos(kadro, tohum) {
  const sonuc = [];
  for (let no = 1; no <= 20; no++) {
    const b = bolumDalgasi(no, tohum);
    sonuc.push(Object.assign({ no, bossVar: b.bossVar, adet: b.adet },
      bolumKos({ kadro, dalga: b.dalga, sure: b.sure, tohum: tohum * 131 + no })));
  }
  return sonuc;
}
