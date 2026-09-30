"""
Read the faces out of a SketchUp 8 model, placed where the model puts them.

    python3 scripts/skp-faces.py model.skp > faces.json

A SketchUp 8 file is an MFC archive: a stream of objects, each introduced by
a class tag, in which classes and objects share one running index and any
object already written is referred to by that index. Geometry lives in
component definitions — every group is an instance of one — each holding a
count, then its entities, then its GUID and name. This reads the classes a
model of an aeroplane is made of (vertices, edges, faces and the loops of
edge-uses round them, groups and component instances with their transforms,
and the texture positioning on a face) and walks the definitions from the
model's root, composing transforms on the way down.

Out comes a JSON list of faces: their loops as points in the model's inches,
the material each is painted with, and the path of groups it was reached by.
Materials are listed alongside, by index, with their names and colours.
"""
import json
import re
import struct
import sys

sys.setrecursionlimit(1000000)
b = open(sys.argv[1], 'rb').read()


class Stop(Exception):
    pass


CLS = {}


class R:
    def __init__(s, off, idx):
        s.o = off
        s.idx = idx
        s.objs = {}
        s.first_loop = None
        s.loopref = None

    def u8(s):
        v = b[s.o]
        s.o += 1
        return v

    def u16(s):
        v, = struct.unpack_from('<H', b, s.o)
        s.o += 2
        return v

    def u32(s):
        v, = struct.unpack_from('<I', b, s.o)
        s.o += 4
        return v

    def f64(s, n=1):
        v = struct.unpack_from('<%dd' % n, b, s.o)
        s.o += 8 * n
        return v

    def cstring(s):
        if b[s.o:s.o + 3] != b'\xff\xfe\xff':
            raise Stop(f'no string at {s.o:#x}')
        s.o += 3
        n = s.u8()
        if n == 0xff:
            n = s.u16()
        t = b[s.o:s.o + 2 * n].decode('utf-16le')
        s.o += 2 * n
        return t

    def obj(s):
        start = s.o
        tag = s.u16()
        if tag == 0:
            return None
        if tag == 0xFFFF:
            s.u16()
            ln = s.u16()
            name = b[s.o:s.o + ln].decode('latin1')
            s.o += ln
            ci = s.idx
            s.idx += 1
            CLS[ci] = name
        elif tag == 0x7FFF:
            big = s.u32()
            if not big & 0x80000000:
                return ('ref', big)
            ci = big & 0x7FFFFFFF
            name = CLS.get(ci)
            if name is None:
                raise Stop(f'unknown class {ci:#x} at {start:#x}')
        elif tag & 0x8000:
            ci = tag & 0x7FFF
            name = CLS.get(ci)
            if name is None:
                raise Stop(f'unknown class {ci:#x} at {start:#x}')
        else:
            return ('ref', tag)
        oi = s.idx
        s.idx += 1
        fn = getattr(s, 'r_' + name, None)
        if fn is None:
            raise Stop(f'no reader for {name} at {start:#x}')
        o = {'t': name, 'i': oi}
        s.objs[oi] = o
        fn(o)
        return o

    # A drawing element: attributes, material, and eight bytes of flags.
    def drawing(s, o):
        o['attr'] = s.obj()
        o['mat'] = s.obj()
        s.o += 8

    def r_CVertex(s, o):
        o['attr'] = s.obj()
        o['p'] = s.f64(3)

    def r_CEdge(s, o):
        s.drawing(o)
        o['v0'] = s.obj()
        o['v1'] = s.obj()
        s.obj()

    def r_CFace(s, o):
        s.drawing(o)
        s.f64(4)
        n = s.u32()
        if n > 1000:
            raise Stop(f'bad loop count at {s.o:#x}')
        o['loops'] = [s.obj() for _ in range(n)]
        s.obj()

    def r_CLoop(s, o):
        s.obj()
        s.o += 2
        if s.first_loop is None:
            s.first_loop = o['i']
        o['first'] = s.obj()

    def r_CEdgeUse(s, o):
        s.obj()
        o['edge'] = s.obj()
        o['rev'] = s.u8()
        loop = s.obj()
        if s.loopref is None and isinstance(loop, tuple):
            s.loopref = loop[1]
        o['next'] = s.obj()

    # On a textured face, its attributes hold the texture's positioning.
    def r_CAttributeContainer(s, o):
        s.obj()
        s.obj()
        s.o += 6

    def r_CFaceTextureCoords(s, o):
        s.obj()
        s.o += 4 + 25 * 8 + 4

    def instance(s, o):
        s.drawing(o)
        o['def'] = s.obj()
        o['m'] = s.f64(13)
        s.cstring()

    r_CGroup = instance
    r_CComponentInstance = instance


def entities(off, count, base):
    r = R(off, base)
    return r, [r.obj() for _ in range(count)]


def solve_base(off, count):
    """Where a definition's objects start in the running index: read off the
    first loop's back-reference, parsing with a provisional base of zero."""
    saved = dict(CLS)
    r = R(off, 0)
    try:
        for _ in range(count):
            r.obj()
            if r.loopref is not None:
                break
    except (Stop, struct.error, IndexError):
        pass
    CLS.clear()
    CLS.update(saved)
    if r.loopref is not None and r.first_loop is not None:
        return r.loopref - r.first_loop
    return None


def tail_ok(p):
    return b[p:p + 6] == b'\0' * 6 and b[p + 22:p + 25] == b'\xff\xfe\xff'


def class_index(name):
    return next((k for k, v in CLS.items() if v == name), None)


# The classes declared before the first definition, found from the file itself.
m = re.search(rb'\xff\xff..\x14\x00CComponentDefinition', b, re.S)
first_def = m.start()
# Classes and objects so far: the definition class sits at the index the first
# definition's own layer reference names, less two.
defs = []
# First definition: its classes are declared as it goes. Its entity count is
# the u32 before the first geometry class declaration.
g = re.search(rb'\xff\xff\x02\x00\x05\x00CEdge', b[first_def:])
start = first_def + g.start()
count, = struct.unpack_from('<I', b, start - 4)
layer_ref, = struct.unpack_from('<H', b, start - 10)
CLS[layer_ref - 2] = 'CComponentDefinition'
CLS[layer_ref - 6] = 'CLayer'
CLS[5] = 'CAttributeContainer'
base = layer_ref + 1
r, ents = entities(start, count, base)
defs.append({'index': base - 2, 'ents': ents, 'objs': r.objs, 'end': r.o, 'start': start})
def_class = layer_ref - 2
tags = [m.start() for m in re.finditer(struct.pack('<H', 0x8000 | def_class) + rb'\x00\x00', b)]
for d in tags:
    if d < defs[0]['end']:
        continue
    for q in range(d + 20, d + 600):
        cnt, = struct.unpack_from('<I', b, q - 4)
        if not 0 < cnt < 500000:
            continue
        t = b[q] | b[q + 1] << 8
        if not (t & 0x8000 or t == 0x7FFF):
            continue
        found = solve_base(q, cnt)
        if found is None:
            continue
        saved = dict(CLS)
        try:
            r, ents = entities(q, cnt, found)
        except (Stop, struct.error, IndexError, UnicodeDecodeError):
            CLS.clear()
            CLS.update(saved)
            continue
        if not tail_ok(r.o):
            CLS.clear()
            CLS.update(saved)
            continue
        defs.append({'index': found - 2, 'ents': ents, 'objs': r.objs, 'end': r.o, 'start': q})
        break

by_index = {d['index']: d for d in defs}
for d in defs:
    d['name'] = R(d['end'] + 22, 0).cstring()


def apply(m, p):
    x = m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9]
    y = m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10]
    z = m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11]
    return (x / m[12], y / m[12], z / m[12])


def compose(a, c):
    cols = []
    for k in range(3):
        v = c[k * 3:k * 3 + 3]
        cols += [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]]
    return cols + list(apply(a, c[9:12])) + [1.0]


def deref(x, objs):
    return objs.get(x[1]) if isinstance(x, tuple) else x


def loop_points(loop, objs):
    pts = []
    eu = loop['first']
    while isinstance(eu, dict):
        e = deref(eu['edge'], objs)
        v = deref(e['v1'] if eu['rev'] else e['v0'], objs)
        pts.append(v['p'])
        eu = eu['next']
    return pts


faces = []


def emit(index, M, path):
    d = by_index.get(index)
    if d is None:
        return
    path = path + '/' + d['name']
    objs = d['objs']
    for e in d['ents']:
        if not isinstance(e, dict):
            continue
        if e['t'] == 'CFace':
            loops = [[[round(c, 4) for c in apply(M, p)] for p in loop_points(l, objs)] for l in e['loops'] if isinstance(l, dict)]
            mat = e['mat']
            faces.append({'loops': loops, 'mat': mat[1] if isinstance(mat, tuple) else (mat['i'] if mat else -1), 'path': path})
        elif e['t'] in ('CGroup', 'CComponentInstance'):
            ref = e['def'][1] if isinstance(e['def'], tuple) else e['def']['i']
            emit(ref, compose(M, e['m']), path)


# The model's root: a definition that nobody else places. Place each of its
# groups and instances, at the transforms it gives them.
placed = set()
for d in defs:
    for e in d['ents']:
        if isinstance(e, dict) and e['t'] in ('CGroup', 'CComponentInstance'):
            placed.add(e['def'][1] if isinstance(e['def'], tuple) else e['def']['i'])
# The root places what no definition does. Its groups sit outside every
# definition's entities: look for a group anywhere that places a definition
# nobody else places, and put that down at the root's transform.
group_class = class_index('CGroup')
unplaced = {d['index'] for d in defs} - placed
spans = [(d['start'], d['end']) for d in defs]
roots = []
for m in re.finditer(struct.pack('<H', 0x8000 | group_class) + rb'\x00\x00', b[first_def:], re.S):
    at = first_def + m.start()
    if any(a <= at < e for a, e in spans):
        continue
    try:
        o = R(at, 0).obj()
    except (Stop, struct.error, IndexError, UnicodeDecodeError):
        continue
    if not o or abs(o['m'][12] - 1) > 1e-6:
        continue
    ref = o['def'][1] if isinstance(o['def'], tuple) else o['def']['i']
    if ref in unplaced:
        roots.append((ref, list(o['m'])))
for ref, m in roots:
    emit(ref, m, '')

# Materials: name, then two bytes, then RGBA.
materials = {}
mat_class = None
for k, v in CLS.items():
    pass
for m in re.finditer(rb'(.)\x80\x00\x00\xff\xfe\xff(.)', b[:first_def], re.S):
    s0 = m.start()
    n = b[s0 + 7]
    try:
        name = b[s0 + 8:s0 + 8 + 2 * n].decode('utf-16le')
    except UnicodeDecodeError:
        continue
    p = s0 + 8 + 2 * n + 2
    materials.setdefault('order', []).append({'name': name, 'rgb': list(b[p:p + 3])})

json.dump({'faces': faces, 'materials': materials.get('order', [])}, sys.stdout)
print(f'{len(defs)} definitions, {len(faces)} faces, roots {[d["name"] for d in defs if d["index"] in [r for r, _ in roots]]}', file=sys.stderr)
