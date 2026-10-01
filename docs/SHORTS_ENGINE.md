# Shorts and Reels engine

Nuvellum's vertical-video engine is a **zero-cost production engine**. It renders a real 9:16 MP4 with local Piper narration. The Shorts autopilot (below) chooses stories, renders, verifies and distributes them without anyone picking a slug.

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

Piper is used only when `PIPER_MODEL` points to a local voice model. GitHub's smoke test uses `espeak-ng` so the whole render can be proven without a paid API. **espeak is functional validation, not the intended final public voice quality.** Production uses Piper with `en_GB-cori-high` (below); the autopilot refuses any Short narrated by a fallback voice.

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

### Shorts autopilot (the normal production path)

`.github/workflows/shorts-autopilot.yml` runs every four hours (minute 41). Nobody picks a slug.

1. **Select.** The autopilot reads every published story from the last 72 hours (`engines/shorts/autopilot.mjs`).
   - **Never automatic:**
     - Opinion/Essay/Ideas/Review;
     - any story whose `risk` is not `low` (sensitive stories are excluded by default);
     - breaking/developing stories;
     - stories whose own text can't yield a verified, verbatim 20–45 second script with at least two supporting lines.
   - **Ranking.** Eligible stories get a deterministic score: recency, then real photo over illustration over text-led, then section fit and script length.
2. **Short ledger** (`shorts/<slug>.json` on the `social-ledger` branch).
   - A story with a rendered Short is never rendered again.
   - Stories that already had a hand-made Short on `social-assets` count as done.
   - A failed render is retried once on a later run, then left alone (`render.final`).
   - At most **2 Shorts in 24 hours**, and one render at a time.
3. **Render** with the existing engine. The voice is Piper `en_GB-cori-high`, with `NUVELLUM_TTS=piper,silent`, so a missing Piper produces a silent file that fails verification. It is never published.
4. **Verify** the actual files (`autopilot-cli.mjs verify`). The checks:
   - 1080×1920, H.264 video and an AAC audio track;
   - Piper narration (no fallback);
   - a duration of 15–60s;
   - non-empty `short.mp4`, `poster.jpg`, `captions.srt`, `script.json`, `plan.json` and `report.json`;
   - every spoken line re-checked as verbatim text of the published article (no invented claims).
5. **Store** the six files on `social-assets` under `shorts/<slug>/`. **Record** the result in the ledger.
6. **Distribute** to the video platforms (`engines/publish/video.mjs`). Each platform is independent, and the ledger is saved after every upload, so nothing is uploaded twice.
   - `sent`: public.
   - `awaiting_approval`: uploaded, but the platform kept it private (an unaudited YouTube project). This is final, and a person can make it public.
   - `blocked_credentials`: no secrets yet.
   - `blocked_external_approval`: TikTok until its audit; set the variable `TIKTOK_AUDITED=yes` afterwards.
   - `queued`: retried up to 3 attempts. A run with no new Short retries queued uploads instead.
   - `failed`.

**Isolation.** A failed render or upload is recorded, and the owner-alert step reports repeated failures. Neither can block or undo article publication.

| Platform | API | Secrets |
| --- | --- | --- |
| YouTube Shorts | Data API v3 resumable `videos.insert` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` (optional variable `YOUTUBE_PRIVACY`) |
| Facebook Reels | Graph `/{page-id}/video_reels` (start → `file_url` → finish) | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` |
| Instagram Reels | Graph `/{ig-user-id}/media` `REELS` → status poll → `media_publish` | `INSTAGRAM_USER_ID`, `INSTAGRAM_TOKEN` |
| TikTok | Content Posting API, `FILE_UPLOAD` Direct Post | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`; variable `TIKTOK_AUDITED=yes` after the audit |

Meta fetches the MP4 by public URL from `https://raw.githubusercontent.com/Sh-010/Nuvellum/social-assets/shorts/<slug>/short.mp4` (the repository is public). YouTube and TikTok receive the bytes directly.

**Manual runs:**
- **Actions → Shorts autopilot → Run workflow.** An optional `slug` skips the recency window and daily limit, but never the safety rules. `distribute` can be unticked to render only.
- **Actions → Shorts preview** still renders a review artifact. `short-assets.yml` (`ops/short-request.txt`) still exists for a hand-requested Short.

### Shorts preview (review tool)


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

The preview does **not** post. Distribution is the autopilot's job (above). The article publication gate never depends on either.

Hook rule: the first line must stand on its own. The article's lead sentence is favoured, and lines that point back to earlier context ("such deals", "those talks") are penalised.

