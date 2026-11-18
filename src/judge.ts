/**
 * marquee/src/judge.ts — judge every failing check with a real LLM.
 *
 * Uses tau's judge helpers (chatTextBackend + buildModel) so each failing
 * marquee check gets a targeted, contextual remediation from a real model —
 * not just a canned hint. Clean capability; the model is the estate's
 * freeinference deepseek lane.
 */
import { buildModel } from "../../../../olympus/products/tau/packages/catalog/src/build.ts";
import { chatTextBackend } from "../../../../olympus/products/tau/packages/ai/src/judgment/chat.ts";
import type { Model } from "../../../../olympus/products/tau/packages/catalog/src/types.ts";
import type { CheckResult } from "./audit.ts";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The estate's freeinference deepseek judge model. */
export function judgeModel(id = "deepseek-v4-flash"): Model<"openai-completions"> {
	return buildModel({
		id,
		name: id,
		api: "openai-completions",
		provider: "freeinference",
		baseUrl: "https://freeinference.org/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	});
}

/** Fallback chain: try each model in order until one completes. */
const JUDGE_FALLBACK_MODELS = ["deepseek-v4-flash", "qwen3.6-35b"];

/** Build a judge prompt for a failing check, including the actual repo context. */
export function judgePrompt(check: CheckResult, dir: string, repoName: string): string {
	// Pull the most relevant file content for context (README/LICENSE/docs).
	const ctx: string[] = [];
	for (const f of ["README.md", "LICENSE", "CHANGELOG.md", "docs/README.md"]) {
		const p = join(dir, f);
		if (existsSync(p)) {
			const c = readFileSync(p, "utf8").slice(0, 800);
			ctx.push(`--- ${f} ---\n${c}`);
		}
	}
	return [
		`You are the star-grade judge for the repo "${repoName}".`,
		`A marquee audit check FAILED:`,
		`  [${check.pri}] ${check.label}`,
		`  hint: ${check.hint}`,
		``,
		`Here is the current repo context:`,
		ctx.join("\n\n") || "(no files present yet)",
		``,
		`Give a concrete, actionable remediation (2-4 sentences) for THIS specific repo.`,
		`Be direct and specific — reference the actual files/state above. Do not pad.`,
	].join("\n");
}

/**
 * Judge a single failing check with the LLM, falling back across models.
 * Returns the judge's remediation text.
 */
export async function judgeCheck(check: CheckResult, dir: string, repoName: string, apiKey: string): Promise<string> {
	const prompt = judgePrompt(check, dir, repoName);
	for (const modelId of JUDGE_FALLBACK_MODELS) {
		try {
			const model = judgeModel(modelId);
			const backend = chatTextBackend(model, { apiKey });
			const completion = await backend.complete(
				{ system: "You are a terse, expert repo grader. Give only the remediation.", user: prompt },
				{ signal: undefined },
			);
			const text = completion.text?.trim();
			if (text) return text;
		} catch (e) {
			// fall through to the next model
		}
	}
	return "(all judge models failed)";
}

/**
 * Judge all failing checks in an audit. Returns a map of checkId -> remediation.
 */
export async function judgeAllFails(
	checks: CheckResult[],
	dir: string,
	repoName: string,
	apiKey: string,
	concurrency = 3,
): Promise<Map<string, string>> {
	const fails = checks.filter((c) => !c.pass);
	const out = new Map<string, string>();
	let idx = 0;
	async function worker() {
		while (idx < fails.length) {
			const c = fails[idx++];
			try {
				out.set(c.id, await judgeCheck(c, dir, repoName, apiKey));
			} catch (e) {
				out.set(c.id, `(judge error: ${(e as Error).message})`);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, fails.length) }, () => worker()));
	return out;
}