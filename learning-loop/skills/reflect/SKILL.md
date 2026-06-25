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
5. **Tarcie ze skilli (capture).** Dla skilli, których FAKTYCZNIE użyłeś w tej sesji
   i które pokazały tarcie: dopisz wpis do `<skill-dir>/FRICTION.md`. Tylko realne
   tarcie z tej sesji. Naprawia `/skill-review`. Format:
   ```markdown
   ## <YYYY-MM-DD>
   - **expected:** <co skill kazał zrobić>
   - **actual:** <co faktycznie wyszło / dlaczego zawiodło>
   - **fix-hint:** <opcjonalnie>
   ```

## Fakty (pamięć) — zawsze per-projekt

Wszystkie fakty zapisuj do pamięci **per-projekt**, niezależnie od `type`.
- Cel: katalog pamięci podany przez harness w kontekście tej sesji (per-projekt,
  np. `~/.claude/projects/<hash>/memory/`). Utwórz, jeśli trzeba. Fakt = jeden plik
  `<slug>.md` z frontmatter (`name`, `description`, `metadata.type`) + linia w `MEMORY.md`.
- Jeśli harness NIE podaje ścieżki pamięci → fallback: `./memory/` w katalogu projektu
  + **jawne ostrzeżenie**, że harness tego nie wczyta automatycznie.
- NIE wynoś faktów user-level do globalnego `~/.claude/`. Uniwersalne preferencje to
  domena ręcznie kuratorowanego `~/.claude/CLAUDE.md` / `rules/` — pętla ich nie dotyka.
  (User pracuje inaczej w różnych projektach; globalny fakt by skaził kontekst.)

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

**Awans przez powtórkę (v1):** jeśli tworzony skill to ta sama procedura, którą znasz
już z innego projektu → twórz od razu globalnie (powtórzenie = dowód przenośności).

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

## Verification

- Każdy nowy plik pamięci ma odpowiadającą linię w `MEMORY.md`.
- Fakty trafiły do pamięci per-projekt (lub fallback z ostrzeżeniem), NIE do globalnego `rules/`.
- Każdy nowy skill ma `origin: reflect-loop`, `description` ≤ 60, `origin-project`.
- Skill projektowy nie koliduje nazwą z globalnym (albo dostał wyróżnik).
- Wpisy `FRICTION.md` mają `expected` i `actual`.
