"""Bake BILLBOARD.blend into public/models/billboard.glb.

    pip install bpy==4.2.0
    python3 scripts/models/billboard.py path/to/BILLBOARD.blend public/models/billboard.glb
"""
import sys
import bpy
import mathutils

src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
for o in list(bpy.data.objects):
    if o.name == 'Plane' or o.type in ('LIGHT', 'CAMERA'):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.make_single_user(object=True, obdata=True)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
world = {o.name: o.matrix_world.copy() for o in bpy.data.objects}
for o in meshes:
    o.data.transform(world[o.name])
for o in bpy.data.objects:
    o.parent = None
for o in meshes:
    o.matrix_world = mathutils.Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
lo = mathutils.Vector((1e9,) * 3)
hi = mathutils.Vector((-1e9,) * 3)
for o in meshes:
    for v in o.data.vertices:
        lo = mathutils.Vector(map(min, lo, v.co))
        hi = mathutils.Vector(map(max, hi, v.co))
# Centred on its post, standing on the ground.
shift = mathutils.Matrix.Translation(-mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
for o in meshes:
    o.data.transform(shift)
for img in bpy.data.images:
    if img.size[0] > 512:
        img.scale(512, 512)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
bpy.context.view_layer.objects.active.name = 'Billboard'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=80, export_apply=True)
