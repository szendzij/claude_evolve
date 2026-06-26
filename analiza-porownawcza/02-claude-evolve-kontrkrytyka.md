# claude_evolve / learning-loop — kontrkrytyka (próba obalenia tez T1–T8)

> **Status:** krok 2 z 2. Zadanie: **obalić** tezy T1–T8 z `01-pasejo-krytyka.md`,
> patrząc przez pryzmat `claude_evolve`. Reguła uczciwości (CLAUDE.md): tam, gdzie teza
> **przeżywa** lub **obejmuje także claude_evolve**, mówię to wprost — nie wymuszam pogromu.
>
> **Metoda:** dowody operacyjne z realnego stanu (nie z README). Każda teza dostaje werdykt:
> **OBALONA** / **CZĘŚCIOWO** / **PRZEŻYWA** + dowód.
>
> **Data:** 2026-06-26. **Zakres:** plugin `learning-loop` + jego ślady operacyjne w
> `~/.claude/` (friction-candidates, skills-archive, .remember).

---

## Kluczowe odkrycie operacyjne (zmienia wszystko)

W przeciwieństwie do pasejo (gdzie `evolution/log.jsonl` nie istniał — pętla nigdy nie biegła),
**pętla claude_evolve demonstracyjnie BIEGŁA w środowisku** — w 4 sesjach na **3 różnych
projektach**:

| Sesja | Projekt | Co złapał `friction-capture` |
|-------|---------|------------------------------|
| `9d61e4f8…processed` | respondo-autoupdate | Read nieistniejącego `MEMORY.md`; błąd cudzysłowu w Bash |
| `a8d85f99…processed` | google-chat-notify | `git rm --cached .env` — plik nie istniał |
| `e46642cb…processed` | google-chat-notify | porażka testu jest; błąd składni `(` w Bash |
| `def57fc2….jsonl` (live) | pasejo2 (TA sesja) | 2× EISDIR — **ja** czytałem katalogi `epics/` |

Trzy z czterech mają sufiks `.processed` → `/reflect` faktycznie je **skonsumował**.
Dodatkowo: `~/.claude/skills-archive/` zawiera `reflect`, `curator`, `skill-review` (stare,
ręcznie instalowane wersje → zarchiwizowane przy migracji na plugin), a `.remember/now.md`
jest żywy. **Capture + reflect + archive — te ramiona pętli działają.**

ALE: **zero `FRICTION.md` w całym systemie. Zero auto-skilli (`origin: reflect-loop`) żywych.**
Wszystkie pamięci per-projekt puste (złapane błędy *to* m.in. `ls memory (puste)`).

Ten jeden zestaw faktów rozstrzyga większość tez. Po kolei.

---

## T1 — „Ewolucja to artefakt, nie mechanizm" → **CZĘŚCIOWO OBALONA**

**Obalenie:** dla ramion **capture + reflect** teza upada. Hook `friction-capture` odpalił w
4 sesjach na 3 projektach, `/reflect` przetworzył 3 z nich (sufiks `.processed`). To nie
zimny start — to udokumentowany przebieg w realu, czego pasejo nie ma.

**Co przeżywa:** ramię **dojrzewania** (`/skill-review`) nigdy nie dostało wejścia — brak
choć jednego `FRICTION.md`. `/reflect` nigdy nie **urodził** żywego skilla (grep
`origin: reflect-loop` po `~/.claude/skills/` = pusto). Centralna obietnica — auto-rodzone,
dojrzewające skille — pozostaje **nieudowodniona empirycznie**.

**Werdykt:** claude_evolve jest „cieplejsze niż zimne", ale jego rdzeń (cykl życia skilla)
ma tyle samo dowodów działania co pasejo: **zero**. Teza upada w połowie, w której pasejo
było martwe; przeżywa w połowie, która jest istotą obu systemów.

---

## T2 — „58 hooków = kruchość; antytarcie generuje tarcie" → **OBALONA na osi kruchości; SUB-TEZA WRACA**

**Obalenie (mocne):** claude_evolve ma **2 hooki** (nie 58), `hook-errors.log` jest **pusty**
(własne hooki nigdy nie zalogowały błędu), a regresję pokrywa **12/12 przechodzących testów**
(`friction-capture` 5/5, `reflection-gate` 7/7 — zweryfikowane uruchomieniem). To dokładne
przeciwieństwo pasejo, które wypuściło `collect-friction-signals.sh` z bugiem psującym JSON
w 8/20 wpisów. „Mniej hooków + testy" jest tu empirycznie solidniejsze.

**Sub-teza, która WRACA i tnie claude_evolve:** „antytarcie generuje tarcie" odżywa w innej
formie. Złapane kandydatury obejmują błędy **samozadane przez maszynerię uczenia**: `Read
MEMORY.md does not exist`, `ls memory (puste)`. To `/reflect`/loader szukający pamięci,
której nie ma, **produkuje** „tarcie", które system potem łapie. Inny mechanizm, ten sam
paradoks — tyle że na mikroskalę 2 hooków, nie 58.

**Werdykt:** oś ilości/kruchości — obalona przekonująco. Paradoks samozadanego tarcia — żywy
w obu systemach.

---

## T3 — „Trójwarstwowy workflow = over-engineering" → **OBALONA (z zastrzeżeniem)**

**Obalenie:** claude_evolve jest żywym kontrprzykładem — 3 skille + 2 hooki, płasko, zero
redundantnych warstw na ten sam przepływ. Dowodzi, że pętli uczenia **nie trzeba** rozsmarowywać
na komenda→skill→skill. Minimalizm działa (patrz: pętla biegła, T1).

**Zastrzeżenie uczciwe:** claude_evolve nie „rozwiązało" over-engineeringu — ono **nie gra w
tę grę**. Nie ma orkiestracji, egzekucji, fleetu. Łatwo nie mieć trzech warstw workflow, gdy
nie masz żadnego workflow do wykonania. Obalenie realne, ale częściowo przez unik.

**Werdykt:** OBALONA jako „konieczność" — z notką, że to obalenie kosztuje claude_evolve całą
klasę zdolności, których pasejo dostarcza.

---

## T4 — „Smart loader to gnijąca tablica, nie inteligencja" → **PRZEŻYWA — i wręcz się WZMACNIA**

To teza, na której kontrkrytyka **zawodzi**, i to jest najważniejszy wynik kroku 2.

**Próba obalenia nie istnieje:** claude_evolve **nie ma żadnego retrievalu**. Polega na
natywnym ładowaniu `MEMORY.md`. Nie może „zrobić tego lepiej", bo nie robi tego wcale.

**Co gorsza — odwrócenie:** „gnijąca tablica" pasejo (`DOMAIN_MAP`, regex z brancha) i tak
**bije brak retrievalu**. Nawet statyczna, gnijąca mapa wstrzykuje *coś* trafnego; pusty hook
nie wstrzykuje nic. Dowód empiryczny: jedyna aktywność związana z pamięcią, jaką claude_evolve
zarejestrował w realu, to **PORAŻKI znalezienia pamięci** (`Read MEMORY.md does not exist`,
`ls memory (puste)`).

**Werdykt:** teza nie tylko PRZEŻYWA — analiza claude_evolve ją **umacnia**. To wymiar, na
którym pasejo > claude_evolve. (Pokrywa się z luką, którą oznaczyłem już w porównaniu z kroku
poprzedniego: retrieval to największy brak learning-loop.)

---

## T5 — „Pamięć per-agent fragmentuje; scalanie nie biegnie" → **CZĘŚCIOWO OBALONA**

**Obalenie:** model per-projekt eliminuje 18 silosów pasejo i ryzyko „wiedza dla 2 agentów
ginie w jednym". Strukturalnie czystsze.

**Co przeżywa (przesunięcie, nie usunięcie problemu):** w 3 projektach claude_evolve **nic nie
zapisał** do pamięci (katalogi puste — dosłownie złapał własne `ls memory (puste)`). Pasejo
ma problem „rozprosz, nie scalaj"; claude_evolve ma „nie ma czego scalać, bo nic nie
zapisano". Inna przyczyna, **identyczny skutek: brak użytecznej skumulowanej wiedzy.**

**Werdykt:** fragmentacja — obalona. Ale głębszy zarzut (pamięć pusta) jest **wspólny obu**.

---

## T6 — „Liczniki tarcia mierzą hałas, nie naukę" → **OBALONA w projekcie; empiria potwierdza bazowy lęk**

**Obalenie:** claude_evolve nie liczy — zbiera jakościowe `expected≠actual` i każe **człowiekowi**
osądzić surowy sygnał w `/reflect`. To realna alternatywa dla zaszumionych liczników pasejo.

**Empiria jest dwuznaczna:** złapane kandydatury dowodzą, że **surowy sygnał tarcia to hałas
niezależnie od reprezentacji** — wszystkie 4 sesje to błędy przejściowe (cudzysłowy, EISDIR,
brak `.env`). Obrona modelu jakościowego = „człowiek odfiltruje" — i faktycznie odfiltrował
(0 wpisów `FRICTION.md`). Ale to znaczy, że **dotychczasowy plon auto-capture = ZERO użytecznego
sygnału**. Model jakościowy jest lepszy od liczników, lecz lęk bazowy („tarcie z narzędzi to
głównie szum") teza T6 trafnie diagnozuje — i dotyka też claude_evolve.

**Werdykt:** OBALONA jako „musisz kwantyfikować" — z twardą notką, że jakościowy capture jak
dotąd nie wyprodukował ani jednego trafnego sygnału.

---

## T7 — „Sprzężenie = nieprzenoszalność i nieaudytowalność" → **OBALONA (z tym samym zastrzeżeniem co T3)**

**Obalenie:** claude_evolve jest dowodem wprost — czysty node (bez bash/jq/python), miękkie
zależności, dystrybucja przez marketplace, i **realnie przebiegło na 3 różnych projektach**.
Przenoszalność udowodniona faktem, nie deklaracją.

**Zastrzeżenie:** przenoszalne, bo robi mniej (zero integracji Jira/CI). Kompromis
moc↔przenośność jest realny — pasejo kupuje sprzężeniem zdolności, których plugin nie ma.

**Werdykt:** OBALONA jako „sprzężenie konieczne". Sprzężenie pozostaje uzasadnionym wyborem
dla systemu wewnętrznego (to było zresztą w warunku obalenia T7).

---

## T8 (META) — „Aktywność ≠ uczenie; brak dowodu zmiany zachowania" → **PRZEŻYWA i GENERALIZUJE SIĘ**

To była pułapka kroku 1 — i się zatrzasnęła.

**Dlaczego nie da się obalić:** claude_evolve **wykazał aktywność** (4 capture, 3 reflect,
żywe `now.md`, 3 zarchiwizowane skille) i **zero trwałego artefaktu uczenia** (0 `FRICTION.md`,
0 żywych auto-skilli, 0 zapisanych faktów). Dokładnie wzorzec activity-without-learning, który
T8 przewidział — **teraz obejmujący także claude_evolve.**

**Niuans, który częściowo ratuje claude_evolve (ale NIE obala tezy):** wyprodukowanie zera
artefaktów z samego tarcia przejściowego to **zachowanie POPRAWNE** — gate „evidence-only"
zadziałał: system **odmówił sfabrykowania fałszywej nauki**. To realna przewaga nad pasejo,
które takiego bezpiecznika nie ma. Ale „nie stworzył fałszywej wiedzy" ≠ „stworzył prawdziwą".
Bezpiecznik udowodnił, że **blokuje false-positives**; nie udowodnił jeszcze, że **umożliwia
true-positives**, bo w żadnej złapanej sesji nie wystąpiło genuine `expected≠actual`.

**Werdykt:** NIE OBALONA. T8 awansuje z „tezy o pasejo" na **tezę o całej klasie**
„self-evolving agent setups". Żaden z dwóch systemów nie pokazał **ani jednego** przypadku
„zapisana lekcja → zmienione późniejsze zachowanie". claude_evolve jest *lepiej ustawione*,
by to kiedyś pokazać (evidence-only, cykl życia), ale **rekord empiryczny obu = zero**.

---

## Tablica wyników kontrkrytyki

| # | Teza (skrót) | Werdykt | Kto wypada lepiej |
|---|--------------|---------|-------------------|
| T1 | Ewolucja nigdy nie biegła | **CZĘŚCIOWO OBALONA** | claude_evolve (biegło) — ale rdzeń obu nieudowodniony |
| T2 | Hooki = kruchość; antytarcie tnie samo | **OBALONA** (+ sub-teza wraca) | **claude_evolve** (2 hooki, 0 błędów, 12/12 testów) |
| T3 | Trójwarstwowy workflow | **OBALONA** (przez unik) | claude_evolve (ale robi mniej) |
| T4 | Smart loader = gnijąca tablica | **PRZEŻYWA / WZMACNIA SIĘ** | **pasejo** (gnijąca mapa > brak retrievalu) |
| T5 | Per-agent fragmentuje; brak scalania | **CZĘŚCIOWO OBALONA** | claude_evolve struktura, ale pamięć obu pusta |
| T6 | Liczniki = hałas | **OBALONA** (plon i tak = 0) | claude_evolve (jakość > liczniki) |
| T7 | Sprzężenie = nieprzenoszalność | **OBALONA** | **claude_evolve** (przebiegło na 3 projektach) |
| T8 | **Aktywność ≠ uczenie** | **PRZEŻYWA / GENERALIZUJE** | **remis na zero** — dotyczy obu |

**Bilans:** 4 obalone (T2, T3, T6, T7), 2 częściowo (T1, T5), **2 przeżywają (T4, T8)** — i
to właśnie dwie przeżywające są najgłębsze.

---

## Wniosek nadrzędny

Kontrkrytyka **udała się na osiach inżynierskich** (kruchość, prostota, przenośność, anty-szum,
anty-halucynacja) — tu claude_evolve jest wyraźnie lepiej zaprojektowane i, w odróżnieniu od
pasejo, **udowodniło to przebiegiem**. Ale **zawiodła na dwóch osiach epistemicznych**, i to
nie przypadkiem:

1. **T4 (retrieval):** claude_evolve pisze pamięć, ale nie ma jak jej *przywołać*. Dopóki
   nie dorobi domenowo-świadomego retrievalu, „czystsza architektura" zapisuje w próżnię.
   Tu pasejo — mimo gnijącej tablicy — realnie wyprzedza.

2. **T8 (zmiana zachowania):** oba systemy to dziś **rusztowania bez udowodnionego rdzenia**.
   claude_evolve jest lepiej ustawione i ma bezpiecznik przeciw fałszywej nauce — ale dowód
   „lekcja zmieniła zachowanie" nie istnieje w żadnym z nich. Najmocniejsza teza kroku 1
   okazała się tezą o **całej klasie**, nie o jednym systemie.

**Konstruktywny wniosek dla claude_evolve** (z dowodu, nie z opinii): dwie rzeczy odróżniłyby
go od pasejo nie deklaracją, lecz faktem — (a) **retrieval hook** zamykający T4; (b) **jeden
udokumentowany przypadek** genuine `expected≠actual` → poprawka skilla → zmienione zachowanie
w kolejnej sesji, który jako jedyny obala T8. Do tego czasu learning-loop jest *lepiej
zaprojektowaną obietnicą* tej samej niespełnionej jeszcze rzeczy.
