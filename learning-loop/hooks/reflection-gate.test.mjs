import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "reflection-gate.mjs");

function runHook(input, cwd, extraEnv = {}) {
  try {
    const out = execFileSync("node", [HOOK], {
      cwd, input: JSON.stringify(input), encoding: "utf8",
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "ignore"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: e.stdout ?? "" };
  }
}
function freshDir() { return mkdtempSync(join(tmpdir(), "ll-hook-")); }
function gitRepo() {
  const d = freshDir();
  execSync("git init -q", { cwd: d });
  execSync("git config user.email t@example.com", { cwd: d });
  execSync("git config user.name tester", { cwd: d });
  return d;
}
function commitFile(d, name, content) {
  writeFileSync(join(d, name), content);
  execSync("git add " + name, { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
}

// Tryb odroczony: hook NIE pisze na stdout — zapisuje znacznik pending-reflect/<sid>.json.
function markerPath(home, sid) {
  return join(home, ".claude", "learning-loop", "pending-reflect", sid + ".json");
}
function readMarker(home, sid) {
  return JSON.parse(readFileSync(markerPath(home, sid), "utf8"));
}
function seedCandidates(home, sid, lines) {
  const fdir = join(home, ".claude", "learning-loop", "friction-candidates");
  mkdirSync(fdir, { recursive: true });
  writeFileSync(join(fdir, sid + ".jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

test("stop_hook_active -> milczy, brak znacznika", () => {
  const home = freshDir();
  const { code, out } = runHook({ stop_hook_active: true, session_id: "x" }, freshDir(),
    { HOME: home, USERPROFILE: home });
  assert.equal(code, 0); assert.equal(out, "");
  assert.equal(existsSync(markerPath(home, "x")), false);
});

test("poza repo git, brak kandydatur -> milczy, brak znacznika", () => {
  const home = freshDir();
  const { code, out } = runHook({ session_id: "x" }, freshDir(), { HOME: home, USERPROFILE: home });
  assert.equal(code, 0); assert.equal(out, "");
  assert.equal(existsSync(markerPath(home, "x")), false);
});

test("repo czyste -> milczy, brak znacznika", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  const { code, out } = runHook({ session_id: "x" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0); assert.equal(out, "");
  assert.equal(existsSync(markerPath(home, "x")), false);
});

test("zmiana ponizej progu -> milczy, brak znacznika", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  writeFileSync(join(d, "a.txt"), "y\n"); // 1 ins + 1 del = 2 < 50
  const { code, out } = runHook({ session_id: "x" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0); assert.equal(out, "");
  assert.equal(existsSync(markerPath(home, "x")), false);
});

test("zmiana powyzej progu -> zapisuje znacznik (nie blokuje)", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  // 55 insertions + 1 deletion = 56 > threshold 50
  writeFileSync(join(d, "a.txt"), Array.from({ length: 55 }, (_, i) => "line" + i).join("\n") + "\n");
  const { code, out } = runHook({ session_id: "big" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(out, ""); // odroczone — nic na stdout, brak block
  const m = readMarker(home, "big");
  assert.ok(m.score >= 50);
  assert.equal(m.candidates, 0);
  assert.ok(typeof m.cwd === "string" && m.cwd.length > 0);
});

test("pliki niesledzone powyzej progu -> zapisuje znacznik", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  // 18 untracked files × 3 = 54 > threshold 50
  for (let i = 0; i < 18; i++) writeFileSync(join(d, `u${i}.txt`), "new\n");
  const { code, out } = runHook({ session_id: "untracked" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(out, "");
  const m = readMarker(home, "untracked");
  assert.ok(m.score >= 50);
});

test("kandydatury tarcia -> znacznik zawiera licznik i sciezke", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n"); // czyste drzewo, score < próg
  seedCandidates(home, "sX", [{ tool: "Edit", error: "x" }, { tool: "Bash", error: "y" }]);
  const { code, out } = runHook({ session_id: "sX" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(out, "");
  const m = readMarker(home, "sX");
  assert.equal(m.candidates, 2);
  assert.match(m.candidatePath, /sX\.jsonl/);
});

test("R1: czyste drzewo + kandydatury -> znacznik (plug na N2)", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n"); // tree clean after commit
  seedCandidates(home, "r1", [{ tool: "Bash", error: "boom" }, { tool: "Edit", error: "nope" }]);
  const { code } = runHook({ session_id: "r1" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  const m = readMarker(home, "r1");
  assert.equal(m.candidates, 2);
  assert.match(m.candidatePath, /r1\.jsonl/);
});

test("R2: poza repo git + kandydatury -> znacznik", () => {
  const home = freshDir();
  seedCandidates(home, "r2", [{ tool: "Bash", error: "boom" }]);
  const { code } = runHook({ session_id: "r2" }, freshDir(), { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  const m = readMarker(home, "r2");
  assert.equal(m.candidates, 1);
});

test("R3: czyste drzewo + session_id bez pliku kandydatur -> milczy, brak znacznika", () => {
  const home = freshDir();
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  const { code, out } = runHook({ session_id: "r3" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  assert.equal(out, "");
  assert.equal(existsSync(markerPath(home, "r3")), false);
});
