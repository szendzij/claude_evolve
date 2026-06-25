# claude_evolve

Marketplace pluginów Claude Code. Obecnie zawiera jeden plugin: **`learning-loop`**.

---

## learning-loop

**Zamknięta pętla samouczenia dla Claude Code** — inspirowana *closed learning loop*
z Hermes Agenta. Sprawia, że Claude **uczy się z każdej sesji**: wyciąga trwałe wnioski
do pamięci, dojrzewa swoje umiejętności na podstawie realnego tarcia i archiwizuje te
nieużywane. W pełni lokalnie, bez zewnętrznych usług, niezależnie od systemu (Windows/Linux/macOS).

Domyślnie Claude zaczyna każdą sesję „od zera". Ten plugin nakłada warstwę **pamięci
i refleksji**, żeby trwałe fakty i wypracowane procedury przeżywały między sesjami.

### Jak działa

```
Koniec sesji z niezacommitowanymi zmianami
        │  Stop hook (reflection-gate) → przypomina o /reflect
        ▼
/reflect       fakty → pamięć per-projekt · procedury → skill · handoff · tarcie → FRICTION.md
        ▼
/skill-review  dowód z FRICTION.md → poprawka SKILL.md  (evidence-only)
        ▼
/curator       archiwizuje martwe auto-skille (> 30 dni, nigdy nie kasuje)
```

Cykl życia skilla: **`/reflect` rodzi → `/skill-review` dojrzewa → `/curator` archiwizuje.**

### Komendy

| Komenda | Co robi |
|---|---|
| `/reflect` | Refleksja na koniec sesji: routuje fakty → pamięć per-projekt, procedury → skille, aktualizuje handoff, zapisuje tarcie skilli. |
| `/skill-review` | Zamienia zebrane tarcie (`FRICTION.md`) w konkretne poprawki skilli. Evidence-only. |
| `/curator` | Archiwizuje (odwracalnie) auto-skille nieruszane > 30 dni. |

Plus **Stop hook**, który przypomina o `/reflect`, gdy kończysz sesję z niezacommitowaną pracą.

### Zasada nadrzędna

**Silnik globalny, wytwory domyślnie do bieżącego projektu** — żeby konteksty projektów się nie mieszały:
- **Fakty** → zawsze pamięć per-projekt. Uniwersalne preferencje zostają w Twoim ręcznym `~/.claude/`.
- **Skille** → bramka dwustopniowa (czy to skill? → globalny czy projektowy?). Domyślnie projektowy
  (`.claude/skills/`); awans na globalny (`~/.claude/skills/`) tylko po spełnieniu 3 kryteriów.

📖 Pełny opis działania, zasad i mapy pamięci: [`learning-loop/README.md`](./learning-loop/README.md).

## Instalacja

```
/plugin marketplace add szendzij/claude_evolve
/plugin install learning-loop@claude_evolve
```

Po instalacji dostępne: `/reflect`, `/skill-review`, `/curator`. Stop hook wpina się
automatycznie (bez edycji `settings.json`).

## Wymagania

- `node` (hook OS-niezależny + skanery; bez `bash`/`jq`/`python3`).
- `git` (hook przypomina tylko w repo z niezacommitowanymi zmianami).
- Claude Code z obsługą pluginów — zalecana najnowsza (`claude update`; wersja: `claude --version`).
  Udokumentowane minimum: **2.1.128**.

Hook działa identycznie na Windows / Linux / macOS (exec form `node`, bez shella).

## Aktualizacje

Po bumpie `version` w `learning-loop/.claude-plugin/plugin.json` oraz wpisie w
`.claude-plugin/marketplace.json`, użytkownicy:

```
/plugin marketplace update claude_evolve
```
