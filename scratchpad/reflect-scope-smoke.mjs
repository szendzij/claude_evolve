import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The two commands EXACTLY as they will appear in reflect/SKILL.md.
const READ_CMD = `
const fs=require("fs"),path=require("path"),os=require("os");
const sid=process.env.CLAUDE_CODE_SESSION_ID;
if(!sid){console.log("(brak CLAUDE_CODE_SESSION_ID — pomijam auto-skan; wskaż plik ręcznie)");process.exit(0);}
const f=path.join(os.homedir(),".claude","learning-loop","friction-candidates",sid+".jsonl");
if(!fs.existsSync(f)){console.log("(brak kandydatur tarcia dla tej sesji)");process.exit(0);}
console.log("PLIK:",f);
for(const ln of fs.readFileSync(f,"utf8").split("\\n").filter(Boolean)) console.log(ln);
`;
const MARK_CMD = `
const fs=require("fs");const p=process.argv[1];
fs.renameSync(p,p+".processed");console.log("oznaczono:",p+".processed");
`;

const SID = "sess-current-1111";
const FOREIGN = "sess-foreign-2222";
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); } }

function freshHome() {
  const home = join(tmpdir(), "reflect-scope-" + Math.floor(process.hrtime()[1]) + "-" + pass + fail);
  const dir = join(home, ".claude", "learning-loop", "friction-candidates");
  mkdirSync(dir, { recursive: true });
  return { home, dir };
}
function seed(dir) {
  writeFileSync(join(dir, SID + ".jsonl"), JSON.stringify({ ts: "t", tool: "Bash", error: "MINE", target: "x" }) + "\n");
  // foreign written second → newer mtime, would win a "newest globally" sort
  writeFileSync(join(dir, FOREIGN + ".jsonl"), JSON.stringify({ ts: "t", tool: "Bash", error: "FOREIGN", target: "y" }) + "\n");
}
function runRead(home, sidEnv) {
  return execFileSync("node", ["-e", READ_CMD], {
    encoding: "utf8",
    env: { ...process.env, USERPROFILE: home, HOME: home, CLAUDE_CODE_SESSION_ID: sidEnv ?? "" },
  });
}

// T1: read scope — current session only, foreign ignored despite newer mtime
{
  const { home, dir } = freshHome(); seed(dir);
  const out = runRead(home, SID);
  check("T1 reads current session file", out.includes(SID + ".jsonl") && out.includes("MINE"));
  check("T1 ignores newer foreign file", !out.includes("FOREIGN") && !out.includes(FOREIGN + ".jsonl"));
}

// T2: consumption scope — mark-processed touches only current session file
{
  const { home, dir } = freshHome(); seed(dir);
  const out = runRead(home, SID);
  const plik = (out.match(/^PLIK:\s*(.+)$/m) || [])[1].trim();
  execFileSync("node", ["-e", MARK_CMD, plik], { encoding: "utf8" });
  const files = readdirSync(dir);
  check("T2 current renamed to .processed", files.includes(SID + ".jsonl.processed") && !files.includes(SID + ".jsonl"));
  check("T2 foreign untouched", files.includes(FOREIGN + ".jsonl") && !files.includes(FOREIGN + ".jsonl.processed"));
}

// T3: no current-session file → friendly message, no crash
{
  const { home, dir } = freshHome();
  writeFileSync(join(dir, FOREIGN + ".jsonl"), "{}\n"); // only a foreign file exists
  const out = runRead(home, SID);
  check("T3 reports no candidates for this session", out.includes("(brak kandydatur tarcia dla tej sesji)"));
  check("T3 does not read foreign", !out.includes("PLIK:"));
}

// T4: empty env → fallback message, no read
{
  const { home, dir } = freshHome(); seed(dir);
  const out = runRead(home, "");
  check("T4 fallback message", out.includes("brak CLAUDE_CODE_SESSION_ID"));
  check("T4 no PLIK emitted", !out.includes("PLIK:"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
