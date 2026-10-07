#!/usr/bin/env python3
"""Build browser MP3s and a sample-aligned effects sprite (requires ffmpeg).

Original recordings stay outside public/ so Vite only ships the optimized audio.
Run with: python3 scripts/build-audio.py
"""
import hashlib
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio-source'
OUTPUT = ROOT / 'public/audio'
RATE = 32000
CHANNELS = 2
SAMPLE_BYTES = 2 * CHANNELS
EFFECTS = {
    'blast': 'engine-blast.mp3',
    'lightning': 'lightning-strike.mp3',
    'ufo': 'ufo-appear.mp3',
    'wind': 'updraft-wind.mp3',
    'wasted': 'wasted.mp3',
    'fahh': 'fail-fahh.mp3',
    'trombone': 'fail-trombone.mp3',
    'wow': 'wow.mp3',
    'crowd': 'crash-crowd.mp3',
}


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


OUTPUT.mkdir(parents=True, exist_ok=True)
clips = {}
gap = bytes(RATE // 8 * SAMPLE_BYTES)
pcm = bytearray(gap)
with tempfile.TemporaryDirectory() as temp:
    temp = pathlib.Path(temp)
    for name, filename in EFFECTS.items():
        raw = temp / f'{name}.pcm'
        ffmpeg('-i', SOURCE / filename, '-f', 's16le', '-ar', RATE, '-ac', CHANNELS, raw)
        data = raw.read_bytes()
        clips[name] = {
            'offset': len(pcm) / SAMPLE_BYTES / RATE,
            'duration': len(data) / SAMPLE_BYTES / RATE,
        }
        pcm.extend(data)
        pcm.extend(gap)
    raw = temp / 'effects.pcm'
    raw.write_bytes(pcm)
    encoded = temp / 'effects.mp3'
    ffmpeg('-f', 's16le', '-ar', RATE, '-ac', CHANNELS, '-i', raw,
           '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', encoded)
    digest = hashlib.sha256(encoded.read_bytes()).hexdigest()[:12]
    sprite = f'game-effects-{digest}.mp3'
    for old in OUTPUT.glob('game-effects-*.mp3'):
        old.unlink()
    (OUTPUT / sprite).write_bytes(encoded.read_bytes())

for source in sorted(SOURCE.rglob('*.mp3')):
    relative = source.relative_to(SOURCE)
    if str(relative) in EFFECTS.values():
        continue
    target = OUTPUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    speech = relative.parts[0] == 'intercom'
    ambience = source.name == 'flight-cabin-ambience-loop.mp3'
    ffmpeg('-i', source, '-c:a', 'libmp3lame', '-b:a', '40k' if speech else '64k' if ambience else '48k',
           '-ar', '24000' if speech or not ambience else '32000', '-ac', '2' if ambience else '1',
           '-map_metadata', '-1', target)

manifest = {'file': f'audio/{sprite}', 'sampleRate': RATE, 'clips': clips}
(ROOT / 'src/lib/audioSprite.json').write_text(json.dumps(manifest, indent=2) + '\n')
before = sum(p.stat().st_size for p in SOURCE.rglob('*.mp3'))
after = sum(p.stat().st_size for p in OUTPUT.rglob('*.mp3'))
effects_before = sum((SOURCE / filename).stat().st_size for filename in EFFECTS.values())
effects_after = (OUTPUT / sprite).stat().st_size
print(f'All audio: {before:,} -> {after:,} bytes ({1 - after / before:.1%} smaller)')
print(f'Game effects: 9 requests -> 1; {effects_before:,} -> {effects_after:,} bytes ({1 - effects_after / effects_before:.1%} smaller)')
