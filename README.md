# claude_evolve

Marketplace pluginów Claude Code. Obecnie zawiera **`learning-loop`** — przenośną,
OS-niezależną pętlę samouczenia: `reflect` (capture) → `skill-review` (dojrzewanie)
→ `curator` (archiwizacja), plus Stop hook nudżący `/reflect`.

## Instalacja

W Claude Code:

```
/plugin marketplace add szendzij/claude_evolve
/plugin install learning-loop@claude_evolve
```

Po instalacji dostępne: `/reflect`, `/skill-review`, `/curator`. Stop hook wpina się
automatycznie (bez edycji `settings.json`).

## Zasada działania

Silnik globalny, wytwory domyślnie do bieżącego projektu. Fakty → pamięć per-projekt.
Skille → projektowe (`.claude/skills/`); awans na globalne (`~/.claude/skills/`) wg
bramki 3 kryteriów. Evidence-only ulepszanie skilli (`FRICTION.md`).

## Wymagania

- `node` (hook OS-niezależny + skanery; bez `bash`/`jq`/`python3`).
- `git` (hook nudżuje tylko w repo z niezacommitowanymi zmianami).
- Claude Code z obsługą pluginów — zalecana najnowsza (`claude update`; wersja: `claude --version`).
  Udokumentowane minimum: **2.1.128**.

Hook działa identycznie na Windows / Linux / macOS (exec form `node`, bez shella).

## Aktualizacje

Po bumpie `version` w `learning-loop/.claude-plugin/plugin.json` oraz wpisie w
`.claude-plugin/marketplace.json`, użytkownicy:

```
/plugin marketplace update claude_evolve
```
