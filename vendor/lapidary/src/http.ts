// http.ts — lapidary HTTP API.
// REST endpoints mirroring the 4 generic ops + the pens-aware ops, all routed
// through the shared core engine. Serves the web app (site/) as static files.
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { loadRules, rewriteEngine, journalRun, runDetectors } from "./core.ts";
import { resolveTargets } from "./commands/targets.ts";
import { loadConfig } from "./config.ts";
import { moveProduct, retirePen, mergeInto } from "./pens.ts";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

function readBody(req: Request): Promise<Record<string, unknown>> {
	return req.json().catch(() => ({}));
}

function siteDir(): string {
	return path.join(import.meta.dir, "..", "site");
}

async function handler(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const cfg = loadConfig();

	// Static web app (site/)
	if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/app"))) {
		const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/app\//, "");
		const full = path.join(siteDir(), file);
		if (fs.existsSync(full) && fs.statSync(full).isFile()) {
			const ext = path.extname(full);
			const type = ext === ".html" ? "text/html" : ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "application/octet-stream";
			return new Response(fs.readFileSync(full), { headers: { "content-type": type } });
		}
		return json({ error: "not found" }, 404);
	}

	// API
	if (url.pathname === "/health") return json({ ok: true, config: { root: cfg.root ?? null, httpPort: cfg.httpPort } });

	if (url.pathname === "/rewrite" && req.method === "POST") {
		const body = await readBody(req);
		const targets = (body.targets as string[]) ?? [];
		const ruleFiles = (body.rules as string[]) ?? [];
		if (!targets.length || !ruleFiles.length) return json({ error: "targets and rules required" }, 400);
		const { rules, excludes, globalInclude, globalIgnore } = loadRules(ruleFiles);
		const { root, files, kind } = resolveTargets(targets, { depth: body.depth as number | undefined, ignore: (body.ignore as string[]) ?? [] });
		const undoPath = `${root}/.lapidary-undo.jsonl`;
		const outcome = rewriteEngine({ files, rules, excludes, globalInclude, globalIgnore, ruleFiles, undoPath, dryRun: body.dryRun === true });
		journalRun({ mode: body.dryRun === true ? "rewrite-dry" : "rewrite", repo: root, edits: outcome.edits, files: outcome.files });
		return json({ kind, edits: outcome.edits, files: outcome.files, dryRun: body.dryRun === true });
	}

	if (url.pathname === "/undo" && req.method === "POST") {
		const body = await readBody(req);
		const root = body.root as string;
		if (!root) return json({ error: "root required" }, 400);
		const undoPath = `${root}/.lapidary-undo.jsonl`;
		if (!fs.existsSync(undoPath)) return json({ error: `no undo journal at ${undoPath}` }, 404);
		const entries = fs.readFileSync(undoPath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
		let undone = 0;
		for (const entry of entries.reverse() as Array<{ file: string; before: string; hash: string }>) {
			const full = path.join(root, entry.file);
			try {
				const current = fs.readFileSync(full, "utf8");
				if (createHash("sha256").update(current).digest("hex") === entry.hash) { fs.writeFileSync(full, entry.before); undone++; }
			} catch { /* missing */ }
		}
		return json({ undone });
	}

	if (url.pathname === "/verify" && req.method === "POST") {
		const body = await readBody(req);
		const dir = body.dir as string;
		const term = body.term as string;
		if (!dir || !term) return json({ error: "dir and term required" }, 400);
		const grep = Bun.spawnSync(["rg", "-l", "-i", "-g", "!node_modules/**", "-g", "!**/.git/**", "-g", "!**/.cache/**", "-g", "!**/target/**", "-g", "!**/dist/**", term, dir], { stdout: "pipe" });
		const hits = Buffer.from(grep.stdout ?? Buffer.alloc(0)).toString("utf8").split("\n").filter(Boolean);
		return json({ term, dir, stale: hits.length, files: hits });
	}

	if (url.pathname === "/detect" && req.method === "POST") {
		const body = await readBody(req);
		const ruleFiles = (body.rules as string[]) ?? [];
		if (!ruleFiles.length) return json({ error: "rules required" }, 400);
		const { rules } = loadRules(ruleFiles);
		const outcomes = await runDetectors(rules, undefined, `/tmp/lapidary-runs`);
		return json({ outcomes: outcomes.map((o: { id: string; enabled: boolean; findings: unknown[]; latencyMs: number; reason?: string }) => ({ id: o.id, enabled: o.enabled, findings: o.findings.length, latencyMs: o.latencyMs, reason: o.reason })) });
	}

	// Pens-aware ops (only when config present)
	if (cfg.root && url.pathname === "/move" && req.method === "POST") {
		const body = await readBody(req);
		moveProduct(body.product as string, body.fromPen as string, body.toPen as string, body.dryRun === true);
		return json({ ok: true, dryRun: body.dryRun === true });
	}
	if (cfg.root && url.pathname === "/retire" && req.method === "POST") {
		const body = await readBody(req);
		retirePen(body.oldPen as string, body.targetPen as string, body.dryRun === true, body.deleteRepo === true);
		return json({ ok: true, dryRun: body.dryRun === true });
	}
	if (cfg.root && url.pathname === "/merge" && req.method === "POST") {
		const body = await readBody(req);
		mergeInto(body.fromPath as string, body.intoPath as string, body.dryRun === true);
		return json({ ok: true, dryRun: body.dryRun === true });
	}

	return json({ error: `not found: ${req.method} ${url.pathname}` }, 404);
}

export function serve(port: number): void {
	Bun.serve({ port, fetch: handler });
	console.log(`lapidary http: http://0.0.0.0:${port}/`);
}

if (import.meta.main) {
	const cfg = loadConfig();
	serve(cfg.httpPort);
}