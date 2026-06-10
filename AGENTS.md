# AGENTS.md

## Project Context

This project is a local Codex-editable copy of a Sealos DevBox project.

- Local project path: `/Users/pengfan/Documents/Codex/2026-06-04/codex-sealos-devbox/work/metacut-project`
- Remote SSH host: `bja.sealos.run_ns-f7g0mc0f_metacut`
- Remote project path: `/home/devbox/project`
- Tech stack: Next.js 14, React 18, TypeScript, Tailwind CSS, npm.

Use the local copy for Codex code editing. Use the Sealos DevBox mainly for running and validating in the remote Linux environment.

## Important Network Constraint

Do not try to run Codex as a remote SSH-host agent on this Sealos DevBox unless the DevBox gets an OpenAI-supported network egress.

Observed behavior:

- `auth.openai.com` from the DevBox returns HTTP 403.
- Codex login/token exchange on the DevBox failed with `Country, region, or territory not supported`.
- Cursor Remote SSH can still edit the project because Cursor's AI requests are client-side/local, while Codex SSH Host requires the remote DevBox to run Codex and access OpenAI.

Recommended workflow:

1. Edit code locally in this project with Codex.
2. Run local checks first.
3. Sync changes back to Sealos.
4. Run final build/checks on Sealos.

## Local Development Commands

Install dependencies locally:

```bash
npm ci
```

Run production build locally:

```bash
npm run build
```

The latest known local build passed. Existing warnings are from `<img>` usage in these files:

- `components/engines/MaterialLibraryPanel.tsx`
- `components/engines/PackagingKitPanel.tsx`
- `components/workbench/stages/ProductStage.tsx`

These warnings do not currently block the build.

## Sync From DevBox To Local

Use this when the remote DevBox has newer files and you want to refresh the local copy.

```bash
rm -rf /Users/pengfan/Documents/Codex/2026-06-04/codex-sealos-devbox/work/metacut-project
mkdir -p /Users/pengfan/Documents/Codex/2026-06-04/codex-sealos-devbox/work/metacut-project
ssh bja.sealos.run_ns-f7g0mc0f_metacut 'cd /home/devbox/project && tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.turbo --exclude=.cache --exclude=.npm-cache --exclude=public/uploads --exclude="._*" --exclude=.DS_Store --exclude="*.tsbuildinfo" --exclude=.env.local --exclude=dist --exclude=build -czf - .' | tar -xzf - -C /Users/pengfan/Documents/Codex/2026-06-04/codex-sealos-devbox/work/metacut-project
```

`rsync` was attempted but failed with `unexpected end of file`, likely because remote `rsync` is unavailable or incompatible. Prefer the tar-over-SSH workflow unless rsync is fixed on the DevBox.

## Sync From Local To DevBox

Use this after local edits are complete and validated.

```bash
COPYFILE_DISABLE=1 tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.turbo --exclude=.cache --exclude=.npm-cache --exclude=public/uploads --exclude='._*' --exclude=.DS_Store --exclude='*.tsbuildinfo' --exclude=.env.local --exclude=dist --exclude=build -czf - -C /Users/pengfan/Documents/Codex/2026-06-04/codex-sealos-devbox/work/metacut-project . | ssh bja.sealos.run_ns-f7g0mc0f_metacut 'cd /home/devbox/project && tar -xzf -'
```

This sync intentionally excludes dependencies, build outputs, caches, `.git`, local env files, macOS metadata, TypeScript build info, and generated preview assets. `public/uploads` may contain old local preview files, but current deployed assets should use object storage as the source of truth; only sync it when explicitly needed.

If `lib/prompts` on the DevBox is the source of truth for a session, first pull that folder from the DevBox to local, then sync local changes back with `--exclude=lib/prompts` or a targeted file list so prompt edits are not overwritten accidentally.

## Remote Validation Commands

Run remote build on Sealos:

```bash
ssh bja.sealos.run_ns-f7g0mc0f_metacut 'cd /home/devbox/project && npm install && npm run build'
```

The latest known remote build passed.

## Editing Guidelines

- Keep changes focused and minimal.
- Prefer root-cause fixes over cosmetic patches.
- Do not commit, push, or create branches unless explicitly requested.
- Do not sync back to DevBox until the user asks or the task clearly requires remote validation.
- If syncing back, run local checks first when practical, then run remote build after sync.
- Treat `.env.local` as sensitive; do not print, expose, or modify it unless explicitly required.
