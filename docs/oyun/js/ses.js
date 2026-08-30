/** Ses katmanı — WebAudio.
 *
 *  Tasarım kısıtları:
 *   - Tarayıcı otomatik oynatmayı engeller; AudioContext ilk dokunuşta açılır.
 *   - Aynı anda 20-40 zombi var. İki ayrı fren gerekir:
 *       (1) KISMA — her grubun kendi asgari aralığı; aynı ses üst üste binmez.
 *       (2) SES TAVANI — toplam eşzamanlı kaynak sayısı sınırlı; kalabalık
 *           bölümlerde ses çamura dönmesin ve mobil CPU boğulmasın.
 *   - Her grup birden çok VARYANT taşıyabilir. Tek örneğin tekrarı, perde
 *     sapmasına rağmen mekanik duyuluyor; havuzdan rastgele seçim bunu kırar.
 *   - Ses yüklenemezse oyun ÇALIŞMAYA DEVAM EDER; ses savaşı asla bloke etmez.
 *
 *  Kaynaklar (hepsi CC0, künye TEDARIK.md):
 *   - silah ateşi: The Free Firearm Sound Library, near-distance kayıtlar
 *   - reload: gun-reload-sounds + handgun-reload
 *   - zombi: artisticdude (homurtu) · arcadeparty (acı/ölüm) · rubberduck
 *     (tank homurtusu, boss kükremesi)
 *   - isabet/saldırı/tık: Kenney CC0
 *  Klipler `arac/ses-hazirla.mjs` ile ham kayıtlardan üretilir.
 */

const YOL = '../ses/oyun/';

/** Eşzamanlı çalan kaynak tavanı. 14, dört kurtulanın ateşi + birkaç
 *  isabet + bir ölüm sesinin aynı anda geçmesine izin verir; ötesi
 *  zaten ayırt edilmiyor. */
const AZAMI_SES = 14;

/** İsabette zombinin ses çıkarma olasılığı. Yalnız kısmaya bırakılırsa
 *  inleme saat gibi düzenli gelir ve mekanik duyulur. */
const ACI_SANS = 0.5;

/* Gruplar. `ses` temel yükseklik, `kisma` asgari aralık (sn), `perde`
   rastgele perde sapması. Zombi vokallerinin kısması bilinçle yüksek:
   homurtu bir ORTAM sesidir, her doğumda çalarsa uğultuya döner. */
const GRUP = {
  ates:    { ses: 0.20, kisma: 0.030, perde: 0.10 },
  reload:  { ses: 0.32, kisma: 0.050, perde: 0.06 },
  isabet:  { ses: 0.24, kisma: 0.060, perde: 0.18 },
  saldiri: { ses: 0.42, kisma: 0.120, perde: 0.15 },
  tik:     { ses: 0.40, kisma: 0.020, perde: 0.05 },
  /* aci: ilk ölçümde 50 sn'de 89 kez çaldı — saniyede 1,8, yani neredeyse
     her mermi isabetinde. İnleme bir VURGU olmalı, sürekli bir uğultu değil.
     Kısma 0,9 sn tavanı saniyede 1'e indirir, ACI_SANS onu ~yarıya çeker;
     ikisi birlikte ~0,4/sn veriyor. Metronom gibi düzenli de olmuyor. */
  aci:     { ses: 0.26, kisma: 0.900, perde: 0.14 },
  olum:    { ses: 0.32, kisma: 0.180, perde: 0.12 },
  homurtu: { ses: 0.16, kisma: 0.900, perde: 0.20 },
  agir:    { ses: 0.40, kisma: 0.500, perde: 0.10 },
  boss:    { ses: 0.55, kisma: 1.200, perde: 0.06 },
};

/* Grup → varyant dosyaları. Çalınırken havuzdan rastgele biri seçilir. */
const HAVUZ = {
  isabet:  ['isabet.ogg'],
  saldiri: ['saldiri.ogg'],
  tik:     ['tik.ogg'],
  aci:     ['zombi/aci-1.wav', 'zombi/aci-2.wav', 'zombi/aci-3.wav'],
  olum:    ['zombi/olum-1.wav', 'zombi/olum-2.wav', 'zombi/olum-3.wav'],
  homurtu: ['zombi/homurtu-1.wav', 'zombi/homurtu-2.wav',
            'zombi/homurtu-3.wav', 'zombi/homurtu-4.wav'],
  agir:    ['zombi/agir-1.ogg', 'zombi/agir-2.ogg'],
  boss:    ['zombi/boss-1.ogg', 'zombi/boss-2.ogg'],
};

/** Silah → ateş klibi. Anahtarlar `denge/motor.mjs` SILAHLAR anahtarlarıdır;
 *  eşleme gerçek silahın sınıfına ve kalibresine göre yapıldı. */
export const ATES_KLIBI = {
  revolver:    'silah/revolver.wav',      /* Smith & Wesson 642, .38 */
  agirTabanca: 'silah/agir-tabanca.wav',  /* 1911, .45 */
  smg:         'silah/smg.wav',           /* Carl Gustav M45, 9mm */
  saldiri:     'silah/saldiri.wav',       /* AK-47, 7.62x39 */
  avTufegi:    'silah/av-tufegi.wav',     /* Winchester Model 12, 12 gauge */
  lmg:         'silah/lmg.wav',           /* PPSh, 7.62x25 */
  sniper:      'silah/sniper.wav',        /* Mosin Nagant, 7.62x54 */
};

/** Silah → reload klibi. Silah başına ayrı reload sesi gereksiz: kulak
 *  mekanizma sınıfını ayırt eder, markayı değil. */
export const RELOAD_KLIBI = {
  revolver: 'reload/tabanca.wav', agirTabanca: 'reload/tabanca.wav',
  avTufegi: 'reload/pompali.wav',
  smg: 'reload/tufek.wav', saldiri: 'reload/tufek.wav',
  lmg: 'reload/tufek.wav', sniper: 'reload/tufek.wav',
};

/** Zombi türü → ölüm/doğum sesi. Tank ve boss ayrı gövde taşır;
 *  diğerleri varsayılan havuza düşer. */
const TUR_OLUM  = { tank: 'agir', boss: 'boss' };
const TUR_DOGUM = { tank: 'agir', boss: 'boss' };

/** Yüklenecek her dosya: havuzlar + silah klipleri. */
export function tumYollar() {
  const s = new Set();
  for (const liste of Object.values(HAVUZ)) for (const y of liste) s.add(y);
  for (const y of Object.values(ATES_KLIBI)) s.add(y);
  for (const y of Object.values(RELOAD_KLIBI)) s.add(y);
  return [...s];
}

export class Ses {
  constructor() {
    this.acik = true;
    this.tampon = {};          /* dosya yolu → AudioBuffer */
    this.sonCalma = {};        /* grup adı → son çalma zamanı */
    this.aktif = 0;            /* o an çalan kaynak sayısı */
    this.ctx = null;
    /* Otomatik oynatma kilidi. Dinleyici, context GERÇEKTEN çalışana kadar
       kalkmaz: yükleme sırasındaki bir dokunuş tek şansı harcamasın. */
    this.olaylarBagli = ['pointerdown', 'touchstart', 'keydown'];
    this.coz = () => {
      if (!this.ctx) return;                  /* henüz kurulmadı, dinlemeye devam */
      if (this.ctx.state === 'running') { this.kilidiBirak(); return; }
      this.ctx.resume().then(() => {
        if (this.ctx.state === 'running') this.kilidiBirak();
      }).catch(() => {});
    };
    for (const o of this.olaylarBagli) addEventListener(o, this.coz);
  }

  kilidiBirak() {
    for (const o of this.olaylarBagli) removeEventListener(o, this.coz);
  }

  /** Ses gerçekten çalabiliyor mu? Test ve teşhis bunu okur. */
  durum() {
    return {
      ctx: this.ctx ? this.ctx.state : 'yok',
      klip: Object.keys(this.tampon).length,
      beklenen: tumYollar().length,
      aktif: this.aktif,
      acik: this.acik,
    };
  }

  async yukle() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.ana = this.ctx.createGain();
      this.ana.gain.value = 0.9;
      this.ana.connect(this.ctx.destination);
      await Promise.all(tumYollar().map(async (y) => {
        try {
          const c = await fetch(YOL + y);
          if (!c.ok) return;
          this.tampon[y] = await this.ctx.decodeAudioData(await c.arrayBuffer());
        } catch (e) { /* tek ses düşerse diğerleri çalışsın */ }
      }));
      /* Kurulumdan sonra bir kez dene: kullanıcı yükleme sırasında
         dokunmuşsa context burada açılır. */
      this.coz();
    } catch (e) { this.ctx = null; }
  }

  /** Bir grubu çalar. `dosya` verilirse o klip, verilmezse grubun
   *  havuzundan rastgele bir varyant kullanılır. */
  cal(grupAd, dosya, gucOrani) {
    if (!this.acik || !this.ctx) return false;
    const g = GRUP[grupAd];
    if (!g) return false;

    const simdi = this.ctx.currentTime;
    if (this.sonCalma[grupAd] !== undefined && simdi - this.sonCalma[grupAd] < g.kisma) return false;

    let yol = dosya;
    if (!yol) {
      const havuz = HAVUZ[grupAd];
      if (!havuz || !havuz.length) return false;
      yol = havuz[(Math.random() * havuz.length) | 0];
    }
    const tampon = this.tampon[yol];
    if (!tampon) return false;
    /* Tavan kontrolü kısmadan SONRA: tavan dolu olduğu için çalınmayan bir
       ses grubun sırasını harcamasın, bir sonraki olayda yeniden denesin. */
    if (this.aktif >= AZAMI_SES) return false;

    this.sonCalma[grupAd] = simdi;
    this.aktif++;
    const kaynak = this.ctx.createBufferSource();
    kaynak.buffer = tampon;
    /* Perde sapması: aynı örneğin tekrarı mekanik duyulmasın. */
    kaynak.playbackRate.value = 1 + (Math.random() * 2 - 1) * g.perde;
    const gain = this.ctx.createGain();
    gain.gain.value = g.ses * (gucOrani === undefined ? 1 : gucOrani);
    kaynak.connect(gain); gain.connect(this.ana);
    kaynak.onended = () => { this.aktif = Math.max(0, this.aktif - 1); };
    kaynak.start();
    return true;
  }

  /** Savaş olay kuyruğunu sese çevirir. Kuyruğu TÜKETMEZ — sahne de okur. */
  olaylar(liste) {
    for (const o of liste) {
      const silah = o.kurtulan && o.kurtulan.silahAd;
      const tur = o.zombi && o.zombi.tur;

      if (o.tip === 'ates') {
        this.cal('ates', ATES_KLIBI[silah]);
      } else if (o.tip === 'reload') {
        this.cal('reload', RELOAD_KLIBI[silah]);
      } else if (o.tip === 'isabet') {
        /* Mermi darbesi her isabette; zombinin sesi ayrı ve çok daha
           seyrek — yoksa her vuruşta inleme duyulur. */
        this.cal('isabet', null, 0.8);
        if (Math.random() < ACI_SANS) this.cal('aci');
      } else if (o.tip === 'olum') {
        this.cal(TUR_OLUM[tur] || 'olum');
      } else if (o.tip === 'dogum') {
        /* Yürüyen/koşucu doğumu ortam homurtusu; tank ve boss kendi
           gövdesiyle duyurulur. Kısma sayesinde seyrek kalır. */
        this.cal(TUR_DOGUM[tur] || 'homurtu');
      } else if (o.tip === 'saldiri') {
        this.cal('saldiri');
      }
    }
  }

  ac(durum) { this.acik = durum; }
}
