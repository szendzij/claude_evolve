import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
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

test("stop_hook_active -> milczy", () => {
  const { code, out } = runHook({ stop_hook_active: true }, freshDir());
  assert.equal(code, 0); assert.equal(out, "");
});

test("poza repo git -> milczy", () => {
  const { code, out } = runHook({}, freshDir());
  assert.equal(code, 0); assert.equal(out, "");
});

test("repo czyste -> milczy", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  const { code, out } = runHook({}, d);
  assert.equal(code, 0); assert.equal(out, "");
});

test("zmiana ponizej progu -> milczy", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  writeFileSync(join(d, "a.txt"), "y\n"); // 1 ins + 1 del = 2 < 10
  const { code, out } = runHook({}, d);
  assert.equal(code, 0); assert.equal(out, "");
});

test("zmiana powyzej progu -> block", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  writeFileSync(join(d, "a.txt"), Array.from({ length: 15 }, (_, i) => "line" + i).join("\n") + "\n");
  const { code, out } = runHook({}, d);
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).decision, "block");
});

test("pliki niesledzone powyzej progu -> block (odwrocony dawny przypadek B4)", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  for (const n of ["u1.txt", "u2.txt", "u3.txt", "u4.txt"]) writeFileSync(join(d, n), "new\n"); // 4*3=12
  const { code, out } = runHook({}, d);
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).decision, "block");
});

test("kandydatury tarcia -> reason zawiera sciezke i licznik", () => {
  const d = gitRepo();
  commitFile(d, "a.txt", "x\n");
  writeFileSync(join(d, "a.txt"), Array.from({ length: 15 }, (_, i) => "l" + i).join("\n") + "\n");
  const home = freshDir();
  const fdir = join(home, ".claude", "learning-loop", "friction-candidates");
  mkdirSync(fdir, { recursive: true });
  writeFileSync(join(fdir, "sX.jsonl"), '{"tool":"Edit","error":"x"}\n{"tool":"Bash","error":"y"}\n');
  const { code, out } = runHook({ session_id: "sX" }, d, { HOME: home, USERPROFILE: home });
  assert.equal(code, 0);
  const reason = JSON.parse(out).reason;
  assert.match(reason, /2 kandydatur/);
  assert.match(reason, /sX\.jsonl/);
});

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
