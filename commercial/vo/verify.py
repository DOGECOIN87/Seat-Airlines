# Transcribes each VO line with a local Whisper (tiny.en via sherpa-onnx) and compares with the script.
import sys, glob, sherpa_onnx, soundfile as sf, numpy as np, re, subprocess, os
d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/tts/sherpa-onnx-whisper-tiny.en'
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f'{d}/tiny.en-encoder.int8.onnx', decoder=f'{d}/tiny.en-decoder.int8.onnx', tokens=f'{d}/tiny.en-tokens.txt')
script = {'01': 'Ladies and gentlemen, welcome aboard flight SA 350.', '02': "One plane. Everyone's in it. Your bag is your seat.", '03': 'Market cap is altitude.', '04': 'Seat Airlines. Now boarding.'}
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()
for n, text in script.items():
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f'public/vo/{n}.wav', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout
    s = rec.create_stream(); s.accept_waveform(16000, np.frombuffer(raw, dtype=np.float32)); rec.decode_stream(s)
    got = s.result.text.strip(); a, b = norm(text), norm(got)
    hit = sum(1 for w in a if w in b) / len(a)
    print(f'{n} {hit:4.0%}  heard: {got}')
