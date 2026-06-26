# Pasejo2 `.claude/` — bardzo krytyczna analiza wiedzy / pamięci / ewolucji

> **Status:** krok 1 z 2. Ten dokument formułuje serię **tez** (T1–T8) o systemie pasejo2.
> Krok 2 (osobna analiza `claude_evolve`/`learning-loop`) ma je **obalać lub podważać** —
> traktuj każdą tezę jako cel adwersarialny, nie jako prawdę objawioną.
>
> **Metoda:** krytyka oparta na dowodach z kodu (ścieżki + cytaty), nie na wrażeniu.
> Każda teza ma: *twierdzenie → dowód → waga → warunek obalenia* (co musiałby pokazać
> krok 2, żeby tezę przewrócić).
>
> **Zakres badany:** `C:\Users\PC17.PC-17\Documents\BITBUCKET\pasejo2\.claude`
> (agent-memory/, skills/, rules/, hooks/, commands/, epics/, settings.json).
> **Data analizy:** 2026-06-26.

---

## Kontekst (bezsporny stan faktyczny)

System dzieli wiedzę na trzy warstwy: **wiedza statyczna** (`rules/` 44 pliki, `skills/` ~48,
`prompts/`), **pamięć** (per-agent `agent-memory/<agent>/MEMORY.md` × 18 → promocja do
user-scoped `~/.claude/projects/.../memory/`), **ewolucja** (hooki tarcia →
`evolution/log.jsonl` → komenda `/evolve` modyfikująca konfigurację). Pętla domyka się
przez regułę `rules/agent-self-evolution.md` (zapis pamięci na koniec agenta),
`skills/memory-consolidation` (promocja/pruning), `hooks/smart-memory-loader.js`
(retrieval na starcie sesji).

To architektura przemyślana. Poniższe tezy atakują **rozziew między projektem a działaniem**.

---

## T1 — Ewolucja w pasejo to artefakt projektowy, nie działający mechanizm

**Twierdzenie.** „Self-evolution" jest zadeklarowana, ale nie ma dowodu, że kiedykolwiek
zadziałała. To dokumentacja mechanizmu, nie mechanizm.

**Dowód.**
- `evolution/log.jsonl` **nie istnieje** (katalog `evolution/` pusty). `/evolve` czyta
  „ostatnie 20 sesji" z pliku, którego nie ma → tryb „cold audit". Pętla nigdy nie zebrała
  danych w tym checkout.
- `rules/agent-self-evolution.md` (l. 62-65) sam zeznaje: *„The «Learnings» section was
  empty in 23 of 24 agents (...) the actual mechanism never produced learnings because
  nobody knew which agent owned what."* — czyli poprzednia iteracja mechanizmu **udowodniono,
  że nie produkowała wiedzy**.
- `agent-memory/dev-fullstack/MEMORY.md` to czysty stub (291 B): same nagłówki i kursywne
  placeholdery (`_Findings from fullstack feature implementations._`), zero wpisów. Kilka
  pamięci QA <500 B.

**Waga: WYSOKA.** Jeśli rdzeń „ewolucji" nie biegł, cała narracja o systemie samouczącym
jest aspiracją.

**Warunek obalenia (dla kroku 2).** Pokazać, że *jakikolwiek* mechanizm samodoskonalenia —
w pasejo albo w claude_evolve — wyprodukował zmianę zachowania popartą zarejestrowanym
przebiegiem (nie pustą strukturą). Albo: że „mechanizm nieuruchomiony" nie znaczy „mechanizm
zły" — projekt może być poprawny mimo zimnego startu.

---

## T2 — 58 hooków to nie dojrzałość, to dług i kruchość; warstwa antytarciowa sama generuje tarcie

**Twierdzenie.** Liczba hooków jest *negatywnym* sygnałem jakości, nie pozytywnym. Każdy hook
to punkt awarii i koszt utrzymania; system odpalający dziesiątki skryptów na każdą akcję jest
z definicji kruchy.

**Dowód.**
- 58 skryptów w `hooks/` (`*.sh` + `*.js`); ~100 wpisów `"command"` w `settings.json`.
- `hooks/collect-friction-signals.sh` (l. 58-67) zawiera komentarz o **własnym bugu**:
  `grep -c` zwracał `"0\n0"` pod `set -euo pipefail`, co psuło JSON w **8 z 20 wpisów**
  `log.jsonl`. Narzędzie do *mierzenia* tarcia samo było źródłem tarcia — i to akurat to,
  którego dane miały zasilać `/evolve`.
- README samego claude_evolve (sekcja YAGNI) formułuje regułę wprost przeciwną:
  *„Brak hooków na każdą akcję (...) im mniej automatyki w tle, tym mniej kruchości."*

**Waga: WYSOKA.** Antytarciowa infrastruktura, która sama jest źródłem tarcia, jest
samozaprzeczeniem.

**Warunek obalenia.** Pokazać, że gęstość hooków koreluje z *mniejszą* liczbą realnych
incydentów (mniej regресji, mniej rework), a nie tylko z większą powierzchnią konfiguracji.
Albo: że bug w `collect-friction` był jednorazowy i naprawiony, więc nie świadczy o klasie.

---

## T3 — Trójwarstwowa reprezentacja jednego workflow to over-engineering

**Twierdzenie.** Ten sam przepływ „task → PR" jest opisany w trzech miejscach: komenda
`/execute`, skill `execute-stages` (14 plików `stage-*.md`), skill `orchestrator-workflow`.
To redundancja, nie modularność.

**Dowód.**
- `commands/` (50 plików) i `skills/` (~48) w dużej mierze pokrywają tematykę; sama komenda
  `/evolve` ma w checklistcie pozycję *„No major overlap between skills and commands"* —
  czyli autor systemu **podejrzewa u siebie ten problem**.
- `orchestrator.md` (agent) cytuje `orchestrator-workflow`, który dekomponuje się na
  `execute-stages`, który czyta `stage-*.md` „on demand". Trzy poziomy pośrednictwa do
  jednego efektu (commit + PR).

**Waga: ŚREDNIA.** Działać może, ale koszt poznawczy i utrzymaniowy rośnie wykładniczo z
liczbą warstw, a granice odpowiedzialności się rozmywają.

**Warunek obalenia.** Pokazać, że warstwy są naprawdę niezależnie reużywalne (np.
`execute-stages` wołane przez ≥2 różne komendy z realnym zyskiem), a nie że to jeden
przepływ rozsmarowany na trzy pliki.

---

## T4 — „Smart memory loader" nie jest inteligentny — to ręcznie utrzymywana tablica, która gnije

**Twierdzenie.** Retrieval reklamowany jako domenowo-świadomy opiera się na **zahardkodowanej
mapie** plik→domena. To nie inteligencja, to lookup-table z nieuniknionym driftem.

**Dowód.**
- `hooks/smart-memory-loader.js` (l. 72-99): `ALWAYS_LOAD` to sztywna lista 6 nazw plików,
  `DOMAIN_MAP` to ręcznie wypisany słownik (`api: ['feedback_testing.md', ...]`). Dodanie
  nowego pliku pamięci wymaga **ręcznej edycji hooka**, inaczej nigdy nie zostanie podany.
- Domeny wnioskowane regexem z nazwy brancha + `git diff HEAD~5`. Branch bez `PAS2-` lub
  shallow clone (l. 29-31, 43-45) → cicha rezygnacja, zero retrievalu.
- Loader emituje tylko **nazwy** plików („Load on demand"), nie treść — więc realne wczytanie
  zależy od tego, czy agent w ogóle po nie sięgnie. Brak gwarancji konsumpcji.

**Waga: WYSOKA.** To podważa rzekomą przewagę pasejo nad prostszymi systemami: „aktywny
retrieval" jest w istocie statyczną konfiguracją podszytą regexem.

**Warunek obalenia.** Pokazać, że tablica jest tańsza/pewniejsza niż brak retrievalu w ogóle
(bo nawet gnijąca mapa > losowe ładowanie), albo że system bez retrievalu (claude_evolve) ma
gorszy realny dostęp do wiedzy mimo „czystszej" architektury.

---

## T5 — Pamięć per-agent fragmentuje wiedzę i przerzuca koszt scalania na rytuał, który nie biegnie

**Twierdzenie.** 18 silosów pamięci to anti-pattern epistemiczny: wiedza użyteczna dla wielu
agentów ginie w jednym, a jedyny mechanizm scalania (`/memory-consolidation`) jest ręczny i
bez śladu uruchomień.

**Dowód.**
- 18 katalogów `agent-memory/*`; reguła promocji (`agent-self-evolution.md` l. 54-60) wymaga
  ręcznego `/memory-consolidation` „gdy 2+ agentów skorzysta LUB wzorzec wraca w 3+ sesjach".
- Brak jakiegokolwiek artefaktu świadczącego, że konsolidacja kiedykolwiek przebiegła
  (user-scoped `memory/` tego projektu w środowisku analizy jest pusty; markerów
  `[CONSOLIDATED]` brak w zbadanych plikach).
- Rozkład bajtów jest skrajnie nierówny: `qa-integration` 4.6 KB vs `dev-fullstack` 291 B —
  wiedza gromadzi się tam, gdzie ktoś pamiętał ją zapisać, nie tam, gdzie jest potrzebna.

**Waga: ŚREDNIA-WYSOKA.** Model „tanio per-agent, drogo scal ręcznie" w praktyce oznacza
„tanio rozprosz, nigdy nie scalaj".

**Warunek obalenia.** Pokazać, że per-projekt (claude_evolve) cierpi na *odwrotny* problem —
zlewanie kontekstów różnych ról w jeden worek — i że silosy per-agent są mniejszym złem.
Albo: że fragmentacja jest pozorna, bo `smart-memory-loader` i tak miesza pliki z wielu
agentów na starcie.

---

## T6 — Ilościowe sygnały tarcia mierzą hałas, nie naukę

**Twierdzenie.** `/evolve` opiera rekomendacje na licznikach (`friction`, `rework`,
`agent_memory_saves`, `duration_s`). To proxy słabo skorelowane z jakością wiedzy: rework
bywa zdrowy (iteracja), długa sesja bywa produktywna, „zapis pamięci" liczy fakt zapisu, nie
jego wartość.

**Dowód.**
- `collect-friction-signals.sh` (l. 113-114) loguje pięć liczb na sesję. `/evolve` (l. 15-30)
  agreguje je w „friction average", „rework count" itd.
- `REWORK_PATTERN` (l. 45) łapie m.in. `revert`, `fix.*regression`, `retrigger` — ale revert
  bywa właściwą reakcją, a regression-fix to *dowód działającego* QA, nie patologii. Licznik
  nie odróżnia zdrowej iteracji od marnotrawstwa.
- `agent_memory_saves` mierzy, czy plik został dotknięty — nie, czy zapisano coś wartościowego
  (por. T1: pliki bywają pustymi stubami).

**Waga: ŚREDNIA.** Metryka, która nie odróżnia zdrowego od chorego, generuje rekomendacje o
przypadkowym znaku.

**Warunek obalenia.** Pokazać, że jakościowe, zakotwiczone-w-dowodzie tarcie (model
claude_evolve: `expected≠actual` per skill) jest *mniej* skalowalne lub bardziej zależne od
dyscypliny człowieka niż tanie liczniki — tzn. że ilość bije jakość przy braku nadzoru.

---

## T7 — Głębokie sprzężenie z projektem czyni system nieaudytowalnym i nieprzenoszalnym

**Twierdzenie.** Wiedza pasejo jest tak wrośnięta w jeden stack (Jira PAS2, Bitbucket, Prisma,
nx, Windows-worktree), że nie da się jej ani przenieść, ani niezależnie zweryfikować — to
bespoke artefakt jednego zespołu, nie wzorzec.

**Dowód.**
- `orchestrator.md` (l. 56-68): obejście „NIE używaj `EnterWorktree` MCP, bo broken na
  Windows" — wiedza jest łatą na konkretny bug konkretnego OS, nie zasadą.
- `rules/` pełne identyfikatorów domenowych: `nx-cloud-workspace-id.md`,
  `stripe-dev-environment.md`, `multi-tenant-resolution.md` (shopId), klucze `PAS2-` w
  walidatorach commitów i branchy.
- Cały tracker epików operuje na kluczach Jira (`epics/PAS2-4115/tracker.json`).

**Waga: ŚREDNIA** (to świadomy wybór — system produkcyjny, nie produkt). Ale jako *wzorzec do
naśladowania* — bezużyteczny poza wFirmą.

**Warunek obalenia.** Pokazać, że przenoszalność jest nieistotna dla systemu wewnętrznego, a
sprzężenie kupuje realną moc (np. integracja z Jirą domyka pętlę, której przenośny plugin nie
domyka). Czyli: „nieprzenoszalny" ≠ „gorszy" dla danego celu.

---

## T8 (META, najmocniejsza) — Pasejo myli aktywność z uczeniem

**Twierdzenie.** System produkuje ogromną liczbę artefaktów (epics, sessions, heartbeats,
leases, memory files, 58 hooków) — ale **nie istnieje dowód, że którakolwiek pętla zwrotna
faktycznie zmieniła przyszłe zachowanie**. To system *activity-based*, nie *outcome-based*:
mierzy, że coś się dzieje, nie że dzięki temu jest lepiej.

**Dowód (synteza T1–T6).** Pusty `evolution/log.jsonl` (brak danych ewolucji) + pusta sekcja
Learnings w 23/24 agentów (zeznane w regule) + stuby pamięci + brak śladu konsolidacji +
metryki proxy. Każdy z tych elementów osobno to usterka; razem składają się na obraz pętli,
która *istnieje na papierze i w plikach konfiguracyjnych*, ale nie zamyka się empirycznie.

**Waga: KRYTYCZNA.** To teza nadrzędna — jeśli się utrzyma, pasejo jest imponującym
**rusztowaniem** wokół niesprawdzonego rdzenia.

**Warunek obalenia.** Najtrudniejszy i najważniejszy dla kroku 2: znaleźć *choć jeden*
zarejestrowany przypadek, gdzie zapisana lekcja (w pasejo LUB w claude_evolve) zmieniła
późniejszą decyzję/zachowanie. Jeśli claude_evolve też tego nie pokaże — teza T8 obejmuje
oba systemy i staje się tezą o **całej klasie** „self-evolving agent setups", a nie o pasejo.

---

## Podsumowanie tez (tabela celów dla kroku 2)

| # | Teza | Waga | Najłatwiej obalić przez… |
|---|------|------|--------------------------|
| T1 | Ewolucja to artefakt, nie mechanizm (pętla nigdy nie biegła) | WYSOKA | dowód realnego przebiegu pętli |
| T2 | 58 hooków = dług i kruchość; antytarcie generuje tarcie | WYSOKA | korelacja hooki↔mniej incydentów |
| T3 | Trójwarstwowy workflow = over-engineering | ŚREDNIA | dowód niezależnej reużywalności warstw |
| T4 | „Smart loader" to gnijąca tablica, nie inteligencja | WYSOKA | „gnijąca mapa > brak retrievalu" |
| T5 | Pamięć per-agent fragmentuje; scalanie nie biegnie | ŚR-WYS | „per-projekt zlewa konteksty — gorzej" |
| T6 | Liczniki tarcia mierzą hałas, nie naukę | ŚREDNIA | „jakość gorzej skaluje bez nadzoru" |
| T7 | Sprzężenie = nieprzenoszalność i nieaudytowalność | ŚREDNIA | „nieprzenoszalny ≠ gorszy dla celu" |
| T8 | **Aktywność ≠ uczenie; brak dowodu zmiany zachowania** | KRYTYCZNA | jeden zarejestrowany przypadek zmiany |

**Nadrzędne pytanie dla kroku 2:** czy `claude_evolve`/`learning-loop` *unika* tych pułapek,
czy tylko *przesuwa* je gdzie indziej (np. T8 — czy ono pokazuje zmianę zachowania, czy też
jest tylko czystszym rusztowaniem wokół tego samego niesprawdzonego rdzenia)?
