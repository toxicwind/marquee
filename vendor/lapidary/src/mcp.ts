// mcp.ts — lapidary MCP server (stdio).
// Exposes the same 4 operations as the CLI, as MCP tools:
//   lapidary_rewrite, lapidary_undo, lapidary_verify, lapidary_detect
// All route through the shared core engine (src/core.ts).
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadRules, rewriteEngine, journalRun, runDetectors } from "./core.ts";
import { resolveTargets } from "./commands/targets.ts";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function ok(text: string): ToolResult {
	return { content: [{ type: "text", text }] };
}
function err(text: string): ToolResult {
	return { content: [{ type: "text", text }], isError: true };
}

const TOOLS = [
	{
		name: "lapidary_rewrite",
		description:
			"Apply .lapidary rule files (word/substr/regex/case/comby) over a target (file, folder, or git repo). " +
			"Supports multiple targets, --depth, --ignore. Symbol-boundary word matching (handles _omp_, __omp, omp_). " +
			"Journals every edit for lapidary_undo.",
		inputSchema: {
			type: "object",
			properties: {
				targets: { type: "array", items: { type: "string" }, description: "file(s), folder(s), or repo(s)" },
				rules: { type: "array", items: { type: "string" }, description: ".lapidary rule file paths" },
				depth: { type: "number", description: "max walk depth (folders)" },
				ignore: { type: "array", items: { type: "string" }, description: "folder names to skip" },
				dryRun: { type: "boolean", default: false },
			},
			required: ["targets", "rules"],
		},
	},
	{
		name: "lapidary_undo",
		description: "Roll back the last lapidary rewrite from a target's undo journal.",
		inputSchema: {
			type: "object",
			properties: { root: { type: "string", description: "target root holding .lapidary-undo.jsonl" } },
			required: ["root"],
		},
	},
	{
		name: "lapidary_verify",
		description: "Pens-wide stale-ref scan (content + filename) for a term in a dir.",
		inputSchema: {
			type: "object",
			properties: { dir: { type: "string" }, term: { type: "string" } },
			required: ["dir", "term"],
		},
	},
	{
		name: "lapidary_detect",
		description: "Run orchid detectors over the corpus (feature-flag-gated).",
		inputSchema: {
			type: "object",
			properties: { rules: { type: "array", items: { type: "string" }, description: ".lapidary manifest paths" } },
			required: ["rules"],
		},
	},
];

async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
	try {
		switch (name) {
			case "lapidary_rewrite": {
				const targets = (args.targets as string[]) ?? [];
				const ruleFiles = (args.rules as string[]) ?? [];
				if (!targets.length || !ruleFiles.length) return err("lapidary_rewrite: targets and rules required");
				const { rules, excludes, globalInclude, globalIgnore } = loadRules(ruleFiles);
				const { root, files, kind } = resolveTargets(targets, {
					depth: args.depth as number | undefined,
					ignore: (args.ignore as string[]) ?? [],
				});
				const undoPath = `${root}/.lapidary-undo.jsonl`;
				const outcome = rewriteEngine({
					files, rules, excludes, globalInclude, globalIgnore,
					ruleFiles, undoPath,
					dryRun: args.dryRun === true,
				});
				journalRun({ mode: args.dryRun === true ? "rewrite-dry" : "rewrite", repo: root, edits: outcome.edits, files: outcome.files });
				return ok(`[${kind}] edits=${outcome.edits} files=${outcome.files}${args.dryRun === true ? " (dry-run)" : ""}`);
			}
			case "lapidary_undo": {
				const root = args.root as string;
				if (!root) return err("lapidary_undo: root required");
				const undoPath = `${root}/.lapidary-undo.jsonl`;
				const { createHash } = await import("node:crypto");
				const fs = await import("node:fs");
				const path = await import("node:path");
				if (!fs.existsSync(undoPath)) return err(`no undo journal at ${undoPath}`);
				const entries = fs.readFileSync(undoPath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
				let undone = 0;
				for (const entry of entries.reverse() as Array<{ file: string; before: string; hash: string }>) {
					const full = path.join(root, entry.file);
					try {
						const current = fs.readFileSync(full, "utf8");
						if (createHash("sha256").update(current).digest("hex") === entry.hash) {
							fs.writeFileSync(full, entry.before); undone++;
						}
					} catch { /* missing file */ }
				}
				return ok(`undone ${undone} file(s)`);
			}
			case "lapidary_verify": {
				const dir = args.dir as string;
				const term = args.term as string;
				if (!dir || !term) return err("lapidary_verify: dir and term required");
				const grep = Bun.spawnSync(["rg", "-l", "-i", "-g", "!node_modules/**", "-g", "!**/.git/**", "-g", "!**/.cache/**", "-g", "!**/target/**", "-g", "!**/dist/**", term, dir], { stdout: "pipe" });
				const hits = Buffer.from(grep.stdout ?? Buffer.alloc(0)).toString("utf8").split("\n").filter(Boolean);
				return ok(`verify "${term}" in ${dir}: ${hits.length} stale ref(s)\n${hits.join("\n")}`);
			}
			case "lapidary_detect": {
				const ruleFiles = (args.rules as string[]) ?? [];
				if (!ruleFiles.length) return err("lapidary_detect: rules required");
				const { rules } = loadRules(ruleFiles);
				const outcomes = await runDetectors(rules, undefined, `/tmp/lapidary-runs`);
				return ok(outcomes.map((o: { id: string; enabled: boolean; findings: unknown[]; latencyMs: number; reason?: string }) => `[detect] ${o.id} ${o.enabled ? `ran ${o.findings.length} finding(s) in ${o.latencyMs}ms` : `SKIPPED (${o.reason})`}`).join("\n"));
			}
			default:
				return err(`unknown tool: ${name}`);
		}
	} catch (e) {
		return err(`lapidary ${name}: ${(e as Error).message}`);
	}
}

// ─── stdio MCP transport ───────────────────────────────────────────────────
export async function main(): Promise<void> {
	const stdin = process.stdin;
	const stdout = process.stdout;
	let buffer = "";
	stdin.setEncoding("utf8");
	stdin.on("data", async (chunk: string) => {
		buffer += chunk;
		let idx: number;
		while ((idx = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 1);
			if (!line.trim()) continue;
			let msg: { id?: number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
			try { msg = JSON.parse(line); } catch { continue; }
			if (msg.method === "initialize") {
				write(stdout, { id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "lapidary", version: "1.0.0" } } });
			} else if (msg.method === "tools/list") {
				write(stdout, { id: msg.id, result: { tools: TOOLS } });
			} else if (msg.method === "tools/call") {
				const result = await handleTool(msg.params?.name ?? "", msg.params?.arguments ?? {});
				write(stdout, { id: msg.id, result });
			} else if (msg.method === "notifications/initialized") {
				// no-op
			} else {
				write(stdout, { id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
			}
		}
	});
}

function write(stream: NodeJS.WritableStream, obj: unknown): void {
	stream.write(JSON.stringify(obj) + "\n");
}

if (import.meta.main) await main();