// move.ts — `lapidary move <product> <from-pen> <to-pen> [--dry-run]`
// Thin CLI wrapper over the pens-aware moveProduct (src/pens.ts).
import { moveProduct } from "../pens.ts";

export function run(args: string[]): void {
	const product = args[0];
	const fromPen = args[1];
	const toPen = args[2];
	const dryRun = args.includes("--dry-run");
	if (!product || !fromPen || !toPen) { console.error("lapidary move: <product> <from-pen> <to-pen> required"); process.exit(2); }
	try {
		moveProduct(product, fromPen, toPen, dryRun);
	} catch (e) { console.error(`lapidary move: ${(e as Error).message}`); process.exit(2); }
}