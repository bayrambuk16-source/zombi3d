/** Oyun katmanı — bölüm akışı, dalga kurulumu, kayıt, döngü.
 *
 *  Savaş kurallarını UYGULAMAZ: `denge/motor.mjs` içindeki `Savas` sınıfını
 *  çalıştırır. Simülatör de aynı sınıfı kullanır; böylece ölçülen denge ile
 *  oynanan denge ayrışamaz.
 */
import { Savas, ZOMBILER } from '../../denge/motor.mjs';
import { CHAPTER1, temaBul, kayitYukle, kayitYaz, silahAcilisiUygula,
         SILAH_SUNUM, KURTULANLAR } from './veri.js';
import { Sahne } from './sahne.js';
import { Arayuz } from './arayuz.js';
import { Ses } from './ses.js';

/* ═══ DALGA KURULUMU ═══
   Bölüm, aralarında nefes boşluğu olan 2-3 ATAKtan oluşur; her atak aynı
   anda doğan bir öbektir. Bu yapı ölçümle seçildi: zorluk ortalama debiyle
   ayarlanınca sistem kapasite eşiğinde ani çöküyordu (bkz. denge/RAPOR.md). */
function karisim(no) {
  const kosucuPay = no >= 6 ? Math.min(0.30, (no - 5) * 0.03) : 0;
  const tankPay   = no >= 11 ? Math.min(0.22, (no - 10) * 0.028) : 0;
  const liste = [];
  for (let i = 0; i < 24; i++) {
    const v = (i * 7) % 24 / 24;    /* deterministik serpiştirme */
    liste.push(v < tankPay ? 'tank' : v < tankPay + kosucuPay ? 'kosucu' : 'yuruyen');
  }
  return liste;
}

/* denge/kalibre.mjs içindeki dalgaKur ile BİREBİR aynı olmalı: oyun ölçülen
   dalganın aynısını kurmazsa kalibre edilen zorluk oynanışta tutmaz. */
function dalgaKur(t) {
  const kar = karisim(t.no);
  /* boss bölümünde yandaki adet küçülür — boss ~5 zombi eşdeğeri sayılır */
  const toplam = t.bossCan ? Math.max(3, Math.round(t.toplam * 0.55)) : t.toplam;
  const dalga = [];
  let i = 0;
  for (let a = 0; a < t.atak; a++) {
    const bu = Math.floor(toplam / t.atak) + (a < toplam % t.atak ? 1 : 0);
    const t0 = 2 + a * t.bosluk;
    for (let j = 0; j < bu; j++, i++)
      dalga.push({ tur: kar[i % kar.length], zaman: t0 + j * 0.25 });
  }
  if (t.bossCan) dalga.push({ tur: 'boss', can: t.bossCan, zaman: 3 });
  return dalga;
}

/* ═══ OYUN ═══ */
class Oyun {
  constructor() {
    this.kayit = kayitYukle();
    this.duraklatildi = false;
    this.mod = 'TAM OTOMATİK';
    this.savas = null;
  }

  async baslat() {
    const yuzde = document.getElementById('cubuk');
    const yazi = document.getElementById('yukYazi');
    this.sahne = new Sahne(document.getElementById('sahne'));
    await this.sahne.yukle((p, ad) => {
      yuzde.style.width = (p * 100) + '%';
      yazi.textContent = ad;
    });
    yazi.textContent = 'ses';
    this.ses = new Ses();
    await this.ses.yukle();
    yazi.textContent = 'ikonlar';
    this.ikon = this.sahne.ikonlariUret();

    this.ui = new Arayuz({
      silahSec: (i, s) => { this.kayit.kadro[i].silah = s; this.kadroUygula(); },
      buildSec: (i, b) => { this.kayit.kadro[i].build = b; this.kadroUygula(); },
      duraklat: (d) => { this.duraklatildi = d; },
      modDegis: () => this.modDegis(),
      ates: (basili) => { this.atesBasili = basili; },
      doldur: () => { this.doldurIstegi = 0.35; },
      yon: (d) => { this.elYon = d; },
      sesDegis: () => {
        this.ses.ac(!this.ses.acik);
        this.ui.sesYazi(this.ses.acik);
        if (this.ses.acik) this.ses.cal('tik');
      },
    });

    /* Hedef seçimi: savaş alanına dokunma. HUD ve panel üstündeki dokunuşlar
       buraya gelmez (pointer-events zaten onlarda). */
    this.sahne.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.mod === 'TAM OTOMATİK' || !this.savas) return;
      const id = this.sahne.dokunulanZombi(e.clientX, e.clientY, this.savas);
      this.hedefId = id || null;
    });
    this.ui.ikonlariAta(this.ikon);
    this.ui.kayit = this.kayit;
    this.ui.modYazi(this.mod);
    this.ui.kontrolModu(this.mod);
    this.ui.sesYazi(this.ses.acik);

    document.getElementById('yuk').remove();
    this.bolumBasla(this.kayit.bolum);
    this.dongu();

    /* test kancası — headless ölçüm bunu kullanır */
    window.OYUN = this;
  }

  modDegis() {
    const modlar = ['TAM OTOMATİK', 'YARI OTOMATİK', 'YARI MANUEL', 'MANUEL'];
    this.mod = modlar[(modlar.indexOf(this.mod) + 1) % modlar.length];
    this.ui.modYazi(this.mod);
    this.ui.kontrolModu(this.mod);
    this.hedefId = null;
    this.atesBasili = false;
    this.elYon = 0;
  }

  /** Kontrol modunu savaş motorunun emir kanalına çevirir.
   *  TAM OTOMATİK'te emir NULL kalır — motor ölçümdekiyle birebir aynı
   *  davranır, denge kaymaz. Kademeler DURUM'daki sıraya uyar:
   *  hedef → ateş/reload → pozisyon. */
  emriKur(dt) {
    if (this.mod === 'TAM OTOMATİK') { this.savas.emir = null; return; }
    if (this.doldurIstegi > 0) this.doldurIstegi -= dt;
    const manuel = this.mod === 'MANUEL';
    this.savas.emir = {
      hedefId: this.hedefId,
      elleAtes: manuel,
      atesSerbest: !!this.atesBasili,
      elleReload: manuel || this.mod === 'YARI MANUEL',
      reloadIstegi: this.doldurIstegi > 0,
      elleHareket: manuel,
      yon: this.elYon || 0,
    };
  }

  /** Çantada silah/build değişince savaşı bozmadan kadroyu yeniler.
   *  Bölüm ortasında değişiklik olursa yalnız bir sonraki bölümde geçerlidir —
   *  DURUM kuralı: "silah değişimi bölüm başında". */
  kadroUygula() {
    kayitYaz(this.kayit);
    this.ui.kayit = this.kayit;
    this.ui.cantaRozeti(this.kayit);
  }

  bolumBasla(no) {
    const t = CHAPTER1[Math.min(no, CHAPTER1.length) - 1];
    this.bolum = no;
    this.tema = temaBul(no);
    this.savas = new Savas({
      kadro: this.kayit.kadro.map(k => ({ silah: k.silah, build: k.build })),
      dalga: dalgaKur(t),
      sure: t.sure,
      tolerans: 45,
      tohum: no * 7919 + 13,
    });
    this.sahne.bolumKur(this.savas, no);
    this.ui.kadroKur(this.savas);
    this.ui.cantaRozeti(this.kayit);
    this.bittiIslendi = false;
  }

  bolumBitti() {
    const o = this.savas.ozet();
    const basarili = o.temizlendi && o.olen < 4;
    const satirlar = [];
    satirlar.push('Kesim: <b>' + o.kurtulanlar.reduce((a, k) => a + k.kesim, 0) + '</b>' +
                  '  ·  Kalan can: <b>' + Math.round(o.canYuzde * 100) + '%</b>');
    if (o.olen > 0) satirlar.push('<span class="uyari">Kayıp: ' + o.olen + ' kurtulan</span>');

    if (basarili) {
      const sonraki = this.bolum + 1;
      if (this.bolum % 5 === 0) {
        this.kayit.checkpoint = this.bolum + 1;
        satirlar.push('<span class="iyi">CHECKPOINT — bölüm ' + (this.bolum + 1) + '</span>');
      }
      const acilan = silahAcilisiUygula(this.kayit, sonraki);
      for (const a of acilan)
        satirlar.push('<span class="iyi">YENİ SİLAH: ' + SILAH_SUNUM[a].sinif +
                      ' — ' + a + '</span>');
      this.kayit.bolum = Math.min(sonraki, CHAPTER1.length);
      kayitYaz(this.kayit);
      this.ui.kayit = this.kayit;

      if (sonraki > CHAPTER1.length) {
        this.ui.perdeGoster('CHAPTER 1 TAMAM', satirlar, 'BAŞA DÖN', null,
          () => { this.kayit.bolum = 1; kayitYaz(this.kayit); this.bolumBasla(1); });
      } else {
        /* DURUM kuralı: NEXT butonu; basılmazsa 30 sn sonra otomatik başlar */
        this.ui.perdeGoster('BÖLÜM 1-' + this.bolum + ' TEMİZ', satirlar, 'DEVAM',
          30, () => this.bolumBasla(this.kayit.bolum));
      }
    } else {
      /* checkpoint'e dön — 1.9'da ölen 1.6'ya döner */
      const geri = this.kayit.checkpoint;
      satirlar.push('<span class="uyari">Hat düştü. Bölüm ' + geri + '\'ya dönülüyor.</span>');
      this.kayit.bolum = geri;
      kayitYaz(this.kayit);
      this.ui.perdeGoster('HAT DÜŞTÜ', satirlar, 'TEKRAR DENE', null,
        () => this.bolumBasla(geri));
    }
  }

  dongu() {
    requestAnimationFrame(() => this.dongu());
    /* Ses, sahneden ÖNCE okur: sahne olay kuyruğunu boşaltıyor. */
    if (this.savas) this.ses.olaylar(this.savas.olaylar);
    const dt = this.sahne.ciz(this.savas);
    if (!this.duraklatildi && this.savas && !this.savas.bitti) {
      this.emriKur(dt);
      /* Halka her karede güncellenir: koşulsuz çağrılmazsa tam otomatiğe
         geçildiğinde eski işaret ekranda asılı kalıyor. */
      if (!this.sahne.hedefIsaretle(this.savas, this.hedefId, dt)) this.hedefId = null;
      this.savas.ilerlet(dt);
      this.ui.guncelle(this.savas, this.bolum, this.tema, this.savas.t);
    } else if (this.savas && this.savas.bitti && !this.bittiIslendi) {
      this.bittiIslendi = true;
      this.ui.guncelle(this.savas, this.bolum, this.tema, this.savas.t);
      setTimeout(() => this.bolumBitti(), 900);
    }
  }
}

new Oyun().baslat().catch(e => {
  const y = document.getElementById('yuk');
  if (y) y.innerHTML = '<div style="color:#e88;padding:24px;text-align:center">' +
                       'Yükleme hatası:<br>' + e.message + '</div>';
  console.error(e);
});
