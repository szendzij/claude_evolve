# learning-loop

Przenośna pętla samouczenia dla Claude Code: `reflect` (capture) → `skill-review`
(dojrzewanie) → `curator` (archiwizacja), plus Stop hook nudżący `/reflect`.

## Zasada

Silnik globalny, wytwory domyślnie do bieżącego projektu. Fakty → pamięć per-projekt.
Skille → projektowe (`.claude/skills/`), awans na globalne (`~/.claude/skills/`) wg
bramki 3 kryteriów. Evidence-only ulepszanie skilli (`FRICTION.md`).

## Instalacja (lokalny test)

```bash
claude --plugin-dir /ścieżka/do/learning-loop
```

Po instalacji dostępne: `/reflect`, `/skill-review`, `/curator`. Stop hook wpina się
automatycznie (nie trzeba edytować `settings.json`).

## Wymagania

- `node` (hook OS-niezależny + skanery; bez `bash`/`jq`/`python3`).
- `git` (hook nudżuje tylko w repo z niezacommitowanymi zmianami).
- **Claude Code z obsługą pluginów** — zalecana najnowsza (`claude update`; wersja: `claude --version`).
  Udokumentowane minimum: **2.1.128**. Pozostałe użyte funkcje (hooki plugin, exec form `args`,
  skille projektowe) nie mają podanej wersji w docs — trzymaj się najnowszej. `plugin.json` nie
  potrafi wymusić wersji, stąd ta nota.

Hook działa identycznie na Windows / Linux / macOS — exec form `node` (bez shella, bez Git for Windows).

## Zależności (miękkie)

- `remember` / `.remember/` — handoff degraduje łagodnie, jeśli go nie masz.
- Wbudowana pamięć per-projekt — fakty mają fallback `./memory/` z ostrzeżeniem.
