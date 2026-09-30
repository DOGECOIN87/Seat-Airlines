"""
Pull the seated man out of a 3ds Max scene and write him out as the base
mesh every passenger in the cabin is made from.

    python3 scripts/passenger-mesh.py path/to/3d-model.max

The scene is a man in a wheelchair, from SketchUp by way of Max: nine
Editable Mesh nodes, each with its own position, rotation and scale. This
reads the Max file's chunk tree directly (it is an OLE compound document; the
Scene stream is a tree of id/size chunks), puts every node where the file
says it goes, and then:

  * drops the wheelchair and the man's own head, which is replaced in the
    browser by a carved one that can wear hair and carry a face;
  * turns him from Max's Z-up inches into the cabin's Y-up metres, facing -z,
    scaled so his eyes sit where a seated passenger's do;
  * sits him back: in the wheelchair he is hunched forward over his knees,
    which in an airline seat would be somebody leaning into the seat ahead.
    The upper body is swung back about the hips while the hands stay on
    the knees.

What comes out is src/three/passengerMesh.ts: positions quantised to 16 bits,
triangles, and for each vertex what it is (shirt, trousers, shoes, skin) and
which limb it belongs to.

Needs olefile (pip install olefile).
"""
import base64
import math
import struct
import sys

import olefile

if len(sys.argv) < 2:
    sys.exit(__doc__)

ole = olefile.OleFileIO(sys.argv[1])
scene = ole.openstream('Scene').read()


def read_chunks(buf, off, end, depth, out):
    while off < end - 6:
        cid, size = struct.unpack_from('<HI', buf, off)
        head = 6
        if size == 0:
            size, = struct.unpack_from('<Q', buf, off + 6)
            head = 14
            container = bool(size & (1 << 63))
            size &= (1 << 63) - 1
        else:
            container = bool(size & 0x80000000)
            size &= 0x7fffffff
        if size < head or off + size > end:
            return False
        out.append([depth, cid, container, off + head, off + size])
        if container and not read_chunks(buf, off + head, off + size, depth + 1, out):
            out[-1][2] = False
        off += size
    return True


chunks = []
read_chunks(scene, 0, len(scene), 0, chunks)
objects = [c for c in chunks if c[0] == 1]


def inside(obj):
    return [c for c in chunks if c[3] >= obj[3] and c[4] <= obj[4]]


def data(obj, cid):
    for c in inside(obj):
        if c[0] == obj[0] + 1 and c[1] == cid:
            return scene[c[3]:c[4]]
    return None


def references(i):
    d = data(objects[i], 0x2035)
    if d is not None:
        v = struct.unpack_from('<%di' % (len(d) // 4), d)
        return dict(zip(v[1::2], v[2::2]))
    d = data(objects[i], 0x2034)
    if d is not None:
        return dict(enumerate(struct.unpack_from('<%di' % (len(d) // 4), d)))
    return {}


def float_value(i):
    for c in inside(objects[i]):
        if c[1] == 0x2501:
            return struct.unpack_from('<f', scene, c[3])[0]
    return 0.0


def mesh(i):
    cs = inside(objects[i])
    vc = next(c for c in cs if c[1] == 0x914)
    fc = next(c for c in cs if c[1] == 0x912)
    n, = struct.unpack_from('<I', scene, vc[3])
    v = struct.unpack_from('<%df' % (n * 3), scene, vc[3] + 4)
    m, = struct.unpack_from('<I', scene, fc[3])
    rec = (fc[4] - fc[3] - 4) // m
    f = [struct.unpack_from('<3I', scene, fc[3] + 4 + k * rec) for k in range(m)]
    return [v[k:k + 3] for k in range(0, len(v), 3)], f


NODE = None
nodes = {}
for i, obj in enumerate(objects):
    name = data(obj, 0x962)
    offset = data(obj, 0x96a)
    if name is None or offset is None:
        continue
    name = name.decode('utf-16le')
    refs = references(i)
    prs = references(refs[0])
    pos = [float_value(x) for x in references(prs[0]).values()]
    rot = [float_value(x) for x in references(prs[1]).values()]
    scale = struct.unpack_from('<3f', data(objects[prs[2]], 0x2505))
    off = struct.unpack('<3f', offset)
    verts, faces = mesh(refs[1])
    cx, sx = math.cos(rot[0]), math.sin(rot[0])
    cy, sy = math.cos(rot[1]), math.sin(rot[1])
    cz, sz = math.cos(rot[2]), math.sin(rot[2])
    world = []
    for (x, y, z) in verts:
        x, y, z = (x + off[0]) * scale[0], (y + off[1]) * scale[1], (z + off[2]) * scale[2]
        y, z = y * cx - z * sx, y * sx + z * cx
        x, z = x * cy + z * sy, -x * sy + z * cy
        x, y = x * cz - y * sz, x * sz + y * cz
        world.append((x + pos[0], y + pos[1], z + pos[2]))
    nodes[name] = (world, faces, rot[2])

# Every part of him is turned about five degrees; face him straight ahead.
TURN = nodes['Group_005'][2]
for name, (world, faces, _) in list(nodes.items()):
    if name.startswith('Group'):
        c, s_ = math.cos(-TURN), math.sin(-TURN)
        world = [(x * c - y * s_, x * s_ + y * c, z) for (x, y, z) in world]
    nodes[name] = (world, faces)

# What each node is. The wheelchair and the mouth go; so do the eyes, which
# belong to the head that is being replaced.
KIND = {
    'Group_008': 'shirt',
    'Group_007': 'trousers',
    'Group_009': 'shoes',
    'Group_005': 'skin',
    'Group_004': 'eyes',
    'Group_003': 'vest',
    'Group_002': 'buttons',
}

# ── Into the cabin's frame ───────────────────────────────────────────────
# Max is Z-up in inches with this man facing -y. The cabin is Y-up in metres
# facing -z: (x, y, z) -> (-x, z, y) is a rotation, not a mirror.
INCH = 0.0254
SEAT_Z = 18.2      # underside of the trousers, where he meets the seat
BACK_Y = 9.95      # back of the trousers, where he meets the seat back
EYE_Z = 46.8       # the eyes
HIP = (3.5, 22.5)  # the hip joint, as (y, z)
TARGET_EYE = 0.70  # a seated passenger's eye, above the cushion
FLOOR = -0.5       # the cabin floor, below the cushion
LEAN_BACK = math.radians(14)
HEAD = (0.0, -5.6, 46.6)  # the middle of his skull

scale = 1.0


eye_pts = nodes['Group_004'][0]
MID_X = sum(p[0] for p in eye_pts) / len(eye_pts)
EYE_Y = sum(p[1] for p in eye_pts) / len(eye_pts)
EYE_Z = sum(p[2] for p in eye_pts) / len(eye_pts)


def to_cabin(p):
    x, y, z = p
    return (-(x - MID_X) * INCH * scale, (z - SEAT_Z) * INCH * scale, (y - BACK_Y) * INCH * scale + 0.105)


def swing(p, w, hip):
    a = LEAN_BACK * w
    y, z = p[1] - hip[1], p[2] - hip[2]
    return (p[0], hip[1] + y * math.cos(a) - z * math.sin(a), hip[2] + y * math.sin(a) + z * math.cos(a))


# Sitting up raises the head, so find the scale that puts the eyes at the
# right height once he has.
for _ in range(4):
    hip = to_cabin((0, HIP[0], HIP[1]))
    eye = swing(to_cabin((MID_X, EYE_Y, EYE_Z)), 1, hip)
    scale *= TARGET_EYE / eye[1]
hip = to_cabin((0, HIP[0], HIP[1]))
head = swing(to_cabin((MID_X, HEAD[1], HEAD[2])), 1, hip)

parts = []
for name, kind in KIND.items():
    verts, faces = nodes[name]
    verts = [to_cabin(p) for p in verts]
    keep = [True] * len(verts)
    if kind == 'eyes':
        eyes = [[p for p in verts if p[0] * s > 0] for s in (-1, 1)]
        continue
    if kind == 'skin':
        # The skin is the arms, and the head and neck: split them, so the
        # head can turn on its own.
        is_head = [abs(p[0]) < 0.105 and p[1] > 0.45 for p in verts]
        for want, name in ((False, 'skin'), (True, 'head')):
            fs = [f for f in faces if all(is_head[i] == want for i in f)]
            used = sorted({i for f in fs for i in f})
            remap = {old: new for new, old in enumerate(used)}
            parts.append([name, [verts[i] for i in used], [tuple(remap[i] for i in f) for f in fs]])
        continue
    parts.append([kind, verts, faces])

# The fingertips: the lowest skin on each side.
skin = next(p for p in parts if p[0] == 'skin')
tips = {}
for s in (-1, 1):
    side = [p for p in skin[1] if p[0] * s > 0]
    tips[s] = min(side, key=lambda p: p[1])


def lean_weight(p, kind):
    """How much of the swing back a point takes: none below the hips, all of
    it from the chest up — except down the arms, where it fades out toward the
    hands so they stay on the knees."""
    up = min(1.0, max(0.0, (p[1] - hip[1] - 0.02) / 0.2))
    up = up * up * (3 - 2 * up)
    if kind == 'head':
        return 1.0
    if kind == 'skin' or (kind == 'shirt' and abs(p[0]) > 0.15):
        tip = tips[1 if p[0] > 0 else -1]
        d = math.dist(p, tip)
        fade = min(1.0, max(0.0, (d - 0.18) / 0.3))
        return fade * fade * (3 - 2 * fade)
    return up


def reach_floor(p, kind):
    """A wheelchair seat is lower than an airline one, so his feet would
    hang. Stretch him from the knees down until they are on the floor."""
    if kind not in ('trousers', 'shoes') or p[1] > 0.1:
        return p
    t = min(1.0, (0.1 - p[1]) / (0.1 - low))
    return (p[0], p[1] - (low - FLOOR) * t, p[2])


# Some of the parts were modelled inside out — the shirt is wound so its
# faces point in — and a renderer that culls back faces then draws the inside
# of its back through the holes where the wheelchair used to hide it. Turn
# every closed part to enclose positive volume, and the flat ones (the vest
# in the collar, the buttons) to face forward.
def facing(verts, faces):
    vol = 0.0
    nz = 0.0
    c = [sum(p[k] for p in verts) / len(verts) for k in range(3)]
    for a, b, d in faces:
        pa, pb, pd = ([verts[i][k] - c[k] for k in range(3)] for i in (a, b, d))
        vol += pa[0] * (pb[1] * pd[2] - pb[2] * pd[1]) - pa[1] * (pb[0] * pd[2] - pb[2] * pd[0]) + pa[2] * (pb[0] * pd[1] - pb[1] * pd[0])
        u = [pb[k] - pa[k] for k in range(3)]
        w = [pd[k] - pa[k] for k in range(3)]
        nz += u[0] * w[1] - u[1] * w[0]
    return vol, nz


for part in parts:
    vol, nz = facing(part[1], part[2])
    flat = part[0] in ('vest', 'buttons')
    if (flat and nz > 0) or (not flat and vol < 0):
        part[2] = [(a, d, b) for a, b, d in part[2]]

low = min(p[1] for part in parts if part[0] == 'shoes' for p in part[1])
for part in parts:
    part[1] = [reach_floor(swing(p, lean_weight(p, part[0]), hip), part[0]) for p in part[1]]

# ── Out ──────────────────────────────────────────────────────────────────
PART = {'shirt': 0, 'trousers': 1, 'shoes': 2, 'skin': 3, 'vest': 4, 'buttons': 5, 'head': 6}
eyes = [[swing(p, 1, hip) for p in side] for side in eyes]
eye_centres = [[sum(p[k] for p in side) / len(side) for k in range(3)] for side in eyes]
allv = [p for part in parts for p in part[1]]
lo = [min(p[k] for p in allv) for k in range(3)]
hi = [max(p[k] for p in allv) for k in range(3)]
span = [hi[k] - lo[k] for k in range(3)]

pos = bytearray()
extra = bytearray()
idx = bytearray()
ranges = []
base = 0
for kind, verts, faces in parts:
    for p in verts:
        pos += struct.pack('<3H', *[round((p[k] - lo[k]) / span[k] * 65535) for k in range(3)])
        tip = tips[1 if p[0] > 0 else -1]
        # Distance to the fingertips on that side, in 4 mm steps: how the
        # browser tells a hand from a forearm from an upper arm.
        extra += struct.pack('<B', min(255, round(math.dist(p, tip) / 0.004)))
    for f in faces:
        idx += struct.pack('<3H', *[base + i for i in f])
    ranges.append((PART[kind], base, len(verts), len(faces)))
    base += len(verts)

blob = bytes(pos) + bytes(extra) + bytes(idx)
b64 = base64.b64encode(blob).decode()
lines = [b64[i:i + 100] for i in range(0, len(b64), 100)]
total_faces = sum(r[3] for r in ranges)

with open('src/three/passengerMesh.ts', 'w') as out:
    out.write('/* Generated by scripts/passenger-mesh.py from the seated figure; do not edit. */\n\n')
    out.write('/** One seated man, in metres: y up from the seat cushion, facing -z, the seat back at z = +0.1. */\n')
    out.write('export const PASSENGER_MESH = {\n')
    out.write(f'  vertices: {base},\n  triangles: {total_faces},\n')
    out.write(f'  min: [{lo[0]:.5f}, {lo[1]:.5f}, {lo[2]:.5f}],\n')
    out.write(f'  span: [{span[0]:.5f}, {span[1]:.5f}, {span[2]:.5f}],\n')
    out.write(f'  hip: [{hip[0]:.4f}, {hip[1]:.4f}, {hip[2]:.4f}],\n')
    out.write('  /** The middle of his skull. */\n')
    out.write(f'  head: [{head[0]:.4f}, {head[1]:.4f}, {head[2]:.4f}],\n')
    out.write('  /** The middle of each eye, from the eyes the model had. */\n')
    out.write('  eyes: [' + ', '.join('[%.4f, %.4f, %.4f]' % tuple(e) for e in eye_centres) + '],\n')
    out.write('  /** kind (0 shirt, 1 trousers, 2 shoes, 3 skin, 4 vest, 5 buttons, 6 head), first vertex, vertex count, triangle count. */\n')
    out.write('  parts: [' + ', '.join('[%d, %d, %d, %d]' % r for r in ranges) + '],\n')
    out.write('  /** Uint16 x3 positions, then a Uint8 per vertex (distance to the fingertips, 4 mm steps), then Uint16 x3 triangles. */\n')
    out.write('  data:\n' + '\n'.join(f"    '{l}' +" for l in lines)[:-2] + ',\n')
    out.write('} as const;\n')

print('vertices', base, 'triangles', total_faces, 'scale', round(scale, 4), 'hip', [round(h, 3) for h in hip], 'head', [round(h, 3) for h in head], 'bytes', len(blob))
print('bounds', [round(x, 3) for x in lo], [round(x, 3) for x in hi])
