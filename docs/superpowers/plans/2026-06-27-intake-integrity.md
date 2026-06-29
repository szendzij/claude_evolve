# Intake Integrity (SP-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the learning-loop from silently losing captured friction and from drowning it in noise — `reflection-gate` nudges whenever the session has unprocessed friction candidates (not only on git diffs), `friction-capture` skips definitional noise, and `curator` distinguishes triaged logs from unprocessed lessons.

**Architecture:** Three independent edits to existing files, each black-box / smoke testable: a noise filter in the `friction-capture` Stop... (PostToolUseFailure) hook, a second trigger path in the `reflection-gate` Stop hook, and a reframed GC section in the `curator` skill. Components 1+2 are causally coupled (trigger-on-candidates without the filter = nudge spam), so both ship here.

**Tech Stack:** Node.js (built-in `node:fs`/`node:path`/`node:os`/`node:child_process`), `node:test`, git CLI, bash helper snippets in a SKILL.md.

## Global Constraints

- **OS-independent:** pure Node, exec form, no bash/jq/python in the hooks themselves.
- **Hooks never throw, never block the session with an error, always `exit 0`.**
- **Conservative noise denylist only:** skip `EISDIR` and shell-syntax errors (`bash: … syntax error|unexpected EOF|unexpected token`). Everything else is still captured.
- **Trigger threshold:** `THRESHOLD = 10` (unchanged); candidate trigger fires at `≥ 1` unprocessed candidate for the session.
- **GC windows:** `.processed` (triaged) reported at `> 7 days`; unprocessed `.jsonl` (lessons) at `> 21 days`, framed as loss, never auto-deleted.
- **No regression:** existing suites stay green — `memory-retrieval` 7/7, `friction-capture` 5/5 → 8/8, `reflection-gate` 7/7 → 10/10.
- **Test command:** `node --test learning-loop/hooks/<file>.test.mjs`.

---

### Task 1: Noise filter in friction-capture

**Files:**
- Modify: `learning-loop/hooks/friction-capture.mjs`
- Test: `learning-loop/hooks/friction-capture.test.mjs`

**Interfaces:**
- Produces: `isNoise(error: string) -> boolean` (module-internal). `main` skips writing a candidate when `isNoise(rawError)` is true. No change to the candidate record shape `{ts, tool, error, target}`.

- [ ] **Step 1: Write the failing tests (F1–F3)**

Append to `learning-loop/hooks/friction-capture.test.mjs` (reuses existing `runHook`, `freshHome`, `candDir`):

```js
test("F1: EISDIR error -> nic nie zapisane, exit 0", () => {
  const home = freshHome();
  const code = runHook({ session_id: "f1", tool_name: "Read", error: "EISDIR: illegal operation on a directory, read '/some/dir'", tool_input: { file_path: "/some/dir" } }, home);
  assert.equal(code, 0);
  assert.ok(!existsSync(join(candDir(home), "f1.jsonl")));
});

test("F2: blad skladni powloki -> nic nie zapisane, exit 0", () => {
  const home = freshHome();
  const c1 = runHook({ session_id: "f2a", tool_name: "Bash", error: "/usr/bin/bash: eval: line 1: unexpected EOF while looking for matching \"'\"", tool_input: { command: "ls \"" } }, home);
  const c2 = runHook({ session_id: "f2b", tool_name: "Bash", error: "/usr/bin/bash: eval: line 1: syntax error near unexpected token `('", tool_input: { command: "echo (" } }, home);
  assert.equal(c1, 0);
  assert.equal(c2, 0);
  assert.ok(!existsSync(join(candDir(home), "f2a.jsonl")));
  assert.ok(!existsSync(join(candDir(home), "f2b.jsonl")));
});

test("F3: zwykly blad (porazka testu) -> nadal zapisany", () => {
  const home = freshHome();
  runHook({ session_id: "f3", tool_name: "Bash", error: "FAIL tests/handlers.test.js\n  × zwraca dane", tool_input: { command: "npm test" } }, home);
  assert.ok(existsSync(join(candDir(home), "f3.jsonl")));
});
```

- [ ] **Step 2: Run tests to verify F1/F2 fail**

Run: `node --test learning-loop/hooks/friction-capture.test.mjs`
Expected: FAIL on F1 and F2 (the records are currently written — files exist), F3 passes.

- [ ] **Step 3: Add `isNoise` and the skip**

In `learning-loop/hooks/friction-capture.mjs`, add the helper above `main`:

```js
// Definitional noise — never a skill failure, only tool-misuse or shell-quoting slips.
function isNoise(error) {
  if (/EISDIR/.test(error)) return true;
  if (/bash:.*(syntax error|unexpected EOF|unexpected token)/i.test(error)) return true;
  return false;
}
```

Then in `main`, replace these two lines:

```js
  const error = String(input.error ?? "").slice(0, 300);
```

with:

```js
  const rawError = String(input.error ?? "");
  if (isNoise(rawError)) return; // skip definitional noise — never a skill failure
  const error = rawError.slice(0, 300);
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test learning-loop/hooks/friction-capture.test.mjs`
Expected: PASS — 8 tests (5 existing + F1/F2/F3). Existing "poprawny payload" (error "File not found") and "brak error" (error "") still write, confirming the filter is not over-eager.

- [ ] **Step 5: Commit**

```bash
git add learning-loop/hooks/friction-capture.mjs learning-loop/hooks/friction-capture.test.mjs
git commit -m "feat(friction-capture): skip definitional noise (EISDIR, shell-syntax errors)"
```

---

### Task 2: Candidate-trigger path in reflection-gate

**Files:**
- Modify: `learning-loop/hooks/reflection-gate.mjs`
- Test: `learning-loop/hooks/reflection-gate.test.mjs`

**Interfaces:**
- Consumes: friction-candidate files at `<home>/.claude/learning-loop/friction-candidates/<session_id>.jsonl` (written by `friction-capture`).
- Produces: the hook now emits `{decision:"block", reason}` when `score >= THRESHOLD` **OR** `candidateCount > 0`; silent `exit 0` otherwise. `reason` contains the candidate path + count when candidates triggered it.

- [ ] **Step 1: Write the failing tests (R1–R3)**

Append to `learning-loop/hooks/reflection-gate.test.mjs` (reuses existing `runHook`, `freshDir`, `gitRepo`, `commitFile`; `mkdirSync`/`writeFileSync` already imported):

```js
function seedCandidates(home, sid, lines) {
  const fdir = join(home, ".claude", "learning-loop", "friction-candidates");
  mkdirSync(fdir, { recursive: true });
  writeFileSync(join(fdir, sid + ".jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

test("R1: czyste drzewo + kandydatury -> block (plug na N2)", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n"); // tree clean after commit
  const home = freshDir();
  seedCandidates(home, "r1", [{ tool: "Bash", error: "boom" }, { tool: "Edit", error: "nope" }]);
  const { code, out } = runHook({ session_id: "r1" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  const reason = JSON.parse(out).reason;
  assert.match(reason, /2 kandydatur/);
  assert.match(reason, /r1\.jsonl/);
});

test("R2: poza repo git + kandydatury -> block", () => {
  const home = freshDir();
  seedCandidates(home, "r2", [{ tool: "Bash", error: "boom" }]);
  const { code, out } = runHook({ session_id: "r2" }, freshDir(), { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).decision, "block");
});

test("R3: czyste drzewo + session_id bez pliku kandydatur -> milczy", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  const home = freshDir(); // no candidates seeded
  const { code, out } = runHook({ session_id: "r3" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(out, "");
});
```

- [ ] **Step 2: Run tests to verify R1/R2 fail**

Run: `node --test learning-loop/hooks/reflection-gate.test.mjs`
Expected: FAIL on R1 and R2 — current hook does early `exit 0` on clean tree (R1) and on non-repo (R2), emitting nothing. R3 passes (silence is already correct).

- [ ] **Step 3: Restructure `reflection-gate.mjs`**

Replace the entire body of `learning-loop/hooks/reflection-gate.mjs` from the `if (input.stop_hook_active)` line to the end with this (keeps the file header comment and imports; `THRESHOLD = 10` stays):

```js
if (input.stop_hook_active) process.exit(0);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
}

// --- Signal A: unprocessed friction candidates for this session (independent of git) ---
let candidateCount = 0;
let candidatePath = "";
const sid = input.session_id;
if (sid) {
  candidatePath = join(homedir(), ".claude", "learning-loop", "friction-candidates", sid + ".jsonl");
  if (existsSync(candidatePath)) {
    try { candidateCount = readFileSync(candidatePath, "utf8").split("\n").filter(Boolean).length; }
    catch { candidateCount = 0; }
  }
}

// --- Signal B: git diff size (0 when outside a repo or the tree is clean) ---
let score = 0;
let stat = "";
const inside = git(["rev-parse", "--is-inside-work-tree"]);
if (inside && inside.trim() === "true" && (git(["status", "--porcelain"]) || "").trim()) {
  const changedLines = (args) => {
    const s = git(args) || "";
    const ins = Number((s.match(/(\d+) insertion/) || [, 0])[1]);
    const del = Number((s.match(/(\d+) deletion/) || [, 0])[1]);
    return ins + del;
  };
  const tracked = changedLines(["diff", "--shortstat"]) + changedLines(["diff", "--cached", "--shortstat"]);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "")
    .split("\n").filter(Boolean).length;
  score = tracked + untracked * 3;
  stat = (git(["diff", "--stat"]) || "").split("\n").slice(-20).join("\n");
}

// --- Decide: nudge if either signal fires ---
if (score < THRESHOLD && candidateCount === 0) process.exit(0);

let reason = "Uruchom /reflect: wyekstrahuj trwałe wnioski i powtarzalne procedury wg Memory "
  + "Routing (Konstytucja Pamięci w skillu reflect), zaktualizuj handoff.";
if (score >= THRESHOLD) {
  reason += "\nSesja z niezapisanymi zmianami (score " + score + ").\nRozbieg (git diff --stat):\n" + stat;
}
if (candidateCount > 0) {
  reason += "\nTa sesja zarejestrowała " + candidateCount + " kandydatur tarcia: " + candidatePath
    + "\nPrzejrzyj je w /reflect i przypisz do właściwego FRICTION.md.";
}

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
```

Note: this removes the two early `exit 0` guards (non-repo, clean-tree) because candidate signal must work outside git and on a clean tree. The git block now runs only when inside a repo with a dirty tree, so `git` errors outside a repo are still swallowed and `score` stays 0.

- [ ] **Step 4: Run the full reflection-gate suite**

Run: `node --test learning-loop/hooks/reflection-gate.test.mjs`
Expected: PASS — 10 tests. The 7 existing pass: "stop_hook_active" exits first; "poza repo git" (`{}`, no sid) → score 0, candidateCount 0 → silent; "repo czyste" → silent; "ponizej progu" → silent; "powyzej progu" → block; "untracked powyzej progu" → block; "kandydatury tarcia" (dirty + 2 candidates) → block with `/2 kandydatur/` + `/sX\.jsonl/`.

- [ ] **Step 5: Commit**

```bash
git add learning-loop/hooks/reflection-gate.mjs learning-loop/hooks/reflection-gate.test.mjs
git commit -m "feat(reflection-gate): nudge on unprocessed friction candidates regardless of git state"
```

---

### Task 3: Reframe candidate GC in the curator skill

**Files:**
- Modify: `learning-loop/skills/curator/SKILL.md` (section "## Higiena kandydatur tarcia")

**Interfaces:** none (skill doc + bash helper snippets). Verified by smoke test, not `node --test`.

- [ ] **Step 1: Replace the "Higiena kandydatur tarcia" section**

In `learning-loop/skills/curator/SKILL.md`, replace the entire existing `## Higiena kandydatur tarcia` section (the intro paragraph plus its two `node -e` snippets — "Raport (pliki > 7 dni)" and "Usunięcie (po potwierdzeniu)") with:

````markdown
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
````

- [ ] **Step 2: Smoke-test the two report helpers**

Run this from the repo root (seeds a temp home with one stale `.processed` and one stale unprocessed `.jsonl`, then runs both report helpers against it):

```bash
TMPH=$(mktemp -d); FD="$TMPH/.claude/learning-loop/friction-candidates"; mkdir -p "$FD"
node -e '
const fs=require("fs"),path=require("path");
const d=process.argv[1];
fs.writeFileSync(path.join(d,"old.jsonl"),"{}\n");
fs.writeFileSync(path.join(d,"old.processed"),"{}\n");
const t=Date.now()/1000;
fs.utimesSync(path.join(d,"old.jsonl"), t-30*86400, t-30*86400);   // 30d old, unprocessed
fs.utimesSync(path.join(d,"old.processed"), t-10*86400, t-10*86400); // 10d old, processed
' "$FD"
echo "--- processed report (expect old.processed) ---"
HOME="$TMPH" USERPROFILE="$TMPH" node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".claude","learning-loop","friction-candidates");
const cutoff=Date.now()-7*864e5;let n=0;
for(const f of fs.readdirSync(dir)){ if(!f.endsWith(".processed")) continue;
  const m=fs.statSync(path.join(dir,f)).mtimeMs;
  if(m<cutoff){console.log("PROCESSED >7d:",f);n++;}}
if(!n)console.log("(brak .processed > 7 dni)");
'
echo "--- unprocessed report (expect old.jsonl + loss warning) ---"
HOME="$TMPH" USERPROFILE="$TMPH" node -e '
const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".claude","learning-loop","friction-candidates");
const cutoff=Date.now()-21*864e5;let n=0;
for(const f of fs.readdirSync(dir)){ if(!f.endsWith(".jsonl")) continue;
  const m=fs.statSync(path.join(dir,f)).mtimeMs;
  if(m<cutoff){console.log("NIEPRZETWORZONA LEKCJA >21d:",f);n++;}}
if(n)console.log("=> "+n+" nieprzetworzonych lekcji; uruchom /reflect.");
'
rm -rf "$TMPH"
```

Expected output:
```
--- processed report (expect old.processed) ---
PROCESSED >7d: old.processed
--- unprocessed report (expect old.jsonl + loss warning) ---
NIEPRZETWORZONA LEKCJA >21d: old.jsonl
=> 1 nieprzetworzonych lekcji; uruchom /reflect.
```
Verify: `old.processed` appears ONLY in the processed report; `old.jsonl` appears ONLY in the unprocessed report with the loss line. (Confirms class separation and the 7d/21d windows.)

- [ ] **Step 3: Commit**

```bash
git add learning-loop/skills/curator/SKILL.md
git commit -m "docs(curator): separate triaged .processed logs from unprocessed lessons in GC"
```

---

### Task 4: Documentation update (README)

**Files:**
- Modify: `learning-loop/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the reflection-gate description**

In `learning-loop/README.md`, in the `### Stop hook (`reflection-gate`) — cichy strażnik` subsection, replace the "**Co robi:**" line with:

```markdown
**Co robi:** kiedy kończysz sesję z **niezacommitowanymi zmianami** w repo git, LUB gdy ta
sesja zarejestrowała **nieprzetworzone kandydatury tarcia**, przypomina o `/reflect` i dokleja
`git diff --stat` oraz ścieżkę pliku kandydatur jako rozbieg.
```

And replace the "**Kiedy milczy:**" line with:

```markdown
**Kiedy milczy:** poza repo git i bez kandydatur / przy czystym drzewie bez kandydatur / gdy
już raz przypomniał w tym cyklu (flaga `stop_hook_active`).
```

- [ ] **Step 2: Add the noise filter to the friction-capture description**

In `README.md`, in the `friction-capture` / auto-capture description (the bullet/section describing what it logs), add a sentence:

```markdown
Pomija przy tym **szum definicyjny** (EISDIR z czytania katalogu, błędy składni powłoki) —
nie zapisuje go jako kandydatury, by `/reflect` nie tonął w przejściowych awariach narzędzi.
```

- [ ] **Step 3: Update the curator / memory-map description**

In `README.md`, in the `/curator` section, add a sentence about candidate hygiene:

```markdown
Rozdziela też kandydatury tarcia: `*.processed` (striageowane logi, > 7 dni) od nieprzetworzonych
`*.jsonl` (lekcje, > 21 dni) — te drugie raportuje jako **utratę** i nigdy nie kasuje domyślnie.
```

- [ ] **Step 4: Commit**

```bash
git add learning-loop/README.md
git commit -m "docs(intake-integrity): document candidate trigger, noise filter, GC classes"
```

---

## Self-Review

**1. Spec coverage:**
- §4.1 trigger restructure → Task 2 (full body replacement). ✓
- §4.2 noise filter → Task 1 (`isNoise` + skip). ✓
- §4.3 GC reframe (processed/unprocessed split, 7d/21d, loss framing) → Task 3. ✓
- §5 constants (THRESHOLD 10, candidate ≥1, 7d/21d) → Task 2 (THRESHOLD/≥1) + Task 3 (7d/21d). ✓
- §6 tests: R1–R3 → Task 2 (R4 = existing "zmiana powyzej progu -> block", noted); F1–F3 → Task 1; GC smoke-test → Task 3 Step 2. ✓
- §7 acceptance 1–7 → Tasks 1–4. ✓
- §8 docs → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO; every code/test step has complete code; commands have expected output. ✓

**3. Type/name consistency:** `isNoise(error)` (Task 1) — single definition. `candidateCount`, `candidatePath`, `score`, `stat`, `git()`, `changedLines` (Task 2) — consistent within the replaced body; `reason` assembled once. Test helper `seedCandidates` (Task 2) writes `<sid>.jsonl` matching the hook's read path. The `reason` substrings `"N kandydatur tarcia"` + `<sid>.jsonl` match R1's assertions (`/2 kandydatur/`, `/r1\.jsonl/`) and the existing "kandydatury tarcia" test (`/2 kandydatur/`, `/sX\.jsonl/`). ✓

**Note on R4:** the spec's R4 (dirty ≥ threshold + 0 candidates → block) is already covered verbatim by the existing reflection-gate test "zmiana powyzej progu -> block"; not duplicated.

**Note on existing "kandydatury tarcia" test:** it seeds a dirty tree AND 2 candidates, so after the restructure it triggers on both signals and `reason` still contains `/2 kandydatur/` and the path — assertion preserved.
