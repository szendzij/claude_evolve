## 2026-06-29
- **expected:** krok 4 (handoff) zakłada, że `.remember/remember.md` istnieje — Read, potem update
- **actual:** na first-use w projekcie plik nie istnieje → Read zgłasza błąd; trzeba Write nowego pliku zamiast update
- **fix-hint:** w kroku 4 dodać rozgałęzienie: „jeśli plik istnieje — wczytaj i zaktualizuj; jeśli nie — stwórz nowy"
