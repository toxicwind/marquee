/**
 * marquee changelog — CHANGELOG.md init + append.
 * Signals "alive": a fresh, dated, human-readable entry. Keep it minimal; no placeholders.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  added?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
}

const HEADER = `# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/) — versions use
[SemVer](https://semver.org/).
`;

export function formatEntry(e: ChangelogEntry): string {
  const parts: string[] = [`## [${e.version}] — ${e.date}`, ""];
  const group = (heading: string, items?: string[]) => {
    if (items && items.length > 0) {
      parts.push(`### ${heading}`, "", ...items.map((i) => `- ${i}`), "");
    }
  };
  group("Added", e.added);
  group("Changed", e.changed);
  group("Fixed", e.fixed);
  group("Removed", e.removed);
  if (!e.added?.length && !e.changed?.length && !e.fixed?.length && !e.removed?.length) {
    parts.push("_No significant changes._", "");
  }
  return parts.join("\n");
}

/** Read existing CHANGELOG.md body (after header), prepend a new entry, write. */
export function writeChangelog(dir: string, entry: ChangelogEntry): { path: string; created: boolean } {
  const abs = join(dir, "CHANGELOG.md");
  const created = !existsSync(abs);
  let existing = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  // strip old header so the target version always sits first
  existing = existing.replace(/^# Changelog[\s\S]*?\n\n/, "");
  const body = `${HEADER}\n${formatEntry(entry)}\n${existing}`;
  writeFileSync(abs, body.trimEnd() + "\n", "utf8");
  return { path: "CHANGELOG.md", created };
}

/** Today's date in YYYY-MM-DD (local). */
export function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}