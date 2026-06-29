import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "memory-retrieval.mjs");

// Derive slug exactly like the hook (spec §5.1) so tests can place the memory dir.
function slugOf(cwd) { return cwd.replace(/[^A-Za-z0-9-]/g, "-"); }

function freshHome() { return mkdtempSync(join(tmpdir(), "ll-mr-home-")); }
function freshDir() { return mkdtempSync(join(tmpdir(), "ll-mr-cwd-")); }

// memoryDir for a given (home, cwd)
function memDir(home, cwd) {
  return join(home, ".claude", "projects", slugOf(cwd), "memory");
}

// Write a MEMORY.md index + optional fact files; returns memoryDir.
function seedMemory(home, cwd, indexText, facts = {}) {
  const dir = memDir(home, cwd);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "MEMORY.md"), indexText);
  for (const [name, content] of Object.entries(facts)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function runHook(input, cwd, home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const out = execFileSync("node", [HOOK], {
      cwd, input: JSON.stringify(input), encoding: "utf8",
      env, stdio: ["pipe", "pipe", "ignore"],
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: e.stdout ?? "" }; }
}

test("T1: brak memory dir -> pusty output, exit 0", () => {
  const home = freshHome();
  const cwd = freshDir(); // no memory seeded
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("T7: MEMORY.md istnieje, brak parsowalnych wpisow -> sam indeks, exit 0", () => {
  const home = freshHome();
  const cwd = freshDir();
  seedMemory(home, cwd, "# Memory index\n\n(no entries yet)\n");
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /## Indeks \(MEMORY\.md\)/);
  assert.match(ctx, /no entries yet/);
  assert.doesNotMatch(ctx, /Przywołane fakty/); // no facts seeded/implemented
});

test("T3: brak sygnalu (fake cwd, brak gita) -> fallback recency wstrzykuje najnowszy fakt", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\not-a-repo"; // not a real/git dir -> git fails -> signals empty
  const index =
    "# Memory\n" +
    "- [Old fact](old.md) — stary temat\n" +
    "- [New fact](new.md) — nowszy temat\n";
  const dir = seedMemory(home, cwd, index, {
    "old.md": "OLD FACT BODY",
    "new.md": "NEW FACT BODY",
  });
  // Make new.md clearly newer than old.md.
  const t0 = Date.now() / 1000;
  utimesSync(join(dir, "old.md"), t0 - 100, t0 - 100);
  utimesSync(join(dir, "new.md"), t0, t0);
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /## Przywołane fakty/);
  assert.match(ctx, /NEW FACT BODY/);
  // newest ranked first
  assert.ok(ctx.indexOf("NEW FACT BODY") < ctx.indexOf("OLD FACT BODY"));
});

function gitRepoOnBranch(branch) {
  const d = freshDir();
  execSync("git init -q", { cwd: d });
  execSync("git config user.email t@example.com", { cwd: d });
  execSync("git config user.name tester", { cwd: d });
  writeFileSync(join(d, "seed.txt"), "x\n");
  execSync("git add seed.txt", { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
  execSync("git checkout -q -b " + branch, { cwd: d });
  return d;
}

test("T2: branch token dopasowuje fakt -> ten fakt wstrzykniety (rank 1)", () => {
  const home = freshHome();
  const cwd = gitRepoOnBranch("feat-auth-login"); // tokens: feat, auth, login
  const index =
    "# Memory\n" +
    "- [Styling rules](css.md) — odstepy formularzy\n" +
    "- [Auth flow](auth.md) — auth login session\n";
  seedMemory(home, cwd, index, {
    "css.md": "CSS FACT BODY",
    "auth.md": "AUTH FACT BODY",
  });
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /AUTH FACT BODY/);
  // signal-matched auth fact ranks before the unmatched css fact (if present at all)
  if (ctx.includes("CSS FACT BODY")) {
    assert.ok(ctx.indexOf("AUTH FACT BODY") < ctx.indexOf("CSS FACT BODY"));
  }
  // signals line reflects branch tokens
  assert.match(ctx, /auth/);
});

test("T5: tresc faktow > MAX_CHARS -> budzet respektowany, brak uciecia w pol", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\budget-test"; // no git -> recency
  const big = "A".repeat(3000);
  const index =
    "# Memory\n" +
    "- [Fact one](f1.md) — temat\n" +
    "- [Fact two](f2.md) — temat\n";
  const dir = seedMemory(home, cwd, index, {
    "f1.md": big,           // 3000 chars
    "f2.md": "B".repeat(3000), // would push total to 6000 > 4000
  });
  const t0 = Date.now() / 1000;
  utimesSync(join(dir, "f1.md"), t0, t0);
  utimesSync(join(dir, "f2.md"), t0 - 100, t0 - 100); // f1 newest
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  // exactly one 3000-char fact body fits under 4000; the second is skipped whole
  const aCount = (ctx.match(/A{3000}/) || []).length;
  const bCount = (ctx.match(/B{3000}/) || []).length;
  assert.equal(aCount, 1);
  assert.equal(bCount, 0);
});

test("T8: wpis indeksu uciekajacy poza memoryDir (path traversal) -> pominiety, nie wstrzykniety", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\traversal-test"; // no git -> recency fallback
  // The escaping fact lives outside the memory dir; a legit fact lives inside.
  const index =
    "# Memory\n" +
    "- [Escape](../../../escape.md) — sekret\n" +
    "- [Legit](legit.md) — prawdziwy fakt\n";
  const dir = seedMemory(home, cwd, index, {
    "legit.md": "LEGIT FACT BODY",
  });
  // Create the escape target OUTSIDE the memory dir, at the path the entry resolves to.
  const escapeTarget = join(dir, "..", "..", "..", "escape.md");
  writeFileSync(escapeTarget, "ESCAPED SECRET");
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  // The traversal sentinel must never be read/injected.
  assert.doesNotMatch(ctx, /ESCAPED SECRET/);
  // The guard must not over-block: the legit sibling fact is still injected.
  assert.match(ctx, /LEGIT FACT BODY/);
});

test("T4: zepsuty MEMORY.md -> brak crasha, exit 0, poprawny JSON", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\malformed";
  seedMemory(home, cwd, "  not markdown ][)(— random {garbage}\n###");
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const parsed = JSON.parse(out); // must be valid JSON
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.doesNotMatch(parsed.hookSpecificOutput.additionalContext, /Przywołane fakty/);
});

// Odroczone /reflect: reflection-gate zapisuje pending-reflect/<sid>.json.
function seedPending(home, sid, markerCwd, extra = {}) {
  const dir = join(home, ".claude", "learning-loop", "pending-reflect");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sid + ".json"),
    JSON.stringify({ session_id: sid, cwd: markerCwd, score: 60, candidates: 2, ...extra }));
}

test("P1: pending dla biezacego cwd, brak pamieci -> notka w kontekscie", () => {
  const home = freshHome();
  const cwd = freshDir();
  seedPending(home, "session-aaaa", cwd);
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Pending \/reflect/);
  assert.match(ctx, /session-/); // skrócone id sesji
  assert.match(ctx, /kandydatur tarcia/);
});

test("P2: pending dla INNEGO cwd -> brak notki (zero przecieku miedzy projektami)", () => {
  const home = freshHome();
  const cwd = freshDir();
  const otherCwd = freshDir();
  seedPending(home, "session-bbbb", otherCwd);
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  assert.equal(out, ""); // znacznik należy do innego projektu, brak pamięci tutaj
});

test("P3: pending + pamiec -> oba bloki w kontekscie", () => {
  const home = freshHome();
  const cwd = freshDir();
  seedMemory(home, cwd, "# Memory index\n\n(no entries yet)\n");
  seedPending(home, "session-cccc", cwd);
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /## Indeks \(MEMORY\.md\)/);
  assert.match(ctx, /Pending \/reflect/);
});

test("P4: dwa pending dla biezacego cwd -> notka liczy obie sesje", () => {
  const home = freshHome();
  const cwd = freshDir();
  seedPending(home, "session-1111", cwd, { candidates: 1 });
  seedPending(home, "session-2222", cwd, { candidates: 3 });
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /2 niezreflektowane sesje/);
  assert.match(ctx, /łącznie 4 kandydatur/);
});
