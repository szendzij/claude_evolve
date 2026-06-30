---
name: curator
description: Raportuje i archiwizuje auto-skille po potwierdzeniu.
metadata:
  origin: reflect-loop
  created: 2026-06-25
---

# Curator Skill

Higiena cyklu życia skilli tworzonych przez `/reflect`. NIE ocenia treści i NIE archiwizuje
automatycznie — **raportuje** wszystkie auto-skille posortowane wg `mtime` (sygnał „dawno
nieedytowane", NIE wyrok), a decyzję per skill podejmuje user. Nigdy nie kasuje — maksymalnie
przenosi do archiwum **poza drzewem odkrywania** (odwracalnie). Obejmuje skille GLOBALNE
(`~/.claude/skills/`) i PROJEKTOWE (`./.claude/skills/` bieżącego katalogu).

## When to Use

- Ręcznie (`/curator`), okresowo (np. raz w miesiącu).
- Gdy auto-skilli przybywa i chcesz przejrzeć, co nadal się przydaje.

## Inwarianty (twarde)

- Tykasz WYŁĄCZNIE skille `metadata.origin: reflect-loop`. Ręcznych i pluginowych NIE rusza.
- **Wykluczenie silnika:** mimo `origin: reflect-loop`, skille silnika pętli — `reflect`,
  `skill-review`, `curator` (plugin `learning-loop`/`lore-keeper`) — NIGDY nie trafiają do
  raportu ani archiwum. Pętla nie zarządza cyklem życia samej siebie.
- **Brak automatycznego wyroku z wieku.** `mtime` to tylko sygnał do przeglądu; nie generujesz
  „listy do usunięcia" z samej daty. User decyduje per skill. **Bez progu odcięcia** — raport
  pokazuje wszystkie, najświeższe też (na końcu listy).
- NIGDY nie kasujesz — przenosisz do archiwum POZA root odkrywania (odwracalne):
  globalne → `~/.claude/skills-archive/<name>/`, projektowe → `./.claude/skills-archive/<name>/`.
- `pinned: true` w metadata → skill wyłączony z każdej tranzycji.
- Bez LLM-review treści skilla. Decyzja usera na podstawie raportu.
- **Pending-friction obok mtime:** raport pokazuje liczbę ważnych wpisów `FRICTION.md` (`Nf`, flaga `!` gdy >0). Skille z `Nf>0` przejrzyj **niezależnie od mtime** — świeży mtime może maskować skill chronicznie łatany.
- **Reguły reflect-loop:** raportujesz też reguły z `.claude/rules/reflect-loop.md` (projekt) i
  `~/.claude/rules/reflect-loop.md` (global). Reguła NIE ma sygnału użycia ani mtime — jedyny
  mierzalny sygnał to **wiek** z markera `added`, **sprzeczność** z nowszą regułą i **redundancja**
  (zachowanie wchłonięte przez skill). To przypomnienia do przeglądu, nie wyrok. Wykluczenie silnika
  obowiązuje. Archiwum reguł → `.claude/rules-archive/` (POZA `rules/`, inaczej nadal się auto-loaduje).

## Procedure

1. **Raportuj.** Uruchom komendę „raport" niżej: listuje WSZYSTKIE skille `origin: reflect-loop`
   (globalne + projektowe, pomijając `pinned: true`), posortowane wg `mtime` od najdawniej
   edytowanych, z etykietą zasięgu `[global]`/`[project]` i datą.
2. **Przedstaw** listę userowi z jawną ramką: „dawno nieedytowane — przejrzyj, czy nadal
   przydatne" (NIE „martwe"). Zwróć uwagę na flagę `!`/`Nf>0`: te skille mają nieprzetworzone
   tarcie i zasługują na przegląd niezależnie od pozycji wg mtime. NIE archiwizuj nic automatycznie.
3. **Po decyzji** usera per skill: zostaw / zaproponuj dodanie `pinned: true` / archiwizuj.
4. **Archiwizacja** wybranych: uruchom komendę „archiwizuj" niżej z `<scope>` (`global`|`project`)
   i `<name>`. Tworzy `skills-archive/` (jeśli brak) i przenosi tam katalog skilla. Przywrócenie
   = przeniesienie z powrotem do `skills/<name>/`.

## Komenda pomocnicza — raport (sortowany wg mtime, oba korzenie)

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
function pending(dir){
  const f=path.join(dir,"FRICTION.md"); if(!fs.existsSync(f)) return 0;
  const txt=fs.readFileSync(f,"utf8");
  return txt.split(/^##\s/m).slice(1).filter(b=>/\*\*expected:\*\*/.test(b)&&/\*\*actual:\*\*/.test(b)&&!/\*\*won.t-fix:\*\*/.test(b)).length;
}
const roots=[["global",path.join(os.homedir(),".claude","skills")],
             ["project",path.join(process.cwd(),".claude","skills")]];
const rows=[];
for(const [scope,root] of roots){
  let es=[]; try{es=fs.readdirSync(root,{withFileTypes:true});}catch{continue;}
  for(const e of es){
    if(!e.isDirectory()||e.name.startsWith(".")) continue;
    const d=path.join(root,e.name);
    const f=path.join(d,"SKILL.md"); if(!fs.existsSync(f)) continue;
    const fm=(fs.readFileSync(f,"utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)||[,""])[1];
    if(!/origin:\s*reflect-loop/.test(fm)||/pinned:\s*true/.test(fm)) continue;
    rows.push({scope,name:e.name,m:fs.statSync(f).mtimeMs,nf:pending(d)});
  }
}
rows.sort((a,b)=>a.m-b.m);
for(const r of rows) console.log(`${r.nf>0?"!":" "} [${r.scope}] ${r.name}  ${new Date(r.m).toISOString().slice(0,10)}  ${r.nf}f`);
if(!rows.length) console.log("(brak auto-skilli)");
'
```

Uwaga: zamiast `⚠` użyto ASCII `!` jako flagi, by snippet pozostał ASCII-safe wewnątrz `node -e`
na Windows Git Bash; w prozie nazywamy ją „flagą pending-friction".

## Raport reguł (reflect-loop.md)

Reguły z pętli żyją w `.claude/rules/reflect-loop.md` (auto-load) i nie mają mtime. Raportuj je
po **wieku** markera `added` (próg N=30 dni → flaga `!` „przejrzyj, czy nadal aktualna"). Dodatkowo
osądź **sprzeczność** (nowsza reguła znosi starszą) i **redundancję** (zachowanie reguły trafiło już
do skilla) — to realne sygnały do wycofania. Nigdy nie wycofujesz automatycznie.

```
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const now=Date.now(), DAY=864e5, AGE=30;
const roots=[["global",path.join(os.homedir(),".claude","rules","reflect-loop.md")],
             ["project",path.join(process.cwd(),".claude","rules","reflect-loop.md")]];
let total=0;
for(const [scope,f] of roots){
  if(!fs.existsSync(f)) continue;
  const txt=fs.readFileSync(f,"utf8");
  const re=/<!--\s*reflect-loop:\s*added\s*(\d{4}-\d{2}-\d{2})\s*-->\s*\r?\n([^\r\n]*)/g;
  let m;
  while((m=re.exec(txt))){
    const age=Math.floor((now-Date.parse(m[1]))/DAY);
    console.log(`${age>=AGE?"!":" "} [${scope}] ${m[1]} (${age}d)  ${m[2].trim().slice(0,70)}`);
    total++;
  }
}
if(!total) console.log("(brak regul reflect-loop)");
else console.log("\n! = starsza niz "+AGE+"d -> przejrzyj, czy nadal aktualna (przypomnienie, nie wyrok).");
'
```

**Wycofanie reguły (odwracalne, za potwierdzeniem).** Gdy user potwierdzi wycofanie wybranej reguły:
1. Utwórz `.claude/rules-archive/` (jeśli brak) — POZA `.claude/rules/`, więc archiwum NIE auto-loaduje.
2. Przenieś blok reguły (marker `added` + linia) z `reflect-loop.md` do `rules-archive/reflect-loop.md`,
   dopisując na końcu bloku linię `<!-- archived: YYYY-MM-DD -->`.
3. Usuń ten blok z `reflect-loop.md`.
Przywrócenie = przeniesienie bloku z powrotem. NIGDY nie kasujesz reguły bezpowrotnie.

## Komenda pomocnicza — archiwizuj jeden skill (odwracalnie, poza root)

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const scope=process.argv[1], name=process.argv[2];
const base = scope==="project" ? path.join(process.cwd(),".claude") : path.join(os.homedir(),".claude");
const from=path.join(base,"skills",name);
const toDir=path.join(base,"skills-archive");
fs.mkdirSync(toDir,{recursive:true});
fs.renameSync(from, path.join(toDir,name));
console.log("zarchiwizowano:", from, "->", path.join(toDir,name));
' <scope> <name>
```

## Higiena MEMORY.md (opcjonalnie, w tym samym przebiegu)

`MEMORY.md` (indeks per-projekt) ładuje się co sesję — pilnuj, by nie puchł. Dla pamięci
bieżącego projektu uruchom komendę: wskaże **martwe linki** (linie wskazujące na pliki,
których już nie ma) i **duplikaty tematu** (ta sama nazwa pliku w >1 linii). Zaproponuj
userowi usunięcie/scalenie linii — odwracalnie, za potwierdzeniem. NIE streszczasz treści
pamięci (to robi warstwa epizodyczna); tylko czyścisz indeks.

```bash
node -e '
const fs=require("fs"),path=require("path");
const dir=process.argv[1]; const idx=path.join(dir,"MEMORY.md");
if(!fs.existsSync(idx)){console.log("brak MEMORY.md");process.exit(0);}
const lines=fs.readFileSync(idx,"utf8").split(/\r?\n/);
const seen=new Map();
lines.forEach((ln,i)=>{
  const m=ln.match(/\(([^)]+\.md)\)/);
  if(!m) return;
  const target=path.join(dir,m[1]);
  if(!fs.existsSync(target)) console.log(`MARTWY LINK (l.${i+1}): ${m[1]}`);
  seen.set(m[1],(seen.get(m[1])||0)+1);
});
for(const [f,n] of seen) if(n>1) console.log(`DUPLIKAT: ${f} x${n}`);
' "<sciezka-do-katalogu-memory>"
```

## Higiena kandydatur tarcia

Hook `friction-capture` zostawia pliki w `~/.claude/learning-loop/friction-candidates/`.
Rozróżniaj **dwie klasy** — nie traktuj wszystkiego jako „logi":

- **`*.processed`** — już striageowane w `/reflect`. To prawdziwe transientne logi.
  Raportuj > **7 dni** i — po potwierdzeniu — usuń (logi, nie podlegają „nigdy nie kasuj").
- **`*.jsonl`** (bez `.processed`) — **nieprzetworzone lekcje**, jedyny zapisany sygnał tarcia.
  Raportuj > **21 dni** z framingiem **utraty**: to nie logi, to lekcje, które przepadną.
  **Nie kasuj ich na ślepo** — najpierw zaproponuj userowi `/reflect`, by je przypisał.

Raport `.processed` > 7 dni (bezpieczne do usunięcia):

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".claude","learning-loop","friction-candidates");
const cutoff=Date.now()-7*864e5;let n=0;
let files=[];try{files=fs.readdirSync(dir);}catch{console.log("(brak katalogu kandydatur)");process.exit(0);}
for(const f of files){ if(!f.endsWith(".processed")) continue;
  const m=fs.statSync(path.join(dir,f)).mtimeMs;
  if(m<cutoff){console.log("PROCESSED >7d:",f,new Date(m).toISOString().slice(0,10));n++;}}
if(!n)console.log("(brak .processed > 7 dni)");
'
```

Raport nieprzetworzonych `.jsonl` > 21 dni (UTRATA — uruchom /reflect, nie kasuj):

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".claude","learning-loop","friction-candidates");
const cutoff=Date.now()-21*864e5;let n=0;
let files=[];try{files=fs.readdirSync(dir);}catch{console.log("(brak katalogu kandydatur)");process.exit(0);}
for(const f of files){ if(!f.endsWith(".jsonl")) continue;
  const m=fs.statSync(path.join(dir,f)).mtimeMs;
  if(m<cutoff){console.log("NIEPRZETWORZONA LEKCJA >21d:",f,new Date(m).toISOString().slice(0,10));n++;}}
if(n)console.log("\n=> "+n+" nieprzetworzonych lekcji starszych niz 21 dni. To NIE logi — uruchom /reflect, by je przypisac; NIE kasuj na slepo.");
else console.log("(brak nieprzetworzonych .jsonl > 21 dni)");
'
```

Usunięcie `.processed` > 7 dni (tylko ta klasa, po potwierdzeniu usera):

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".claude","learning-loop","friction-candidates");
const cutoff=Date.now()-7*864e5;let n=0;
for(const f of fs.readdirSync(dir)){ if(!f.endsWith(".processed")) continue;
  const p=path.join(dir,f); if(fs.statSync(p).mtimeMs<cutoff){fs.unlinkSync(p);n++;}}
console.log("usunieto",n,".processed > 7 dni");
'
```

## Raport outcome (held vs recurred — ewidencja T8)

Skanuje `<skill>/RESOLVED.md` w obu korzeniach i podsumowuje skuteczność napraw. `recurred` =
fix się nie utrzymał (głębsza przebudowa, nie kolejna łata). `held ≥30 dni` = kandydat na dowód,
że naprawa zmieniła zachowanie (T8). Sygnał, nie wyrok — decyzja u usera.

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const roots=[["global",path.join(os.homedir(),".claude","skills")],
             ["project",path.join(process.cwd(),".claude","skills")]];
const now=Date.now(), DAY=864e5; let HELD=0,REC=0,EV=0;
for(const [scope,root] of roots){
  let es=[]; try{es=fs.readdirSync(root,{withFileTypes:true});}catch{continue;}
  for(const e of es){
    if(!e.isDirectory()||e.name.startsWith(".")) continue;
    const f=path.join(root,e.name,"RESOLVED.md"); if(!fs.existsSync(f)) continue;
    let h=0,r=0;
    for(const b of fs.readFileSync(f,"utf8").split(/^##\s/m).slice(1)){
      if(/\*\*status:\*\*\s*recurred/i.test(b)){r++;continue;}
      if(/\*\*status:\*\*\s*held/i.test(b)){h++;
        const dm=b.match(/^(\d{4}-\d{2}-\d{2})/);
        if(dm&&(now-Date.parse(dm[1]))/DAY>=30) EV++;
      }
    }
    if(h||r) console.log(`[${scope}] ${e.name}  held:${h} recurred:${r}`);
    HELD+=h;REC+=r;
  }
}
console.log(`OUTCOME: held ${HELD}, recurred ${REC}. T8-evidence (held >=30d): ${EV}.`);
if(REC>0) console.log("recurred = fix sie nie utrzymal -> rozwaz glebsza przebudowe, nie kolejna late.");
if(EV>0) console.log("held >=30d = kandydat na dowod zmiany zachowania (T8).");
'
```

## Verification

- Raport zawiera skille `origin: reflect-loop` z OBU korzeni, niepinowane, posortowane wg mtime rosnąco.
- Brak progu — najświeższy skill też jest na liście. Żadnej automatycznej archiwizacji.
- Archiwum ląduje w `skills-archive/` (poza `skills/`); zarchiwizowany skill znika z `/`-autocomplete.
- Pliki w archiwum dają się przywrócić (przeniesienie z powrotem).
- Raport pokazuje kolumnę `Nf` (ważne pending wpisy: expected ∧ actual ∧ ¬won't-fix) i flagę `!` przy `Nf>0`; sort wg mtime rosnąco zachowany.
- Raport outcome liczy `held`/`recurred` z `RESOLVED.md` (bloki `split(/^##\s/m).slice(1)`); `held ≥30d` zliczone jako T8-evidence; noty recurred/evidence pojawiają się warunkowo.
- Raport reguł listuje wpisy `reflect-loop.md` (oba korzenie) po wieku markera `added`; flaga `!` przy ≥30d; brak pliku → „(brak regul reflect-loop)". Wycofana reguła ląduje w `.claude/rules-archive/` (poza auto-load), odwracalnie; żadna reguła nie jest kasowana bezpowrotnie.
