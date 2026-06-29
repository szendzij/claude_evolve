---
name: reflect
description: Routuje wnioski sesji do pamięci i skilli per projekt.
metadata:
  origin: reflect-loop
  created: 2026-06-25
---

# Reflect Skill

Refleksja na koniec istotnej sesji: przeglądasz, co zrobiłeś, i routujesz trwałą
wiedzę do właściwej warstwy I zasięgu. Nie zapisuje przebiegu sesji (to robi
`remember`, jeśli go masz) — wyłącznie trwałe fakty i powtarzalne procedury.

Zasada nadrzędna: **silnik globalny, wytwory domyślnie do bieżącego projektu.**
Awans na globalny to rzadki wyjątek (patrz Bramka skilla, Etap 2).

## When to Use

- Gdy hook `reflection-gate` poprosi po sesji z niezacommitowanymi zmianami.
- Ręcznie (`/reflect`), gdy wypracowałeś coś wartego zapamiętania.

## Memory Routing (Konstytucja Pamięci)

| Rodzaj wiedzy | Warstwa | Gdzie |
|---|---|---|
| Co działo się w sesji (przebieg) | Epizodyczna | `remember` / `.remember/` (jeśli masz) |
| Trwały fakt | Semantyczna | pamięć per-projekt (patrz Fakty) |
| Powtarzalna procedura | Proceduralna | skill (patrz Bramka skilla) |
| Co dalej w następnej sesji | Przejściowa | `.remember/remember.md` (handoff) |

Reguła rozstrzygająca: *Czy to przyda się za tydzień w innej sesji?* Nie → zostaw
warstwie epizodycznej. Tak, fakt → pamięć. Tak, procedura → skill.

## Procedure

1. **Przejrzyj sesję.** Co zrobiłeś, co zadziałało, co było nieoczywiste, jakie decyzje.
2. **Fakty → pamięć per-projekt** (patrz Fakty).
3. **Procedury → skille** (patrz Bramka skilla).
4. **Handoff** (tylko jeśli używasz `remember`/`.remember/`): zaktualizuj
   `.remember/remember.md`. Jeśli nie używasz tej warstwy — pomiń krok.
   **Wyczyść znaczniki pending-reflect** tego projektu (komenda niżej) — `reflection-gate`
   zapisuje je odroczone (zamiast przerywać sesję), a ten krok zamyka pętlę po refleksji.
5. **Atrybucja kandydatur tarcia (auto-capture).** Hook `friction-capture` zapisał surowe
   awarie narzędzi tej sesji. Wczytaj najświeższy plik kandydatur (komenda niżej) i dla
   KAŻDEGO wpisu oceń — znając kontekst sesji i to, których skilli FAKTYCZNIE użyłeś:
   - **Realne tarcie powiązane z użytym skillem** → dopisz wpis do właściwego
     `<skill>/FRICTION.md` w istniejącym formacie (`expected`/`actual`/`fix-hint`),
     tłumacząc surową awarię na rozjazd `expected` ≠ `actual`.
   - **Błąd przejściowy / literówka / niepowiązany ze skillem** → odrzuć, nie zapisuj.

   To TY przypisujesz (hook tego nie robi — nie zna aktywnego skilla). Po przetworzeniu
   oznacz plik jako `.processed` (komenda niżej) — odwracalnie, by nie przerabiać go ponownie.
6. **Tarcie ze skilli (capture).** Dla skilli, których FAKTYCZNIE użyłeś w tej sesji
   i które pokazały tarcie: dopisz wpis do `<skill-dir>/FRICTION.md`. Tylko realne
   tarcie z tej sesji. Naprawia `/skill-review`. Format:
   ```markdown
   ## <YYYY-MM-DD>
   - **expected:** <co skill kazał zrobić>
   - **actual:** <co faktycznie wyszło / dlaczego zawiodło>
   - **fix-hint:** <opcjonalnie>
   ```
7. **Detekcja nawrotu (outcome).** Dla KAŻDEGO tarcia przypisanego do skilla w krokach 5–6:
   sprawdź `<skill>/RESOLVED.md` (jeśli istnieje). Jeśli nowe tarcie to **nawrót** rozwiązanego
   wcześniej (osąd: podobne `was`):
   - w `RESOLVED.md` zmień tę pozycję `- **status:** held` → `- **status:** recurred <YYYY-MM-DD>`,
   - **wyraźnie zaznacz w wynikach:** „fix z DNIA się nie utrzymał — sygnał do GŁĘBSZEJ przebudowy
     skilla, nie cichego ponownego zapisania tego samego tarcia",
   - wpis tarcia i tak trafia do `FRICTION.md` (skill-review obsłuży go świadomy, że to nawrót).
   To osąd LLM (fuzzy match `was`), nie mechaniczny matcher.

## Komendy — kandydatury tarcia

Wczytaj plik kandydatur **bieżącej sesji** (scope po `CLAUDE_CODE_SESSION_ID` — nigdy „najnowszy globalnie", bo to czytałoby tarcie innych projektów):

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const sid=process.env.CLAUDE_CODE_SESSION_ID;
if(!sid){console.log("(brak CLAUDE_CODE_SESSION_ID — pomijam auto-skan; wskaż plik ręcznie)");process.exit(0);}
const f=path.join(os.homedir(),".claude","learning-loop","friction-candidates",sid+".jsonl");
if(!fs.existsSync(f)){console.log("(brak kandydatur tarcia dla tej sesji)");process.exit(0);}
console.log("PLIK:",f);
for(const ln of fs.readFileSync(f,"utf8").split("\n").filter(Boolean)) console.log(ln);
'
```

Po przypisaniu oznacz plik jako przetworzony (odwracalnie):

```bash
node -e '
const fs=require("fs");const p=process.argv[1];
fs.renameSync(p,p+".processed");console.log("oznaczono:",p+".processed");
' "<sciezka-pliku-z-PLIK:>"
```

## Komenda — wyczyść pending-reflect (krok 4)

`reflection-gate` odracza nudge: zamiast przerywać Stop, zapisuje znacznik
`~/.claude/learning-loop/pending-reflect/<sid>.json`. Po zakończonej refleksji usuń
znaczniki **bieżącego projektu** (dopasowanie po `cwd`), by nie wisiały na starcie
kolejnej sesji:

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const here=path.resolve(process.cwd());
const dir=path.join(os.homedir(),".claude","learning-loop","pending-reflect");
let n=0;
try{for(const f of fs.readdirSync(dir)){
  if(!f.endsWith(".json")) continue;
  const p=path.join(dir,f);
  try{const m=JSON.parse(fs.readFileSync(p,"utf8")||"{}");
    if(m.cwd && path.resolve(m.cwd)===here){fs.rmSync(p);n++;}}catch{}
}}catch{}
console.log("wyczyszczono pending-reflect:",n);
'
```

## Fakty (pamięć) — zawsze per-projekt

Wszystkie fakty zapisuj do pamięci **per-projekt**, niezależnie od `type`.
- Cel: katalog pamięci podany przez harness w kontekście tej sesji (per-projekt,
  np. `~/.claude/projects/<hash>/memory/`). Utwórz, jeśli trzeba. Fakt = jeden plik
  `<slug>.md` z frontmatter (`name`, `description`, `metadata.type`) + linia w `MEMORY.md`.
- Jeśli harness NIE podaje ścieżki pamięci → **NIE zapisuj po cichu** (zapis trafiłby
  w miejsce, którego harness nie wczyta = zapis-widmo). Powiedz userowi wprost: „Harness
  nie udostępnił katalogu pamięci tej sesji; fakt NIE został zapisany. Opcje: (a) podaj
  ścieżkę pamięci, (b) dopiszę fakt do `CLAUDE.md` projektu jako jawną regułę, (c) pomiń."
  Czekaj na decyzję usera — żadnego zapisu w nieczytane miejsce.
- NIE wynoś faktów user-level do globalnego `~/.claude/`. Uniwersalne preferencje to
  domena ręcznie kuratorowanego `~/.claude/CLAUDE.md` / `rules/` — pętla ich nie dotyka.
  (User pracuje inaczej w różnych projektach; globalny fakt by skaził kontekst.)
- **Zwięzłość indeksu:** dokładnie JEDNA linia w `MEMORY.md` na fakt; hook ≤ ~80 znaków.
  `MEMORY.md` ładuje się co sesję — długi indeks puchnie kontekst.

## Bramka skilla (dwustopniowa)

**Etap 1 — czy to w ogóle skill?** Twórz skill TYLKO gdy procedura jest:
1. **Powtarzalna** — wystąpi ponownie w innych sesjach.
2. **Nieoczywista** — nie wynika trywialnie z dokumentacji/zdrowego rozsądku.

Nie spełnia obu → zapisz jako fakt, NIE jako skill.

**Etap 2 — globalny czy projektowy?** Default = **projektowy** (`.claude/skills/`).
Awans na globalny (`~/.claude/skills/`) tylko gdy WSZYSTKIE 3:
1. **Brak śladów projektu** — SKILL.md nie odwołuje się do nazwy repo, ścieżek projektu,
   stacku/frameworka/wersji, nazw serwisów, domeny biznesowej. Ślad → projektowy, koniec.
2. **Tylko uniwersalne narzędzia/koncepty** — git, bash, ogólne wzorce; nie bespoke tooling.
3. **Afirmatywny osąd** — „czy pomoże w niezwiązanym projekcie?", domyślnie NIE.

**Awans przez powtórkę (oparty o skan, nie o pamięć).** Przy tworzeniu skilla skanujesz
istniejące skille globalne (`~/.claude/skills/*`) komendą niżej i szukasz odpowiednika:
ta sama nazwa kebab LUB bardzo zbliżony `description`. Znaleziony odpowiednik = sprawdzalny
dowód powtórki → zaproponuj **aktualizację/awans globalnego** zamiast tworzyć projektowy
duplikat. Brak odpowiednika → zwykła bramka (default projektowy). NIE polegaj na „pamiętam
to z innego projektu" — pamięć sesji nie przeżywa, liczy się tylko artefakt na dysku.

Komenda — szukaj odpowiednika globalnego (po nazwie i description):
```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const want=process.argv[1].toLowerCase();
const root=path.join(os.homedir(),".claude","skills");
let es=[]; try{es=fs.readdirSync(root,{withFileTypes:true});}catch{}
for(const e of es){
  if(!e.isDirectory()||e.name.startsWith(".")) continue;
  const f=path.join(root,e.name,"SKILL.md"); if(!fs.existsSync(f)) continue;
  const fm=(fs.readFileSync(f,"utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)||[,""])[1];
  const desc=((fm.match(/^description:\s*(.+)$/m)||[])[1]||"").toLowerCase();
  if(e.name.toLowerCase()===want || desc.includes(want) || want.includes(e.name.toLowerCase()))
    console.log("ODPOWIEDNIK:", e.name, "->", desc);
}' "<nazwa-lub-fraza>"
```

## Tworzenie skilla

- Globalny: `~/.claude/skills/<name>/SKILL.md`. Projektowy: `.claude/skills/<name>/SKILL.md`.
- Frontmatter MUSI zawierać:
  ```yaml
  ---
  name: <kebab-name>
  description: <≤60 znaków, jedno zdanie, kończy kropką>
  metadata:
    origin: reflect-loop
    created: <YYYY-MM-DD>
    origin-project: <nazwa-projektu>
  ---
  ```
- **Kolizja nazw:** zapisując skill PROJEKTOWY, sprawdź, czy globalny skill o tej nazwie
  istnieje (`~/.claude/skills/<name>/`). Jeśli tak → globalny PRZEBIJE projektowy
  (precedencja Claude Code). Ostrzeż usera i dodaj wyróżnik do nazwy.
- Skill złożony → deleguj do `skill-creator`, potem dodaj `metadata.origin: reflect-loop`.
- Aktualizując istniejący skill `origin: reflect-loop` — edytuj (mtime sygnalizuje curatorowi życie).

### Walidacja (deterministyczna — uruchom, nie zgaduj)

Po zapisaniu nowego `SKILL.md` uruchom lint frontmatter + heurystykę śladów projektu.
Frontmatter to twardy wymóg; ślady projektu to **sygnał** wspierający Etap 2 bramki (nie blok).

```bash
node -e '
const fs=require("fs");
const t=fs.readFileSync(process.argv[1],"utf8");
const fm=(t.match(/^---\r?\n([\s\S]*?)\r?\n---/)||[,""])[1];
const body=t.replace(/^---\r?\n[\s\S]*?\r?\n---/,"");
const probs=[];
const name=(fm.match(/^name:\s*(.+)$/m)||[])[1];
if(!name||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim())) probs.push("name: brak lub nie-kebab");
const desc=(fm.match(/^description:\s*(.+)$/m)||[])[1];
if(!desc){ probs.push("description: brak"); }
else { const d=desc.trim(); if(d.length>60) probs.push("description: >60 ("+d.length+")"); if(!d.endsWith(".")) probs.push("description: bez kropki na koncu"); }
if(!/origin:\s*reflect-loop/.test(fm)) probs.push("metadata.origin: brak reflect-loop");
if(!/created:/.test(fm)) probs.push("metadata.created: brak");
if(!/origin-project:/.test(fm)) probs.push("metadata.origin-project: brak");
const traces=[];
if(/[A-Za-z]:\\|\/(home|Users)\//.test(body)) traces.push("sciezka absolutna");
if(/\b(npm|yarn|pnpm)\s+(run\s+)?\S+/.test(body)) traces.push("skrypt npm/yarn/pnpm");
if(/\b(react|vue|angular|django|rails|spring|laravel|next\.js)\b/i.test(body)) traces.push("nazwa frameworka");
console.log(probs.length?("FRONTMATTER — PROBLEMY:\n- "+probs.join("\n- ")):"FRONTMATTER OK");
console.log(traces.length?("SLADY PROJEKTU (sygnal -> rozwaz projektowy):\n- "+traces.join("\n- ")):"BRAK sladow projektu");
' "<sciezka-do-SKILL.md>"
```

Kolizja nazw — przy zapisie skilla PROJEKTOWEGO potwierdź, czy globalny o tej nazwie istnieje:

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const name=process.argv[1];
const g=path.join(os.homedir(),".claude","skills",name);
console.log(fs.existsSync(g)?("KOLIZJA: globalny \""+name+"\" istnieje -> przebije projektowy; dodaj wyroznik"):"BRAK kolizji nazwy");
' "<nazwa>"
```

## Verification

- Każdy nowy plik pamięci ma odpowiadającą linię w `MEMORY.md`.
- Fakty trafiły do pamięci per-projekt; przy braku ścieżki — żadnego zapisu-widma, decyzja u usera.
- Lint frontmatter przebiega bez „PROBLEMY" (origin/created/origin-project obecne, description ≤ 60 z kropką, name kebab).
- Dla skilla projektowego komenda kolizji potwierdziła „BRAK kolizji" lub dodano wyróżnik.
- Heurystyka śladów projektu uruchomiona; ślady wzięte pod uwagę w Etapie 2 bramki.
- Wpisy `FRICTION.md` mają `expected` i `actual`.
- Nawrót rozwiązanego tarcia: odpowiednia pozycja w `<skill>/RESOLVED.md` oznaczona `recurred <data>` + jawny sygnał „fix się nie utrzymał".
