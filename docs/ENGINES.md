# Distribution Engine and Shorts Engine

Both live in `engines/`, a separate Node package with its own lockfile. They are not part of the site build, are not publication checks, and are designed so that **no failure in them can affect whether an article publishes**.

```bash
cd engines && npm ci
npx playwright-core install chromium     # once, for Shorts rendering
# also needs ffmpeg; espeak-ng (free) or Piper (free, better) for narration
npm test
```

## Distribution Engine

**Flow:** published article → `loadStory` → `generateCopy` (grounded) → platform adapters → ledger.

- **Payload** (`shared/article.mjs`): title, dek, section, risk, tags, sources, plain text, sentences, art, and the canonical Nuvellum URL. Only `status: published` articles qualify. Placeholder articles whose body is shared with other articles are refused.
- **Copy** (`distribution/copy.mjs`): templates built from the article's own headline and dek, which are grounded by construction. A model (`NUVELLUM_ROLE_SOCIAL`) may propose better copy, but each platform's text is accepted only if it:
  - fits the platform's length rules (X counts every link as 23 characters);
  - contains the article link where the platform allows links;
  - passes `shared/grounding.mjs`: every number, name and quotation appears in the article, and there's no hype or persuasion.

  Otherwise the template is used.
- **Adapters** (`distribution/adapters/`). Each one is disabled until its env vars exist:

  | Platform | Env | Notes |
  | --- | --- | --- |
  | X | `X_USER_ACCESS_TOKEN` | OAuth 2.0 user token with `tweet.write`. Create Post endpoint. |
  | Threads | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | Creates a TEXT container, then publishes it. |
  | Facebook Page | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` | Link post. The token goes in the POST body. |
  | Instagram | `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` | Needs a **publicly hosted JPEG** (`--image-url`). Instagram rejects SVG. |
  | TikTok | `TIKTOK_ACCESS_TOKEN` | Content Posting API, file upload. Posts `SELF_ONLY` until the TikTok app passes audit. |
  | YouTube Shorts | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | Resumable upload. `private` by default. |

- **Reliability:**
  - Each platform is isolated; one failure never stops the others.
  - Retryable errors (network, 429, 5xx) back off exponentially.
  - Auth or other 4xx errors, or 5 failed runs, move the post to `dead-letter`.
  - `engines/.state/distribution-ledger.jsonl` makes reruns idempotent: a platform is never posted twice for the same story.
- **Running it:** `node distribution/cli.mjs --slug <slug>` is a dry run and writes `engines/out/distribution/<slug>.json`. Add `--live` (or set `DISTRIBUTION_LIVE=1`) to post.
- **In CI:** `.github/workflows/distribution.yml` runs after a story reaches `main` (the publication gate dispatches it). It's a dry run until the repository variable `DISTRIBUTION_LIVE` is `on`, and the report is uploaded as an artifact.

Still untested against the live APIs, because no Nuvellum accounts exist yet: all six adapters. Their wire formats are tested against mock servers built from the platforms' documented APIs. Expect small adjustments during the first live run for each platform.

## Shorts Engine

**Flow:** published article → hook → 20–45 s script → verification → narration → scene plan → 9:16 frames → MP4.

- **Hook** (`shorts/script.mjs`): scores early sentences for specificity (numbers, names, contrast). It penalises context-dependent openers ("The organisation…", "However…") and prefers sentences that name the story's subjects. The Short creates curiosity about one true element; it does not retell the article.
- **Script:**
  - If `NUVELLUM_ROLE_SHORTS_SCRIPT` is set, a model may write the hook and beats. Every line must pass deterministic grounding (numbers, names and quotes in the article; no hype; no persuasion) and, if `NUVELLUM_ROLE_SHORTS_VERIFY` is set, an independent model check.
  - Otherwise, and **always for sensitive stories**, the script is extractive: verbatim article sentences.
  - If even that fails verification, no video is produced (`status: refused`).
- **Narration** (`shorts/tts.mjs`, chain `NUVELLUM_TTS`): ElevenLabs, OpenAI, Google (cloud), Piper (free, local, neural), espeak-ng (free, local), silent. One voice per video.
- **Plan** (`shorts/plan.mjs`): per-line timing from the measured audio, caption pages of at most 4 words with per-word timing, an end card, and a minimum of 20 s. Beats are dropped automatically if a slow voice would exceed 45 s.
- **Render** (`shorts/render.mjs`): Chromium draws `renderAt(t)` for each frame of a v5.1-branded template (masthead, section kicker, labelled illustration, animated word-level captions, source line, oxblood end card), and the frames stream into ffmpeg.
  - **Output:** `short.mp4` (1080×1920, 30 fps, H.264 High, yuv420p, AAC 48 kHz, loudness-normalised, faststart), `captions.srt`, `poster.jpg`, `script.json`, `plan.json`, `report.json`.
  - **Determinism:** the same inputs always produce the same frames.
- **Truthfulness:** artwork is always labelled as an illustration, never presented as footage. There are no fake quotes, invented consequences or persuasion, and the source outlets are credited on screen.
- **Running it:** `node shorts/cli.mjs --slug <slug>`. `--preview` renders at half size and 15 fps. Rendering takes about 100 s for a 40 s Short on a 2-vCPU machine.

A sample output from 2026-09-26: `scotland-diesel-prices-over-2-pounds`, 41.0 s, 3.6 MB, espeak narration, extractive script, hook "Diesel prices have risen above £2 a litre at at least 226 forecourts across Scotland…".

## Future work

- Better voice: set up Piper locally for free, or add an ElevenLabs key.
- Instagram needs raster media hosting, e.g. render `poster.jpg` and host it on the site under `/social/`.
- Scheduling and cadence per platform.
- An analytics feedback loop into hook scoring.
