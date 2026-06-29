# learning-loop

**Zamknięta pętla samouczenia dla Claude Code.** Sprawia, że asystent przestaje
zaczynać każdą rozmowę „od zera" — z każdej sesji wyciąga trwałe wnioski, zapisuje je
w odpowiednim miejscu i z czasem ulepsza własne procedury na podstawie tego, co
naprawdę zawiodło w praktyce. Wszystko lokalnie, bez zewnętrznych usług, niezależnie
od systemu operacyjnego (Windows / Linux / macOS).

Inspiracja: *closed learning loop* z [Hermes Agenta](https://github.com/NousResearch) —
agenta, który uczył się preferencji użytkownika między sesjami. Ten plugin przenosi ten
pomysł do Claude Code i dokłada wymiar, którego Hermesowi brakowało: **rozdział wiedzy
na konkretne projekty.**

---

## Problem, który to rozwiązuje

Claude Code domyślnie jest **bezpamięciowy między sesjami**. Każda nowa rozmowa startuje
bez wiedzy o tym, czego nauczyłeś go wczoraj: jaką decyzję podjęliście, jaką procedurę
wypracowaliście, jaki błąd już raz wspólnie naprawiliście. Wczorajsza wiedza wyparowuje.

Claude Code daje natywnie dwa „pojemniki" na trwałą wiedzę, ale obu trzeba pilnować ręcznie:

- **CLAUDE.md / rules/** — ręcznie pisane instrukcje. Ty je redagujesz, Claude tylko czyta.
- **Skille** — wielokrotnego użytku procedury (`SKILL.md`), które Claude ładuje, gdy pasują
  do zadania. Też ktoś musi je stworzyć i utrzymać.

Brakuje **mechanizmu, który sam, na koniec sesji, zdecyduje co warto zapamiętać i gdzie to
umieścić** — i który z czasem poprawia istniejące procedury. Tym mechanizmem jest ten plugin.

---

## Słownik pojęć (przeczytaj raz, dalej będzie jasne)

| Pojęcie | Co to dokładnie jest |
|---|---|
| **Skill** | Katalog z plikiem `SKILL.md` — opis powtarzalnej procedury („jak zrobić X"), który Claude Code ładuje do kontekstu, gdy zadanie pasuje. To jednostka **wiedzy proceduralnej**. |
| **Auto-skill** | Skill stworzony przez tę pętlę (oznaczony `metadata.origin: reflect-loop`). Tylko takie skille pętla później ulepsza i archiwizuje — Twoich ręcznych i pluginowych **nigdy nie rusza**. |
| **Pamięć per-projekt** | Katalog `memory/` przypisany do konkretnego projektu (np. `~/.claude/projects/<hash>/memory/`), gdzie ląduje **wiedza semantyczna** — trwałe fakty. Każdy fakt to jeden plik `.md` + linia w `MEMORY.md` (indeks ładowany na starcie sesji). |
| **Handoff** | Notatka „co dalej w następnej sesji" w `.remember/remember.md`. **Wiedza przejściowa** — żyje do następnej sesji, potem traci sens. |
| **FRICTION.md** | Plik-towarzysz obok `SKILL.md`, gdzie zapisuje się **tarcie**: sytuacje, w których skill kazał zrobić jedno, a wyszło drugie. To paliwo do ulepszania skilli — i jedyne źródło, z którego `/skill-review` czerpie. |
| **Tarcie (friction)** | Konkretny, zaobserwowany rozjazd między tym, co skill obiecywał (`expected`), a tym, co faktycznie wyszło (`actual`). Nie „opinia, że da się lepiej" — **zaobserwowany fakt z sesji**. |

---

## Architektura: cztery warstwy pamięci („Konstytucja Pamięci")

Sercem pluginu jest jedna decyzja, którą podejmuje przy każdym wniosku: **do której warstwy
to należy?** Warstwy nie konkurują — każda przechowuje inny rodzaj wiedzy i ma inny czas życia.

| Warstwa | Jaki rodzaj wiedzy | Gdzie ląduje | Czas życia |
|---|---|---|---|
| **Epizodyczna** | Co działo się w sesji (przebieg, stan) | `.remember/` (plugin `remember`, jeśli go masz) | krótki — log historii |
| **Semantyczna** | Trwały fakt (decyzja, preferencja, niezmiennik) | pamięć **per-projekt** `~/.claude/projects/<hash>/memory/` | trwały |
| **Proceduralna** | Powtarzalna procedura („jak zrobić X") | **skill** — projektowy `.claude/skills/` lub globalny `~/.claude/skills/` | trwały, dojrzewa |
| **Przejściowa** | Co dalej w następnej sesji | `.remember/remember.md` (handoff) | do następnej sesji |

**Reguła rozstrzygająca**, gdy nie wiadomo, gdzie coś włożyć:

> *Czy to przyda się za tydzień, w innej sesji?*
> - **Nie** → zostaw warstwie epizodycznej (`remember` złapie to sam).
> - **Tak, i to fakt** → pamięć semantyczna (per-projekt).
> - **Tak, i to procedura** → skill (proceduralna).

Pętla **nie zapisuje** warstwy epizodycznej — od tego jest osobny plugin `remember`. Zajmuje
się wyłącznie tym, co trwałe: faktami, procedurami i handoffem.

---

## Jak działa — pętla krok po kroku

```
 Kończysz sesję, w repo są niezacommitowane zmiany
            │
            ▼
 ┌──────────────────────────┐
 │ Stop hook: reflection-gate│  Cichy strażnik. Widzi niezacommitowaną pracę
 └──────────────────────────┘  → przypomina: „uruchom /reflect" (+ git diff --stat).
            │
            ▼
 ┌──────────────────────────┐  Sortownia wiedzy. Przegląda sesję i routuje
 │        /reflect           │  każdy wniosek do właściwej warstwy:
 └──────────────────────────┘    fakt          → pamięć per-projekt
            │                     procedura     → skill (projektowy / globalny)
            │                     handoff       → .remember/remember.md
            │                     tarcie skilla → <skill>/FRICTION.md
            ▼
 ┌──────────────────────────┐  Warsztat. Bierze zebrane tarcie z FRICTION.md
 │      /skill-review        │  i zamienia je w konkretne poprawki SKILL.md.
 └──────────────────────────┘  Tylko gdy jest dowód — żadnego „ulepszania w ciemno".
            │
            ▼
 ┌──────────────────────────┐  Sprzątaczka. Raportuje auto-skille (globalne i projektowe)
 │        /curator           │  wg mtime do przeglądu; archiwizuje po Twojej decyzji.
 └──────────────────────────┘  Nigdy nie kasuje.
```

**Cykl życia jednego skilla:** `/reflect` **rodzi** go → `/skill-review` **dojrzewa** go na
podstawie tarcia → `/curator` **archiwizuje**, gdy umrze. Pełny obieg, od narodzin do emerytury.

### Przykład końca-do-końca

1. W sesji trzeci raz uruchamiasz ten sam zestaw kroków, żeby zseedować bazę pod testy E2E.
   Za każdym razem trzeba pamiętać, żeby najpierw wyczyścić cache kompilacji.
2. Kończysz, zostają niezacommitowane zmiany → **hook** przypomina o `/reflect`.
3. **`/reflect`** ocenia: to procedura *powtarzalna* i *nieoczywista* (Etap 1 ✔) → skill.
   Czy globalny? Odwołuje się do schematu bazy tego projektu (Etap 2: ślad projektu) →
   **skill projektowy** `.claude/skills/seed-e2e-db/SKILL.md`.
4. Dwa tygodnie później skill każe „uruchom seed", ale pada błąd — bo używasz stale
   skompilowanego JS. W `/reflect` dopisujesz **tarcie** do `seed-e2e-db/FRICTION.md`:
   `expected: seed wchodzi czysto` / `actual: błąd, bo nie wyczyszczono build-cache`.
5. **`/skill-review`** widzi ten dowód i proponuje poprawkę `SKILL.md`: dodać krok
   „wyczyść build-cache przed seedem". Akceptujesz — skill mądrzeje. Wpis tarcia znika.

---

## Komendy — co, kiedy i jak dokładnie

### `/reflect` — refleksja na koniec sesji (sortownia wiedzy)

**Co robi:** przegląda, co zrobiłeś w sesji, i każdy trwały wniosek kieruje do właściwej
warstwy i zasięgu. To jedyne miejsce, które *tworzy* fakty i skille.

**Kiedy:** gdy poprosi hook (po sesji z niezacommitowaną pracą) albo ręcznie, kiedy
wypracowałeś coś wartego utrwalenia.

**Jak dokładnie (procedura):**
1. Przejrzyj sesję — co zadziałało, co było nieoczywiste, jakie zapadły decyzje.
2. **Fakt** → zapisz do pamięci **per-projekt** (`~/.claude/projects/<hash>/memory/`): plik
   `<slug>.md` z frontmatter (`name`, `description`, `metadata.type`) + linia w `MEMORY.md`;
   przy braku ścieżki pętla NIE zapisuje po cichu — pyta Ciebie, co zrobić.
3. **Procedura** → przepuść przez **Bramkę skilla** (niżej) i zapisz jako skill.
4. **Handoff** → zaktualizuj `.remember/remember.md` (pomijane, jeśli nie używasz `remember`).
5. **Tarcie** → dla skilli, których *naprawdę* użyłeś w tej sesji i które zawiodły,
   dopisz wpis do `<skill>/FRICTION.md`.

**Czego nie robi:** nie zapisuje przebiegu sesji (od tego jest warstwa epizodyczna) i nie
wynosi faktów do globalnej konfiguracji (to domena Twojego ręcznego `~/.claude/`).

### `/skill-review` — dojrzewanie skilli (warsztat)

**Co robi:** zamienia zebrane tarcie (`FRICTION.md`) w konkretne poprawki `SKILL.md`.

**Kiedy:** ręcznie, gdy chcesz przerobić nazbierane tarcie na realne ulepszenia.

**Jak dokładnie (procedura):**
1. Skanuje `~/.claude/skills/*/FRICTION.md` **oraz** `./.claude/skills/*/FRICTION.md`, zbiera skille z ≥1 ważnym wpisem.
2. Dla każdego wczytuje `SKILL.md` + ważne wpisy tarcia.
3. Proponuje **diff zakotwiczony w dowodzie** — wprost wskazuje, którego wpisu
   `expected`/`actual` dotyczy poprawka.
4. Po Twoim potwierdzeniu edytuje `SKILL.md` (zmiana `mtime` = sygnał życia dla curatora).
5. Czyści skonsumowane wpisy z `FRICTION.md`. Wpis świadomie nienaprawiany dostaje
   `won't-fix: <powód>` i zostaje pominięty na przyszłość.

**Twarda zasada — evidence-only:** brak zaobserwowanego dowodu (`expected` ≠ `actual`) — żadnej zmiany.
Obejmuje skille globalne (`~/.claude/skills/`) i projektowe (`./.claude/skills/`).
Nigdy nie wymyśla ulepszeń „dla jakości", nigdy nie ocenia skilla na zimno.
Tyka **wyłącznie** auto-skille (`origin: reflect-loop`) — skille pluginów i Twoje ręczne skille
leżą poza zasięgiem.
Wpisy powtarzające się (**≥2** w bieżącym `FRICTION.md`) traktuje priorytetowo — recydywa to
sygnał, że problem jest systemowy (głębsza przebudowa zamiast kolejnej łaty).

### `/curator` — higiena cyklu życia (sprzątaczka)

**Co robi:** **Raportuje** wszystkie auto-skille (globalne i projektowe) posortowane wg `mtime` — jako
sygnał „dawno nieedytowane do przeglądu", NIE wyrok. Decyzję per skill podejmujesz Ty.
Archiwizuje (**NIGDY nie kasuje**) poza root odkrywania: `~/.claude/skills-archive/` lub
`./.claude/skills-archive/`. Pomija `pinned: true`. Czyści też martwe/duplikatowe linie `MEMORY.md`.
Rozdziela też kandydatury tarcia: `*.processed` (striageowane logi, > 7 dni) od nieprzetworzonych
`*.jsonl` (lekcje, > 21 dni) — te drugie raportuje jako **utratę** i nigdy nie kasuje domyślnie.
Raport pokazuje też **pending-friction** (`Nf`, flaga `!`) obok `mtime` — skille z nieprzetworzonym
tarciem warto przejrzeć niezależnie od tego, jak dawno były edytowane (świeży `mtime` może maskować
skill łatany w kółko).

**Kiedy:** okresowo (np. raz w miesiącu), gdy `~/.claude/skills/` lub `./.claude/skills/` się rozrasta.

**Jak dokładnie (procedura):**
1. Skanuje auto-skille globalne (`~/.claude/skills/*/SKILL.md`) i projektowe (`./.claude/skills/*/SKILL.md`),
   czyta frontmatter (`origin`, `pinned`) i `mtime` pliku.
2. **Raportuje** wszystkie auto-skille (`origin: reflect-loop`, `pinned != true`) posortowane wg `mtime`
   — bez progu czasowego, bez wyroku. Najdawniej ruszane na górze, jako sygnał do przeglądu.
3. Po Twojej decyzji per skill przenosi wybrane poza root odkrywania:
   `~/.claude/skills-archive/<name>/` (skill globalny) lub `./.claude/skills-archive/<name>/` (skill projektowy).
4. Czyści martwe/duplikatowe linie w `MEMORY.md` (higiena indeksu).

**Twarde zasady:** **NIGDY nie kasuje** — tylko przenosi do `skills-archive/` **poza** root odkrywania
(przywrócenie = przeniesienie z powrotem). Curator **raportuje**, decyzję podejmujesz Ty; bez progu
czasowego i bez oceny treści przez LLM. `pinned: true` wyłącza skill z każdej tranzycji.

### Warstwa outcome — czy naprawa zadziałała

`/skill-review` przy każdej naprawie zapisuje rozwiązanie do `<skill>/RESOLVED.md`
(`status: held`). `/reflect`, przypisując nowe tarcie, sprawdza `RESOLVED.md`: jeśli to nawrót
naprawionego wcześniej, oznacza go `recurred` i sygnalizuje „fix się nie utrzymał — głębsza
przebudowa, nie kolejna łata". `/curator` raportuje **held vs recurred**: `held ≥30 dni` bez
nawrotu to kandydat na **dowód, że zapisana lekcja zmieniła zachowanie** (domknięcie pętli).
Dowód pozytywny jest z natury opóźniony (wymaga upływu czasu); nawrót widać natychmiast.

### SessionStart hook (`memory-retrieval`) — przywołanie pamięci

**Co robi:** na starcie sesji wyprowadza katalog pamięci per-projekt z `cwd`, czyta
`MEMORY.md`, rankuje wpisy wg pokrycia tokenów sygnałami sesji (branch + `git diff HEAD~3`),
a gdy brak sygnału — wg świeżości. Wstrzykuje indeks oraz **treść** top-5 faktów (budżet
4000 znaków) inline do kontekstu, żeby wiedza była dostępna, nie tylko „do pobrania".

**Kiedy milczy:** brak pamięci projektu / zły JSON / brak gita — cichy `exit 0`, zero błędów.

**Zero zahardkodowanej mapy domen** — ranking liczony z opisów na dysku, więc się nie starzeje.

### Stop hook (`reflection-gate`) — cichy strażnik

**Co robi:** kiedy kończysz sesję z **niezacommitowanymi zmianami** w repo git, LUB gdy ta
sesja zarejestrowała **nieprzetworzone kandydatury tarcia**, przypomina o `/reflect` i dokleja
`git diff --stat` oraz ścieżkę pliku kandydatur jako rozbieg.

**Kiedy milczy:** poza repo git i bez kandydatur / przy czystym drzewie bez kandydatur / gdy
już raz przypomniał w tym cyklu (flaga `stop_hook_active`).

**Dlaczego node, a nie bash:** napisany w czystym Node.js i uruchamiany w *exec form*
(`{command: "node", args: [...]}`), bez powłoki. Dzięki temu jest **napisany OS-niezależnie**
(Windows / Linux / macOS) — nie wymaga Git for Windows ani `sh`. Zweryfikowany na Windows;
na Linux/macOS oczekiwany identyczny przebieg (zautomatyzowany test hooka przechodzi).

---

## Zasady działania (na czym to stoi)

### 1. Oś user-vs-projekt: silnik globalny, wytwory do projektu

Plugin instaluje się **raz, globalnie**, ale wszystko, co wytwarza, **domyślnie ląduje
w bieżącym projekcie**. Powód jest praktyczny: w projekcie A możesz pracować zupełnie
inaczej niż w projekcie B. Gdyby fakt z projektu A wylądował globalnie, **skaziłby** kontekst
projektu B.

- **Fakty** → **zawsze** per-projekt. Uniwersalne preferencje user-level (np. „zawsze pisz
  testy najpierw") nie są domeną pętli — należą do Twojego ręcznie pisanego `~/.claude/CLAUDE.md`.
- **Skille** → domyślnie projektowe; globalne tylko przez bramkę (niżej).

### 2. Bramka skilla — dwa etapy

**Etap 1 — czy to w ogóle skill?** Tylko gdy procedura jest *jednocześnie*:
1. **powtarzalna** — wystąpi znów w innych sesjach, oraz
2. **nieoczywista** — nie wynika trywialnie z dokumentacji czy zdrowego rozsądku.

Nie spełnia obu → to fakt, nie skill.

**Etap 2 — globalny czy projektowy?** Domyślnie **projektowy** (`.claude/skills/`). Awans na
globalny (`~/.claude/skills/`) **tylko gdy spełnione WSZYSTKIE trzy**:
1. **Brak śladów projektu** — `SKILL.md` nie odwołuje się do nazwy repo, ścieżek, stacku,
   wersji, nazw serwisów ani domeny biznesowej. *Przykład śladu, który dyskwalifikuje:*
   „uruchom `npm run seed:wfirma`". Jest ślad → projektowy, koniec.
2. **Tylko uniwersalne narzędzia** — git, bash, ogólne wzorce; żadnego bespoke toolingu.
3. **Afirmatywny osąd** — „czy realnie pomoże w *niezwiązanym* projekcie?". Domyślna
   odpowiedź to **nie** — globalny zasięg trzeba sobie zasłużyć.

**Skrót przez powtórkę:** przy zapisie skilla pętla skanuje istniejące skille globalne
(`~/.claude/skills/*`); jeśli znajdzie odpowiednik po nazwie kebab lub zbliżonym `description`,
proponuje awans/aktualizację globalnego zamiast tworzyć projektowy duplikat. Liczy się
artefakt na dysku, nie „pamięć" z innej sesji.

**Kolizja nazw:** zapisując skill projektowy, pętla sprawdza, czy istnieje globalny o tej
samej nazwie. Jeśli tak — globalny **przebije** projektowy (precedencja Claude Code), więc
ostrzega i dokłada wyróżnik do nazwy.

### 3. Evidence-only — żadnego ulepszania w ciemno

`/skill-review` rusza skill **wyłącznie**, gdy `FRICTION.md` niesie zaobserwowany dowód
(`expected` ≠ `actual`). To celowa blokada przed „halucynacją ulepszeń" — modelem, który
w nieskończoność poprawia skill, bo *wydaje mu się*, że da się lepiej. Bez faktu z sesji —
zero zmian.

Format wpisu tarcia:
```markdown
## 2026-06-25
- **expected:** seed bazy wchodzi czysto według kroków skilla
- **actual:** błąd FK — bo nie wyczyszczono build-cache, użyto stale JS
- **fix-hint:** dodać krok „wyczyść build-cache" przed seedem
```

### 4. Odwracalność i bezpieczeństwo

- Curator **nigdy nie kasuje** — archiwizuje odwracalnie.
- Każda poprawka skilla i każdy awans na globalny — **za Twoim potwierdzeniem**.
- Skanery operują **wyłącznie** na Twoich auto-skillach (`origin: reflect-loop`) — zarówno
  globalnych (`~/.claude/skills/`), jak i projektowych (`./.claude/skills/`). Skille pluginów
  i Twoje ręczne skille są poza zasięgiem.

---

## Mapa pamięci — gdzie ląduje co (ściągawka)

| Warstwa | Co | Lokalizacja |
|---|---|---|
| Epizodyczna | przebieg sesji | `.remember/` (jeśli masz `remember`) |
| Semantyczna | trwałe fakty | `~/.claude/projects/<hash>/memory/` (per-projekt) |
| Proceduralna (projekt) | procedury projektowe | `.claude/skills/` |
| Proceduralna (globalna) | procedury przenośne | `~/.claude/skills/` |
| Tarcie | dowód do poprawki | `<skill>/FRICTION.md` |
| Outcome | czy naprawa skilla się utrzymała | `<skill>/RESOLVED.md` (held/recurred) → raport `/curator` |
| Przejściowa | handoff | `.remember/remember.md` |
| Archiwum | wycofane auto-skille | `~/.claude/skills-archive/` lub `./.claude/skills-archive/` |
| Retrieval | przywołanie faktów na starcie sesji | `memory-retrieval` (SessionStart) → `additionalContext` |

---

## Instalacja

```
/plugin marketplace add szendzij/claude_evolve
/plugin install learning-loop@claude_evolve
```

**Wersja 1.4.1** (patch na 1.4.0). 1.4.0 domknęło czterowarstwową pętlę: SessionStart retrieval
(`memory-retrieval`), integralność wejścia (trigger na nieprzetworzonych kandydaturach + filtr
szumu), sygnały zdrowia cyklu skilli (pending-friction w `/curator`, priorytet recydywy
w `/skill-review`) oraz warstwę outcome (`RESOLVED.md` + raport held/recurred jako ewidencja, że
naprawa zmieniła zachowanie). 1.4.1 zamyka wyciek cross-project: `/reflect` czyta i konsumuje
kandydatury tarcia tylko bieżącej sesji (scope po `CLAUDE_CODE_SESSION_ID`), nie „najnowszy globalnie".
Aby zaktualizować już zainstalowany plugin: `/plugin marketplace update claude_evolve` a następnie
`/plugin update learning-loop@claude_evolve`.

Po instalacji dostępne są `/reflect`, `/skill-review`, `/curator`, a Stop hook wpina się
**automatycznie** — bez ręcznej edycji `settings.json`.

Lokalny test bez instalacji: `claude --plugin-dir /ścieżka/do/learning-loop`.

## Wymagania

- **`node`** — uruchamia hook (OS-niezależnie) oraz skanery skilli. Bez `bash`, `jq`, `python3`.
- **`git`** — hook przypomina tylko w repo z niezacommitowanymi zmianami.
- **Claude Code z obsługą pluginów** — zalecana najnowsza (`claude update`; wersję sprawdzisz
  `claude --version`). Udokumentowane minimum: **2.1.128**. Manifest pluginu nie ma pola do
  wymuszenia wersji, stąd ta nota tutaj.

Hook jest **napisany OS-niezależnie** dla **Windows / Linux / macOS** (exec form `node`, bez
powłoki, bez Git for Windows). Zweryfikowany na Windows; zautomatyzowany test hooka przechodzi.

## Zależności miękkie (degradują łagodnie)

- **`remember` / `.remember/`** — handoff to zwykły zapis `.md`. Bez tej warstwy krok handoffu
  jest po prostu pomijany; reszta pętli działa normalnie.
- **Wbudowana pamięć per-projekt** — gdy harness nie poda ścieżki pamięci, pętla **NIE zapisuje
  po cichu** (taki zapis trafiłby w miejsce, którego harness nie wczyta = zapis-widmo). Mówi wprost,
  że fakt nie został zapisany, i czeka na Twoją decyzję: podać ścieżkę pamięci, dopisać fakt do
  `CLAUDE.md` projektu jako jawną regułę, albo pominąć.

## Czego świadomie NIE robi (YAGNI)

- **Brak liczników użycia i oceny skilli przez LLM** — curator tylko **raportuje** auto-skille
  posortowane wg twardej metryki `mtime`; decyzję podejmujesz Ty. Zero infrastruktury do
  utrzymania, zero subiektywnych ocen, zero progu czasowego.
- **Brak wynoszenia faktów user-level do globalnej konfiguracji** — to domena Twojego ręcznie
  kuratorowanego `~/.claude/`. Pętla celowo tego nie dotyka.
- **Minimalny zestaw hooków** — SessionStart (retrieval), Stop (reflection-gate),
  PostToolUseFailure (friction-capture). Trzy lekkie hooki node, każdy z testami; żadnej
  automatyki „na każdą akcję" ponad to. Im mniej automatyki w tle, tym mniej kruchości.
  `friction-capture` pomija przy tym **szum definicyjny** (EISDIR z czytania katalogu, błędy
  składni powłoki) — nie zapisuje go jako kandydatury, by `/reflect` nie tonął w przejściowych
  awariach narzędzi.
- **Brak natychmiastowego dowodu T8** — warstwa outcome (`RESOLVED.md` + raport held/recurred)
  czyni „lekcja → zmiana zachowania" *mierzalnym*, ale dowód pozytywny (`held ≥30d`) wymaga
  realnego upływu czasu i użycia; mierzone jest tylko ramię skilli, nie przywołanych faktów.
