// merge.ts — `lapidary merge <from-path> <into-path> [--dry-run]`
// Thin CLI wrapper over the pens-aware mergeInto (src/pens.ts).
import { mergeInto } from "../pens.ts";

export function run(args: string[]): void {
	const fromPath = args[0];
	const intoPath = args[1];
	const dryRun = args.includes("--dry-run");
	if (!fromPath || !intoPath) { console.error("lapidary merge: <from-path> <into-path> required"); process.exit(2); }
	try {
		mergeInto(fromPath, intoPath, dryRun);
	} catch (e) { console.error(`lapidary merge: ${(e as Error).message}`); process.exit(2); }
}