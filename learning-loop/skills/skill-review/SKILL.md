---
name: skill-review
description: Ulepsza skille na podstawie zebranego tarcia (FRICTION.md).
metadata:
  origin: reflect-loop
  created: 2026-06-25
---

# Skill Review

Środkowy człon pętli uczenia: zamienia zaobserwowane tarcie (`FRICTION.md`)
w konkretne poprawki `SKILL.md`. `/reflect` rodzi skill, ten go dojrzewa,
`/curator` archiwizuje. NIE recenzuje „na zimno": brak dowodu → brak poprawki.
Obejmuje skille GLOBALNE (`~/.claude/skills/`) i PROJEKTOWE (`./.claude/skills/` bieżącego katalogu).

## When to Use

- Ręcznie (`/skill-review`), gdy chcesz przetworzyć zebrane tarcie w poprawki.
- Gdy `~/.claude/skills/*/FRICTION.md` urosło i czas zamienić dowód na fix.

## Inwarianty (twarde)

- **Evidence-only:** poprawka MUSI wskazywać wpis z `FRICTION.md` (`expected`/`actual`).
  Brak ważnego wpisu → brak propozycji. Nigdy nie wymyślasz ulepszeń „dla jakości".
- **Zakres = lokalizacja:** tykasz `~/.claude/skills/*` ORAZ `./.claude/skills/*`. Skille
  pluginów (`~/.claude/plugins/...`) są poza tymi drzewami — NIE ruszasz.
- **Nie-destrukcyjnie:** każdy diff za potwierdzeniem usera. Dowód czyścisz dopiero
  PO zastosowaniu poprawki.
- **Wpis nieważny** (brak `expected` lub `actual`) → pomiń, nie zgaduj.

## Procedure

1. **Skanuj** `~/.claude/skills/*/FRICTION.md` ORAZ `./.claude/skills/*/FRICTION.md`; zbierz
   pliki z ≥1 ważnym wpisem (komenda niżej), z etykietą zasięgu `[global]`/`[project]`.
2. Dla każdego skilla: wczytaj `SKILL.md` + ważne wpisy z `FRICTION.md`.
3. **Zaproponuj diff** zakotwiczony w `expected`/`actual` — wskaż, którego wpisu dotyczy.
4. **Po potwierdzeniu** usera zastosuj edycję `SKILL.md` (mtime → sygnał życia dla curatora).
5. **Wyczyść** skonsumowane wpisy z `FRICTION.md`. Wpis świadomie nienaprawiany →
   oznacz `- **won't-fix:** <powód>` (zostaje, pomijany w kolejnych przeglądach).

## Format FRICTION.md (wejście)

```markdown
## <YYYY-MM-DD>
- **expected:** <co skill kazał zrobić>
- **actual:** <co faktycznie wyszło / dlaczego zawiodło>
- **fix-hint:** <opcjonalnie: kierunek poprawki>
```

## Komenda pomocnicza (lista skilli z tarciem)

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const roots=[["global",path.join(os.homedir(),".claude","skills")],
             ["project",path.join(process.cwd(),".claude","skills")]];
for(const [scope,root] of roots){
  let es=[]; try{es=fs.readdirSync(root,{withFileTypes:true});}catch{continue;}
  for(const e of es){
    if(!e.isDirectory()||e.name.startsWith(".")) continue;
    const f=path.join(root,e.name,"FRICTION.md"); if(!fs.existsSync(f)) continue;
    const n=(fs.readFileSync(f,"utf8").match(/^\s*-\s*\*\*expected:\*\*/mg)||[]).length;
    if(n>0) console.log(`[${scope}] ${e.name}  ${n} wpis(y)`);
  }
}'
```

## Verification

- Lista zawiera skille z `~/.claude/skills/*` i `./.claude/skills/*` mające ważny wpis (`expected`), z etykietą zasięgu.
- Skille pluginowe nigdy się nie pojawiają (inne drzewo).
- Każda propozycja wskazuje konkretny wpis dowodowy.
- Po naprawie `FRICTION.md` nie zawiera już skonsumowanego wpisu.
