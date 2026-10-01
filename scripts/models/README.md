# Rebuilding the railway models

The source models are large (the station OBJ alone is 21 MB) and are not kept in the repository.

**Train, track and station** (`export-train.html`): a page that loads `Train station.obj` + `.mtl` with three.js and writes `train-lead.glb`, `train-carriage.glb`, `track.glb` and `station.glb`. Serve a folder containing it, `three` (symlinked from `node_modules/three`), and the OBJ under `obj/`. Open it in a browser (or headless Chromium) and save the base64 GLBs in `window.out`.

**Billboard** (`billboard.py`): run with Blender's Python module (`pip install bpy==4.2.0`).

Conventions every model follows: metres, forward −Z, track centre x = 0, rail top y = 0.
