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
- **Recydywa = sygnał systemowy:** ≥2 podobne wpisy → priorytet i rozważenie przebudowy, nie kolejnej łaty.

## Procedure

1. **Skanuj** `~/.claude/skills/*/FRICTION.md` ORAZ `./.claude/skills/*/FRICTION.md`; zbierz
   pliki z ≥1 ważnym wpisem (komenda niżej), z etykietą zasięgu `[global]`/`[project]`.
2. Dla każdego skilla: wczytaj `SKILL.md` + ważne wpisy z `FRICTION.md`.
3. **Priorytet recydywy.** Zanim zaproponujesz fixy, **grupuj wpisy o podobnym `expected`/`actual`**.
   Wpisy powtarzające się (**≥2** w bieżącym `FRICTION.md`) traktuj priorytetowo — to sygnał,
   że poprzedni fix nie zadziałał albo problem jest systemowy: rozważ **głębszą przebudowę skilla,
   nie kolejną łatę**. Grupowanie to Twój osąd nad treścią wpisów (nie helper).
4. **Zaproponuj diff** zakotwiczony w `expected`/`actual` — wskaż, którego wpisu dotyczy.
5. **Po potwierdzeniu** usera zastosuj edycję `SKILL.md` (mtime → sygnał życia dla curatora).
6. **Wyczyść** skonsumowane wpisy z `FRICTION.md`. Wpis świadomie nienaprawiany →
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
    const txt=fs.readFileSync(f,"utf8");
    const n=txt.split(/^##\s/m).slice(1).filter(b=>/\*\*expected:\*\*/.test(b)&&/\*\*actual:\*\*/.test(b)&&!/\*\*won.t-fix:\*\*/.test(b)).length;
    if(n>0) console.log(`[${scope}] ${e.name}  ${n} wpis(y)`);
  }
}'
```

## Verification

- Lista zawiera skille z `~/.claude/skills/*` i `./.claude/skills/*` mające ≥1 ważny pending wpis (expected ∧ actual ∧ ¬won't-fix), z etykietą zasięgu.
- Skille pluginowe nigdy się nie pojawiają (inne drzewo).
- Każda propozycja wskazuje konkretny wpis dowodowy.
- Po naprawie `FRICTION.md` nie zawiera już skonsumowanego wpisu.
