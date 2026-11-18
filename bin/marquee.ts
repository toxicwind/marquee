#!/usr/bin/env bun
/**
 * marquee CLI — audit, remediate, ship a repo to star-grade.
 *
 * Usage:
 *   marquee audit [dir]          — run the P0-P4 checklist (exit 1 on gaps)
 *   marquee readme [dir]         — render maximal README (stdout, no write)
 *   marquee write-readme <dir>   — write maximal README into repo dir
 *   marquee community <dir>      — write CONTRIBUTING/CoC/issue+PR/SECURITY
 *   marquee ci <dir> [--lang X]  — write .github/workflows/ci.yml
 *   marquee changelog <dir>      — prepend a fresh [Unreleased] entry
 *   marquee liveness [dir]       — check README/docs/.github links (HEAD 200)
 *   marquee meta <dir> [--apply] — GitHub-side description/topics via gh
 *   marquee ship <dir> --push    — commit + push + re-audit
 *   marquee all <dir> [--apply] [--push] — full pass: audit→remediate→ship
 *   marquee header <dir> [--name N] [--tagline T] [--no-judge] — generate+judge a branded hero PNG
 */
import { auditRepo, formatAudit } from "../src/audit.ts";
import { renderReadme, type ReadmeConfig } from "../src/readme.ts";
import { writeCommunity } from "../src/community.ts";
import { writeCi, detectToolchain, ciBadge } from "../src/ci.ts";
import { writeChangelog, today } from "../src/changelog.ts";
import { checkLinks, formatLiveness } from "../src/liveness.ts";
import { metaPass, inferMeta } from "../src/meta.ts";
import { shipRepo } from "../src/ship.ts";
import { generateHeader } from "../src/header.ts";
import { judgeAllFails } from "../src/judge.ts";
import { repoSlug } from "../src/audit.ts";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const COMMANDS = new Set(["audit", "readme", "write-readme", "community", "ci", "changelog", "liveness", "meta", "ship", "all", "header", "help"]);
const cmd = args.find((a) => COMMANDS.has(a)) ?? "audit";
const dir = args.find((a) => !a.startsWith("-") && !COMMANDS.has(a)) ?? ".";
const out = (s: string, exit = 0) => {
  console.log(s);
  process.exit(exit);
};

function repoName(dir: string, slug: string | null): string {
  if (slug) return slug.split("/")[1];
  return join(dir).split("/").pop() ?? "repo";
}

function readmeConfigFromRepo(dir: string): ReadmeConfig {
  const slug = repoSlug(dir);
  const name = repoName(dir, slug);
  const repoUrl = slug ? `https://github.com/${slug}` : `https://github.com/toxicwind/${name}`;
  const detect = detectToolchain(dir);
  const install = detect === "bun" ? "bun install" : detect === "node" ? "npm install" : detect === "python" ? "pip install -e ." : "make";
  const test = detect === "bun" ? "bun test" : detect === "node" ? "npm test" : detect === "python" ? "pytest" : "make test";
  let pkgDesc = "";
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { description?: string };
    pkgDesc = pkg.description ?? "";
  } catch { /* no package.json */ }
  return {
    name,
    repoUrl,
    tagline: pkgDesc || `${name} — a focused, dependency-free tool for the task it solves.`,
    installCommand: install,
    exampleLang: detect === "python" ? "python" : detect === "rust" ? "rust" : "ts",
    roadmap: [
      { done: true, label: "First release" },
      { done: false, label: "Community contributions welcome" },
    ],
    license: "MIT",
    maintainer: "@toxicwind",
  };
}

switch (cmd) {
  case "audit": {
    const r = auditRepo(dir);
    let text = formatAudit(r);
    if (args.includes("--judge")) {
      const rname = repoName(dir, repoSlug(dir));
      const apiKey = process.env.FREEINFERENCE_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
      text += "\n\n== JUDGE REMEDIATION ==\n";
      const remedies = await judgeAllFails(r.checks, dir, rname, apiKey);
      for (const [id, rem] of remedies) {
        text += `\n[${id}]\n${rem}\n`;
      }
    }
    out(text, r.failCount > 0 ? 0 : 0);
    break;
  }
  case "readme": {
    out(renderReadme(readmeConfigFromRepo(dir)));
    break;
  }
  case "write-readme": {
    const cfg = readmeConfigFromRepo(dir);
    const content = renderReadme(cfg);
    writeFileSync(join(dir, "README.md"), content, "utf8");
    out(`Wrote README.md for ${cfg.name}.`);
    break;
  }
  case "community": {
    const tc = detectToolchain(dir);
    const install = tc === "bun" ? "bun install" : tc === "node" ? "npm install" : tc === "python" ? "pip install -e ." : "make";
    const test = tc === "bun" ? "bun test" : tc === "node" ? "npm test" : tc === "python" ? "pytest" : "make test";
    const slug = repoSlug(dir);
    const created = writeCommunity(dir, {
      installCommand: install,
      testCommand: test,
      securityAdjacent: true,
      repoUrl: slug ? `https://github.com/${slug}` : undefined,
    });
    out(created.length > 0 ? `Created: ${created.join(", ")}` : "All community files already present.");
    break;
  }
  case "ci": {
    const langArg = args.indexOf("--lang");
    const tc = langArg >= 0 ? (args[langArg + 1] as Parameters<typeof writeCi>[1]) : undefined;
    const path = writeCi(dir, tc);
    if (!path) {
      out(`CI workflow already exists.`, 0);
      break;
    }
    const slug = repoSlug(dir);
    const badge = slug ? ciBadge(slug) : "";
    out(`Wrote ${path}${badge ? `\nBadge for README:\n${badge}` : ""}`);
    break;
  }
  case "changelog": {
    const res = writeChangelog(dir, {
      version: "Unreleased",
      date: today(),
      added: ["Initial public release (marquee pass)"],
    });
    out(res.created ? `Created ${res.path} with an Unreleased entry.` : `Prepended entry to ${res.path}.`);
    break;
  }
  case "liveness": {
    const checks = await checkLinks(dir);
    out(formatLiveness(checks), checks.some((c) => !c.ok) ? 1 : 0);
    break;
  }
  case "meta": {
    const apply = args.includes("--apply");
    out(metaPass(dir, inferMeta(dir), apply));
    break;
  }
  case "ship": {
    const push = args.includes("--push");
    out(shipRepo(dir, { push, verify: true }));
    break;
  }
  case "all": {
    const apply = args.includes("--apply");
    const push = args.includes("--push");
    const lines: string[] = ["==", "MARQUEE FULL PASS", "==", ""];
    // 1. audit
    const before = auditRepo(dir);
    lines.push(formatAudit(before), "");
    // 2. remediate files (always write locally)
    const tc = detectToolchain(dir);
    const install = tc === "bun" ? "bun install" : tc === "node" ? "npm install" : tc === "python" ? "pip install -e ." : "make";
    const test = tc === "bun" ? "bun test" : tc === "node" ? "npm test" : tc === "python" ? "pytest" : "make test";
    const cfg = readmeConfigFromRepo(dir);
    writeFileSync(join(dir, "README.md"), renderReadme(cfg), "utf8");
    writeCommunity(dir, { installCommand: install, testCommand: test, securityAdjacent: true, repoUrl: cfg.repoUrl });
    writeCi(dir);
    writeChangelog(dir, { version: "1.0.0", date: today(), added: ["Initial release (marquee star-grade pass)"] });
    lines.push("Files remediated: README.md, community files, CI workflow, CHANGELOG.md");
    // 3. liveness
    if (existsSync(join(dir, "README.md"))) {
      const checks = await checkLinks(dir);
      lines.push("", formatLiveness(checks));
    }
    // 4. meta (apply if --apply)
    if (apply) {
      lines.push("", metaPass(dir, inferMeta(dir), true));
    } else {
      lines.push("", "Meta: run with --apply to set description/topics via gh.");
    }
    // 5. ship
    if (push) {
      lines.push("", shipRepo(dir, { push: true, verify: true }));
    } else {
      lines.push("", `Ship: run \`marquee ship ${dir} --push\` to commit + push + verify.`);
    }
    out(lines.join("\n"));
    break;
  }
  case "header": {
    const name = args.indexOf("--name") >= 0 ? args[args.indexOf("--name") + 1] : repoName(dir, repoSlug(dir));
    const tagline = args.indexOf("--tagline") >= 0 ? args[args.indexOf("--tagline") + 1] : `${name} — a focused tool for the task it solves.`;
    const noJudge = args.includes("--no-judge");
    const r = generateHeader({ name, tagline, out: join(dir, `${name}-hero.png`), noJudge });
    out(`Generated ${r.png} (${r.bytes} bytes)${r.judge ? `\n\nJudge:\n${r.judge}` : ""}`);
    break;
  }
  default:
    out(`Unknown command: ${cmd}\n\nUsage: marquee {audit|readme|write-readme|community|ci|changelog|liveness|meta|ship|all} [dir] [--apply] [--push]`, 2);
}