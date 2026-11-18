// rewrite.ts — `lapidary rewrite <target>... --rules <files> [--depth N] [--ignore a,b] [--dry-run]`
// Applies .lapidary rule files over targets (file/folder/repo). Routes through
// the shared rewriteEngine (core.ts) + target resolution (targets.ts).
import * as path from "node:path";
import { loadRules, rewriteEngine, journalRun } from "../core.ts";
import { resolveTargets } from "./targets.ts";

export function run(args: string[]): void {
	const get = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
	const rulesArg = get("--rules") ?? get("--pairs");
	const FLAG_ARGS = new Set(["--rules", "--pairs", "--repo", "--commit", "--depth", "--ignore", "--flags", "--manifest"]);
	const positionals: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (!a.startsWith("-")) { positionals.push(a); continue; }
		if (FLAG_ARGS.has(a)) i++;
	}
	const targets = positionals;
	const force = args.includes("--force");
	const dryRun = args.includes("--dry-run") && !force;
	const depth = get("--depth") !== undefined ? Number(get("--depth")) : undefined;
	const ignore = get("--ignore")?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
	if (!rulesArg || targets.length === 0) {
		console.error("lapidary rewrite: <target>... and --rules are required");
		process.exit(2);
	}
	const ruleFiles = rulesArg.split(",").map(f => f.trim());
	const { rules, excludes, globalInclude, globalIgnore } = loadRules(ruleFiles);
	const { root, files, kind } = resolveTargets(targets, { depth, ignore });
	const undoPath = path.join(root, ".lapidary-undo.jsonl");
	const outcome = rewriteEngine({ files, rules, excludes, globalInclude, globalIgnore, ruleFiles, undoPath, dryRun });
	console.log(`[${kind}] edits=${outcome.edits} files=${outcome.files}${dryRun ? " (dry-run)" : ""}`);
	journalRun({ mode: dryRun ? "rewrite-dry" : "rewrite", repo: root, edits: outcome.edits, files: outcome.files });
	if (!dryRun) {
		path.join(root, "rename.map");
	}
}