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
| `hooks/memory-retrieval.mjs` | `session-tokens` path, `token-reports` path, nagłówek `"# Pamięć projektu (learning-loop)"` |
| `hooks/reflection-gate.mjs` | `friction-candidates` path, referencja do `token-reports/latest.md` w `tokenSummary()` |
| `hooks/token-report.mjs` | `session-tokens` path, `token-reports` path; nagłówek MD: `"LORE Keeper — Token Footprint"` |
| `hooks/reflection-gate.test.mjs` | `friction-candidates` w `seedCandidates()` i inline |
| `hooks/token-report.test.mjs` | `token-reports` w `reportPath()`, `session-tokens` w T4 |

`hooks.json` i `skills/` **nie zawierają** hardcoded ścieżek runtime — kopiujesz bez zmian.

## Pułapka: testy też mają ścieżki

Testy używają `freshHome()` jako fake `~/.claude/`, ale wciąż konstruują ścieżki z `"learning-loop"`. Bez zamiany w testach szukają pliku pod złą ścieżką i test przechodzi (false positive) lub pada z timeout.

## Procedura

1. Skopiuj zmienione pliki z `claude_evolve/learning-loop/` do `wins_claude_plugins/lore-keeper/`.
2. Zastosuj zamiany z tabeli powyżej.
3. `node --test lore-keeper/hooks/*.test.mjs` z katalogu `wins_claude_plugins` — muszą przejść wszystkie.
4. Bump wersji w obu repach:
   - `claude_evolve`: `learning-loop/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
   - `wins_claude_plugins`: `lore-keeper/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
