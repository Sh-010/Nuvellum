# CLAUDE.md

Read `AGENTS.md` first. It is the authoritative guide for agents working in this repository.

The rules that matter most:
- Never redesign Nuvellum or modify `assets/nuvellum-v5.zip`, its checksum or the v5.1 template.
- Never rewrite published articles, commit secrets, force-push, or delete backup/checkpoint branches.
- Patch the existing pipeline in place. Checkpoint before risky changes. Fail closed.
- Run `npm test && npm run build` (and `cd engines && npm test` when engines change), keep `git status` clean after a build, and append to `WORKLOG.md`.
