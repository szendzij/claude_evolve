---
name: curator
description: Archiwizuje nieużywane auto-skille po potwierdzeniu.
metadata:
  origin: reflect-loop
  created: 2026-06-25
---

# Curator Skill

Higiena cyklu życia skilli tworzonych przez `/reflect`. Liczy staleness po `mtime`
(zero infrastruktury, bez licznika użycia). NIE kasuje — maksymalnie archiwizuje, odwracalnie.
Operuje na skillach GLOBALNYCH (`~/.claude/skills/`); skille projektowe (`.claude/skills/`) — v2.

## When to Use

- Ręcznie (`/curator`), okresowo (np. raz w miesiącu).
- Gdy `~/.claude/skills/` rozrasta się o auto-skille i chcesz zrobić porządek.

## Inwarianty (twarde)

- Tykasz WYŁĄCZNIE skille z `metadata.origin: reflect-loop`. Ręcznych i pluginowych NIE rusza.
- NIGDY nie kasujesz — maks. przenosisz do `~/.claude/skills/.archive/` (odwracalne).
- `pinned: true` w metadata → skill wyłączony z każdej tranzycji.
- Bez LLM-review treści skilla. Decyzja na podstawie twardej metryki, potwierdzana przez usera.

## Procedure

1. **Skanuj** `~/.claude/skills/*/SKILL.md`. Dla każdego odczytaj frontmatter:
   `origin`, `pinned`, oraz `mtime` pliku.
2. **Filtruj kandydatów:** `origin == reflect-loop` AND `pinned != true`
   AND `mtime` starszy niż 30 dni.
3. **Przedstaw listę** kandydatów userowi (nazwa, data ostatniej modyfikacji). NIE archiwizuj automatycznie.
4. **Po potwierdzeniu** przenieś wybrane do `~/.claude/skills/.archive/<name>/`
   (`mkdir -p` najpierw). Przywrócenie = przeniesienie z powrotem.

## Komenda pomocnicza (lista kandydatów)

```bash
node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const root=path.join(os.homedir(),".claude","skills");
const cutoff=Date.now()-30*864e5;
for(const d of fs.readdirSync(root)){
  const f=path.join(root,d,"SKILL.md");
  if(!fs.existsSync(f)) continue;
  const t=fs.readFileSync(f,"utf8");
  const fm=(t.match(/^---\n([\s\S]*?)\n---/)||[,""])[1];
  if(!/origin:\s*reflect-loop/.test(fm)) continue;
  if(/pinned:\s*true/.test(fm)) continue;
  const m=fs.statSync(f).mtimeMs;
  if(m<cutoff) console.log(d, new Date(m).toISOString().slice(0,10));
}'
```

## Verification

- Lista kandydatów zawiera wyłącznie skille `origin: reflect-loop`, niepinowane, > 30 dni.
- Archiwizacja nie usuwa danych — pliki są w `.archive/` i dają się przywrócić.
