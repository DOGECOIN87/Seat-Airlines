# VO script: launch intro (4K, 33 s) and short (14.5 s)

The voice is recorded in ElevenLabs. Generate **one file per line**, name it as below and drop it in
`commercial/vo/intro/`. Run `python3 vo/prep.py` (trims the silence, caps long pauses, speeds slow reads a touch, levels to 48 kHz WAV).
The film plays each line at its cue if the file is there and skips it if it is not, so you can render
before the voice is done.

## Voice settings (ElevenLabs)

- **Model:** Eleven v3 (or Multilingual v2 if v3 sounds too theatrical).
- **Voice:** warm, confident, mid-low; think "a captain on the PA enjoying the flight", not "movie trailer".
  Good stock starting points: *Brian*, *Daniel*, *George*. Your own voice or a cloned one works the same way.
- **Stability** 45–55 %, **Similarity** 75 %, **Style exaggeration** 15–25 %, **Speaker boost** on, speed 1.0.
- **Output:** WAV / PCM 48 kHz if your plan allows, otherwise MP3 44.1 kHz 192 kbps.
- Generate each line 3–4 times and keep the best take. Leave a breath at the start; the prep script trims it.

## Lines

| File | Plays over | Line (paste exactly) | Delivery |
|---|---|---|---|
| `01-welcome` | The badge slams in (intro and short) | `Welcome aboard... Seat Airlines.` | Cabin PA. Warm, a smile in it, small pause before the name. |
| `02-one-plane` | The airliner above the clouds | `One plane. Everyone's in it.` | Easy and conversational. Two beats. |
| `03-your-bag` | The seat map filling | `Your bag is your seat. The bigger the bag... the better the seat.` | Knowing, a little sly on the second half. |
| `04-altitude` | The climb begins (intro and short) | `Market cap is altitude.` | The thesis. Slow down, land on "altitude". |
| `05-to-the-moon` | The climb: each phrase on its band (clouds, space, Moon, Mars) | `Through the clouds. Into space. To the moon... and beyond.` | Builds with the climb; each phrase a step up. |
| `06-fly-higher` | The departures board (intro and short) | `Hold more. Fly higher.` | The tagline. Confident, not shouted. |
| `07-now-boarding` | The end card (intro and short) | `Seat Airlines. Now boarding.` | Final PA call. Crisp, a beat between the two halves. |

The scene lengths and cues live in `config/intro.json`; the prep script records each take's length and
phrase starts in `config/vo-intro.json`, and the on-screen words land on the spoken phrases.

**v3 audio tags (optional):** v3 reads tags in square brackets, e.g. `[warmly] Welcome aboard... Seat Airlines.`
or `[confident] Hold more. Fly higher.` Use them sparingly; the punctuation above already shapes the read.

**Pronunciation:** "Seat Airlines" should come out as two clear words. If the model runs them together,
type `Seat, Airlines.` (a comma) and regenerate.

## Whole read, for a single take

If you'd rather generate it in one go and let me cut it, paste this and name the file `00-full`:

```
Welcome aboard... Seat Airlines.

One plane. Everyone's in it.

Your bag is your seat. The bigger the bag... the better the seat.

Market cap is altitude.

Through the clouds. Into space. To the moon... and beyond.

Hold more. Fly higher.

Seat Airlines. Now boarding.
```

## On-screen text (already in the film; for reference)

WELCOME ABOARD · ONE PLANE. EVERYONE'S IN IT. · YOUR BAG IS YOUR SEAT. · MARKET CAP IS ALTITUDE ·
HOLD MORE. FLY HIGHER. · SEAT-AIRLINES.SPACE · NOW BOARDING · BUILT ON SOLANA
