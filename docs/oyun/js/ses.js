/** Ses katmanı — WebAudio, havuzsuz ama kısıtlı.
 *
 *  Tasarım kısıtları:
 *   - Tarayıcı otomatik oynatmayı engeller; AudioContext ilk dokunuşta açılır.
 *   - Aynı anda 20-40 zombi var; her isabette ses çalmak kulak tırmalıyor.
 *     Bu yüzden her ses türünün kendi asgari aralığı (kısma) vardır.
 *   - Ses yüklenemezse oyun ÇALIŞMAYA DEVAM EDER; ses hiçbir zaman
 *     savaşı bloke etmez.
 *
 *  Kaynaklar: Kenney CC0 (impact/interface/rpg) + Pixabay gunshot.
 */
const KAYNAK = {
  ates:    { yol: '../ses/oyun/ates.mp3',    ses: 0.22, kisma: 0.045, perde: 0.14 },
  isabet:  { yol: '../ses/oyun/isabet.ogg',  ses: 0.30, kisma: 0.07,  perde: 0.20 },
  olum:    { yol: '../ses/oyun/olum.ogg',    ses: 0.38, kisma: 0.10,  perde: 0.18 },
  saldiri: { yol: '../ses/oyun/saldiri.ogg', ses: 0.45, kisma: 0.12,  perde: 0.15 },
  reload:  { yol: '../ses/oyun/reload.ogg',  ses: 0.35, kisma: 0.05,  perde: 0.10 },
  tik:     { yol: '../ses/oyun/tik.ogg',     ses: 0.40, kisma: 0.02,  perde: 0.05 },
};

export class Ses {
  constructor() {
    this.acik = true;
    this.tampon = {};
    this.sonCalma = {};
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
      await Promise.all(Object.entries(KAYNAK).map(async ([ad, k]) => {
        try {
          const c = await fetch(k.yol);
          if (!c.ok) return;
          this.tampon[ad] = await this.ctx.decodeAudioData(await c.arrayBuffer());
        } catch (e) { /* tek ses düşerse diğerleri çalışsın */ }
      }));
      /* Kurulumdan sonra bir kez dene: kullanıcı yükleme sırasında
         dokunmuşsa context burada açılır. */
      this.coz();
    } catch (e) { this.ctx = null; }
  }

  /** Kısma: aynı sesin arka arkaya yığılmasını engeller. */
  cal(ad, gucOrani) {
    if (!this.acik || !this.ctx || !this.tampon[ad]) return;
    const k = KAYNAK[ad];
    const simdi = this.ctx.currentTime;
    if (this.sonCalma[ad] && simdi - this.sonCalma[ad] < k.kisma) return;
    this.sonCalma[ad] = simdi;
    const kaynak = this.ctx.createBufferSource();
    kaynak.buffer = this.tampon[ad];
    /* Perde sapması: aynı örneğin tekrarı mekanik duyulmasın. */
    kaynak.playbackRate.value = 1 + (Math.random() * 2 - 1) * k.perde;
    const g = this.ctx.createGain();
    g.gain.value = k.ses * (gucOrani === undefined ? 1 : gucOrani);
    kaynak.connect(g); g.connect(this.ana);
    kaynak.start();
  }

  /** Savaş olay kuyruğunu sese çevirir. Kuyruğu TÜKETMEZ — sahne de okur. */
  olaylar(liste) {
    for (const o of liste) {
      if (o.tip === 'ates') this.cal('ates');
      else if (o.tip === 'isabet') this.cal('isabet', 0.8);
      else if (o.tip === 'olum') this.cal('olum');
      else if (o.tip === 'saldiri') this.cal('saldiri');
      else if (o.tip === 'reload') this.cal('reload');
    }
  }

  ac(durum) { this.acik = durum; }
}
