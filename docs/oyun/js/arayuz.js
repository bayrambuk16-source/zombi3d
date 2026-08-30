/** HUD ve envanter — saf DOM. Savaş durumunu OKUR, hiçbir şeyi değiştirmez.
 *  Değişiklikler geri çağrılarla (`geri`) oyun katmanına bildirilir.
 *
 *  Sanat yönü The Division Mobile'dan: koyu zemin, kehribar vurgu, köşeli
 *  paneller, nadirlik renk şeridi, sayıların okunur olduğu sıkı ızgara.
 */
import { IKON } from './ikon.js';
import { SILAH_SUNUM, BUILD_SUNUM, NADIRLIK, KURTULANLAR, SILAHLAR, BUILDLER,
         silahKunye, silahAdi } from './veri.js';

const el = (etiket, sinif, icerik) => {
  const d = document.createElement(etiket);
  if (sinif) d.className = sinif;
  if (icerik !== undefined) d.innerHTML = icerik;
  return d;
};

export class Arayuz {
  constructor(geri) {
    this.geri = geri;              /* { silahSec, buildSec, sonraki, modDegis } */
    this.ikon = {};
    this.secili = 0;               /* envanterde seçili kurtulan */
    this.d = {
      ust:    document.getElementById('ust'),
      kadro:  document.getElementById('kadro'),
      canta:  document.getElementById('canta'),
      perde:  document.getElementById('perde'),
      dalga:  document.getElementById('dalgaCubuk'),
      bilgi:  document.getElementById('bolumBilgi'),
      tema:   document.getElementById('temaAd'),
      bossDis:   document.getElementById('bossDis'),
      bossCubuk: document.getElementById('bossCubuk'),
      bossAd:    document.getElementById('bossAd'),
      sayac:  document.getElementById('sayac'),
      mod:    document.getElementById('btnMod'),
    };
    const btnCanta = document.getElementById('btnCanta');
    btnCanta.innerHTML = IKON['savas/canta'];
    btnCanta.onclick = () => this.cantaAc();
    document.getElementById('btnKapat').onclick = () => this.cantaKapat();
    this.d.mod.onclick = () => this.geri.modDegis();
    this.d.ses = document.getElementById('btnSes');
    this.d.ses.onclick = () => this.geri.sesDegis();
    this.kartlar = [];
    this._kontrolKur();
  }

  /** Manuel kontrol kümesi. Tetik BASILI TUTMA ile çalışır: tek tek dokunma
   *  silahın kendi atış aralığıyla çakışıp oynanışı kekeletiyordu. */
  _kontrolKur() {
    const k = document.getElementById('kontrol');
    const kSol = document.getElementById('kontrolSol');
    const ates = document.getElementById('btnAtes');
    const bas = (e) => { e.preventDefault(); this.geri.ates(true); ates.classList.add('basili'); };
    const birak = (e) => { e.preventDefault(); this.geri.ates(false); ates.classList.remove('basili'); };
    ates.addEventListener('pointerdown', bas);
    ates.addEventListener('pointerup', birak);
    ates.addEventListener('pointercancel', birak);
    ates.addEventListener('pointerleave', birak);
    document.getElementById('btnDoldur').onclick = () => this.geri.doldur();
    const yon = (d) => (e) => { e.preventDefault(); this.geri.yon(d); };
    for (const [kimlik, d] of [['btnIleri', -1], ['btnGeri', 1]]) {
      const b = document.getElementById(kimlik);
      b.addEventListener('pointerdown', yon(d));
      b.addEventListener('pointerup', yon(0));
      b.addEventListener('pointercancel', yon(0));
      b.addEventListener('pointerleave', yon(0));
    }
    this.dKontrol = k;
    this.dKontrolSol = kSol;
  }

  /** Moda göre hangi düğmelerin açık olduğunu ayarlar. */
  kontrolModu(mod) {
    const elle = mod !== 'TAM OTOMATİK';
    /* Hareket kümesi yalnız MANUEL'de anlamlı; diğer modlarda pozisyonu AI
       verdiği için sol küme hiç gösterilmez, savaş alanı açık kalır. */
    this.dKontrol.classList.toggle('acik', elle);
    this.dKontrolSol.classList.toggle('acik', mod === 'MANUEL');
    document.getElementById('btnAtes').disabled = mod !== 'MANUEL';
    document.getElementById('btnIleri').disabled = mod !== 'MANUEL';
    document.getElementById('btnGeri').disabled = mod !== 'MANUEL';
    document.getElementById('btnDoldur').disabled =
      mod !== 'MANUEL' && mod !== 'YARI MANUEL';
  }

  ikonlariAta(ikon) { this.ikon = ikon; }

  /** Kuşanılmamış açık silah varsa çanta düğmesine rozet koyar. */
  cantaRozeti(kayit) {
    const takili = new Set(kayit.kadro.map(k => k.silah));
    const bekleyen = kayit.acikSilahlar.some(a => !takili.has(a));
    document.getElementById('btnCanta').classList.toggle('rozet', bekleyen);
  }

  /* ═══ HUD ═══ */
  kadroKur(savas) {
    this.d.kadro.innerHTML = '';
    this.kartlar = savas.kurtulanlar.map((k, i) => {
      const s = SILAH_SUNUM[k.silahAd], b = BUILD_SUNUM[k.buildAd];
      const kart = el('div', 'kart');
      kart.style.setProperty('--nadir', NADIRLIK[s.nadirlik].renk);
      kart.innerHTML =
        '<div class="kartUst">' +
          '<span class="ad">' + KURTULANLAR[i].ad + '</span>' +
          '<span class="build" style="color:' + b.renk + '">' + b.simge + '</span>' +
        '</div>' +
        '<div class="ikonKutu"><img class="ikon" alt=""></div>' +
        '<div class="can"><i></i></div>' +
        '<div class="mermiYazi"></div>';
      this.d.kadro.appendChild(kart);
      return {
        kok: kart,
        ikon: kart.querySelector('.ikon'),
        ikonKutu: kart.querySelector('.ikonKutu'),
        can: kart.querySelector('.can i'),
        mermiYazi: kart.querySelector('.mermiYazi'),
      };
    });
    this.ikonYenile(savas);
  }

  ikonYenile(savas) {
    savas.kurtulanlar.forEach((k, i) => {
      const kt = this.kartlar[i];
      if (kt && this.ikon[k.silahAd]) kt.ikon.src = this.ikon[k.silahAd];
    });
  }

  guncelle(savas, bolum, tema, gecen) {
    savas.kurtulanlar.forEach((k, i) => {
      const kt = this.kartlar[i];
      if (!kt) return;
      const canO = Math.max(0, k.can / k.maxCan);
      kt.can.style.width = (canO * 100) + '%';
      kt.can.style.background = canO > 0.5 ? '#57c15a' : canO > 0.22 ? '#e0a12a' : '#e0563a';
      kt.kok.classList.toggle('olu', k.olu);
      if (k.reloadKalan > 0) {
        /* Dairesel gösterge ikonun üstünde: kartın altındaki küçük yazı
           çevresel görüşle okunmuyordu. */
        kt.kok.style.setProperty('--p', (1 - k.reloadKalan / k.s.reload).toFixed(3));
        kt.mermiYazi.textContent = '0 / ' + k.s.sarjor;
        kt.kok.classList.add('reload');
      } else {
        kt.mermiYazi.textContent = k.mermi + ' / ' + k.s.sarjor;
        kt.kok.classList.remove('reload');
      }
    });

    const toplam = savas.kuyruk.length;
    const kalan = savas.zombiler.filter(z => !z.olu).length + (toplam - savas.sonraki);
    this.d.dalga.style.width = ((1 - kalan / Math.max(1, toplam)) * 100) + '%';
    this.d.bilgi.textContent = 'BÖLÜM 1-' + bolum + (bolum % 5 === 0 ? '  ★ BOSS' : '');
    this.d.tema.textContent = tema.ad.toUpperCase() + '  ·  KALAN ' + kalan;

    /* BOSS CAN BARI — yalnız sahnede canlı boss varken.
       Boss bölümünde tek işaret başlıktaki "★ BOSS" yazısıydı ve savaş
       sırasında kimse başlığa bakmıyor: boss'un ne kadar kaldığı hiç
       okunmuyordu. Bar boss SAHNEYE GİRİNCE açılır, ölünce kapanır —
       bölüm numarasına bağlamak boss daha gelmeden bar göstermek olurdu. */
    const boss = savas.zombiler.find(z => z.tur === 'boss' && !z.olu);
    if (boss && this.d.bossDis) {
      this.d.bossDis.classList.add('acik');
      this.d.bossAd.classList.add('acik');
      this.d.bossCubuk.style.width =
        Math.max(0, Math.min(1, boss.can / Math.max(1, boss.maxCan))) * 100 + '%';
    } else if (this.d.bossDis) {
      this.d.bossDis.classList.remove('acik');
      this.d.bossAd.classList.remove('acik');
    }
  }

  /* Mod rozeti: halka + kısa ad.
   *
   * Halka dört dilime bölünmüştür ve dilimler sırayla hedef · ateş · reload ·
   * pozisyon. DOLU dilim = kontrol OYUNCUDA. Böylece rozet modun adını değil
   * NE KADARININ SENDE olduğunu söylüyor; DURUM.md §11'deki kademelenme
   * doğrudan görselleşiyor.
   *
   * Metin KALDIRILMADI, bilerek: tam otomatik (0 dolu) ile yarı otomatik
   * (1 dolu) tek başına 20 px'te ayrışmıyor. Halka hızlı okuma, metin kesin
   * okuma. Tam ad hâlâ yok — savaş alanında fazla yer kaplıyordu. */
  modYazi(mod) {
    const t = ({
      'TAM OTOMATİK': ['OTO', 'mod-1-tam-otomatik'],
      'YARI OTOMATİK': ['Y-OTO', 'mod-2-yari-otomatik'],
      'YARI MANUEL': ['Y-MAN', 'mod-3-yari-manuel'],
      'MANUEL': ['MANUEL', 'mod-4-manuel'],
    })[mod];
    if (!t) { this.d.mod.textContent = mod; return; }
    this.d.mod.innerHTML = IKON['savas/' + t[1]] + '<span>' + t[0] + '</span>';
    this.d.mod.title = mod;
  }
  sesYazi(acik) { this.d.ses.textContent = acik ? 'SES AÇIK' : 'SES KAPALI'; }

  /* ═══ Bölüm sonu perdesi ═══ */
  perdeGoster(baslik, satirlar, dugmeAd, gerisayim, tiklama) {
    const p = this.d.perde;
    p.innerHTML = '';
    p.classList.add('acik');
    const kutu = el('div', 'perdeKutu');
    kutu.appendChild(el('h2', null, baslik));
    for (const s of satirlar) kutu.appendChild(el('p', null, s));
    const btn = el('button', 'birincil', dugmeAd);
    btn.onclick = () => { this.perdeKapat(); tiklama(); };
    kutu.appendChild(btn);
    const sy = el('div', 'gerisayim');
    kutu.appendChild(sy);
    p.appendChild(kutu);
    if (gerisayim) {
      let kalan = gerisayim;
      sy.textContent = kalan + ' sn sonra otomatik başlar';
      clearInterval(this._sayacId);
      this._sayacId = setInterval(() => {
        kalan--;
        if (kalan <= 0) { clearInterval(this._sayacId); btn.click(); return; }
        sy.textContent = kalan + ' sn sonra otomatik başlar';
      }, 1000);
    }
  }

  perdeKapat() {
    clearInterval(this._sayacId);
    this.d.perde.classList.remove('acik');
  }

  /* ═══ ENVANTER ═══ */
  cantaAc(kayit) {
    if (kayit) this.kayit = kayit;
    this.d.canta.classList.add('acik');
    this.cantaCiz();
    this.geri.duraklat(true);
  }

  cantaKapat() {
    this.d.canta.classList.remove('acik');
    this.geri.duraklat(false);
  }

  cantaCiz() {
    const k = this.kayit;
    if (!k) return;
    const sol = document.getElementById('cantaSol');
    const sag = document.getElementById('cantaSag');
    const alt = document.getElementById('cantaAlt');
    sol.innerHTML = '';
    sag.innerHTML = '';

    /* sol: dört kurtulan yuvası */
    k.kadro.forEach((y, i) => {
      const s = SILAH_SUNUM[y.silah], b = BUILD_SUNUM[y.build];
      const yuva = el('div', 'yuva' + (i === this.secili ? ' secili' : ''));
      yuva.style.setProperty('--nadir', NADIRLIK[s.nadirlik].renk);
      yuva.innerHTML =
        '<div class="yuvaAd">' + KURTULANLAR[i].ad + '</div>' +
        '<img src="' + (this.ikon[y.silah] || '') + '" alt="">' +
        '<div class="yuvaBuild" style="color:' + b.renk + '">' + b.simge + '</div>';
      yuva.onclick = () => { this.secili = i; this.cantaCiz(); };
      sol.appendChild(yuva);
    });

    /* sağ: silah ızgarası */
    for (const [anahtar, s] of Object.entries(SILAH_SUNUM)) {
      const acik = k.acikSilahlar.includes(anahtar);
      const takili = k.kadro[this.secili].silah === anahtar;
      const h = el('div', 'esya' + (acik ? '' : ' kilitli') + (takili ? ' takili' : ''));
      h.style.setProperty('--nadir', NADIRLIK[s.nadirlik].renk);
      h.innerHTML =
        '<img src="' + (this.ikon[anahtar] || '') + '" alt="">' +
        '<div class="esyaAd">' + silahAdi(anahtar) + '</div>' +
        '<div class="esyaSinif">' + s.sinif + '</div>' +
        (acik ? '' : '<div class="kilit">BÖLÜM ' + s.acilis + '</div>');
      h.onclick = () => {
        if (!acik) return;
        this.geri.silahSec(this.secili, anahtar);
        this.cantaCiz();
      };
      h.onmouseenter = () => this.detay(anahtar);
      sag.appendChild(h);
    }

    /* alt: build seçici + karşılaştırma */
    const y = k.kadro[this.secili];
    alt.innerHTML = '<div class="buildSatir"></div><div class="detay"></div>';
    const bs = alt.querySelector('.buildSatir');
    for (const [anahtar, b] of Object.entries(BUILD_SUNUM)) {
      const d = el('button', 'buildBtn' + (y.build === anahtar ? ' secili' : ''),
        '<span class="build" style="color:' + b.renk + '">' + b.simge + '</span> ' + b.ad);
      d.onclick = () => { this.geri.buildSec(this.secili, anahtar); this.cantaCiz(); };
      bs.appendChild(d);
    }
    this.detay(y.silah);
  }

  /** Seçili kurtulanın mevcut silahı ile gösterilen silahı karşılaştırır. */
  detay(silahAd) {
    const kutu = document.querySelector('#cantaAlt .detay');
    if (!kutu || !this.kayit) return;
    const y = this.kayit.kadro[this.secili];
    const a = silahKunye(y.silah, y.build);
    const b = silahKunye(silahAd, y.build);
    const s = SILAH_SUNUM[silahAd];
    const satir = (ad, x, z, birim, tersIyi, ondalik) => {
      const fark = z - x;
      const iyi = tersIyi ? fark < 0 : fark > 0;
      const ok = Math.abs(fark) < 0.001 ? '' :
        '<span class="' + (iyi ? 'arti' : 'eksi') + '">' +
        (fark > 0 ? '▲ +' : '▼ ') + fark.toFixed(fark % 1 ? 2 : 0) + '</span>';
      const bas = ondalik === undefined ? (z % 1 ? 2 : 0) : ondalik;
      return '<div class="dSatir"><span>' + ad + '</span>' +
             '<b>' + z.toFixed(bas) + birim + '</b>' + ok + '</div>';
    };
    kutu.innerHTML =
      '<div class="dBaslik" style="color:' + NADIRLIK[s.nadirlik].renk + '">' +
        silahAdi(silahAd) + ' · ' + NADIRLIK[s.nadirlik].ad + '</div>' +
      satir('Sürekli DPS', a.dps, b.dps, '', false, 0) +
      satir('Hasar', a.hasar, b.hasar, '', false, 0) +
      satir('Atış aralığı', a.ara, b.ara, ' sn', true) +
      satir('Şarjör', a.sarjor, b.sarjor, '') +
      satir('Reload', a.reload, b.reload, ' sn', true) +
      satir('Menzil', a.menzil, b.menzil, ' m', false, 1) +
      (b.agirCarpan ? '<div class="dSatir kosullu"><span>Ağır hedefe DPS</span><b>' +
        (b.dps * (1 + b.agirCarpan)).toFixed(0) + '</b><span class="kos">tank</span></div>' : '') +
      (b.uzakCarpan ? '<div class="dSatir kosullu"><span>Uzak mesafede DPS</span><b>' +
        (b.dps * (1 + b.uzakCarpan)).toFixed(0) + '</b><span class="kos">' +
        (b.menzil * b.uzakEsik).toFixed(1) + ' m+</span></div>' : '') +
      '<p class="dAciklama">' + s.aciklama + '</p>' +
      '<p class="dBuild">' + BUILD_SUNUM[y.build].ozet + '</p>';
  }
}
