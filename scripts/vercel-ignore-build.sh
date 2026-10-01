#!/usr/bin/env bash
# Vercel Ignored Build Step.
# Exit 0 = skip deployment; exit 1 = continue building.
set -u

if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  echo "No parent commit available; building."
  exit 1
fi

CHANGED="$(git diff --name-only HEAD^ HEAD || true)"
if [ -z "$CHANGED" ]; then
  echo "No changed paths resolved; building defensively."
  exit 1
fi

# These paths do not affect the public Vercel application. Workflow/docs/QA-only
# commits should not consume the Hobby build-rate budget.
RELEVANT="$(printf '%s\n' "$CHANGED" | grep -Ev '^(\.github/|docs/|tests/|engines/|ops/|n8n/|WORKLOG\.md$|README\.md$)' || true)"

if [ -z "$RELEVANT" ]; then
  echo "Only non-production paths changed; skipping Vercel build."
  printf '%s\n' "$CHANGED"
  exit 0
fi

echo "Production-relevant paths changed; building."
printf '%s\n' "$RELEVANT"
exit 1
