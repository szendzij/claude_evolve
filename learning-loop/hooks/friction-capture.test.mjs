import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "friction-capture.mjs");

function runHook(input, home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    execFileSync("node", [HOOK], {
      input: typeof input === "string" ? input : JSON.stringify(input),
      env, stdio: ["pipe", "pipe", "ignore"],
    });
    return 0;
  } catch (e) { return e.status ?? 1; }
}
function freshHome() { return mkdtempSync(join(tmpdir(), "ll-fc-")); }
function candDir(home) { return join(home, ".claude", "learning-loop", "friction-candidates"); }

test("poprawny payload -> jedna linia JSONL", () => {
  const home = freshHome();
  const code = runHook({ session_id: "s1", tool_name: "Edit", error: "File not found", tool_input: { file_path: "/x/y.txt" } }, home);
  assert.equal(code, 0);
  const f = join(candDir(home), "s1.jsonl");
  assert.ok(existsSync(f));
  const lines = readFileSync(f, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.tool, "Edit");
  assert.equal(rec.error, "File not found");
  assert.equal(rec.target, "/x/y.txt");
  assert.ok(rec.ts);
});

test("dwie awarie tej samej sesji -> dwie linie", () => {
  const home = freshHome();
  runHook({ session_id: "s2", tool_name: "Bash", error: "boom", tool_input: { command: "false" } }, home);
  runHook({ session_id: "s2", tool_name: "Write", error: "denied", tool_input: { file_path: "/a" } }, home);
  const lines = readFileSync(join(candDir(home), "s2.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
});

test("zly stdin -> exit 0, brak pliku", () => {
  const home = freshHome();
  const code = runHook("not json{{{", home);
  assert.equal(code, 0);
  assert.ok(!existsSync(candDir(home)) || readdirSync(candDir(home)).length === 0);
});

test("brak session_id -> exit 0, nic nie zapisane", () => {
  const home = freshHome();
  const code = runHook({ tool_name: "Edit", error: "x" }, home);
  assert.equal(code, 0);
  assert.ok(!existsSync(candDir(home)) || readdirSync(candDir(home)).length === 0);
});

test("brak error -> rekord z pustym error, target zachowany", () => {
  const home = freshHome();
  runHook({ session_id: "s3", tool_name: "Edit", tool_input: { file_path: "/p" } }, home);
  const rec = JSON.parse(readFileSync(join(candDir(home), "s3.jsonl"), "utf8").trim());
  assert.equal(rec.error, "");
  assert.equal(rec.target, "/p");
});
