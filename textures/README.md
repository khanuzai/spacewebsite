# Texture Files

Drop your texture files in this folder. The app will try `.jpg` first, then `.png`.

## Required filenames

| File                    | Description                          | Recommended resolution |
|-------------------------|--------------------------------------|------------------------|
| `earth_daymap`          | Earth surface (color)                | 8K (8192×4096)         |
| `earth_nightmap`        | Earth city lights (dark side)        | 8K                     |
| `earth_clouds`          | Cloud layer (grayscale/alpha)        | 8K                     |
| `earth_normalmap`       | Terrain normal map                   | 8K                     |
| `earth_specularmap`     | Ocean specular (white=water)         | 8K                     |
| `mercury`               | Mercury surface                      | 4K                     |
| `venus_surface`         | Venus surface                        | 4K                     |
| `mars`                  | Mars surface                         | 8K                     |
| `jupiter`               | Jupiter cloud bands                  | 8K                     |
| `saturn`                | Saturn surface                       | 4K                     |
| `saturn_ring`           | Saturn ring opacity (PNG with alpha) | 2K×256                 |
| `uranus`                | Uranus surface                       | 4K                     |
| `neptune`               | Neptune surface                      | 4K                     |

## Good free sources

- **Solar System Scope** — https://www.solarsystemscope.com/textures/ (free for personal use)
- **NASA Visible Earth** — https://visibleearth.nasa.gov (public domain)
- **JHT's Planetary Pixel Emporium** — http://planetpixelemporium.com/planets.html

## Without textures

All objects fall back to procedural shaders, so the scene still looks great
without any texture files. The Sun, stars, atmosphere glow, and Saturn's rings
are 100% procedural.
