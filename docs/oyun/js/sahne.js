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

    /* Duvar lambaları — her mekânda var, yalnız RENGİ temayla değişir
       (otoparkta floresan, sokakta sodyum, metroda sert beyaz, hastanede
       klinik yeşil). Tek geometri/materyal paylaşılır. */
    this.lambaMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const lambaGeo = new THREE.PlaneGeometry(0.34, 0.1);
    this.lambalar = [];
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 4.4;
      for (const yon of [-1, 1]) {
        const l = new THREE.Mesh(lambaGeo, this.lambaMat);
        l.position.set(yon * 4.26, 2.5, z);
        l.rotation.y = yon * Math.PI / 2;
        this.sahne.add(l); this.lambalar.push(l);
      }
    }
    this._mekanKur();
    /* Rim ışığı: zombiler uzakta siyah zemine karışıyordu. Kameranın
       KARŞISINDAN gelir, yani hedefin arkasını aydınlatıp siluetini ayırır. */
    this.rim = new THREE.DirectionalLight(0xbcd8ff, 1.4);
    this.rim.position.set(0, 9, -30);
    this.sahne.add(this.rim);
    this.rimTaban = 1.4;      /* temanın kendi değeri; vurgu buna döner */
    this.rimVurgu = 0;        /* boss girişinde kısa süre >0 */

    /* Boss zemin aurası — hedef halkasından ayrılsın diye geniş, kırmızı
       ve soluk. Tek nesne, sahnede bir boss varken görünür. */
    this.bossAura = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.55, 36),
      new THREE.MeshBasicMaterial({ color: 0xb0402a, transparent: true,
                                    opacity: 0.16, side: THREE.DoubleSide,
                                    depthWrite: false }));
    this.bossAura.rotation.x = -Math.PI / 2;
    this.bossAura.visible = false;
    this.sahne.add(this.bossAura);

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
      ['klip-tabanca-v2', 'karakter/klip-tabanca-v2.glb'],
      ['klip-tabanca-ek', 'karakter/klip-tabanca-ek.glb'],
      ['klip-agir',     'karakter/klip-agir.glb'],
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
        /* ── KARAKTER MALZEME BİRLİĞİ ──
           Ölçüm: kurtulanların deri ve kıyafet malzemeleri `metalness 0,5`,
           bir mesh'i `metalness 1` ile geliyordu; zombiler `roughness 0,78`.
           Deri ve kumaş METAL DEĞİLDİR — bu, Mixamo FBX→GLB dönüşümünün
           bilinen artefaktı. Metalness albedo'yu kısmen specular tint gibi
           davrandırdığı için kurtulanlar "foto kesik", zombiler "oyun
           asseti" gibi duruyordu: aynı ışığa iki farklı tepki.
           Dokulara dokunulmuyor, yalnız PBR parametreleri eşitleniyor. */
        if (/^(kurtulan|zombi|klip-)/.test(ad)) {
          for (const m of [].concat(o.material)) {
            if (m.metalness !== undefined) m.metalness = 0;
            if (m.roughness !== undefined) m.roughness = 0.85;
          }
        } else if (SILAH_SUNUM[ad]) {
          /* SİLAHLAR — önce "onlar gerçekten metal" diye kapsam dışı
             bırakılmıştı. O gerekçe ancak ÇEVRE HARİTASI varsa geçerli:
             yansıtacak bir şeyi olmayan `metalness 1` malzeme siyah render
             edilir. Sahnede envMap yok ve silahlar hem elde hem envanter
             ikonunda koyu lekeye dönüyordu — ölçüldü: ortalama ikon
             parlaklığı 80/255, revolver 57, av tüfeği 50.
             Ucuz ve doğru çözüm metalness'i düşürmek; silah, ışıkla
             aydınlanan koyu bir gövde olur. PMREM/çevre haritası mobil
             bütçeye ek yük getirir ve bu kadarı için gereksiz. */
          for (const m of [].concat(o.material)) {
            if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.35);
            if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.45);
          }
        }
      });
      if (ilerleme) ilerleme((i + 1) / liste.length, ad);
    }
    /* Ölçülen pencerelere göre kes — uzun "sahne" klipleri oyunun kısa
       eylem penceresine sığmıyordu. */
    for (const ad of ['kurtulan1', 'klip-tabanca', 'klip-tabanca-ek', 'klip-tabanca-v2',
                      'zombi-yuruyen', 'klip-agir']) {
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
    /* SIRA ÖNEMLİ: aynı ada sahip klipte SONRAKİ kazanır (`_aktorYap`
       `eylem[k.name] = ...` ile yazar). v2 seti eski tabanca setinin
       üstüne biner.
       Neden v2: eski set TUTARSIZDI — locomotion bir Mixamo paketinden,
       ateş bambaşka bir paketten geliyordu ve locomotion paketinde nişan
       ya da ateş klibi hiç yoktu. Sonuç: `tabancaAtes` ateş etme olarak
       okunmuyor, idle/yürüyüşte eller kafa hizasında kalıyordu.
       v2'de nişan (Pistol Aim), ateş (Shooting Pistol) ve tüm locomotion
       TEK paketten geliyor. Reload ve hasar/ölüm o pakette yok, eski
       kaynaklarda kalıyor. */
    this.insanKlip = this.M.kurtulan1.animations
      .concat(this.M['klip-tabanca'].animations)
      .concat(this.M['klip-tabanca-ek'].animations)
      .concat(this.M['klip-tabanca-v2'].animations);
    /* Tank ve boss, yürüyenin kliplerini paylaşıyordu: ekrandaki en iri iki
       düşman sıradan bir yürüyenle birebir aynı hareket ediyordu. Ağır
       klipler ortak havuza katılır, tür seçimi `_zombiKlipSec`te yapılır. */
    this.zombiKlip = this.M['zombi-yuruyen'].animations
      .concat(this.M['klip-agir'].animations);

    /* Klip kaynağı dosyaların mesh'i hiç sahneye girmiyor; dokularını ve
       geometrisini GPU belleğinde tutmanın anlamı yok. */
    for (const ad of ['klip-tabanca', 'klip-tabanca-ek', 'klip-tabanca-v2', 'klip-agir']) {
      this.M[ad].scene.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [].concat(o.material)) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'])
            if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
    }
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

    /* ── İZ (tracer) ──
       Namlu alevi ile isabet işareti arasında BOŞLUK vardı: atışın nereye
       gittiği görünmüyordu, özellikle kalabalıkta. İz o boşluğu kapatır.
       Sprite değil KUTU: sprite kameraya döner ama uzunluğu bir yöne
       hizalanamaz; ince bir kutu her açıdan görünür ve yönü taşır. */
    this.izGeo = new THREE.BoxGeometry(1, 0.045, 0.045);
    this.izler = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.izGeo, new THREE.MeshBasicMaterial({
        color: 0xffe0a8, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false;
      this.sahne.add(m); this.izler.push(m);
    }

    /* ── PARLAMA (düşman hit-flash) ──
       Materyalle yapılamaz: ölçüm, 7 zombi için yalnız 6 malzeme olduğunu
       gösterdi — malzemeler aktörler arasında PAYLAŞILIYOR, birinin
       emissive'ini değiştirmek hepsini parlatırdı. Bunun yerine vurulan
       zombinin gövdesine çok kısa süreli, geniş ve eklemeli bir nokta
       bindiriliyor. */
    this.parlamalar = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.noktaDoku, color: 0xfff0d2, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(1.35); s.visible = false;
      this.sahne.add(s); this.parlamalar.push(s);
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
    /* Tabanca taşıyan kurtulanın kendi düşüş klipleri var; tüfek ölümüyle
       düşerken eller olmayan bir tüfeği kavrıyordu. Havuz boş çıkarsa
       (zombiler, tabanca kliplerini taşımayan aktörler) tüfek setine düşer. */
    const tabancaSet = ['tabancaOlum', 'tabancaOlum2'].filter(x => a.eylem[x]);
    if (a.tabanca && tabancaSet.length)
      return tabancaSet[Math.floor(Math.random() * tabancaSet.length)];

    const secenek = ['olum', 'olum2', 'olum3', 'olumKafa']
      .filter(x => a.eylem[x] && (x !== 'olumKafa' || kafaIzin));
    if (!secenek.length) return 'olum';
    /* Tek vuruşta devrilme (sniper, yakın av tüfeği) sert klibe yönelsin;
       gerisi düz rastgele. */
    if (oran >= 0.9 && Math.random() < 0.5) return secenek[0];
    return secenek[Math.floor(Math.random() * secenek.length)];
  }

  /** Kalabalıkta üst üste binmeyi azaltır — YALNIZ GÖRSEL.
   *
   *  Motor 1B'dir ve `serit` (yanal x) motorda yalnız ATANIR, hiç OKUNMAZ;
   *  burada verilen kayma hiçbir denge sayısını etkilemez. Bu yüzden
   *  düzeltme motora değil sahneye yazıldı: ölçüm zinciri (K0) dokunulmadan
   *  kalır.
   *
   *  Sorun: beş şerit var ama zombiler yürürken aynı derinlikte toplanıyor;
   *  aynı z bandında yan yana düşenler birbirini örtüyor ve kalabalıkta
   *  tür farkı okunmaz oluyor. En çok kaybeden tank ve boss: küçük
   *  zombiler önlerine geçince tamamen kayboluyorlar.
   *
   *  Yöntem: derinlik bandına göre tek geçişli gevşetme. Ağır olan az,
   *  hafif olan çok kaçar — böylece kalabalık boss'un ETRAFINDAN akar,
   *  boss yerinde kalır.
   */
  _kalabalikAyir(savas, dt) {
    const liste = this._ayirmaListe || (this._ayirmaListe = []);
    liste.length = 0;
    for (const z of savas.zombiler) {
      const a = this.zombiAktor.get(z.id);
      if (!a || z.olu) continue;
      if (a.kayma === undefined) a.kayma = 0;
      a.hedefKayma = 0;
      /* Ağırlık ölçekten gelir: boss 1,65 · tank 1,28 · yürüyen 1,00. */
      liste.push({ a, z: z.z, x: z.serit + a.kayma,
                   agirlik: (ZOMBI_SUNUM[z.tur] || {}).olcek || 1 });
    }
    if (liste.length < 2) return;
    liste.sort((p, q) => p.z - q.z);

    /* Sıralı olduğu için her aktör yalnız KENDİNDEN SONRAKİ birkaç komşuyla
       karşılaştırılır; z farkı eşiği aşınca döngü kırılır. n² değil. */
    const DERINLIK = 1.35;    /* bu kadar yakın z'ler aynı bandda sayılır */
    const AYRIM = 0.95;       /* bandda istenen asgari yanal ayrım */
    for (let i = 0; i < liste.length; i++) {
      const p = liste[i];
      for (let j = i + 1; j < liste.length; j++) {
        const q = liste[j];
        if (q.z - p.z > DERINLIK) break;
        const d = q.x - p.x;
        const mesafe = Math.abs(d);
        if (mesafe >= AYRIM) continue;
        /* Tam üst üste ise yönü id'den türet: rastgele kullanmak
           kareler arası titreme yaratır. */
        const yon = mesafe < 0.001 ? ((p.a.uid || i) % 2 ? 1 : -1) : Math.sign(d);
        const eksik = (AYRIM - mesafe) * 0.5;
        const toplam = p.agirlik + q.agirlik;
        /* Ağır olan az kaçar: payı KARŞI tarafın ağırlığından gelir. */
        p.a.hedefKayma -= yon * eksik * (q.agirlik / toplam) * 2;
        q.a.hedefKayma += yon * eksik * (p.agirlik / toplam) * 2;
      }
    }

    /* Yumuşatma ve sınır. Anında uygulamak zombileri ışınlıyor; kayma
       koridor dışına taşmamalı. */
    const SINIR = 1.45;
    for (const p of liste) {
      const hedef = Math.max(-SINIR, Math.min(SINIR, p.a.kayma + p.a.hedefKayma));
      p.a.kayma += (hedef - p.a.kayma) * Math.min(1, dt * 6);
    }
  }

  /** Namludan hedefe iz çizer. `bas` dünya konumu, `hedef` savaş zombisi. */
  _iz(bas, hedef) {
    const m = this._vfxAl(this.izler);
    const son = this._izSon || (this._izSon = new THREE.Vector3());
    const yon = this._izYon || (this._izYon = new THREE.Vector3());
    /* Gövde ortası: zemin yerine göğüs hizası, iz zombinin içinden geçsin. */
    son.set(hedef.serit, 1.15, hedef.z);
    yon.subVectors(son, bas);
    const uzunluk = yon.length();
    if (uzunluk < 0.2) { m.visible = false; return; }
    yon.divideScalar(uzunluk);
    m.position.copy(bas).addScaledVector(yon, uzunluk / 2);
    m.quaternion.setFromUnitVectors(this._izX || (this._izX = new THREE.Vector3(1, 0, 0)), yon);
    m.scale.set(uzunluk, 1, 1);
    m.material.opacity = 0.85;
    m.visible = true;
    m.userData.t = 0.055;      /* çok kısa: uzun iz lazer gibi duruyor */
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
    this.mekanMat.color.setHex(t.duvar).multiplyScalar(0.82);
    this.mekanCizgiMat.color.setHex(t.gunes);
    this.mekanRayMat.color.setHex(t.sis);
    this.mekanVurguMat.color.setHex(t.lamba || t.gunes);
    this.mekanPropMat.color.setHex(t.duvar).multiplyScalar(1.75);
    /* Işık dili temadan: lamba rengi ve siluet ayıran arka ışık. Gerçek
       ışık SAYISI değişmiyor, yalnız renk ve şiddet. */
    this.lambaMat.color.setHex(t.lamba || t.gunes);
    this.rim.color.setHex(t.rimRenk || t.ortam);
    this.rimTaban = t.rimGuc || 1.4;
    this.rim.intensity = this.rimTaban;
    /* Mekân silueti: aynı anda yalnız bir grup görünür. */
    for (const [ad, g] of Object.entries(this.mekan)) g.visible = (ad === t.anahtar);
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

  /** Dört mekânın mimari silueti.
   *
   *  Sorun: tema yalnız RENK değiştiriyordu. Dışarıdan bakan biri dört
   *  mekânı ayırt edemedi — "hepsi aynı koridor". Renk mekânı söyler,
   *  siluet gösterir; göz siluetten okur.
   *
   *  Maliyet kuralı: her parça InstancedMesh, tek geometri + tek materyal.
   *  Dört mekân da kurulur ama aynı anda YALNIZ BİRİ görünür (`tema()`).
   *  Toplam ek çizim çağrısı mekân başına 3-4.
   *
   *  Ölçüler koridora göre: duvar iç yüzü x=±4,5 · tavan y≈3,6 ·
   *  oynanan derinlik z = +2 … −46.
   */
  _mekanKur() {
    this.mekan = {};
    /* Ortak materyaller: gövde (temayla koyulaşır), çizgi (zemin işaretleri),
       oyuk (kapı/pencere boşluğu — sisin rengine yakın koyu). */
    this.mekanMat  = new THREE.MeshLambertMaterial({ color: 0x24272c });
    this.mekanCizgiMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.055 });
    this.mekanOyukMat = new THREE.MeshBasicMaterial({ color: 0x0b0d10 });
    /* Ray/travers için AYRI ve koyu materyal. Gövde materyali kullanılınca
       raylar zeminden parlak çıkıyor ve koridorun tam ortasında zombilerle
       yarışan bir merdiven oluyordu. Ray bir VURGU değil, zeminde bir OYUK
       gibi okunmalı: zemin renginden koyu. */
    this.mekanRayMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    /* İmza proplarının okunan yüzeyi: tabela levhası, lamba başlığı.
       Işık almadan kendi rengini verir — küçük bir vurgu için ayrı ışık
       açmanın anlamı yok. Rengi temanın lamba renginden gelir. */
    this.mekanVurguMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff });
    /* Prop gövdesi duvardan AÇIK olmalı: aynı renk olunca siluet duvara
       karışıyor ve "tanımlayıcı obje" hiçbir şey tanımlamıyordu. */
    this.mekanPropMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });

    /* ── İMZA PROP BANDI ──
       Ölçüldü: zombiler koridorda hiçbir zaman |x| = 3,40'ı geçmiyor
       (574 örnek, bölüm 18). Duvar iç yüzü 4,5'te. Proplar bu iki sayının
       arasına, 3,6-4,5 bandına konur — böylece hiçbir prop hiçbir zombiyi
       kapatamaz. Aşama 4'te tavan kirişleriyle öğrenilen ders: okunabilirlik
       dekordan önce gelir. */
    const PROP_X = 4.05;

    /** Bir InstancedMesh'i verilen dönüşümlerle doldurup gruba ekler. */
    const ekle = (grup, geo, mat, yerlesim) => {
      const m = new THREE.InstancedMesh(geo, mat, yerlesim.length);
      const d = new THREE.Object3D();
      yerlesim.forEach((y, i) => {
        d.position.set(y[0], y[1], y[2]);
        d.rotation.set(y[3] || 0, y[4] || 0, y[5] || 0);
        d.scale.set(y[6] === undefined ? 1 : y[6], y[7] === undefined ? 1 : y[7],
                    y[8] === undefined ? 1 : y[8]);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = false; m.receiveShadow = false;
      m.frustumCulled = false;      /* koridor boyu uzun, kutu yanıltıyor */
      grup.add(m);
      return m;
    };
    const yatay = -Math.PI / 2;     /* PlaneGeometry'yi zemine yatırır */

    /* ── OTOPARK: kolon + beton kiriş + park çizgileri ── */
    {
      const g = new THREE.Group();
      const kolonZ = [], kirisZ = [], cizgi = [];
      for (let i = 0; i < 11; i++) {
        const z = 2 - i * 4.4;
        kolonZ.push([-4.55, 1.7, z], [4.55, 1.7, z]);
        /* Kiriş UÇLARI, koridoru geçen tam kiriş DEĞİL. İlk denemede
           kirişler 9,4 birim genişti ve koridoru enine kesiyordu: kamera
           alçak olduğu için tavandaki her şey oyun alanının önüne düşüyor
           ve zombileri kapatıyordu. Okunabilirlik mimariden önce gelir. */
        kirisZ.push([-3.85, 3.3, z], [3.85, 3.3, z]);
        /* Park yeri çizgileri: koridora DİK, iki yanda. */
        cizgi.push([-3.5, 0.012, z - 1.1, yatay], [3.5, 0.012, z - 1.1, yatay]);
      }
      ekle(g, new THREE.BoxGeometry(0.55, 3.4, 0.55), this.mekanMat, kolonZ);
      ekle(g, new THREE.BoxGeometry(1.7, 0.3, 0.42), this.mekanMat, kirisZ);
      ekle(g, new THREE.PlaneGeometry(1.9, 0.07), this.mekanCizgiMat, cizgi);
      /* İmza prop 1: park bariyeri (boru + iki direk). */
      const barZ = [-8, -19, -30], bar = [], barDirek = [];
      for (const z of barZ) for (const yon of [-1, 1]) {
        bar.push([yon * PROP_X, 0.62, z]);
        barDirek.push([yon * PROP_X - 0.5, 0.31, z], [yon * PROP_X + 0.5, 0.31, z]);
      }
      ekle(g, new THREE.BoxGeometry(1.2, 0.1, 0.1), this.mekanPropMat, bar);
      ekle(g, new THREE.BoxGeometry(0.08, 0.62, 0.08), this.mekanPropMat, barDirek);
      /* İmza prop 2: park yeri tabelası (direk + levha). */
      const tabZ = [-13, -25], tabDirek = [], tabLevha = [];
      for (const z of tabZ) for (const yon of [-1, 1]) {
        tabDirek.push([yon * PROP_X, 1.0, z]);
        tabLevha.push([yon * PROP_X, 2.0, z, 0, yon * Math.PI / 2, 0]);
      }
      ekle(g, new THREE.BoxGeometry(0.07, 2.0, 0.07), this.mekanPropMat, tabDirek);
      ekle(g, new THREE.PlaneGeometry(0.42, 0.34), this.mekanVurguMat, tabLevha);
      this.mekan.otopark = g;
    }

    /* ── SOKAK: kaldırım + cephe silueti + yol şeritleri ── */
    {
      const g = new THREE.Group();
      /* Kaldırım: koridor boyunca iki uzun blok. */
      ekle(g, new THREE.BoxGeometry(0.62, 0.24, 62), this.mekanMat,
           [[-4.1, 0.12, -14], [4.1, 0.12, -14]]);
      /* Cephe blokları duvarın ARKASINDA ve daha yüksek: 3,6 m duvarın
         üstünden görünüp gökyüzü çizgisini kırarlar. Yükseklik ritmi
         sabit bir diziden geliyor, rastgele değil — her açılışta aynı
         şehir silueti çıksın. */
      const yukseklik = [7.2, 4.6, 9.0, 5.8, 6.4, 8.2, 5.0, 7.8, 6.0, 4.2, 8.6];
      const cephe = [];
      yukseklik.forEach((h, i) => {
        const z = 1 - i * 5.6;
        for (const yon of [-1, 1])
          cephe.push([yon * 7.4, h / 2, z, 0, 0, 0, 1, h / 6, 1]);
      });
      ekle(g, new THREE.BoxGeometry(3.4, 6, 4.6), this.mekanMat, cephe);
      /* Yol orta şeridi: kesikli. */
      const serit = [];
      for (let i = 0; i < 16; i++) serit.push([0, 0.013, 1 - i * 3.4, yatay]);
      ekle(g, new THREE.PlaneGeometry(0.16, 1.7), this.mekanCizgiMat, serit);
      /* İmza prop 1: sokak lambası. Direk + koridora doğru uzanan kol +
         kendi rengini veren başlık. Sokağın en zayıf tema olmasının sebebi
         dikey işaret yokluğuydu. */
      const lambaZ = [-6, -16, -26, -36], direk = [], kol = [], bas = [];
      for (const z of lambaZ) for (const yon of [-1, 1]) {
        direk.push([yon * PROP_X, 1.7, z]);
        kol.push([yon * (PROP_X - 0.22), 3.36, z]);
        bas.push([yon * (PROP_X - 0.42), 3.2, z, -Math.PI / 2, 0, 0]);
      }
      ekle(g, new THREE.BoxGeometry(0.1, 3.4, 0.1), this.mekanPropMat, direk);
      ekle(g, new THREE.BoxGeometry(0.46, 0.08, 0.08), this.mekanPropMat, kol);
      ekle(g, new THREE.PlaneGeometry(0.34, 0.2), this.mekanVurguMat, bas);
      /* İmza prop 2: terk edilmiş araç. Dar tutuldu (0,85) çünkü güvenli
         bant 0,9 birim; silueti uzunluğu ve tavan çizgisi taşıyor. */
      const aracZ = [-11, -31], govde = [], kabin = [];
      for (let i = 0; i < aracZ.length; i++) {
        const yon = i % 2 ? 1 : -1;
        govde.push([yon * PROP_X, 0.34, aracZ[i]]);
        kabin.push([yon * PROP_X, 0.78, aracZ[i] + 0.15]);
      }
      ekle(g, new THREE.BoxGeometry(0.85, 0.68, 2.4), this.mekanPropMat, govde);
      ekle(g, new THREE.BoxGeometry(0.72, 0.42, 1.2), this.mekanPropMat, kabin);
      this.mekan.sokak = g;
    }

    /* ── METRO: ray + travers + peron + tünel kemeri ── */
    {
      const g = new THREE.Group();
      ekle(g, new THREE.BoxGeometry(0.11, 0.09, 62), this.mekanRayMat,
           [[-0.78, 0.05, -14], [0.78, 0.05, -14]]);
      /* TRAVERS YOK — bilinçli. Denendi ve çıkarıldı: traversler öldürme
         koridorunun tam ortasına bir merdiven çiziyor, göz zombiler yerine
         onu takip ediyordu. Sıklaştırmak da koyultmak da meşguliyeti
         çözmedi; kaldırmak çözdü. İki ray + peron + kaburga metro kimliğini
         zaten taşıyor, üstelik zemini boş bırakarak. */
      /* Peron: raydan yüksek, yanlarda. Zemini böler, koridor "tünel" olur. */
      ekle(g, new THREE.BoxGeometry(2.0, 0.55, 62), this.mekanMat,
           [[-3.5, 0.28, -14], [3.5, 0.28, -14]]);
      /* Tünel kaburgaları — otoparktaki kirişle aynı ders: tam genişlik
         koridoru kesiyor ve zombileri kapatıyordu. Yalnız kenar uçları
         kaldı; tünel hissini peron + ray zaten taşıyor. */
      const kaburga = [];
      for (let i = 0; i < 13; i++) {
        const z = 1 - i * 3.8;
        kaburga.push([-3.9, 3.38, z], [3.9, 3.38, z]);
      }
      ekle(g, new THREE.BoxGeometry(1.9, 0.36, 0.34), this.mekanMat, kaburga);
      /* İmza prop 1: peron bankı. Peron yüzeyinin üstüne oturur (y 0,55). */
      const bankZ = [-9, -21, -33], oturak = [], ayak = [];
      for (const z of bankZ) for (const yon of [-1, 1]) {
        oturak.push([yon * (PROP_X - 0.35), 0.98, z]);
        ayak.push([yon * (PROP_X - 0.35), 0.76, z - 0.5],
                  [yon * (PROP_X - 0.35), 0.76, z + 0.5]);
      }
      ekle(g, new THREE.BoxGeometry(0.5, 0.09, 1.5), this.mekanPropMat, oturak);
      ekle(g, new THREE.BoxGeometry(0.4, 0.36, 0.08), this.mekanPropMat, ayak);
      /* İmza prop 2: istasyon tabelası — asılı, kendi rengini veren levha. */
      const istZ = [-15, -29], istDirek = [], istLevha = [];
      for (const z of istZ) for (const yon of [-1, 1]) {
        istDirek.push([yon * PROP_X, 2.2, z]);
        istLevha.push([yon * PROP_X, 2.55, z, 0, yon * Math.PI / 2, 0]);
      }
      ekle(g, new THREE.BoxGeometry(0.06, 1.4, 0.06), this.mekanPropMat, istDirek);
      ekle(g, new THREE.PlaneGeometry(0.9, 0.26), this.mekanVurguMat, istLevha);
      this.mekan.metro = g;
    }

    /* ── HASTANE: kapı oyukları + duvar alt bandı + karo zemin ── */
    {
      const g = new THREE.Group();
      const kapi = [];
      for (let i = 0; i < 11; i++) {
        const z = 0 - i * 5.2;
        kapi.push([-4.46, 1.05, z, 0, Math.PI / 2, 0],
                  [4.46, 1.05, z, 0, -Math.PI / 2, 0]);
      }
      ekle(g, new THREE.PlaneGeometry(1.15, 2.1), this.mekanOyukMat, kapi);
      /* Duvar alt bandı — klinik koridorların imzası. */
      ekle(g, new THREE.BoxGeometry(0.07, 0.42, 62), this.mekanMat,
           [[-4.46, 0.5, -14], [4.46, 0.5, -14]]);
      /* Karo zemin: enine derz + iki boyuna derz. Zemin ölçek kazanıyor. */
      const karo = [];
      for (let i = 0; i < 26; i++) karo.push([0, 0.012, 1 - i * 2.4, yatay]);
      ekle(g, new THREE.PlaneGeometry(9.2, 0.045), this.mekanCizgiMat, karo);
      ekle(g, new THREE.PlaneGeometry(0.045, 62), this.mekanCizgiMat,
           [[-2.3, 0.012, -14, yatay], [2.3, 0.012, -14, yatay]]);
      /* İmza prop 1: koridorda bırakılmış sedye. Alçak ve dar; hastane
         koridorunun terk edilmişliğini tek nesneyle anlatır. */
      const sedyeZ = [-10, -24, -38], yatak = [], sedyeAyak = [];
      for (let i = 0; i < sedyeZ.length; i++) {
        const yon = i % 2 ? 1 : -1, z = sedyeZ[i];
        yatak.push([yon * PROP_X, 0.68, z]);
        for (const dz of [-0.75, 0.75])
          sedyeAyak.push([yon * PROP_X, 0.33, z + dz]);
      }
      ekle(g, new THREE.BoxGeometry(0.62, 0.12, 2.0), this.mekanPropMat, yatak);
      ekle(g, new THREE.BoxGeometry(0.5, 0.66, 0.07), this.mekanPropMat, sedyeAyak);
      /* İmza prop 2: medikal dolap — duvara dayalı dik kutu, kapı oyukları
         arasındaki boş duvarı kırar. */
      const dolapZ = [-17, -31], dolap = [], dolapYuz = [];
      for (const z of dolapZ) for (const yon of [-1, 1]) {
        dolap.push([yon * (PROP_X + 0.2), 0.9, z]);
        dolapYuz.push([yon * (PROP_X - 0.11), 1.35, z, 0, yon * Math.PI / 2, 0]);
      }
      ekle(g, new THREE.BoxGeometry(0.42, 1.8, 0.9), this.mekanPropMat, dolap);
      ekle(g, new THREE.PlaneGeometry(0.5, 0.22), this.mekanVurguMat, dolapYuz);
      this.mekan.hastane = g;
    }

    for (const g of Object.values(this.mekan)) { g.visible = false; this.sahne.add(g); }
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

    /* ── NAMLU UCU ──
       Namlu alevi eskiden sabit bir noktaya çiziliyordu (serit+0,3 · 1,42 ·
       z−0,55). Ölçüm: alev revolverde 25 cm, keskin nişancıda 67 cm sapıyordu
       — tüfeğin yarısı kadar. Sabit nokta ayrıca kurtulanın hedefe dönüşünü
       de yok sayıyordu.
       Çözüm: ucu MODELİN KENDİ geometrisinden bul, silaha çocuk olarak bağla.
       Böylece el kemiğini, gövde dönüşünü ve ölçeği kendiliğinden izler.
       Yönelim varsayılmıyor: en uzun eksenin iki ucu da ölçülüp atış yönüne
       (−z) bakan seçiliyor. */
    aktor.kok.updateWorldMatrix(true, true);
    const sonKutu = new THREE.Box3().setFromObject(s);
    const sb = sonKutu.getSize(new THREE.Vector3());
    const eksen = sb.x >= sb.y && sb.x >= sb.z ? 'x' : sb.y >= sb.z ? 'y' : 'z';
    const merkez = sonKutu.getCenter(new THREE.Vector3());
    const ucA = merkez.clone(); ucA[eksen] = sonKutu.min[eksen];
    const ucB = merkez.clone(); ucB[eksen] = sonKutu.max[eksen];
    const ucDunya = ucA.z < ucB.z ? ucA : ucB;
    const namlu = new THREE.Object3D();
    namlu.position.copy(s.worldToLocal(ucDunya.clone()));
    s.add(namlu);
    s.userData.namlu = namlu;

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
    /* Havuzdan gelen aktör eski yanal kaymasını taşımamalı: yeni doğan
       zombi koridorun kenarında belirip sonra ortaya kayardı. */
    a.kayma = 0; a.hedefKayma = 0;
    const s = ZOMBI_SUNUM[tur];
    a.kok.scale.setScalar(s.olcek);
    a.kok.visible = true;
    /* Zombi +z yönünde yürür: kurtulanın tersine bakmalı. Aynı dönüşü
       vermek onu geri geri yürütüyordu. */
    a.kok.rotation.y = 0;
    a.mixer.stopAllAction();
    a.aktif = null;
    /* ── Yürüyüş klibi türe göre ──
       Koşucunun kendi koşu klibi var; hızlandırılmış yürüyüş "hızlı yürüyen"
       gibi duruyordu, tür farkı silüetten okunmuyordu. Aynı sorun tank ve
       boss'ta daha büyüktü: ekrandaki en iri iki düşman sıradan bir
       yürüyenle birebir aynı adımı atıyordu. Ölçek büyütmek yetmiyor —
       göz hareketten okuyor. */
    if (tur === 'kosucu' && a.eylem.kos) a.yuruKlip = 'kos';
    else if ((tur === 'tank' || tur === 'boss') && a.eylem.agirYuru) a.yuruKlip = 'agirYuru';
    else {
      /* Üç yürüyüş varyasyonu arasında dağıt. */
      const secenek = ['yuru', 'yuru2', 'yuru3'].filter(x => a.eylem[x]);
      a.yuruKlip = secenek[this._sayac % secenek.length] || 'yuru';
    }
    const refHiz = a.yuruKlip === 'kos' ? 2.4 : YURU_REF_HIZ;
    /* ±%12 tempo sapması: aynı türden zombiler bile aynı adımı atmasın. */
    const sapma = 1 + (((this._sayac * 37) % 25) / 100 - 0.12);
    a.yuruHiz = Math.max(0.3, Math.min(2.6, ZOMBILER[tur].hiz / refHiz * sapma));
    /* Saldırı varyasyonu: klipler arasında id'ye göre dağıt — tekdüzelik
       "zombiler hep aynı şeyi yapıyor" hissi veriyordu. Tank kafa/yumruk
       darbesi, boss tekme atar: ağır düşman ısırmaz, savurur. */
    const saldiriSecenek = (tur === 'boss')  ? ['bossSaldiri', 'agirSaldiri']
                         : (tur === 'tank')  ? ['agirSaldiri', 'agirSaldiri2']
                         : ['saldiri', 'saldiri2', 'saldiri3'];
    const uygun = saldiriSecenek.filter(x => a.eylem[x]);
    a.saldiriKlip = uygun.length ? uygun[this._sayac++ % uygun.length]
                                 : ['saldiri', 'saldiri2', 'saldiri3'][this._sayac++ % 3];
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
        /* Boss girişi: arka ışık kısa süre güçlenir. Kükreme SESİ zaten
           doğumda çalıyor (ses.js TUR_DOGUM); bu onun görsel karşılığı. */
        if (o.zombi.tur === 'boss') this.rimVurgu = 1.4;
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
          /* Alev namlu ucundan çıkar. Namlu nesnesi silaha bağlı olduğu için
             el kemiğini ve gövde dönüşünü izler; sabit konum ikisini de yok
             sayıyordu (bkz. _silahBagla). Silah yoksa eski sabit noktaya
             düşülür — alevin hiç çıkmaması daha kötü. */
          const nam = a.silah && a.silah.userData.namlu;
          if (nam) nam.getWorldPosition(f.position);
          else f.position.set(o.kurtulan.serit + 0.3, 1.42, o.kurtulan.z - 0.55);
          /* İz: namludan hedefe. Hedef yoksa iz de yok — havaya çizilen
             bir iz atışın nereye gittiğini yanlış söyler. */
          if (o.hedef && !o.hedef.olu) this._iz(f.position, o.hedef);
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
        /* Düşman parlaması: isabet işaretinden ayrı, daha geniş ve çok daha
           kısa. Vuruşun DÜŞMANA değdiğini söyler, havada bir yere değil. */
        const p = this._vfxAl(this.parlamalar);
        p.visible = true; p.material.opacity = 0.7; p.userData.t = 0.075;
        p.position.set(o.zombi.serit, 1.2, o.zombi.z);
        if (z && z.aktif !== 'olum') {
          /* Ağır türler kendi vuruş tepkisini verir: tank ve boss sıradan
             bir yürüyen gibi irkilmemeli, ağırlığını taşımalı. */
          const vk = ((z.tur === 'tank' || z.tur === 'boss') && z.eylem.agirVurus)
            ? 'agirVurus' : 'vurus';
          this.oynat(z, vk, { dongu: false, gecis: 0.07 });
          z.kilit = 0.4;
        }
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
        if (k && !o.kurtulan.olu) {
          /* Tabanca taşıyan kendi vuruş tepkisini kullanır; tüfek klibi
             kolları bir anlığına tüfek duruşuna çekiyordu. */
          const hk = (k.tabanca && k.ust.tabancaHasar) ? 'tabancaHasar' : 'hasar';
          if (k.ust[hk]) {
            this.kanal(k, 'ust', hk, { dongu: false, gecis: 0.05, hiz: 1.3 });
            k.ustKilit = 0.3;
          }
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

    /* Kalabalık ayrımı ÖNCE hesaplanır, konumlar sonra yazılır. */
    this._kalabalikAyir(savas, dt);

    let bossZ = null;
    for (const z of savas.zombiler) {
      const a = this.zombiAktor.get(z.id);
      if (!a || z.olu) continue;
      a.kok.position.set(z.serit + (a.kayma || 0), 0, z.z);
      if (z.tur === 'boss') bossZ = a.kok.position;
      a.kilit -= dt;
      const yk = a.yuruKlip || 'yuru';
      if (a.kilit <= 0 && a.aktif !== yk && z.yuruyor !== false)
        this.oynat(a, yk, { hiz: a.yuruHiz || 1 });
      a.mixer.update(dt);
    }

    /* ── Boss sunumu ──
       Boss zaten yürüyenden %65 büyük (ZOMBI_SUNUM ölçek 1,65) ve doğumda
       kendi kükreme sesi çalıyor. Eksik olan görsel vurguydu: kalabalıkta
       hangisinin boss olduğu ölçekten geç anlaşılıyordu.
       Zemin aurası hedef halkasıyla karışmasın diye AYRI okunur: daha
       geniş, kırmızı ve çok daha soluk. */
    if (this.bossAura) {
      if (bossZ) {
        this.bossAura.visible = true;
        this.bossAura.position.set(bossZ.x, 0.03, bossZ.z);
        /* Yavaş nabız: sabit halka sahne dekoru gibi duruyor, nabız
           "burada bir şey var" diyor. */
        this.bossNabiz = (this.bossNabiz || 0) + dt;
        const n = 1 + Math.sin(this.bossNabiz * 2.4) * 0.06;
        this.bossAura.scale.setScalar(n);
        this.bossAura.material.opacity = 0.16 + Math.sin(this.bossNabiz * 2.4) * 0.05;
      } else this.bossAura.visible = false;
    }
    /* Doğum vurgusu: boss sahneye girerken arka ışık kısa süre güçlenir,
       sonra temanın kendi değerine döner. Yeni ışık EKLENMİYOR. */
    if (this.rimVurgu > 0) {
      this.rimVurgu = Math.max(0, this.rimVurgu - dt);
      this.rim.intensity = this.rimTaban * (1 + 0.55 * (this.rimVurgu / 1.4));
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
    for (const m of this.izler) {
      if (!m.visible) continue;
      m.userData.t -= dt;
      m.material.opacity = Math.max(0, 0.85 * (m.userData.t / 0.055));
      if (m.userData.t <= 0) m.visible = false;
    }
    for (const p of this.parlamalar) {
      if (!p.visible) continue;
      p.userData.t -= dt;
      p.material.opacity = Math.max(0, 0.7 * (p.userData.t / 0.075));
      if (p.userData.t <= 0) p.visible = false;
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
