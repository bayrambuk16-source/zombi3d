# Zombi 3D — oynanabilir prototip

Mobil, portrait, insan-vs-zombi koridor savunma oyunu. Three.js.
**Oyna:** https://bayrambuk16-source.github.io/zombi3d/

Bu repo yalnız **oynanabilir yapıyı** içerir (`docs/`). Tasarım belgeleri,
denge ölçüm laboratuvarı ve kaynak varlıklar burada değildir.

## Yapı
- `docs/oyun/` — oyun (HTML + js katmanları + karakter GLB'leri)
- `docs/denge/motor.mjs` — savaş motoru; ölçüm ve oyun aynı sınıfı çalıştırır
- `docs/silah/optim/` — silah modelleri
- `docs/ses/oyun/` — ses efektleri

## Varlık kaynakları
- Karakter ve animasyonlar: Adobe **Mixamo**
- Silah modelleri: **Meshy** topluluk kütüphanesi (CC0)
- Ses: **Kenney** (CC0) + Pixabay
