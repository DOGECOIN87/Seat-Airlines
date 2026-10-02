#!/usr/bin/env python3
"""
Prepares the ElevenLabs VO for the launch intro and the explainer.

Reads the takes in vo/<film>/*.wav|mp3 (named as in vo-script-<film>.md, for
each film in FILMS) and, for each one, writes public/vo/<film>/<name>.wav:
  - speech found by silencedetect (-45 dB, 0.25 s), padded a little so no
    consonant or breath is clipped;
  - leading and trailing silence removed, pauses inside the line capped at
    MAX_GAP seconds (the read keeps its rhythm, the film keeps its pace);
  - sped up by its TEMPO (rubberband, formants kept, so the voice does not
    go chipmunk), since the reads run slower than the cuts;
  - levelled to -18 LUFS with a -1.5 dBTP ceiling, high-passed at 70 Hz,
    48 kHz mono.
Lines in SPLIT are also written phrase by phrase (<name>-p1.wav, -p2, ...) so
the film can land each phrase on its own beat.

config/vo-<film>.json records every file's length and the start of each
phrase in it; the film reads that to place lines and sync on-screen words.

Usage: python3 vo/prep.py [--max-gap 0.45]
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILMS = ('intro', 'explainer')
MAX_GAP = float(sys.argv[sys.argv.index('--max-gap') + 1]) if '--max-gap' in sys.argv else 0.45
SPLIT = {'05-to-the-moon'}
# Speed per line (1.0 = as read). The slow, deliberate lines get the most.
TEMPO = {
    '01-welcome': 1.05, '02-one-plane': 1.06, '03-your-bag': 1.12, '04-altitude': 1.1,
    '05-to-the-moon': 1.1, '06-fly-higher': 1.06, '07-now-boarding': 1.04,
}
DEFAULT_TEMPO = 1.06
PAD_IN, PAD_OUT = 0.05, 0.09
TARGET_LUFS, CEILING = -18.0, -1.5


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def duration(path):
    return float(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)).stdout)


def speech(path):
    """Speech segments [(start, end)] from silencedetect."""
    err = run('ffmpeg', '-hide_banner', '-i', str(path), '-af', 'silencedetect=n=-45dB:d=0.25', '-f', 'null', '-').stderr
    total = duration(path)
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', err)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', err)]
    silences = list(zip(starts, ends + [total] * (len(starts) - len(ends))))
    segs, at = [], 0.0
    for s, e in silences:
        if s > at:
            segs.append((at, s))
        at = e
    if at < total:
        segs.append((at, total))
    return [(max(0.0, a - PAD_IN), min(total, b + PAD_OUT)) for a, b in segs if b - a > 0.05]


def loudness(path):
    err = run('ffmpeg', '-hide_banner', '-i', str(path), '-af', 'loudnorm=print_format=json', '-f', 'null', '-').stderr
    return float(json.loads(err[err.rindex('{'):err.rindex('}') + 1])['input_i'])


def render(src, segs, gaps, gain, tempo, dest):
    """Concatenate the segments with the given gaps between them, at the given tempo and gain."""
    parts, labels = [], []
    for i, (a, b) in enumerate(segs):
        parts.append(f'[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS[s{i}]')
        labels.append(f'[s{i}]')
        if i < len(segs) - 1:
            parts.append(f'anullsrc=r=48000:cl=mono,atrim=0:{gaps[i]:.4f}[g{i}]')
            labels.append(f'[g{i}]')
    chain = ';'.join(parts) + f";{''.join(labels)}concat=n={len(labels)}:v=0:a=1,{stretch(tempo)}highpass=f=70,volume={gain:.2f}dB,alimiter=limit={10 ** (CEILING / 20):.4f}:level=disabled,aresample=48000[out]"
    run('ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-filter_complex', chain, '-map', '[out]', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(dest))


def stretch(tempo):
    return '' if abs(tempo - 1) < 1e-3 else f'rubberband=tempo={tempo}:formant=preserved:pitchq=quality,'


def prep(film):
    src_dir, out = ROOT / 'vo' / film, ROOT / 'public' / 'vo' / film
    manifest_path = ROOT / 'config' / f'vo-{film}.json'
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for src in sorted([*src_dir.glob('*.wav'), *src_dir.glob('*.mp3')]):
        name = src.stem
        segs = speech(src)
        if not segs:
            print(f'{name}: no speech found, skipped')
            continue
        gain = TARGET_LUFS - loudness(src)
        tempo = TEMPO.get(name, DEFAULT_TEMPO)
        # Pauses: the gap between padded segments, capped.
        gaps = [min(MAX_GAP, max(0.12, segs[i + 1][0] - segs[i][1])) for i in range(len(segs) - 1)]
        dest = out / f'{name}.wav'
        render(src, segs, gaps, gain, tempo, dest)
        phrases, at = [], 0.0
        for i, (a, b) in enumerate(segs):
            phrases.append(round(at / tempo, 3))
            at += (b - a) + (gaps[i] if i < len(gaps) else 0)
        manifest[name] = {'seconds': round(duration(dest), 3), 'phrases': phrases}
        print(f'{name}: {manifest[name]["seconds"]:.2f} s (×{tempo}), {len(segs)} phrase(s), gain {gain:+.1f} dB')
        if name in SPLIT:
            for i, seg in enumerate(segs):
                part = out / f'{name}-p{i + 1}.wav'
                render(src, [seg], [], gain, tempo, part)
                manifest[f'{name}-p{i + 1}'] = {'seconds': round(duration(part), 3), 'phrases': [0]}
                print(f'  {part.name}: {manifest[part.stem]["seconds"]:.2f} s')
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'wrote {manifest_path.relative_to(ROOT)}')


def main():
    for film in FILMS:
        prep(film)


if __name__ == '__main__':
    main()
