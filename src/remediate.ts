/**
 * marquee remediate — tree-wide text transforms backed by lapidary's engine.
 *
 * marquee audits and ships star-grade repos; when a repo needs a rename or a
 * tree-wide text fix (old name → new name, stale branding, path moves), it
 * delegates to lapidary's rewriteEngine so the transform is symbol-boundary
 * correct, journaled, and undoable — the same engine the pens estate uses.
 */
import { join } from "node:path";
import { rewriteEngine, loadRules, rule, type Rule } from "../vendor/lapidary/src/core.ts";
import { resolveTargets } from "../vendor/lapidary/src/commands/targets.ts";

export interface RemediateOptions {
  /** .lapidary rule files to apply. */
  ruleFiles?: string[];
  /** Programmatic word rules: [{from, to}] — case-sensitive word matches. */
  wordPairs?: Array<{ from: string; to: string }>;
  /** Programmatic substr rules: [{from, to}]. */
  substrPairs?: Array<{ from: string; to: string }>;
  dryRun?: boolean;
}

export interface RemediateResult {
  edits: number;
  files: number;
  kind: "file" | "folder" | "repo";
}

/**
 * Apply lapidary transforms over a repo dir. Returns edit counts.
 * The undo journal lands at <dir>/.lapidary-undo.jsonl (use lapidary undo).
 */
export function remediateRepo(dir: string, opts: RemediateOptions = {}): RemediateResult {
  const rules: Rule[] = [];
  for (const p of opts.wordPairs ?? []) rules.push(rule("word", p.from, p.to));
  for (const p of opts.substrPairs ?? []) rules.push(rule("substr", p.from, p.to));
  if (opts.ruleFiles?.length) {
    const loaded = loadRules(opts.ruleFiles);
    rules.push(...loaded.rules);
  }
  if (rules.length === 0) return { edits: 0, files: 0, kind: "repo" };

  // Walk the repo like lapidary does (git tracked+untracked, or fs fallback).
  const { root, files, kind } = resolveTargets([dir], {});
  const undoPath = join(root, ".lapidary-undo.jsonl");
  const outcome = rewriteEngine({
    files,
    rules,
    ruleFiles: opts.ruleFiles ?? [],
    undoPath,
    dryRun: opts.dryRun === true,
  });
  return { edits: outcome.edits, files: outcome.files, kind };
}

/** Convenience: rename `from` → `to` across a repo (word + case variants). */
export function renameRepo(dir: string, from: string, to: string, dryRun = false): RemediateResult {
  return remediateRepo(dir, {
    wordPairs: [
      { from, to },
      { from: from.charAt(0).toUpperCase() + from.slice(1), to: to.charAt(0).toUpperCase() + to.slice(1) },
      { from: from.toUpperCase(), to: to.toUpperCase() },
    ],
    dryRun,
  });
}