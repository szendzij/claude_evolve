# Spec: hook `memory-retrieval` (SP-A · Retrieval)

**Data:** 2026-06-26
**Status:** zatwierdzony design, przed planem implementacji
**Sub-projekt:** SP-A z `analiza-porownawcza/03` (dekompozycja poprawek learning-loop)
**Dotyczy:** plugin `learning-loop`

---

## 1. Problem (zakotwiczony w dowodach)

`learning-loop` zapisuje wiedzę (fakty per-projekt), ale **nie ma mechanizmu jej przywołania**
w kontekst sesji. Polega na natywnym ładowaniu `MEMORY.md`. Empirycznie (analiza
`02-claude-evolve-kontrkrytyka.md`) jedyna zarejestrowana aktywność „pamięciowa" pluginu w
realu to **porażki znalezienia pamięci** (`Read MEMORY.md does not exist`, `ls memory (puste)`).

To wprost łamie deklarowany cel z README: *„asystent przestaje zaczynać każdą rozmowę od
zera"*. Pamięć, której nie da się kontekstowo przywołać, nie jest pamięcią. Teza T4 z
`01-pasejo-krytyka.md` przeżyła kontrkrytykę i **wzmocniła się**: na tym wymiarze nawet
„gnijąca tablica" pasejo bije brak retrievalu w learning-loop.

## 2. Cel

Na zdarzeniu `SessionStart` przywołać **trafne fakty** z pamięci per-projekt i wstrzyknąć je
**inline** do kontekstu sesji — gwarantując recall, bez zahardkodowanej mapy domen
(która w pasejo gnije).

## 3. Non-goals (świadomie poza zakresem)

- **Nie pisze** pamięci (to `/reflect`).
- **Nie ranguje przez LLM** — czyste dopasowanie tokenów na dysku.
- **Nie utrzymuje żadnej tablicy/konfiguracji** domen (anty-T4).
- **Nie obejmuje skilli** — auto-ładują się natywnie po `description`.
- **Nie obejmuje handoffu** `.remember/` — obsługuje go plugin `remember`.
- **Nie czyta** pełnej treści faktów poza wybranym top-N.
- **Nie zmienia** istniejących hooków (`friction-capture`, `reflection-gate`) — osobny moduł.

## 4. Architektura modułu

Nowy plik `learning-loop/hooks/memory-retrieval.mjs` + wpis `SessionStart` w
`learning-loop/hooks/hooks.json`. Czysty Node, **exec form** (`{command:"node", args:[...]}`),
bez powłoki — OS-niezależny, spójny z istniejącymi dwoma hookami.

**Granica modułu (interfejs):**
- **Wejście:** `cwd` + `session_id` (stdin SessionStart, JSON) oraz stan dysku
  (`MEMORY.md` + pliki-fakty + repo git).
- **Wyjście:** pojedynczy JSON na stdout z `hookSpecificOutput.additionalContext`.
- **Zależności:** tylko `node:fs`, `node:path`, `node:os`, `node:child_process` (git).
  Zero zależności od reszty pętli → testowalny w izolacji.

## 5. Przepływ (krok po kroku)

### 5.1. Odnalezienie pamięci
Wyprowadź slug projektu z `cwd`:
```
slug = cwd.replace(/[^A-Za-z0-9-]/g, "-")
memoryDir = join(homedir(), ".claude", "projects", slug, "memory")
indexPath = join(memoryDir, "MEMORY.md")
```
Zweryfikowane na realnej ścieżce: `C:\Users\PC17.PC-17\Documents\GitHub\claude-evolve`
→ `C--Users-PC17-PC-17-Documents-GitHub-claude-evolve` (`:` `\` `.` → `-`, istniejące `-`
zachowane).

**Brak `memoryDir` lub `indexPath` → cichy `exit 0`** (pusty output). Premia: eliminuje
samozadane kandydatury tarcia typu `Read MEMORY.md does not exist` (poprawka Z1 przy okazji).

### 5.2. Parsowanie indeksu
Każdą linię pasującą do wzorca pozycji indeksu:
```
- [Tytuł](plik.md) — tekst-hook
```
zamień na `{ file: "plik.md", text: "Tytuł tekst-hook", line: "<cała linia>" }`.
Linie niepasujące (nagłówki, puste) pomiń. Scoring liczony **na `text`** (tanio) — pełne
pliki-fakty otwierane dopiero dla zwycięzców.

### 5.3. Sygnały trafności
```
branch  = git branch --show-current           (timeout ~1.5s, błąd → "")
changed = git diff --name-only HEAD~3 HEAD     (timeout ~1.5s, błąd → "")
signals = tokenize(branch + " " + changed)     // lowercase, split /[^a-z0-9]+/, len>=3, uniq
```
Brak gita / shallow clone → `signals = []` (→ fallback 5.5). Tokeny krótsze niż 3 znaki
odrzucone (redukcja szumu typu „v", „to").

### 5.4. Scoring
Dla każdego wpisu: `score = |signals ∩ tokenize(entry.text)|` (liczba wspólnych tokenów).

### 5.5. Selekcja
- Jeśli istnieją wpisy ze `score > 0`: posortuj malejąco po `score`, tie-break: mtime
  pliku-faktu malejąco (nowsze wyżej).
- Jeśli żaden `score > 0` (zimny start / brak sygnału): **fallback** = wpisy posortowane po
  mtime pliku-faktu malejąco (recency jako słaby priorytet trafności).
- Cap: maks. `MAX_FACTS = 5` plików **oraz** budżet `MAX_CHARS = 4000` znaków sumarycznej
  treści inline. Dokładaj fakty w kolejności rankingu, aż pierwszy z limitów się wyczerpie
  (fakt, który by przekroczył `MAX_CHARS`, jest pomijany; pętla próbuje kolejne mniejsze —
  albo kończy; nie przycinamy faktu w połowie).

### 5.6. Wstrzyk (output)
```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<blok>"
  }
}
```
`<blok>` =
```
# Pamięć projektu (learning-loop)
**Sygnały sesji:** <branch + zmienione segmenty, lub "brak (fallback: recency)">

## Indeks (MEMORY.md)
<pełna treść MEMORY.md — tani indeks, zawsze>

## Przywołane fakty (top-N, inline)
### <plik.md>
<pełna treść pliku-faktu>
...
```
Jeśli `MEMORY.md` istnieje, ale nie ma żadnych parsowalnych wpisów → wstrzyknij sam indeks
bez sekcji faktów (nadal użyteczne).

## 6. Tryb awarii (twarde)

- Cały korpus w `try/catch`; **każdy** błąd → cichy `exit 0`, output pusty.
- Nigdy `throw`, nigdy niezerowy exit, nigdy blokada `SessionStart`.
- Hook **nie może sam generować tarcia** (lekcja z Z1): wszystkie operacje dyskowe i git
  owinięte tak, by nie produkować błędów-narzędzi widocznych dla `friction-capture`.
- Wywołania git z `stdio: ["ignore","pipe","ignore"]` + timeout, błąd połykany.

## 7. Stałe (konfiguracja w kodzie, nie w pliku)

| Stała | Wartość | Uzasadnienie |
|-------|---------|--------------|
| `MAX_FACTS` | 5 | limit liczby przywołanych faktów |
| `MAX_CHARS` | 4000 | twardy budżet kontekstu inline |
| `DIFF_WINDOW` | `HEAD~3 HEAD` | okno świeżych zmian dla sygnału |
| `GIT_TIMEOUT_MS` | 1500 | nie blokuj startu sesji |
| `MIN_TOKEN_LEN` | 3 | redukcja szumu tokenowego |

Tuning przez edycję pliku (jak `THRESHOLD` w `reflection-gate.mjs`). Brak pliku konfiguracji
(YAGNI).

## 8. Plan testów (`memory-retrieval.test.mjs`, `node --test`)

Styl jak `friction-capture.test.mjs` (tymczasowy katalog, stub stdin, asercje na stdout JSON).
Git symulowany przez kontrolę `cwd`/env tam, gdzie to możliwe; gdzie nie — testy operują na
ścieżce pamięci niezależnej od gita (signals = []), pokrywając ścieżkę fallback.

| # | Przypadek | Oczekiwane |
|---|-----------|------------|
| T1 | Brak `memoryDir` | pusty output, `exit 0` |
| T2 | `MEMORY.md` + wpis trafny do sygnału | sekcja „Przywołane fakty" zawiera trafny plik |
| T3 | Sygnał pusty (brak gita) | fallback recency: najnowszy fakt wstrzyknięty |
| T4 | `MEMORY.md` zepsuty / linie niepasujące | brak crasha; sam indeks lub pusto, `exit 0` |
| T5 | Treść faktów > `MAX_CHARS` | cap respektowany; nie przekracza budżetu; brak ucięcia w pół faktu |
| T6 | Derivacja sluga | `cwd` → poprawny slug (asercja na znanym przykładzie) |
| T7 | `MEMORY.md` istnieje, zero wpisów | sam indeks, brak sekcji faktów, `exit 0` |

Wymóg: wszystkie testy zielone (`node --test learning-loop/hooks/memory-retrieval.test.mjs`),
oraz brak regresji w istniejących (`friction-capture` 5/5, `reflection-gate` 7/7).

## 9. Kryteria akceptacji

1. Hook zarejestrowany w `hooks.json` pod `SessionStart`, exec form `node`.
2. Przy istniejącej pamięci projektu i dopasowanym branchu — `additionalContext` zawiera
   treść trafnego faktu inline (nie samą nazwę).
3. Przy braku pamięci / braku gita / zepsutym indeksie — cichy `exit 0`, zero błędów,
   zero nowych kandydatur tarcia od tego hooka.
4. Budżet `MAX_CHARS`/`MAX_FACTS` nigdy przekroczony.
5. Zero zahardkodowanej mapy domen w kodzie.
6. Komplet testów T1–T7 zielony; istniejące testy bez regresji.
7. README pluginu zaktualizowane (warstwa retrieval w mapie pamięci + opis hooka).

## 10. Wpływ na dokumentację (krok „aktualizacja doku")

- `learning-loop/README.md`: dodać hook do listy (obecnie „jeden lekki Stop hook" → teraz
  Stop + PostToolUseFailure + SessionStart), opisać warstwę retrieval w „Mapie pamięci",
  zaktualizować sekcję „Czego świadomie NIE robi" (retrieval przestaje być luką).
- `analiza-porownawcza/`: dopisać notkę, że SP-A domyka T4 (po weryfikacji).
