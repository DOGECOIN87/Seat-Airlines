# Railway models

Loaded by `src/three/RailWorld.ts`. All are converted from the models supplied for the railway:

| File | From | Notes |
| :-- | :-- | :-- |
| `train-lead.glb` | `Train station.obj`, the metro car with cab | Forward is −Z, rail top is y = 0, metres (scaled 1.435 / 5.3 from the model's own gauge). Material names are kept; the livery is applied at runtime by name (`Body`, `Metal`, `GLASS`…). |
| `train-carriage.glb` | the same car | Rear half mirrored about the car's middle, so it has no cab. |
| `track.glb` | the station's rails and sleepers | One 14.7748 m tile (24 sleepers); the scene tiles it along the line near the camera. |
| `station.glb` | the platform side of the station | Third-party signage textures removed; the scene draws its own signs. Scaled ×1.75 at runtime. |
| `billboard.glb` | `BILLBOARD.blend` | Transforms baked; textures downscaled to 512 px. The ad face is drawn on a plane of its own over the panel. |

The reference photo that was mapped onto the car body in the source (a real operator's train, with its logo) is deliberately not included.

To rebuild them, see `scripts/models/README.md`.
