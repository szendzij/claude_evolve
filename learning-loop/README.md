# learning-loop

**Zamknięta pętla samouczenia dla Claude Code** — inspirowana *closed learning loop*
z [Hermes Agenta](https://github.com/NousResearch). Sprawia, że Claude **uczy się
z każdej sesji**: wyciąga trwałe wnioski do pamięci, dojrzewa swoje umiejętności na
podstawie realnego tarcia i archiwizuje te nieużywane — w pełni lokalnie, bez
zewnętrznych usług, niezależnie od systemu operacyjnego.

## Po co to

Domyślnie Claude zaczyna każdą sesję „od zera". Ten plugin nakłada warstwę **pamięci
i refleksji**, żeby wiedza i umiejętności przeżywały między sesjami:

- **trwałe fakty** (decyzje projektowe, preferencje, niezmienniki) trafiają do pamięci,
- **powtarzalne procedury** wypracowane w boju stają się skillami,
- skille **dojrzewają**, gdy w praktyce zawiodą, i **znikają**, gdy umrą.

Filozofia: *rdzeń wąski, zdolności na krawędziach* + *silnik globalny, wytwory do
bieżącego projektu*.

## Jak działa — pętla

```
Koniec sesji z niezacommitowanymi zmianami
        │
        ▼
[Stop hook: reflection-gate]  ── przypomina ──►  uruchom /reflect
        │
        ▼
[/reflect]  ── routuje wg Konstytucji ──►  fakty        → pamięć per-projekt
        │                                   procedury     → skill (projektowy/globalny)
        │                                   handoff       → .remember/remember.md
        │                                   tarcie skilla → <skill>/FRICTION.md
        ▼
[/skill-review]  ── evidence-only ──►  dowód z FRICTION.md → poprawka SKILL.md
        │
        ▼
[/curator]  ── okresowo ──►  archiwizuje martwe auto-skille (mtime > 30 dni)
```

Pełny cykl życia skilla: **`/reflect` rodzi → `/skill-review` dojrzewa → `/curator` archiwizuje.**

## Komendy

### `/reflect` — refleksja na koniec sesji
Przegląda, co zrobiłeś, i routuje trwałą wiedzę do właściwej warstwy:
- **trwały fakt** → pamięć **per-projekt** (`~/.claude/projects/<hash>/memory/`),
- **powtarzalna procedura** → **skill** (projektowy lub globalny — patrz Bramka skilla),
- **handoff** → `.remember/remember.md` (co dalej w następnej sesji),
- **tarcie ze skilla** → wpis `expected`/`actual` w `<skill>/FRICTION.md` (paliwo dla `/skill-review`).

Nie zapisuje przebiegu sesji — to robi warstwa epizodyczna (np. plugin `remember`), jeśli jej używasz.

### `/skill-review` — dojrzewanie skilli
Zamienia zebrane tarcie (`FRICTION.md`) w konkretne poprawki `SKILL.md`.
**Evidence-only**: bez zaobserwowanego dowodu (`expected` ≠ `actual`) — żadnej zmiany.
Zero „ulepszania dla ulepszania", zero oceny jakości przez LLM.

### `/curator` — higiena cyklu życia
Archiwizuje (**NIGDY nie kasuje**) auto-skille nieruszane > 30 dni, do `~/.claude/skills/.archive/`.
Decyzja na twardej metryce (mtime), zawsze po Twoim potwierdzeniu. Pomija `pinned: true`.

### Stop hook (reflection-gate)
Gdy kończysz sesję z **niezacommitowanymi zmianami** w repo git, hook przypomina o `/reflect`
(dołączając `git diff --stat` jako rozbieg). Cichy, gdy: poza repo git / czyste drzewo /
już przypomniał w tym cyklu. OS-niezależny (czysty `node`, exec form — bez shella).

## Kluczowe zasady

### Oś user-vs-projekt
Silnik jest globalny, ale **wytwory domyślnie lądują w bieżącym projekcie** — żeby konteksty
różnych projektów się nie mieszały:

- **Fakty** → zawsze pamięć **per-projekt**. Uniwersalne preferencje user-level zostają
  w Twoim ręcznie kuratorowanym `~/.claude/CLAUDE.md` / `rules/` — pętla ich nie dotyka.
- **Skille** → bramka dwustopniowa:
  1. **Czy to skill?** — procedura *powtarzalna* + *nieoczywista* (inaczej → fakt).
  2. **Globalny czy projektowy?** — domyślnie **projektowy** (`.claude/skills/`).
     Awans na globalny (`~/.claude/skills/`) tylko gdy WSZYSTKIE 3: brak śladów projektu
     + tylko uniwersalne narzędzia + realnie przydatne w niezwiązanym projekcie.

### Evidence-only
`/skill-review` rusza skill wyłącznie, gdy `FRICTION.md` niesie dowód realnego tarcia.

### Bezpieczeństwo / odwracalność
Curator nigdy nie kasuje (archiwizuje odwracalnie). Każda poprawka i każdy awans — za Twoim
potwierdzeniem. Skanery operują wyłącznie na Twoich skillach (`~/.claude/skills/`), nigdy na pluginach.

## Gdzie ląduje co (mapa pamięci)

| Warstwa | Co | Lokalizacja |
|---|---|---|
| Epizodyczna | przebieg sesji | `.remember/` (jeśli masz `remember`) |
| Semantyczna | trwałe fakty | `~/.claude/projects/<hash>/memory/` (per-projekt) |
| Proceduralna (projekt) | procedury projektowe | `.claude/skills/` |
| Proceduralna (globalna) | procedury przenośne | `~/.claude/skills/` |
| Tarcie | dowód do poprawki | `<skill>/FRICTION.md` |
| Przejściowa | handoff | `.remember/remember.md` |

## Instalacja

```
/plugin marketplace add szendzij/claude_evolve
/plugin install learning-loop@claude_evolve
```

Lokalny test bez instalacji: `claude --plugin-dir /ścieżka/do/learning-loop`.

## Wymagania

- `node` — hook (OS-niezależny) + skanery; bez `bash`/`jq`/`python3`.
- `git` — hook przypomina tylko w repo z niezacommitowanymi zmianami.
- **Claude Code z obsługą pluginów** — zalecana najnowsza (`claude update`; wersja: `claude --version`).
  Udokumentowane minimum: **2.1.128**. `plugin.json` nie potrafi wymusić wersji, stąd ta nota.

Hook działa identycznie na **Windows / Linux / macOS** (exec form `node`, bez shella, bez Git for Windows).

## Zależności (miękkie — degradują łagodnie)

- `remember` / `.remember/` — handoff to zwykły zapis `.md`; bez tej warstwy krok handoff jest pomijany.
- Wbudowana pamięć per-projekt — gdy harness nie poda ścieżki, fakty mają fallback `./memory/` + ostrzeżenie.

## Czego świadomie NIE robi (YAGNI)

- Brak liczników użycia i oceny jakości skilli przez LLM (curator: tylko twarde metryki).
- Brak wynoszenia faktów user-level do globalnej konfiguracji (to domena Twojego `~/.claude/`).
- Brak hooków na każdą akcję poza jednym lekkim Stop hookiem.
