# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin marketplace (`claude_evolve`). Its sole plugin is **`learning-loop`** — a closed learning loop that routes session knowledge to the right persistence layer (memory, skills, or handoff) and matures those artifacts over time via three skills: `/reflect`, `/skill-review`, `/curator`.

The `analiza dzialania hermesa/`, `analiza-porownawcza/`, and `docs/` directories are dev workspace only and are excluded from the published marketplace via `.gitignore`.

## Running tests

Tests use the Node.js built-in test runner (`node:test`). No install step, no `package.json`.

Run all hook tests:
```
node --test learning-loop/hooks/*.test.mjs
```

Run a single test file:
```
node --test learning-loop/hooks/memory-retrieval.test.mjs
```

Requirements: Node.js ≥ 18, `git` on PATH.

## Versioning — always bump both files together

When bumping a version, update **both**:
1. `learning-loop/.claude-plugin/plugin.json` → `version`
2. `.claude-plugin/marketplace.json` → `plugins[0].version` (and top-level `version`)

Users update with `/plugin marketplace update claude_evolve` then `/plugin update learning-loop@claude_evolve`.

## Architecture

### Plugin structure

```
learning-loop/
  .claude-plugin/plugin.json   — plugin manifest
  skills/
    reflect/SKILL.md           — session-end sorter: routes facts/procedures/handoff/friction
    skill-review/SKILL.md      — evidence-only skill editor (reads FRICTION.md)
    curator/SKILL.md           — auto-skill lifecycle reporter + archiver
  hooks/
    hooks.json                 — hook wiring (SessionStart, Stop ×2, PostToolUseFailure)
    memory-retrieval.mjs       — SessionStart: reads per-project MEMORY.md, injects top-5 facts inline + surfaces deferred pending-reflect markers for this cwd
    friction-capture.mjs       — PostToolUseFailure: appends raw candidate to ~/.claude/learning-loop/friction-candidates/<session_id>.jsonl
    reflection-gate.mjs        — Stop: DEFERS /reflect — writes ~/.claude/learning-loop/pending-reflect/<session_id>.json (cwd-tagged) instead of blocking, when uncommitted work or unprocessed friction candidates exist
    token-report.mjs           — Stop: saves plugin token footprint to ~/.claude/learning-loop/token-reports/latest.{json,md}
    *.test.mjs                 — one test file per hook, same directory
```

### Memory layers

| Layer | What | Location |
|---|---|---|
| Semantic (facts) | Trwałe fakty per-projekt | `~/.claude/projects/<cwd-slug>/memory/` |
| Procedural (skills) | Projektowe: `.claude/skills/`; Globalne: `~/.claude/skills/` |
| Reguła (behavioral) | Trwałe dyrektywy „rób/nie rób" | `.claude/rules/reflect-loop.md` (auto-load); archiwum `.claude/rules-archive/` |
| Friction | Dowód do poprawki skilla | `<skill>/FRICTION.md` |
| Outcome | Czy naprawa się utrzymała | `<skill>/RESOLVED.md` (held/recurred) |
| Pending reflect | Odroczony nudge /reflect (cwd-tagged) | `~/.claude/learning-loop/pending-reflect/<session_id>.json` |
| Handoff | Co dalej | `.remember/remember.md` |
| Archive | Wycofane auto-skille | `~/.claude/skills-archive/` |

The cwd-slug formula (used by `memory-retrieval.mjs` and its tests):
```js
cwd.replace(/[^A-Za-z0-9-]/g, "-")
```

### Hook design constraints

All hooks are **pure Node.js, exec-form** (`{command: "node", args: [...]}`), no shell, no bash, no external binaries except `git`. This makes them OS-independent (Windows / Linux / macOS). Every hook must:
- Always `exit 0` — never block the session.
- Read input from `stdin` as JSON (Claude Code hook contract).
- Be silent on expected-absent state (no memory dir, outside git repo, etc.).

`friction-capture` filters definitional noise (`EISDIR`, shell syntax errors) — these are never real skill failures and must not be logged.

`reflection-gate` **defers instead of blocking**: on a significant Stop it writes a `pending-reflect/<session_id>.json` marker (tagged with `cwd`) rather than emitting `decision: block`. This keeps the terminal non-blocking — the agent's `/reflect` turn (LLM cognition, the real time cost) is no longer forced mid-flow. `stop_hook_active` still guards against double-writing within one stop cycle. `/reflect` clears the project's markers (match by `cwd`) once reflection is done.

`memory-retrieval` surfaces pending-reflect markers **scoped to the current `cwd`** (resolve-compared), so opening project A never shows project B's backlog. It also scopes the token-footprint read by `session_id`. Both guards prevent cross-project bleed when multiple projects are active.

### Skill constraints (edit carefully)

- `/skill-review` touches **only** auto-skills (`metadata.origin: reflect-loop`). Plugin skills and hand-written skills are out of scope.
- **Engine self-exclusion:** the loop never takes itself as subject. The engine skills — `reflect`, `skill-review`, `curator` (this plugin) — are out of scope for the whole loop: `reflect` never writes `FRICTION.md`/`RESOLVED.md` about them, `skill-review` never reviews/edits them, `curator` never reports/archives them (despite their `origin: reflect-loop`). This holds in both the plugin cache (`~/.claude/plugins/...`) and the dev-repo source (`learning-loop/skills/`, `lore-keeper/skills/`). Friction met while developing the engine is ordinary code work → commit/handoff, not loop input. (`skill-review`/`curator` are already structurally protected — they scan `~/.claude/skills/*` + `./.claude/skills/*`, neither of which contains the engine; `reflect` writes by judgment, so the invariant is enforced there in prose.)
- Skill promotion from project → global requires three conditions: no project-specific references, universal tools only, affirmative usefulness judgment.
- Evidence-only rule: `/skill-review` proposes changes only when `FRICTION.md` contains a concrete `expected` / `actual` pair from a real session.
