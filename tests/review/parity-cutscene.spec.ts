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

    test("a full flagpole run slides, walks into the castle, counts the time down and moves on to 1-2", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        // Same scenario as above, long enough for the whole countdown. The original gives exactly
        // these numbers: on the pole by step 47, at the castle door by step 300, time and score
        // settled (20350 points) by step 700, then 1-2 once the Stage Clear jingle has ended.
        const result = await runScenario(page, {
            map: "1-1",
            location: 0,
            steps: 1100,
            segments: [hold(["right", "sprint"], 0, 1100), ...jumps([20])],
            actions: [{ at: 1, do: "teleport", args: [6150, 416] }],
        });

        expect(result.errors).toEqual([]);
        expect(result.trace.length).toBe(1100);
        expect(result.cutscene).toBe("Flagpole");

        // Slide: climbing the pole, then lower down it
        const at = (step: number) => result.trace[step].p!;
        expect(at(47).cls).toContain("climbing");
        expect(at(100).t).toBeGreaterThan(at(47).t);
        expect(at(100).l).toBe(at(47).l);
        // Walk: off the pole and to the castle door, where Mario stops
        expect(at(200).l).toBeGreaterThan(at(100).l);
        expect(at(300).l).toBeCloseTo(683.967, 2);
        expect(at(1099).l).toBeCloseTo(683.967, 2);
        // Countdown: time runs out and every second turns into 50 points
        expect(at(300).items[3]).toBeLessThan(399);
        expect(at(600).items[3]).toBeLessThan(at(300).items[3]);
        expect(at(1099).items[3]).toBe(0);
        expect(at(1099).items[0]).toBeGreaterThanOrEqual(20000);
        expect(at(1099).items[0]).toBe(20350);

        // The level is left for 1-2 when the Stage Clear sound ends, which takes real time
        await page.waitForFunction(() => (window as any).FSM.AreaSpawner.getMapName() === "1-2", undefined, { timeout: 30_000 });
        const next = await page.evaluate(() => ({
            map: (window as any).FSM.AreaSpawner.getMapName() as string,
            score: (window as any).FSM.ItemsHolder.getItem("score") as number,
        }));
        expect(next.map).toBe("1-2");
        expect(next.score).toBeGreaterThanOrEqual(20000);
        expect(errors).toEqual([]);
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
