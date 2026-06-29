## 2026-06-29
- **expected:** krok 4 (handoff) zakłada, że `.remember/remember.md` istnieje — Read, potem update
- **actual:** na first-use w projekcie plik nie istnieje → Read zgłasza błąd; trzeba Write nowego pliku zamiast update
- **fix-hint:** w kroku 4 dodać rozgałęzienie: „jeśli plik istnieje — wczytaj i zaktualizuj; jeśli nie — stwórz nowy"

## 2026-06-29
- **expected:** komenda „Walidacja (deterministyczna)" — `node -e '...'` z heurystyką śladów — zwraca „FRONTMATTER OK".
- **actual:** na Windows uruchomiona jako `node -e "..."` (podwójny cudzysłów) wysypała się: `SyntaxError: Invalid regular expression: missing /`. Regex `/[A-Za-z]:\\|\/(home|Users)\//` zawiera `\\`, które powłoka w double-quoted stringu zjada → wyrażenie się rozpada. Single-quoted multi-line `node -e '...'` jest też kruchy w PowerShell, więc agent przepisał na double quotes i trafił na ten błąd.
- **fix-hint:** nie wklejać walidatora inline w `node -e`; zapisać go do pliku `.mjs` (np. w scratchpadzie) i uruchomić `node validate.mjs <ścieżka>` — regex nie przechodzi wtedy przez quoting powłoki. Alternatywnie usunąć `\\` z heurystyki (sam `/(home|Users)/` + sprawdzenie dwukropka dysku bez backslasha).
