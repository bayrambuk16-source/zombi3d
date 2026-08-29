/** Görsel katman — Three.js. GAMEPLAY OTORİTESİ YOKTUR.
 *
 *  Sahne her karede `Savas` durumunu OKUR ve olay kuyruğunu boşaltır.
 *  Buradaki hiçbir sayı savaşı etkilemez; savaş sayıları `denge/motor.mjs`te.
 *
 *  Koridor 1B'dir (z ekseni). "şerit" (x) yalnız görseldir — dört kurtulanın
 *  üst üste binmemesi ve zombilerin dağılmış görünmesi için.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as iskeletKlon } from 'three/addons/utils/SkeletonUtils.js';
import { SILAH_SUNUM, ZOMBI_SUNUM, temaBul, KLIP_PENCERE } from './veri.js';
import { ZOMBILER } from '../../denge/motor.mjs';

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/draco/';

/* Yürüme klibinin doğal göründüğü yer hızı (m/sn). Karakter hâlâ kayıyorsa
   ayarlanacak TEK sayı budur. */
const YURU_REF_HIZ = 1.35;

/* Üst gövde: bel ve yukarısı + kollar. Alt gövde: kalça ve bacaklar.
   Hips ALT tarafa aittir — gövdenin salınımını o taşır. */
const UST_RE = /(Spine|Neck|Head|Shoulder|Arm|ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/;
const ALT_RE = /(Hips|UpLeg|Leg|Foot|ToeBase|Toe_End)/;

/** Klibi zaman aralığına keser ve başı sıfıra çeker.
 *  three.js AnimationUtils.subclip KARE ile çalışır ve klibin fps'ini
 *  bilmemizi ister; burada doğrudan zaman üzerinden kesiyoruz. */
function klipKes(klip, bas, son) {
  const y = klip.clone();
  y.tracks = [];
  for (const t of klip.tracks) {
    const boy = t.values.length / t.times.length;
    const za = [], de = [];
    for (let i = 0; i < t.times.length; i++) {
      if (t.times[i] < bas || t.times[i] > son) continue;
      za.push(t.times[i] - bas);
      for (let k = 0; k < boy; k++) de.push(t.values[i * boy + k]);
    }
    if (za.length < 2) continue;
    const yt = t.clone();
    yt.times = new Float32Array(za);
    yt.values = new Float32Array(de);
    y.tracks.push(yt);
  }
  if (!y.tracks.length) return klip;      /* kesilemedi, aslını kullan */
  y.resetDuration();
  return y;
}

/** Klibi kemik kümesine göre süzer; boş kalırsa null döner. */
function klipBol(klip, bolge) {
  const re = bolge === 'ust' ? UST_RE : ALT_RE;
  const ters = bolge === 'ust' ? ALT_RE : null;
  const iz = klip.tracks.filter(t => {
    const ad = t.name.split('.')[0];
    if (ters && ters.test(ad)) return false;
    return re.test(ad);
  });
  if (!iz.length) return null;
  const y = klip.clone();
  y.tracks = iz;
  y.name = klip.name + '#' + bolge;
  return y;
}
const yuruHizi = (mSn) => Math.max(0.35, Math.min(2.4, Math.abs(mSn) / YURU_REF_HIZ));

export class Sahne {
  constructor(kap) {
    this.kap = kap;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    kap.appendChild(this.renderer.domElement);

    this.sahne = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    /* Portrait, omuz üstü: hat aşağıda, koridor yukarı doğru açılıyor. */
    this.kamera.position.set(0, 6.9, 11.2);
    this.kamera.lookAt(new THREE.Vector3(0, 1.0, -5.4));

    this.ortam = new THREE.HemisphereLight(0xa8bccc, 0x3a4430, 2.2);
    this.sahne.add(this.ortam);
    this.gunes = new THREE.DirectionalLight(0xffe8c8, 3.0);
    this.gunes.position.set(6, 15, 7);
    this.gunes.castShadow = true;
    this.gunes.shadow.mapSize.set(768, 768);
    const c = this.gunes.shadow.camera;
    c.left = -16; c.right = 16; c.top = 18; c.bottom = -18; c.far = 55;
    this.sahne.add(this.gunes);
    const dolgu = new THREE.DirectionalLight(0x9ec0ff, 0.8);
    dolgu.position.set(-6, 7, -9);
    this.sahne.add(dolgu);

    this.zeminMat = new THREE.MeshLambertMaterial({ color: 0x3d4048 });
    const zemin = new THREE.Mesh(new THREE.PlaneGeometry(34, 70), this.zeminMat);
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.z = -14;
    zemin.receiveShadow = true;
    this.sahne.add(zemin);

    this.duvarMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    this.duvarlar = [];
    for (const yon of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.6, 70), this.duvarMat);
      d.position.set(yon * 5.2, 1.8, -14);
      d.castShadow = false; d.receiveShadow = true;
      this.sahne.add(d);
      this.duvarlar.push(d);
    }
    /* Menzil/hat çizgisi — oyuncu savunma hattını görsün. */
    this.hatCizgi = new THREE.Mesh(
      new THREE.PlaneGeometry(10.4, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xe0563a, transparent: true, opacity: 0.35 }));
    this.hatCizgi.rotation.x = -Math.PI / 2;
    this.hatCizgi.position.set(0, 0.02, 2.5);
    this.sahne.add(this.hatCizgi);


    /* Zemin derzleri. Eşit aralıklı ve eşit kontrastlı olunca "debug grid"
       gibi duruyordu: kontrast yarıya indirildi, aralık uzaklaştıkça açılıyor
       (perspektifle birleşince sıkışma daha okunur) ve uzaktakiler soluyor. */
    this.seritMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.028 });
    this.seritUzakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.014 });
    for (let i = 0; i < 11; i++) {
      const z = 1 - (i * 2.5 + i * i * 0.17);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.05),
                               i > 5 ? this.seritUzakMat : this.seritMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set(0, 0.01, z);
      this.sahne.add(c);
    }
    /* Merkez koridoru yanlardan biraz aydınlık tut: hedefleri ayırır ve
       "öldürme koridoru" hissi verir. */
    this.merkezMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035 });
    const merkez = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 60), this.merkezMat);
    merkez.rotation.x = -Math.PI / 2;
    merkez.position.set(0, 0.005, -14);
    this.sahne.add(merkez);

    /* Kolon ritmi + duvar lambaları. Tek geometri/materyal paylaşılır. */
    this.kolonMat = new THREE.MeshLambertMaterial({ color: 0x24272c });
    this.lambaMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const kolonGeo = new THREE.BoxGeometry(0.55, 3.4, 0.55);
    const lambaGeo = new THREE.PlaneGeometry(0.34, 0.1);
    this.kolonlar = []; this.lambalar = [];
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 4.4;
      for (const yon of [-1, 1]) {
        const k = new THREE.Mesh(kolonGeo, this.kolonMat);
        k.position.set(yon * 4.55, 1.7, z);
        /* Kolon gölgesi neredeyse görünmüyor ama gölge geçişinde her
           karede çiziliyor — kapalı. */
        k.castShadow = false;
        this.sahne.add(k); this.kolonlar.push(k);
        const l = new THREE.Mesh(lambaGeo, this.lambaMat);
        l.position.set(yon * 4.26, 2.5, z);
        l.rotation.y = yon * Math.PI / 2;
        this.sahne.add(l); this.lambalar.push(l);
      }
    }
    /* Rim ışığı: zombiler uzakta siyah zemine karışıyordu. Kameranın
       KARŞISINDAN gelir, yani hedefin arkasını aydınlatıp siluetini ayırır. */
    this.rim = new THREE.DirectionalLight(0xbcd8ff, 1.4);
    this.rim.position.set(0, 9, -30);
    this.sahne.add(this.rim);

    /* Hedef işaretçisi: manuel modlarda oyuncunun seçtiği zombiyi gösterir.
       Halka zeminde durur — karakterin üstüne kondurulan işaret portrait
       kamerada gövdenin arkasında kalıyordu. */
    this.hedefHalka = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 24),
      new THREE.MeshBasicMaterial({ color: 0xe0a12a, transparent: true, opacity: 0.9,
                                    side: THREE.DoubleSide }));
    this.hedefHalka.rotation.x = -Math.PI / 2;
    this.hedefHalka.visible = false;
    this.sahne.add(this.hedefHalka);
    /* Kafa üstü ok: kalabalıkta hangi zombinin hedef olduğunu zemine
       bakmadan söyler. */
    this.hedefOk = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._okDokusu(), color: 0xffffff, transparent: true,
      depthTest: false, opacity: 0.95 }));
    this.hedefOk.renderOrder = 10;
    this.hedefOk.scale.set(0.42, 0.42, 1);
    this.hedefOk.visible = false;
    this.sahne.add(this.hedefOk);
    this.hedefNabiz = 0;
    this.isin = new THREE.Raycaster();

    this.M = {};
    this.kurtulanAktor = [];
    this.zombiAktor = new Map();     /* Savas zombi id → aktör */
    this.zombiHavuz = new Map();     /* tür → aktör havuzu (GPU sızıntısı önlenir) */
    this._sayac = 0;                 /* saldırı klibi dağıtımı için */
    this.olenler = [];
    this.saat = new THREE.Clock();
    this._vfxKur();
    this.boyutla();
    addEventListener('resize', () => this.boyutla());
  }

  boyutla() {
    const g = this.kap.clientWidth || innerWidth, y = this.kap.clientHeight || innerHeight;
    this.renderer.setSize(g, y, false);
    this.kamera.aspect = g / y;
    this.kamera.updateProjectionMatrix();
  }

  async yukle(ilerleme) {
    const draco = new DRACOLoader().setDecoderPath(CDN);
    const y = new GLTFLoader().setDRACOLoader(draco);
    const liste = [
      ['kurtulan1', 'karakter/kurtulan1.glb'], ['kurtulan2', 'karakter/kurtulan2.glb'],
      ['kurtulan3', 'karakter/kurtulan3.glb'], ['kurtulan4', 'karakter/kurtulan4.glb'],
      ['zombi-yuruyen',  'karakter/zombi-yuruyen.glb'],
      ['zombi-yuruyen2', 'karakter/zombi-yuruyen2.glb'],
      ['zombi-yuruyen3', 'karakter/zombi-yuruyen3.glb'],
      ['zombi-kosucu',  'karakter/zombi-kosucu.glb'],
      ['zombi-tank',    'karakter/zombi-tank.glb'],
      ['zombi-boss',    'karakter/zombi-boss.glb'],
      ['klip-tabanca',  'karakter/klip-tabanca.glb'],
    ];
    for (const [a, s] of Object.entries(SILAH_SUNUM)) liste.push([a, s.model]);
    for (let i = 0; i < liste.length; i++) {
      const [ad, yol] = liste[i];
      this.M[ad] = await y.loadAsync(yol);
      this.M[ad].scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = !ad.startsWith("zombi");
        /* frustumCulled ESKİ prototipten kapalı geliyordu. Kapalıyken ekran
           dışındaki her zombi de çiziliyor. Skinned mesh sınır kutusu bind
           pozundan hesaplandığı için biraz dar kalabiliyor; kutuyu elle
           büyüterek kenarda kaybolmayı önlüyoruz. */
        o.frustumCulled = true;
        if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry && o.geometry.boundingSphere) o.geometry.boundingSphere.radius *= 2.2;
      });
      if (ilerleme) ilerleme((i + 1) / liste.length, ad);
    }
    /* Ölçülen pencerelere göre kes — uzun "sahne" klipleri oyunun kısa
       eylem penceresine sığmıyordu. */
    for (const ad of ['kurtulan1', 'klip-tabanca', 'zombi-yuruyen']) {
      const g = this.M[ad];
      if (!g) continue;
      g.animations = g.animations.map(k => {
        const p = KLIP_PENCERE[k.name];
        if (!p) return k;
        const y = klipKes(k, p[0], Math.min(p[1], k.duration));
        y.name = k.name;
        return y;
      });
    }
    /* Klip kaynakları — mesh başka dosyadan, animasyon buradan. */
    /* Tüfek + tabanca klipleri tek listede; ad çakışması yok
       (tabanca* öneki). Silah sınıfına göre seçilir. */
    this.insanKlip = this.M.kurtulan1.animations.concat(this.M['klip-tabanca'].animations);
    /* klip-tabanca yalnız ANİMASYON kaynağı; mesh'i hiç sahneye girmiyor.
       Dokuları ve geometrisi GPU belleğinde tutmanın anlamı yok. */
    this.M['klip-tabanca'].scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'])
          if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
    this.zombiKlip = this.M['zombi-yuruyen'].animations;
  }

  /* ═══ VFX havuzları ═══ */
  _vfxKur() {
    /* Dokusuz sprite KARE çizer; namlu alevi ve isabet işareti kutu gibi
       görünüyordu. Yumuşak radyal nokta ikisine de uyar. */
    this.noktaDoku = this._noktaDokusu();
    this.alevMat = new THREE.SpriteMaterial({
      map: this.noktaDoku, color: 0xffd18a, transparent: true,
      blending: THREE.AdditiveBlending, opacity: 0 });
    this.alevler = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(this.alevMat.clone());
      s.scale.setScalar(0.85); s.visible = false;
      this.sahne.add(s); this.alevler.push(s);
    }
    this.isabetler = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.noktaDoku, color: 0xd6402c, transparent: true,
        blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.5); s.visible = false;
      this.sahne.add(s); this.isabetler.push(s);
    }
  }

  /** Yumuşak radyal nokta — alev ve isabet için. */
  _noktaDokusu() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** Aşağı bakan üçgen dokusu — hedef işaretçisi için. */
  _okDokusu() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e0a12a';
    g.beginPath();
    g.moveTo(8, 8); g.lineTo(56, 8); g.lineTo(32, 56); g.closePath();
    g.fill();
    /* koyu kenar: açık zeminde de okunsun */
    g.strokeStyle = '#1a1204'; g.lineWidth = 5; g.stroke();
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }

  /** Ölüm klibi seçer: rastgele, ama ÖLDÜREN VURUŞA göre ağırlıklı.
   *  Hepsinin aynı şekilde düşmesi sürüyü tek bir nesne gibi gösteriyordu.
   *  oran = vuruşun maks. cana oranı; ağır vuruş (sniper, av tüfeği yakın
   *  mesafe) daha sert düşüş verir. */
  _olumKlibi(a, oran, kafaIzin) {
    const secenek = ['olum', 'olum2', 'olum3', 'olumKafa']
      .filter(x => a.eylem[x] && (x !== 'olumKafa' || kafaIzin));
    if (!secenek.length) return 'olum';
    /* Tek vuruşta devrilme (sniper, yakın av tüfeği) sert klibe yönelsin;
       gerisi düz rastgele. */
    if (oran >= 0.9 && Math.random() < 0.5) return secenek[0];
    return secenek[Math.floor(Math.random() * secenek.length)];
  }

  _vfxAl(havuz) {
    for (const s of havuz) if (!s.visible) return s;
    return havuz[0];
  }

  tema(bolum) {
    const t = temaBul(bolum);
    this.zeminMat.color.setHex(t.zemin);
    this.duvarMat.color.setHex(t.duvar);
    this.seritMat.color.setHex(t.gunes);
    this.seritUzakMat.color.setHex(t.gunes);
    this.kolonMat.color.setHex(t.duvar).multiplyScalar(0.82);
    this.lambaMat.color.setHex(t.gunes);
    this.rim.color.setHex(t.ortam);
    this.sahne.background = new THREE.Color(t.sis);
    this.sahne.fog = new THREE.Fog(t.sis, 15, 46);
    this.gunes.color.setHex(t.gunes);
    this.ortam.color.setHex(t.ortam);
    this.ortam.intensity = t.yogunluk;
    return t;
  }

  /* ═══ aktörler ═══ */
  _aktorYap(anahtar, klipler, olcek, bolunmus) {
    const kok = iskeletKlon(this.M[anahtar].scene);
    kok.scale.setScalar(olcek);
    this.sahne.add(kok);
    const mixer = new THREE.AnimationMixer(kok);
    const eylem = {};        /* tam gövde */
    const alt = {}, ust = {};
    /* Klip adları fırınlamada birebir verildi; gevşek eşleme artık gereksiz
       ve tehlikeli ('saldiri' ile 'saldiri2' karışır). */
    for (const k of klipler) {
      eylem[k.name] = mixer.clipAction(k);
      if (!bolunmus) continue;
      const a = klipBol(k, 'alt'); if (a) alt[k.name] = mixer.clipAction(a);
      const u = klipBol(k, 'ust'); if (u) ust[k.name] = mixer.clipAction(u);
    }
    return { kok, mixer, eylem, alt, ust, aktif: null,
             altAktif: null, ustAktif: null, kilit: 0, ustKilit: 0 };
  }

  /** Silahı sağ ele bağlar. Ölçek SABİT ÇARPANLA verilmez: Mixamo el kemiği
   *  0,01 dünya ölçeğinde, Meshy modelleri de her biri başka ölçekte.
   *  Önce bağla, sonra DÜNYA kutusunu ölç, gerçek boya oranla. */
  _silahBagla(aktor, silahAd) {
    let el = null;
    aktor.kok.traverse(o => { if (o.isBone && /RightHand$/.test(o.name)) el = o; });
    if (!el) return null;
    if (aktor.silah) { el.remove(aktor.silah); aktor.silah = null; }
    const s = this.M[silahAd].scene.clone(true);
    s.scale.setScalar(1);
    s.position.set(0, 0, 0);
    s.rotation.set(0, Math.PI, -Math.PI / 2);
    el.add(s);
    aktor.kok.updateWorldMatrix(true, true);
    const kutu = new THREE.Box3().setFromObject(s);
    const b = kutu.getSize(new THREE.Vector3());
    const dunyaBoy = Math.max(b.x, b.y, b.z) || 1;
    s.scale.setScalar((SILAH_SUNUM[silahAd].boy) / dunyaBoy);
    const elOlcek = el.getWorldScale(new THREE.Vector3()).x || 1;
    s.position.set(0.02 / elOlcek, 0.05 / elOlcek, 0.02 / elOlcek);
    aktor.silah = s;
    aktor.silahAd = silahAd;
    return s;
  }

  /** Tek kanalda (alt/üst) klip değiştirir. Tam gövde için oynat() kullanılır. */
  kanal(a, hangi, ad, sec) {
    sec = sec || {};
    const havuz = a[hangi];
    const anahtar = hangi + 'Aktif';
    const e = havuz[ad];
    if (!e || a[anahtar] === ad) {
      if (e && sec.hiz !== undefined) e.timeScale = sec.hiz;
      return;
    }
    const onceki = a[anahtar] && havuz[a[anahtar]];
    e.reset();
    e.timeScale = sec.hiz || 1;
    const dongu = sec.dongu !== false;
    e.setLoop(dongu ? THREE.LoopRepeat : THREE.LoopOnce, dongu ? Infinity : 1);
    e.clampWhenFinished = !dongu;
    if (onceki) e.crossFadeFrom(onceki, sec.gecis !== undefined ? sec.gecis : 0.14, false);
    e.play();
    a[anahtar] = ad;
  }

  oynat(a, ad, sec) {
    sec = sec || {};
    const e = a.eylem[ad];
    if (!e || a.aktif === ad) return;
    const onceki = a.aktif && a.eylem[a.aktif];
    e.reset();
    e.timeScale = sec.hiz || 1;
    const dongu = sec.dongu !== false;
    e.setLoop(dongu ? THREE.LoopRepeat : THREE.LoopOnce, dongu ? Infinity : 1);
    e.clampWhenFinished = !dongu;
    if (onceki) e.crossFadeFrom(onceki, sec.gecis !== undefined ? sec.gecis : 0.16, false);
    e.play();
    a.aktif = ad;
  }

  /** Yeni bölüm: kadroyu kur, eski zombileri topla. */
  bolumKur(savas, bolum) {
    this.tema(bolum);
    for (const [, a] of this.zombiAktor) this._zombiBirak(a);
    this.zombiAktor.clear();
    for (const a of this.olenler) this._zombiBirak(a.aktor);
    this.olenler.length = 0;

    while (this.kurtulanAktor.length < savas.kurtulanlar.length)
      this.kurtulanAktor.push(this._aktorYap(
        'kurtulan' + (this.kurtulanAktor.length % 4 + 1), this.insanKlip, 1, true));
    savas.kurtulanlar.forEach((k, i) => {
      const a = this.kurtulanAktor[i];
      a.kok.visible = true;
      a.kok.rotation.y = Math.PI;
      a.mixer.stopAllAction();
      a.aktif = a.altAktif = a.ustAktif = null;
      a.kilit = a.ustKilit = 0;
      a.yaw = 0;
      /* Tabanca sınıfı silahlar ayrı locomotion seti kullanır: tüfek
         duruşuyla revolver taşımak yanlış görünüyordu. */
      a.tabanca = (SILAH_SUNUM[k.silahAd] || {}).elSayisi === 1;
      if (a.silahAd !== k.silahAd) this._silahBagla(a, k.silahAd);
      this.kanal(a, 'alt', a.tabanca ? 'tabancaIdle' : 'idle');
      this.kanal(a, 'ust', a.tabanca ? 'tabancaIdle' : 'idle');
    });
  }

  _zombiAl(tur) {
    /* Yürüyen sürünün büyük çoğunluğu; tek modelle temsil edilince kalabalık
       "aynı kişinin kopyaları" gibi duruyordu. Üç ayrı karakter arasında
       dağıtılıyor. Havuz model bazında ayrı tutulur. */
    let model = 'zombi-' + tur;
    if (tur === 'yuruyen') {
      const v = this._sayac % 3;
      model = v === 0 ? 'zombi-yuruyen' : 'zombi-yuruyen' + (v + 1);
    }
    if (!this.zombiHavuz.has(model)) this.zombiHavuz.set(model, []);
    const havuz = this.zombiHavuz.get(model);
    const a = havuz.pop() || this._aktorYap(model, this.zombiKlip, 1);
    a.model = model;
    a.tur = tur;
    const s = ZOMBI_SUNUM[tur];
    a.kok.scale.setScalar(s.olcek);
    a.kok.visible = true;
    /* Zombi +z yönünde yürür: kurtulanın tersine bakmalı. Aynı dönüşü
       vermek onu geri geri yürütüyordu. */
    a.kok.rotation.y = 0;
    a.mixer.stopAllAction();
    a.aktif = null;
    /* Koşucunun kendi koşu klibi var; hızlandırılmış yürüyüş "hızlı yürüyen"
       gibi duruyordu, tür farkı silüetten okunmuyordu. */
    if (tur === 'kosucu' && a.eylem.kos) a.yuruKlip = 'kos';
    else {
      /* Üç yürüyüş varyasyonu arasında dağıt. */
      const secenek = ['yuru', 'yuru2', 'yuru3'].filter(x => a.eylem[x]);
      a.yuruKlip = secenek[this._sayac % secenek.length] || 'yuru';
    }
    const refHiz = a.yuruKlip === 'kos' ? 2.4 : YURU_REF_HIZ;
    /* ±%12 tempo sapması: aynı türden zombiler bile aynı adımı atmasın. */
    const sapma = 1 + (((this._sayac * 37) % 25) / 100 - 0.12);
    a.yuruHiz = Math.max(0.3, Math.min(2.6, ZOMBILER[tur].hiz / refHiz * sapma));
    /* Saldırı varyasyonu: üç klip arasında id'ye göre dağıt — tekdüzelik
       "zombiler hep aynı şeyi yapıyor" hissi veriyordu. */
    a.saldiriKlip = ['saldiri', 'saldiri2', 'saldiri3'][this._sayac++ % 3];
    if (!a.eylem[a.saldiriKlip]) a.saldiriKlip = 'saldiri';
    this.oynat(a, a.yuruKlip, { hiz: a.yuruHiz });
    /* Klibin faz kaydırması: aynı anda doğan öbek lockstep yürümesin. */
    const e = a.eylem[a.yuruKlip];
    if (e) e.time = ((this._sayac * 0.37) % 1) * e.getClip().duration;
    this._sayac++;
    return a;
  }

  _zombiBirak(a) {
    a.kok.visible = false;
    a.kok.position.y = 0;
    const anahtar = a.model || ('zombi-' + a.tur);
    const havuz = this.zombiHavuz.get(anahtar) || [];
    if (havuz.length < 24) { havuz.push(a); this.zombiHavuz.set(anahtar, havuz); }
    else this.sahne.remove(a.kok);
  }

  /** Her karede: olayları işle, konumları senkronla, çiz. */
  ciz(savas) {
    /* İki ayrı dt: animasyon karesi kırpılır (uzun duraklamadan sonra klipler
       sıçramasın), savaş ise GERÇEK süreyi alır. Tek kırpılmış dt kullanınca
       düşük FPS'te savaş ağır çekim oluyordu — 8 FPS'te gerçek zamanın
       %42'si. Savaş hızı kare hızına bağlı OLMAMALI. */
    const gercek = this.saat.getDelta();
    this.sonGercekDt = Math.min(gercek, 0.25);
    const dt = Math.min(gercek, 0.05);

    for (const o of savas.olaylar) {
      if (o.tip === 'dogum') {
        this.zombiAktor.set(o.zombi.id, this._zombiAl(o.zombi.tur));
      } else if (o.tip === 'ates') {
        const a = this.kurtulanAktor[o.kurtulan.i];
        if (a) {
          /* Üst gövdede oynar: bacaklar yürümeye devam eder.
             Tabanca taşıyan artık kendi ateş klibini kullanıyor; tüfek
             klibiyle revolver sıkmak yanlış duruş veriyordu. */
          const atesKlip = (a.tabanca && a.ust.tabancaAtes) ? 'tabancaAtes' : 'ates';
          /* Klip atış aralığına sığdırılır: sabit 0,2 sn kilit uzun klibin
             yalnız başını gösteriyordu. */
          const ae = a.ust[atesKlip];
          const asure = ae ? ae.getClip().duration : 0.3;
          const ahiz = Math.max(1, Math.min(3, asure / Math.max(0.25, o.kurtulan.s.ara * 0.85)));
          this.kanal(a, 'ust', atesKlip, { dongu: false, hiz: ahiz, gecis: 0.04 });
          a.ustKilit = asure / ahiz;
          const f = this._vfxAl(this.alevler);
          f.visible = true; f.material.opacity = 1; f.userData.t = 0.05;
          f.position.set(o.kurtulan.serit + 0.3, 1.42, o.kurtulan.z - 0.55);
        }
      } else if (o.tip === 'reload') {
        const a = this.kurtulanAktor[o.kurtulan.i];
        if (a) {
          const reloadKlip = (a.tabanca && a.ust.tabancaReload) ? 'tabancaReload' : 'reload';
          const e = a.ust[reloadKlip];
          /* Klip süresi reload süresine uydurulur: 1,7 sn ile 4,2 sn arası
             reload'lar aynı hızda oynayınca LMG'nin uzun boşluğu görünmüyordu. */
          const hiz = e ? Math.max(0.45, Math.min(2, e.getClip().duration / o.sure)) : 1;
          this.kanal(a, 'ust', reloadKlip, { dongu: false, gecis: 0.1, hiz });
          a.ustKilit = o.sure;
        }
      } else if (o.tip === 'isabet') {
        const z = this.zombiAktor.get(o.zombi.id);
        const s = this._vfxAl(this.isabetler);
        s.visible = true; s.material.opacity = 0.95; s.userData.t = 0.26;
        s.position.set(o.zombi.serit, 1.1, o.zombi.z);
        if (z && z.aktif !== 'olum') { this.oynat(z, 'vurus', { dongu: false, gecis: 0.07 }); z.kilit = 0.4; }
      } else if (o.tip === 'olum') {
        const z = this.zombiAktor.get(o.zombi.id);
        if (z) {
          /* Klip hızına da küçük sapma: aynı klip iki kez arka arkaya
             çıksa bile aynı ritimde düşmesinler. */
          this.oynat(z, this._olumKlibi(z, o.oran || 0), {
            dongu: false, gecis: 0.1, hiz: 0.9 + Math.random() * 0.35 });
          z.kilit = 99;
          this.zombiAktor.delete(o.zombi.id);
          this.olenler.push({ aktor: z, t: 0 });
        }
      } else if (o.tip === 'saldiri') {
        const z = this.zombiAktor.get(o.zombi.id);
        if (z) {
          const sk = z.saldiriKlip || 'saldiri';
          const se = z.eylem[sk];
          const ssure = se ? se.getClip().duration : 0.7;
          /* Saldırı klibi vuruş aralığına sığsın; sabit 0,7 sn kilit
             uzun kliplerde yalnız hazırlığı gösteriyordu. */
          const shiz = Math.max(1, Math.min(2.4, ssure / 0.9));
          this.oynat(z, sk, { dongu: false, gecis: 0.1, hiz: shiz });
          z.kilit = ssure / shiz;
        }
        const k = this.kurtulanAktor[o.kurtulan.i];
        if (k && !o.kurtulan.olu && k.ust.hasar) {
          this.kanal(k, 'ust', 'hasar', { dongu: false, gecis: 0.05, hiz: 1.3 });
          k.ustKilit = 0.3;
        }
      } else if (o.tip === 'kurtulanOldu') {
        const a = this.kurtulanAktor[o.kurtulan.i];
        if (a) {
          /* Ölüm TAM gövdedir; kanalları susturup tek klip oynatılır. */
          for (const h of ['alt', 'ust']) {
            const e = a[h][a[h + 'Aktif']];
            if (e) e.fadeOut(0.12);
            a[h + 'Aktif'] = null;
          }
          this.oynat(a, this._olumKlibi(a, 0, true), {
            dongu: false, gecis: 0.15, hiz: 0.9 + Math.random() * 0.3 });
          a.kilit = a.ustKilit = 99;
        }
      }
    }
    savas.olaylar.length = 0;

    /* konum senkronu */
    savas.kurtulanlar.forEach((k, i) => {
      const a = this.kurtulanAktor[i];
      if (!a) return;
      a.kok.position.set(k.serit, 0, k.z);
      a.kilit -= dt; a.ustKilit -= dt;
      if (!k.olu) {
        /* ── ALT kanal: locomotion, üst gövdeden bağımsız ── */
        const on = a.tabanca ? 'tabanca' : '';
        const ad = (x) => on ? on + x[0].toUpperCase() + x.slice(1) : x;
        const h = Math.abs(k.hareket || 0) * (k.s.hareket || 1);
        if (h > 0.01) {
          const klip = k.hareket > 0 ? ad('geriYuru') : ad('yuru');
          this.kanal(a, 'alt', a.alt[klip] ? klip : ad('yuru'), { hiz: yuruHizi(h) });
        } else this.kanal(a, 'alt', ad('idle'));

        /* ── ÜST kanal: eylem bitince nişan duruşuna dön ── */
        if (a.ustKilit <= 0) this.kanal(a, 'ust', ad('idle'), { gecis: 0.18 });

        /* ── Gövde yönü: hedefe hafifçe dön ──
           Herkesin dümdüz ileri bakması sıralı dizilmiş nişangâh gibi
           duruyordu. Açı sınırlı: kurtulanlar hattı korur, hedefe koşmaz. */
        const hedef = k.hedef;
        let istek = 0;
        if (hedef && !hedef.olu) {
          const dz = Math.max(0.6, k.z - hedef.z);
          istek = Math.atan2(hedef.serit - k.serit, dz);
          istek = Math.max(-0.62, Math.min(0.62, istek));
        }
        a.yaw = (a.yaw || 0) + (istek - (a.yaw || 0)) * Math.min(1, dt * 5);
        a.kok.rotation.y = Math.PI - a.yaw;
      }
      a.mixer.update(dt);
    });

    for (const z of savas.zombiler) {
      const a = this.zombiAktor.get(z.id);
      if (!a || z.olu) continue;
      a.kok.position.set(z.serit, 0, z.z);
      a.kilit -= dt;
      const yk = a.yuruKlip || 'yuru';
      if (a.kilit <= 0 && a.aktif !== yk && z.yuruyor !== false)
        this.oynat(a, yk, { hiz: a.yuruHiz || 1 });
      a.mixer.update(dt);
    }

    /* ölüler: yere göm ve havuza iade et */
    for (let i = this.olenler.length - 1; i >= 0; i--) {
      const o = this.olenler[i];
      o.t += dt;
      o.aktor.mixer.update(dt);
      if (o.t > 2.4) o.aktor.kok.position.y -= dt * 0.6;
      if (o.t > 3.4) { this._zombiBirak(o.aktor); this.olenler.splice(i, 1); }
    }

    for (const f of this.alevler) {
      if (!f.visible) continue;
      f.userData.t -= dt;
      if (f.userData.t <= 0) f.visible = false;
    }
    for (const s of this.isabetler) {
      if (!s.visible) continue;
      s.userData.t -= dt;
      s.material.opacity = Math.max(0, s.userData.t / 0.26);
      if (s.userData.t <= 0) s.visible = false;
    }

    this._kamera(savas, dt);
    this.renderer.render(this.sahne, this.kamera);
    return this.sonGercekDt;
  }


  /** Ekran noktasındaki zombinin Savas id'sini döner (yoksa null).
   *  Isın gövdeye değil, zombinin zemindeki dairesine atılır: iskeletli
   *  mesh'te raycast pahalı ve isabetsiz, portrait ekranda parmak zaten
   *  kabaca hedefin üstüne basıyor. */
  dokunulanZombi(x, y, savas) {
    const k = this.renderer.domElement.getBoundingClientRect();
    const n = new THREE.Vector2(((x - k.left) / k.width) * 2 - 1,
                                -((y - k.top) / k.height) * 2 + 1);
    this.isin.setFromCamera(n, this.kamera);
    let enIyi = null, enYakin = 1.6;
    const nokta = new THREE.Vector3();
    const duzlem = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
    if (!this.isin.ray.intersectPlane(duzlem, nokta)) return null;
    for (const z of savas.zombiler) {
      if (z.olu) continue;
      const d = Math.hypot(nokta.x - z.serit, nokta.z - z.z);
      if (d < enYakin) { enYakin = d; enIyi = z.id; }
    }
    return enIyi;
  }

  /** Seçili hedefin halkasını konumlar; hedef ölmüşse gizler. */
  hedefIsaretle(savas, hedefId, dt) {
    const z = hedefId && savas.zombiler.find(z => z.id === hedefId && !z.olu);
    this.hedefHalka.visible = !!z;
    this.hedefOk.visible = !!z;
    if (z) {
      this.hedefHalka.position.set(z.serit, 0.03, z.z);
      /* Ölçek nabzı — opacity yanıp sönmesi kalabalıkta görünürlüğü
         DÜŞÜRÜR, boyut değişimi düşürmez. */
      this.hedefNabiz += (dt || 0.016) * 3.4;
      const p = 1 + Math.sin(this.hedefNabiz) * 0.06;
      this.hedefHalka.scale.setScalar(p);
      const boy = 1.85 * (ZOMBI_SUNUM[z.tur] ? ZOMBI_SUNUM[z.tur].olcek : 1);
      this.hedefOk.position.set(z.serit, boy + 0.4 + Math.sin(this.hedefNabiz) * 0.05, z.z);
    }
    return !!z;
  }

  /** Kamera kadronun ortalama konumunu yumuşak takip eder.
   *  Sabit kamerada iki uç durum da bozuluyordu: hat tutulduğunda ekranın
   *  altı boş kalıyor, kadro geri çekildiğinde kurtulanlar ekran dışına
   *  taşıyordu. Takip yavaştır — sallanma yapmasın. */
  _kamera(savas, dt) {
    const canli = savas.kurtulanlar.filter(k => !k.olu);
    const ort = canli.length
      ? canli.reduce((a, k) => a + k.z, 0) / canli.length
      : this.hedefZ || 2.5;
    this.hedefZ = this.hedefZ === undefined ? ort : this.hedefZ + (ort - this.hedefZ) * Math.min(1, dt * 1.6);
    const z = this.hedefZ;
    this.kamera.position.set(0, 7.6 + (z - 2.5) * 0.16, z + 10.4);
    this.kamera.lookAt(0, 1.0, z - 8.2);
  }

  /** Envanter ikonları: silah modellerini kapalı sahnede çekip data URL üretir.
   *  Dışarıdan görsel indirmeye gerek kalmaz, ikon 3D modelin ta kendisidir. */
  ikonlariUret(boy) {
    boy = boy || 208;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setSize(boy, boy);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const sn = new THREE.Scene();
    sn.add(new THREE.HemisphereLight(0xffffff, 0x9aa4ad, 5.2));
    const isik = new THREE.DirectionalLight(0xffffff, 4.2);
    isik.position.set(2, 3, 4); sn.add(isik);
    /* karşı taraftan dolgu: silahların koyu gövdesi tek ışıkta siluete düşüyor */
    const dolguIsik = new THREE.DirectionalLight(0xbcd4ff, 2.4);
    dolguIsik.position.set(-3, -1, -2); sn.add(dolguIsik);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.5;
    const km = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    const ikon = {};
    for (const anahtar of Object.keys(SILAH_SUNUM)) {
      const m = this.M[anahtar].scene.clone(true);
      const kutu = new THREE.Box3().setFromObject(m);
      const merkez = kutu.getCenter(new THREE.Vector3());
      const bb = kutu.getSize(new THREE.Vector3());
      const en = Math.max(bb.x, bb.y, bb.z) || 1;
      m.position.sub(merkez);
      m.scale.setScalar(1 / en);
      const grup = new THREE.Group();
      grup.add(m);
      /* hafif üç çeyrek açı — düz profil silahları okunmuyor */
      grup.rotation.set(-0.22, -0.62, 0.12);
      sn.add(grup);
      km.position.set(0, 0, 2.05);
      km.lookAt(0, 0, 0);
      r.render(sn, km);
      ikon[anahtar] = r.domElement.toDataURL('image/webp', 0.9);
      sn.remove(grup);
    }
    r.dispose();
    return ikon;
  }
}
