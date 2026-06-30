# claude_evolve

Marketplace pluginów do **Claude Code** — miejsce, z którego instalujesz pluginy komendą
`/plugin`. Obecnie zawiera jeden: **`learning-loop`**, zamkniętą pętlę samouczenia.

> **Czym jest marketplace Claude Code?** To repozytorium z plikiem
> `.claude-plugin/marketplace.json`, które wskazuje, jakie pluginy są dostępne i skąd je
> wziąć. Dodajesz je raz (`/plugin marketplace add ...`), a potem instalujesz z niego
> dowolny plugin po nazwie.

---

## learning-loop — zamknięta pętla samouczenia

### Po co to istnieje

Claude Code domyślnie **nie pamięta nic między sesjami**. Każda rozmowa startuje od zera:
wczorajsze decyzje, wypracowane procedury i raz już naprawione błędy — wszystko znika.
`learning-loop` nakłada na Claude warstwę **pamięci i refleksji**, dzięki której trwała
wiedza przeżywa między sesjami, a wypracowane procedury z czasem **same się ulepszają**
na podstawie tego, co naprawdę zawiodło w praktyce.

Inspiracja: *closed learning loop* z Hermes Agenta. Tu rozszerzona o wymiar, którego
Hermesowi brakowało — **rozdział wiedzy na poszczególne projekty**, żeby kontekst projektu A
nie skaził projektu B.

### Jak działa — w skrócie

```
 koniec sesji z niezacommitowaną pracą
        │  Stop hook → odkłada znacznik pending-reflect (nie przerywa);
        │              następny start projektu pokazuje „masz N pending /reflect"
        ▼
 /reflect        sortuje wnioski:  fakt          → pamięć per-projekt
        │                          procedura     → skill (projektowy/globalny)
        │                          reguła        → .claude/rules/reflect-loop.md
        │                          handoff       → .remember/remember.md
        │                          tarcie skilla → <skill>/FRICTION.md
        ▼
 /skill-review   dowód z FRICTION.md  →  poprawka SKILL.md   (tylko gdy jest dowód)
        ▼
 /curator        archiwizuje auto-skille (mtime > 30 dni) i reguły wg wieku; nigdy nie kasuje
```

Cykl życia skilla: **`/reflect` rodzi → `/skill-review` dojrzewa → `/curator` archiwizuje.**

### Co dostajesz po instalacji

| Element | Rola |
|---|---|
| `/reflect` | Sortownia wiedzy na koniec sesji. Każdy trwały wniosek kieruje do właściwej warstwy (fakt → pamięć per-projekt, procedura → skill, reguła → `.claude/rules/`, handoff, tarcie → `FRICTION.md`). |
| `/skill-review` | Warsztat. Zamienia zebrane tarcie (`FRICTION.md`) w konkretne poprawki `SKILL.md`. **Evidence-only**: bez zaobserwowanego dowodu — żadnej zmiany. |
| `/curator` | Sprzątaczka. Archiwizuje (odwracalnie, **nigdy nie kasuje**) auto-skille nieruszane > 30 dni; raportuje też reguły behawioralne wg wieku markera i archiwizuje je poza `rules/`. |
| Stop hook | Cichy strażnik — **odracza** `/reflect`: zamiast przerywać terminal, zapisuje znacznik `pending-reflect` (otagowany `cwd`), który `memory-retrieval` pokazuje na starcie kolejnej sesji projektu. OS-niezależny (czysty `node`). |

### Zasada nadrzędna

**Silnik globalny, wytwory domyślnie do bieżącego projektu** — żeby konteksty projektów się
nie mieszały. Fakty zawsze trafiają do pamięci per-projekt; skille domyślnie są projektowe,
a na globalne awansują tylko przez bramkę 3 kryteriów (brak śladów projektu + tylko
uniwersalne narzędzia + realnie przydatne w niezwiązanym projekcie).

📖 **Pełny opis** — wszystkie pojęcia, mechanizmy, zasady, przykład końca-do-końca i mapa
pamięci: [`learning-loop/README.md`](./learning-loop/README.md).

---

## Instalacja

```
/plugin marketplace add szendzij/claude_evolve
/plugin install learning-loop@claude_evolve
```

Po instalacji dostępne: `/reflect`, `/skill-review`, `/curator`. Stop hook wpina się
automatycznie — bez ręcznej edycji `settings.json`.

## Wymagania

- **`node`** — hook (OS-niezależny) + skanery skilli. Bez `bash`/`jq`/`python3`.
- **`git`** — hook przypomina tylko w repo z niezacommitowanymi zmianami.
- **Claude Code z obsługą pluginów** — zalecana najnowsza (`claude update`; wersja:
  `claude --version`). Udokumentowane minimum: **2.1.128**.

Hook działa identycznie na **Windows / Linux / macOS** (exec form `node`, bez powłoki).

## Aktualizacje

Po podbiciu `version` w `learning-loop/.claude-plugin/plugin.json` oraz w
`.claude-plugin/marketplace.json` i wypchnięciu zmian, użytkownicy aktualizują:

```
/plugin marketplace update claude_evolve
```
