# Minigame fleet assets

These models were prepared from the supplied `good-year-blimp.zip` and
`f35-fighter-jet.zip` attachments.

| Asset | Preparation | Size |
| --- | --- | --- |
| `seat-blimp.glb` | Retains the supplied blimp geometry, removes the original logo textures, and applies navy/gold materials. `aerialCraft.ts` paints SEAT AIRLINES onto both curved hull sides. | 912,344 bytes |
| `f35.glb` | Converts and simplifies the supplied FBX, retains its material regions, normalizes length to 15.7 m with the nose along −z, and separates the port elevator for damage. `fighterJet.ts` adds two wing-mounted missiles and boost effects. | 2,511,432 bytes |

SHA-256:

```text
seat-blimp.glb  4599e6757b40fc4c1cca967f20d66e2c260581a724955d8516961b296ce27d8f
f35.glb         81780a1b4a0f26294a31ce0199612fbb0a0a5cc6a2ef07b5e030402edc20d12d
```

The F35 loads when its selector preview or player ride is used. Both loaders
discard late results after disposal, and release owned GPU resources.
