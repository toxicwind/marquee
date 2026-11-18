/**
 * marquee audit — P0-P4 star-grade checklist.
 * Ported from azurite skill `marquee/scripts/marquee-audit.ts` + references/audit-checklist.md.
 * Extended: GitHub-side items (description/topics/social preview) are checked live via `gh`
 * when available, instead of flagged MANUAL.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CheckResult {
  id: string;
  pri: "P0" | "P1" | "P2" | "P3" | "P4";
  label: string;
  pass: boolean;
  hint: string;
  /** true when pass was decided by a live gh call (not filesystem) */
  remote?: boolean;
}

export interface AuditResult {
  repo: string;
  checks: CheckResult[];
  passCount: number;
  failCount: number;
  score: string;
}

function exists(dir: string, p: string): boolean {
  return existsSync(join(dir, p));
}

function read(dir: string, p: string): string {
  try {
    return readFileSync(join(dir, p), "utf8");
  } catch {
    return "";
  }
}

function ghJson(args: string[]): Record<string, unknown> | null {
  try {
    const proc = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) return null;
    return JSON.parse(proc.stdout.toString());
  } catch {
    return null;
  }
}

/** Resolve owner/repo from git remote origin (ssh or https forms). */
export function repoSlug(dir: string): string | null {
  try {
    const proc = Bun.spawnSync(["git", "-C", dir, "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    const raw = proc.stdout.toString().trim();
    const m = raw.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Audit a repo dir against the full checklist. P1 remote items queried via gh when token+remote exist. */
export function auditRepo(dir: string): AuditResult {
  const checks: CheckResult[] = [];
  const push = (c: CheckResult) => checks.push(c);

  const readme = read(dir, "README.md");
  const slug = repoSlug(dir);

  // P0 — the 10-second verdict
  push({
    id: "p0-readme",
    pri: "P0",
    label: "README.md exists at root",
    pass: exists(dir, "README.md"),
    hint: "Create README.md — even 20 lines beats nothing.",
  });
  push({
    id: "p0-badges",
    pri: "P0",
    label: "Shields/badges row at top",
    pass: /shields\.io|badge/.test(readme.slice(0, 1500)),
    hint: "Add shields.io badges (build, version, license) to the top of README.",
  });
  push({
    id: "p0-oneliner",
    pri: "P0",
    label: "One-line description present",
    pass: readme.length > 200,
    hint: "Write the one-liner: [Project] is [what] for [who] that [benefit].",
  });
  push({
    id: "p0-demo",
    pri: "P0",
    label: "Demo (GIF/screenshot/asciinema) above the fold",
    pass: /(\.(gif|png|jpg|jpeg|svg)\)|asciinema|<img|<video|\!\[.*\]\(/i.test(readme.slice(0, 3000)),
    hint: "Add a demo GIF, screenshot, or asciinema cast in the first screen of README.",
  });
  push({
    id: "p0-quickstart",
    pri: "P0",
    label: "Quickstart section (copy-paste to success)",
    pass: /quickstart|getting started|install/i.test(readme),
    hint: "Add copy-paste install + first-run commands.",
  });
  const licenseText = read(dir, "LICENSE") + read(dir, "LICENSE.txt") + read(dir, "LICENSE.md");
  push({
    id: "p0-license",
    pri: "P0",
    label: "LICENSE file with holder/year filled",
    pass:
      (exists(dir, "LICENSE") || exists(dir, "LICENSE.txt") || exists(dir, "LICENSE.md")) &&
      !/\[year\]|\[name\]|\[fullname\]/i.test(licenseText),
    hint: "Add LICENSE (MIT default) with year + holder filled in.",
  });

  // P1 — trust signals
  const hasCI =
    exists(dir, ".github/workflows") ||
    exists(dir, ".gitlab-ci.yml") ||
    exists(dir, "circle.yml") ||
    exists(dir, "Jenkinsfile");
  push({
    id: "p1-ci",
    pri: "P1",
    label: "CI configured",
    pass: hasCI,
    hint: "Add GitHub Actions workflow (build + test).",
  });
  push({
    id: "p1-changelog",
    pri: "P1",
    label: "CHANGELOG.md with recent entries",
    pass: exists(dir, "CHANGELOG.md") || exists(dir, "CHANGELOG"),
    hint: "Add CHANGELOG.md; log every release.",
  });

  const remoteRepo = slug ? ghJson(["repo", "view", slug, "--json", "description,repositoryTopics,defaultBranchRef,hasIssuesEnabled"]) : null;
  const description = typeof remoteRepo?.description === "string" ? remoteRepo.description : "";
  const topics = Array.isArray(remoteRepo?.repositoryTopics) ? (remoteRepo.repositoryTopics as Array<{name?: string} | string>).map(t => typeof t === "string" ? t : (t.name ?? "")) : [];
  const defaultBranch =
    typeof (remoteRepo?.defaultBranchRef as { name?: string } | undefined)?.name === "string"
      ? (remoteRepo.defaultBranchRef as { name: string }).name
      : "";

  push({
    id: "p1-desc",
    pri: "P1",
    label: "Repo description set (<140 chars, keyword-rich)",
    pass: description.length > 0 && description.length <= 140,
    hint: "gh repo edit --description '<140 chars: what it does, for whom>'",
    remote: !!remoteRepo,
  });
  push({
    id: "p1-topics",
    pri: "P1",
    label: "Topics set (8-12 relevant)",
    pass: topics.length >= 8,
    hint: "gh repo edit --add-topic ... --add-topic ... (8-12: language + domain + function)",
    remote: !!remoteRepo,
  });
  push({
    id: "p1-main",
    pri: "P1",
    label: "Default branch is main",
    pass: defaultBranch === "main",
    hint: "GitHub → Settings → Branches → change default to main.",
    remote: !!remoteRepo,
  });

  // P2 — depth
  push({
    id: "p2-docs",
    pri: "P2",
    label: "docs/ directory or wiki",
    pass: exists(dir, "docs"),
    hint: "Add docs/ for beyond-README depth.",
  });
  push({
    id: "p2-examples",
    pri: "P2",
    label: "examples/ with runnable code",
    pass: exists(dir, "examples") || exists(dir, "example"),
    hint: "Add examples/ with runnable code.",
  });
  push({
    id: "p2-roadmap",
    pri: "P2",
    label: "Roadmap section in README",
    pass: /roadmap/i.test(readme),
    hint: "Add Roadmap with - [x] / - [ ] checkboxes.",
  });

  // P3 — community
  push({
    id: "p3-contrib",
    pri: "P3",
    label: "CONTRIBUTING.md (short)",
    pass: exists(dir, "CONTRIBUTING.md") && read(dir, "CONTRIBUTING.md").split("\n").length < 150,
    hint: "Add CONTRIBUTING.md (<100 lines): setup, tests, PR process.",
  });
  push({
    id: "p3-coc",
    pri: "P3",
    label: "CODE_OF_CONDUCT.md",
    pass: exists(dir, "CODE_OF_CONDUCT.md"),
    hint: "Add Contributor Covenant as CODE_OF_CONDUCT.md.",
  });
  push({
    id: "p3-issues",
    pri: "P3",
    label: "Issue templates",
    pass: exists(dir, ".github/ISSUE_TEMPLATE"),
    hint: "Add .github/ISSUE_TEMPLATE/ (bug + feature).",
  });
  push({
    id: "p3-pr",
    pri: "P3",
    label: "PR template",
    pass: exists(dir, "PULL_REQUEST_TEMPLATE.md") || exists(dir, ".github/PULL_REQUEST_TEMPLATE.md"),
    hint: "Add PULL_REQUEST_TEMPLATE.md (<15 lines).",
  });
  push({
    id: "p3-security",
    pri: "P3",
    label: "SECURITY.md",
    pass: exists(dir, "SECURITY.md"),
    hint: "Add SECURITY.md (required if security/network-adjacent).",
  });

  // P4 — star-killer sweep
  push({
    id: "p4-todo",
    pri: "P4",
    label: "No TODO/placeholder in README",
    pass: !/todo|tbd|coming soon|placeholder/i.test(readme),
    hint: "Remove TODO/placeholder text from README.",
  });
  push({
    id: "p4-jargon",
    pri: "P4",
    label: "One-liner is jargon-free",
    pass: !/leveraging|synergistic|next-gen|blazingly|ultra-fast(?!.*proof)/i.test(readme.slice(0, 500)),
    hint: "Rewrite one-liner in plain words a newcomer understands.",
  });

  const passCount = checks.filter((c) => c.pass).length;
  const score = (() => {
    const p0 = checks.every((c) => c.pri !== "P0" || c.pass);
    const p01 = checks.every((c) => c.pri === "P3" || c.pri === "P4" || c.pass);
    if (p0 && p01) return "STAR-GRADE";
    if (p0) return "TRUSTWORTHY";
    return "PRESENTABLE-NOT-YET";
  })();

  return { repo: dir, checks, passCount, failCount: checks.length - passCount, score };
}

/** Pretty-printed audit report. */
export function formatAudit(result: AuditResult): string {
  const lines: string[] = [];
  let cur = "";
  for (const c of result.checks) {
    if (c.pri !== cur) {
      cur = c.pri;
      lines.push(`\n== ${cur} ==`);
    }
    const mark = c.pass ? "PASS" : "FAIL";
    lines.push(`[${mark}]${c.remote ? " ⛅" : ""} ${c.label}`);
    if (!c.pass) lines.push(`       -> ${c.hint}`);
  }
  lines.push(`\n${result.passCount}/${result.checks.length} checks pass. Score: ${result.score}`);
  return lines.join("\n");
}