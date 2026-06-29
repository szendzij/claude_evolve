# Spec: SP-B · Intake Integrity

**Data:** 2026-06-27
**Status:** zatwierdzony design, przed planem implementacji
**Sub-projekt:** SP-B z `analiza-porownawcza/03` (dekompozycja poprawek learning-loop)
**Dotyczy:** plugin `learning-loop`
**Poprzednik:** SP-A (memory-retrieval) — scalony do `main` (`5730e65`)

---

## 1. Problem (zakotwiczony w dowodach)

Pętla uczenia ma dziurawe i zaszumione wejście (analiza `02-claude-evolve-kontrkrytyka.md`):

- **N2 (NIEDOPUSZCZALNE — ciche gubienie sygnału):** `reflection-gate` nudżuje o `/reflect`
  tylko przy niezacommitowanym diffie powyżej progu. Sesja śledcza (zrozumiałeś coś, zero
  zmian plików) albo sesja z czystą higieną commitów → brak nudge'a → kandydatury tarcia
  leżą nieprzetworzone → `curator` kasuje je po 7 dniach jako „stare logi". System niszczy
  własny jedyny sygnał, nazywając to higieną.
- **Z2 (perwersyjny bodziec):** im lepiej commitujesz, tym rzadziej pętla się odpala
  (czyste drzewo → `exit 0`).
- **Z1 (zaśmiecanie sygnału):** `friction-capture` z `matcher: "*"` łapie 100% szumu.
  Wszystkie 4 realnie zaobserwowane sesje to tarcie przejściowe: `EISDIR` z czytania
  katalogów, literówki cudzysłowów w Bash, brak `.env`.

**Sprzężenie przyczynowe (klucz do zakresu):** naprawa triggera tak, by odpalał się na
nieprzetworzonych kandydaturach, BEZ filtra szumu, dałaby spam nudge'y na śmieciach →
zmęczenie → ignorowanie → gorzej. Dlatego trzy fixy idą razem.

## 2. Cel

Tarcie warte przerobienia ma niezawodnie wywołać `/reflect`; nieprzetworzone lekcje nie
giną jako logi; a sygnał nie tonie w przejściowym szumie.

## 3. Non-goals

- **Nie** zmienia formatu kandydatur ani kontraktu `friction-capture` poza pominięciem
  zdefiniowanego szumu.
- **Nie** dotyka `memory-retrieval` (SP-A) ani `reflect`/`skill-review`/`curator` poza sekcją
  GC kandydatur.
- **Nie** dodaje liczników/telemetrii ani automatycznej oceny (YAGNI — spójnie z etosem pluginu).
- **Nie** kasuje nieprzetworzonych lekcji automatycznie (zawsze za świadomym potwierdzeniem).
- **Brak** automatycznego `/reflect` — trigger tylko nudżuje, decyzja u usera.

## 4. Komponenty (trzy, każdy w osobnym pliku)

### 4.1. Trigger — `learning-loop/hooks/reflection-gate.mjs`

**Dziś:** blokuje (nudżuje) tylko gdy: w repo git ORAZ `score = wstawione+usunięte +
untracked×3 ≥ THRESHOLD(10)`. Poza repo / przy czystym drzewie → wczesny `exit 0`.

**Zmiana:** dodatkowa, równoległa ścieżka triggera — **≥1 nieprzetworzona kandydatura tarcia
tej sesji** odpala nudge niezależnie od stanu git.

Restrukturyzacja `main` (kolejność):
1. Loop-guard: `input.stop_hook_active` → `exit 0`.
2. `candidateCount` = liczba linii w
   `<home>/.claude/learning-loop/friction-candidates/<session_id>.jsonl`
   (0 gdy brak `session_id` lub pliku). Niezależne od git.
3. `score` git: jeśli w repo i drzewo brudne — policz jak dziś; inaczej `score = 0`.
   (Hook NIE robi już wczesnego `exit 0` na „poza repo" — kandydatury istnieją też poza git.)
4. Jeśli `score < THRESHOLD && candidateCount === 0` → `exit 0` (cisza).
5. Inaczej → `{decision:"block", reason}` z `reason` dopasowanym do triggera:
   - `candidateCount > 0`: zawrzyj „ta sesja zarejestrowała N kandydatur tarcia: <ścieżka> —
     przejrzyj je w /reflect i przypisz do właściwego FRICTION.md".
   - `score ≥ THRESHOLD`: zawrzyj obecny komunikat o niezapisanej pracy + `git diff --stat`.
   - oba: oba fragmenty.

**Inwarianty zachowane:** loop-guard; cichy `exit 0` gdy brak sygnału; nigdy nie blokuje
poza tymi dwoma trigggerami. Istniejące 7 testów zostają zielone (czyste drzewo bez
kandydatur i „poza repo bez session_id" wciąż milczą).

### 4.2. Filtr szumu — `learning-loop/hooks/friction-capture.mjs`

**Zmiana:** przed `appendFileSync`, jeśli `error` pasuje do denylista → `return`
(nie zapisuj), nadal cichy `exit 0`. Helper `isNoise(error) -> boolean`.

Denylist (konserwatywny, wysoka precyzja — klasy z definicji nie będące tarciem skilla):
- `EISDIR` — `/EISDIR/` (Read na katalogu; błąd użycia narzędzia).
- Błędy składni powłoki — `/bash:.*(syntax error|unexpected EOF|unexpected token)/i`.

Wszystko inne nadal łapane (człowiek triuje w `/reflect`). Filtr liczony na `error` przed
slice'em do 300 znaków (wzorce pojawiają się na początku komunikatu).

### 4.3. Reframe GC — `learning-loop/skills/curator/SKILL.md`

Sekcja „Higiena kandydatur tarcia" rozdziela dwie klasy zamiast „transientne logi":
- **`.processed`** (już striageowane) → prawdziwe logi; raportuj/usuwaj przy **>7 dni**.
- **nieprzetworzone `.jsonl`** → **nieprzetworzone lekcje**; okno **>21 dni**; framing jako
  utrata: „N nieprzetworzonych lekcji starszych niż 21 dni — uruchom `/reflect`, NIE kasuj
  na ślepo"; kasowanie tylko po świadomym potwierdzeniu, nigdy domyślnie.

Dwa helpery bash rozdzielone wg klasy (sufiks `.processed` vs jego brak) i wg progu wieku.
Zmiana proza + bash w SKILL.md (nietestowalna `node --test` — patrz §6 smoke-test).

## 5. Stałe

| Stała | Wartość | Gdzie |
|-------|---------|-------|
| `THRESHOLD` | 10 (bez zmian) | reflection-gate |
| próg kandydatur | `≥ 1` | reflection-gate |
| okno GC `.processed` | 7 dni (bez zmian) | curator SKILL.md |
| okno GC nieprzetworzone | 21 dni (było 7) | curator SKILL.md |

## 6. Plan testów

**reflection-gate (`reflection-gate.test.mjs`, `node --test`)** — dołożyć do istniejących 7:
| # | Przypadek | Oczekiwane |
|---|-----------|------------|
| R1 | czyste drzewo git + ≥1 kandydatura sesji | `block`; `reason` zawiera ścieżkę + licznik kandydatur |
| R2 | poza repo git + ≥1 kandydatura sesji | `block` (kandydatury działają bez git) |
| R3 | czyste drzewo + 0 kandydatur | cisza (regresja: istniejący „repo czyste → milczy" zostaje) |
| R4 | brudne drzewo ≥ próg + 0 kandydatur | `block` (regresja: istniejący przypadek zostaje) |

**friction-capture (`friction-capture.test.mjs`, `node --test`)** — dołożyć do istniejących 5:
| # | Przypadek | Oczekiwane |
|---|-----------|------------|
| F1 | `error` z `EISDIR` | nic nie zapisane, `exit 0` |
| F2 | `error` z `bash: ... syntax error`/`unexpected EOF`/`unexpected token` | nic nie zapisane, `exit 0` |
| F3 | zwykły `error` (np. porażka testu) | rekord zapisany (filtr nie nadgorliwy) |

**curator GC (smoke-test, ręczny w planie):** zasiej katalog z mieszanką `.processed`
(stary) i `.jsonl` (stary, nieprzetworzony); uruchom oba helpery; potwierdź, że raport
processed pokazuje tylko `.processed >7d`, a raport nieprzetworzonych pokazuje `.jsonl >21d`
z framingiem utraty.

**Bez regresji:** `memory-retrieval` 7/7, `friction-capture` (5 + 3 nowe), `reflection-gate`
(7 + 4 nowe) — wszystko zielone.

## 7. Kryteria akceptacji

1. `reflection-gate` nudżuje, gdy sesja ma ≥1 nieprzetworzoną kandydaturę, nawet przy czystym
   drzewie / poza repo git; `reason` wskazuje plik kandydatur.
2. Brak sygnału (czyste drzewo, 0 kandydatur, poza/ w repo) → cichy `exit 0`; loop-guard działa.
3. `friction-capture` pomija EISDIR i błędy składni powłoki; każdy inny błąd nadal zapisuje.
4. `curator` rozdziela `.processed` (GC >7 dni) od nieprzetworzonych `.jsonl` (>21 dni, framing
   utraty, bez kasowania domyślnego).
5. Wszystkie hooki nadal: nigdy nie rzucają, nigdy nie blokują sesji błędem, `exit 0`.
6. Komplet testów (R1–R4, F1–F3 + istniejące) zielony; smoke-test GC potwierdzony; brak regresji.
7. README pluginu zaktualizowane (opis triggera-na-kandydaturach + filtra).

## 8. Wpływ na dokumentację

- `learning-loop/README.md`: zaktualizować opis Stop-hooka (`reflection-gate`) o trigger
  na nieprzetworzonych kandydaturach; dopisać filtr szumu do opisu `friction-capture`;
  zaktualizować sekcję curatora o rozróżnienie processed/nieprzetworzone + okna.
- `analiza-porownawcza/`: po weryfikacji dopisać, że SP-B domyka N2/Z1/Z2.
