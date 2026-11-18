#!/usr/bin/env bun
/**
 * lapidary — the geode transform + detect engine (thin dispatcher).
 *
 * Standalone tool for ANY ecosystem. Four generic verbs + optional pens-aware
 * ops (when a config file defines the pens root) + serve/mcp surfaces.
 *
 *   lapidary rewrite  <target>... --rules <files> [--depth N] [--ignore a,b] [--dry-run]
 *   lapidary undo     <root>
 *   lapidary verify   <dir> <term>
 *   lapidary detect   --rules <manifest> [--flags] [--bench]
 *   lapidary move     <product> <from-pen> <to-pen> [--dry-run]        (pens-aware)
 *   lapidary retire   <old-pen> <target-pen> [--dry-run] [--delete-repo] (pens-aware)
 *   lapidary merge    <from-path> <into-path> [--dry-run]              (pens-aware)
 *   lapidary serve    [--port N]        # HTTP API + web app
 *   lapidary mcp                        # stdio MCP server
 *   lapidary help
 */
import { run as rewrite } from "../src/commands/rewrite.ts";
import { run as undo } from "../src/commands/undo.ts";
import { run as verify } from "../src/commands/verify.ts";
import { run as detect } from "../src/commands/detect.ts";
import { run as move } from "../src/commands/move.ts";
import { run as retire } from "../src/commands/retire.ts";
import { run as merge } from "../src/commands/merge.ts";
import { loadConfig, hasConfig } from "../src/config.ts";

// Public engine exports (used by lapidary.test.ts and embedders).
export {
	applyCasePreserving,
	applyRules,
	combyToRegex,
	listTrackedFiles,
	loadRules,
	matchGlob,
	parseRuleFile,
	pathAllowed,
	rewriteEngine,
	rule,
} from "../src/core.ts";

const HELP = `lapidary — transform + detect engine (standalone, any ecosystem)

usage:
  lapidary rewrite  <target>... --rules <files> [--depth N] [--ignore a,b] [--dry-run]
  lapidary undo     <root>
  lapidary verify   <dir> <term>
  lapidary detect   --rules <manifest> [--flags ORCHID_FLAGS] [--bench]
  lapidary move     <product> <from-pen> <to-pen> [--dry-run]
  lapidary retire   <old-pen> <target-pen> [--dry-run] [--delete-repo]
  lapidary merge    <from-path> <into-path> [--dry-run]
  lapidary serve    [--port N]
  lapidary mcp
  lapidary help

rewrite: apply .lapidary rule files (word/substr/regex/case/comby) over a
         target (file, folder, or git repo). Symbol-boundary word matching.
undo:    roll back the last rewrite from a target's undo journal.
verify:  stale-ref scan (content + filename) for a term in a dir.
detect:  run orchid detectors (a1..a9) over the corpus, feature-flag-gated.
move:    move a product between pens, rewrite refs (pens config required).
retire:  drain a whole pen's products/docs/ssot into another pen.
merge:   absorb one folder's ENTIRE content into another, symlink, rewrite refs.
serve:   HTTP API + web dashboard (site/).
mcp:     stdio MCP server (lapidary_rewrite / _undo / _verify / _detect).
`;

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const cmd = argv[0];
	if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") { console.log(HELP); process.exit(0); }
	const rest = argv.slice(1);
	switch (cmd) {
		case "rewrite": rewrite(rest); break;
		case "undo": undo(rest); break;
		case "verify": await verify(rest); break;
		case "detect": detect(rest); break;
		case "move": move(rest); break;
		case "retire": retire(rest); break;
		case "merge": merge(rest); break;
		case "serve": {
			const get = (f: string) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
			const { serve } = await import("../src/http.ts");
			const cfg = loadConfig();
			serve(get("--port") ? Number(get("--port")) : cfg.httpPort);
			break;
		}
		case "mcp": {
			const { main: mcpMain } = await import("../src/mcp.ts");
			await mcpMain();
			break;
		}
		default:
			console.error(`lapidary: unknown command "${cmd}"`);
			console.log(HELP);
			process.exit(2);
	}
}

if (import.meta.main) await main();