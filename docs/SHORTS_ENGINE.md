# Shorts and Reels engine

Nuvellum's v1 vertical-video engine is a **zero-cost, dry-run production engine**. It can render a real 9:16 MP4, but nothing is posted to a social account automatically.

## Flow

```
published article
  -> choose a strong verbatim hook
  -> build an extractive 20–45 second script
  -> verify every spoken line is verbatim article text
  -> free/local narration (Piper or espeak-ng; silent fallback)
  -> timed 9:16 scene/caption plan
  -> deterministic Chromium frames
  -> ffmpeg H.264/AAC MP4 + poster + SRT
```

The output is intended for the short-video distribution track:

- X video
- Facebook Reels
- Instagram Reels
- TikTok
- YouTube Shorts

## Editorial safety

V1 deliberately does **not** paraphrase with an LLM. Hook and beats are selected from Nuvellum's published article sentences and remain verbatim. The CTA is fixed. This keeps sensitive stories from acquiring new claims during video generation.

The video does not display ingestion-source branding or source URLs. It presents the published Nuvellum story and Nuvellum branding.

## Visual system

- 1080×1920, 30 fps for full renders.
- Preview mode is half-resolution at 15 fps.
- Ivory, charcoal and dark burgundy from the production identity.
- Image-led stories use the article's real photo or approved illustration.
- Approved illustrations are labelled `ILLUSTRATION`.
- Text-led stories use a typographic Nuvellum treatment rather than invented imagery.
- Word-level caption timing and a branded end card are deterministic.

## Voice

Default zero-cost chain:

```
piper -> espeak -> silent
```

Piper is used only when `PIPER_MODEL` points to a local voice model. GitHub's smoke test uses `espeak-ng` so the whole render can be proven without a paid API. **espeak is functional validation, not the intended final public voice quality.** A better local Piper voice or an approved provider should be chosen before automatic public posting.

### Recommended free local voice (Piper)

**`en_GB-cori-high`**:

- **Voice:** single-speaker British English (female), trained from scratch on about 24 hours of **public-domain** LibriVox recordings. Of the British Piper voices, this has the cleanest licence.
- **Size:** 114 MB (`.onnx`) plus a 5 kB `.onnx.json`. `en_GB-cori-medium` is 63.5 MB if size matters.
- **Software licence:** Piper itself (`piper1-gpl`) is GPL-3.0. It runs as a separate local program and isn't vendored here.
- **Voices to avoid for publication use:**
  - `en_US-lessac-*`: its Blizzard 2013 data licence is **research-only, no commercial use**.
  - `alba`, `jenny_dioco` and `northern_english_male`: they are **fine-tuned from lessac**, so they carry its weights.

Do not commit voice models to the repository.

```bash
python3 -m pip install piper-tts
python3 -m piper.download_voices --download-dir "$HOME/piper-voices" en_GB-cori-high
export PIPER_MODEL="$HOME/piper-voices/en_GB-cori-high.onnx"   # PowerShell: $env:PIPER_MODEL = "$HOME\piper-voices\en_GB-cori-high.onnx"
NUVELLUM_TTS=piper,espeak,silent node engines/shorts/cli.mjs --slug <slug> --preview
```

The engine calls `piper --model "$PIPER_MODEL" --output_file line.wav` (or `python3 -m piper …`) with the text on stdin. The current `piper-tts` CLI accepts both. The `.onnx.json` must sit next to the `.onnx`.

Cori's source recordings are audiobook narration: calm, clear and unhurried, which suits restrained news reading better than espeak. Listen to the samples on the voice page before approving it for public posting.

Optional settings:

- `NUVELLUM_TTS`
- `PIPER_MODEL`
- `ESPEAK_VOICE`
- `ESPEAK_RATE`
- `FFMPEG_PATH` / `FFPROBE_PATH`
- `CHROMIUM_PATH`

## Running

Plan only, no browser/video:

```bash
node engines/shorts/cli.mjs --slug <slug> --no-render
```

Fast visual preview:

```bash
node engines/shorts/cli.mjs --slug <slug> --preview
```

Full render:

```bash
node engines/shorts/cli.mjs --slug <slug>
```

Outputs are under `engines/out/shorts/<slug>/`: `short.mp4`, `poster.jpg`, `captions.srt`, `script.json`, `plan.json`, and `report.json`.

## Automation status

`.github/workflows/shorts-preview.yml`:
- renders an espeak preview as a PR smoke test;
- supports **manual rendering with the Piper voice** (Actions → Shorts preview → Run workflow):
  - `slug`: a published story;
  - `voice`: `piper`, the default; or `espeak`;
  - `full`: 1080×1920, 30 fps.

Piper and `en_GB-cori-high` are installed at run time and cached, never committed. A verify step fails the run if:
- the narration fell back from the requested voice (a silent video can't pass as a Piper render);
- the MP4 has no AAC audio track;
- `captions.srt` is missing.

The MP4, poster, SRT and script are uploaded as a 7-day artifact for review.

It does **not** post. Social publishing (`docs/SOCIAL_DISTRIBUTION.md`) records YouTube as `skipped` until a reviewed Short exists, and TikTok always as `awaiting_approval`. The normal article publication gate never depends on either.

Hook rule: the first line must stand on its own. The article's lead sentence is favoured, and lines that point back to earlier context ("such deals", "those talks") are penalised.

