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
- **Brak automatycznego wyroku z wieku.** `mtime` to tylko sygnał do przeglądu; nie generujesz
  „listy do usunięcia" z samej daty. User decyduje per skill. **Bez progu odcięcia** — raport
  pokazuje wszystkie, najświeższe też (na końcu listy).
- NIGDY nie kasujesz — przenosisz do archiwum POZA root odkrywania (odwracalne):
  globalne → `~/.claude/skills-archive/<name>/`, projektowe → `./.claude/skills-archive/<name>/`.
- `pinned: true` w metadata → skill wyłączony z każdej tranzycji.
- Bez LLM-review treści skilla. Decyzja usera na podstawie raportu.

## Procedure

1. **Raportuj.** Uruchom komendę „raport" niżej: listuje WSZYSTKIE skille `origin: reflect-loop`
   (globalne + projektowe, pomijając `pinned: true`), posortowane wg `mtime` od najdawniej
   edytowanych, z etykietą zasięgu `[global]`/`[project]` i datą.
2. **Przedstaw** listę userowi z jawną ramką: „dawno nieedytowane — przejrzyj, czy nadal
   przydatne" (NIE „martwe"). NIE archiwizuj nic automatycznie.
3. **Po decyzji** usera per skill: zostaw / zaproponuj dodanie `pinned: true` / archiwizuj.
4. **Archiwizacja** wybranych: uruchom komendę „archiwizuj" niżej z `<scope>` (`global`|`project`)
   i `<name>`. Tworzy `skills-archive/` (jeśli brak) i przenosi tam katalog skilla. Przywrócenie
   = przeniesienie z powrotem do `skills/<name>/`.

## Komenda pomocnicza — raport (sortowany wg mtime, oba korzenie)

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const roots=[["global",path.join(os.homedir(),".claude","skills")],
             ["project",path.join(process.cwd(),".claude","skills")]];
const rows=[];
for(const [scope,root] of roots){
  let es=[]; try{es=fs.readdirSync(root,{withFileTypes:true});}catch{continue;}
  for(const e of es){
    if(!e.isDirectory()||e.name.startsWith(".")) continue;
    const f=path.join(root,e.name,"SKILL.md"); if(!fs.existsSync(f)) continue;
    const fm=(fs.readFileSync(f,"utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)||[,""])[1];
    if(!/origin:\s*reflect-loop/.test(fm)||/pinned:\s*true/.test(fm)) continue;
    rows.push({scope,name:e.name,m:fs.statSync(f).mtimeMs});
  }
}
rows.sort((a,b)=>a.m-b.m);
for(const r of rows) console.log(`[${r.scope}] ${r.name}  ${new Date(r.m).toISOString().slice(0,10)}`);
if(!rows.length) console.log("(brak auto-skilli)");
'
```

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

## Verification

- Raport zawiera skille `origin: reflect-loop` z OBU korzeni, niepinowane, posortowane wg mtime rosnąco.
- Brak progu — najświeższy skill też jest na liście. Żadnej automatycznej archiwizacji.
- Archiwum ląduje w `skills-archive/` (poza `skills/`); zarchiwizowany skill znika z `/`-autocomplete.
- Pliki w archiwum dają się przywrócić (przeniesienie z powrotem).
