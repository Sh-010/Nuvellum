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

`.github/workflows/shorts-preview.yml` renders a real preview as a PR smoke test and supports manual rendering by slug. It does **not** auto-post and the normal article publication gate never depends on it.

