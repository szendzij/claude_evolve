---
name: lore-keeper-sync
description: Syncs hook changes from claude_evolve to lore-keeper fork.
metadata:
  origin: reflect-loop
  created: 2026-06-29
  origin-project: claude_evolve
---

## Kiedy

Po każdej zmianie hooków lub testów w `claude_evolve` (GitHub) — przenosisz je do `lore-keeper` (`C:\Users\PC17.PC-17\Documents\BITBUCKET\wins_claude_plugins\lore-keeper\`).

## Pliki wymagające zamiany ścieżki runtime

Zamień `"learning-loop"` → `"lore-keeper"` **we wszystkich poniższych** (source + testy):

| Plik | Co zmienić |
|---|---|
| `hooks/memory-retrieval.mjs` | `session-tokens`, `token-reports`, `pending-reflect` paths; nagłówek `"# Pamięć projektu (learning-loop)"` |
| `hooks/reflection-gate.mjs` | `friction-candidates` path, `pending-reflect` path |
| `hooks/token-report.mjs` | `session-tokens` path, `token-reports` path; nagłówek MD: `"LORE Keeper — Token Footprint"` |
| `hooks/reflection-gate.test.mjs` | `friction-candidates` + `pending-reflect` (`markerPath`, `seedCandidates`) |
| `hooks/memory-retrieval.test.mjs` | `pending-reflect` w `seedPending()` |
| `hooks/token-report.test.mjs` | `token-reports` w `reportPath()`, `session-tokens` w T4 |
| `skills/reflect/SKILL.md` | **NOWE:** komenda „wyczyść pending-reflect (krok 4)" ma ścieżkę `~/.claude/learning-loop/pending-reflect/` |

`hooks.json` nie zawiera ścieżek runtime — kopiujesz bez zmian. **`skills/` MA jedną ścieżkę**
(pending-reflect w `reflect/SKILL.md`) — dawne założenie „skills bez ścieżek" już nieaktualne.
`reflect/FRICTION.md` bez ścieżek — kopiujesz/dopisujesz bez zmian.

**Deterministyczny sposób (zalecany):** dla plików funkcjonalnych (2 hooki + 2 testy)
napisz skrypt `.mjs` w scratchpadzie robiący `readFileSync → replaceAll("learning-loop","lore-keeper") → writeFileSync`
i uruchom `node skrypt.mjs` — Node zachowuje UTF-8 bez BOM (emoji ⏳, polskie znaki). NIE wklejaj
go inline w `node -e "..."` (regex/quoting pada na Windows). `SKILL.md` rób targetowanymi edycjami
(by nie nadpisać frontmatter), `FRICTION.md` dopisaniem.

## Pułapka: testy też mają ścieżki

Testy używają `freshHome()` jako fake `~/.claude/`, ale wciąż konstruują ścieżki z `"learning-loop"`. Bez zamiany w testach szukają pliku pod złą ścieżką i test przechodzi (false positive) lub pada z timeout.

## Procedura

1. Skopiuj zmienione pliki z `claude_evolve/learning-loop/` do `wins_claude_plugins/lore-keeper/`.
2. Zastosuj zamiany z tabeli powyżej.
3. `node --test lore-keeper/hooks/*.test.mjs` z katalogu `wins_claude_plugins` — muszą przejść wszystkie.
4. Bump wersji w obu repach:
   - `claude_evolve`: `learning-loop/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
   - `wins_claude_plugins`: `lore-keeper/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
