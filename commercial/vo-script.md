# VO script (15 s cut)

Voice: Piper TTS, stock synthetic voice `en-us-ryan-high` (rhasspy/piper v0.0.2 release). Not a clone of anyone.
One file per line in `public/vo/`, so a voice actor can replace them 1:1. Regenerate with `sh vo/generate.sh`; check with `python3 vo/verify.py` (local Whisper tiny.en via sherpa-onnx).

| File | Timeline (A) | Line | Treatment | Length |
|---|---|---|---|---|
| 01.wav | 0.30 s | "Ladies and gentlemen, welcome aboard flight S A three-fifty." | Cabin PA: HP 300 Hz, LP 3.4 kHz, soft clip, small room | 3.22 s |
| 02.wav | 5.80 s | "One plane. Everyone's in it. Your bag is your seat." | Clean, close | 3.47 s |
| 03.wav | 11.05 s | "Market cap is altitude." | Clean | 1.62 s |
| 04.wav | 12.90 s | "Seat Airlines. Now boarding." (TTS text "Seat, Airlines." so "Seat" is not swallowed) | Clean, 1.06× | 1.83 s |

STT check: all four lines transcribed word for word ("SA-350" for S A three-fifty).
Lines 02 are shown as kinetic headlines rather than captions. Line 04 is shown by the end card itself.
