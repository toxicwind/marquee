// retire.ts — `lapidary retire <old-pen> <target-pen> [--dry-run] [--delete-repo]`
// Thin CLI wrapper over the pens-aware retirePen (src/pens.ts).
import { retirePen } from "../pens.ts";

export function run(args: string[]): void {
	const oldPen = args[0];
	const targetPen = args[1];
	const dryRun = args.includes("--dry-run");
	const deleteRepo = args.includes("--delete-repo");
	if (!oldPen || !targetPen) { console.error("lapidary retire: <old-pen> <target-pen> required"); process.exit(2); }
	try {
		retirePen(oldPen, targetPen, dryRun, deleteRepo);
	} catch (e) { console.error(`lapidary retire: ${(e as Error).message}`); process.exit(2); }
}