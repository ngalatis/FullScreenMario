import { expect, test } from "@playwright/test";

import { collectPageErrors } from "../helpers";
import { hold, jumps, runScenario } from "./parityHarness";

/**
 * Review repro (P-01): ScenePlayr.startCutscene spreads its optional `args`
 * parameter (`this.playRoutine(firstRoutine, ...args)`). Both game callers
 * (collideFlagpole -> "Flagpole", collideCastleAxe -> "BowserVictory") pass no
 * args, so the spread of `undefined` throws "args is not iterable". The original
 * compiled to `[firstRoutine].concat(args)`, which tolerates undefined.
 *
 * In the original, the scripted flagpole run below reaches the castle door and
 * the time countdown (score 20350 after 1100 steps); the Bowser run reaches the
 * axe and ends on map 2-1.
 */
test.describe("cutscenes", () => {
    test("touching the flagpole starts the Flagpole cutscene without errors", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        const result = await runScenario(page, {
            map: "1-1",
            location: 0,
            steps: 300,
            segments: [hold(["right", "sprint"], 0, 300), ...jumps([20])],
            actions: [{ at: 1, do: "teleport", args: [6150, 416] }],
        });

        expect(result.errors).toEqual([]);
        expect(errors).toEqual([]);
        // Original: Mario slid down the pole (step 47), walked into the castle and the countdown began
        expect(result.trace.length).toBe(300);
        expect(result.final!.items[0]).toBeGreaterThan(400);
    });

    test("touching the castle axe starts the BowserVictory cutscene and reaches 2-1", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        const result = await runScenario(page, {
            map: "1-4",
            location: 0,
            steps: 1200,
            segments: [hold(["right", "sprint"], 0, 1200), ...jumps([5, 60, 120, 180])],
            actions: [{ at: 1, do: "teleport", args: [4300, 320] }, { at: 1, do: "star" }],
        });

        expect(result.errors).toEqual([]);
        expect(errors).toEqual([]);
        expect(result.trace.length).toBe(1200);
        expect(result.final!.map).toBe("2-1");
    });
});
