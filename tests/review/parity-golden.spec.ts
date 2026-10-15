import { expect, test } from "@playwright/test";

import { collectPageErrors } from "../helpers";
import { hold, jumps, runScenario, type Scenario } from "./parityHarness";

/**
 * Gameplay parity with the original FullScreenMario 0.10.3.
 *
 * Each scenario below was run with the same driver against the original build;
 * the asserted numbers are the original's results (player position, velocity,
 * items). Physics, enemies, items, pipes, warps, death/respawn, swimming, star
 * power, Lakitu and the random map generator all produced byte-identical traces.
 */
interface Golden {
    name: string;
    scenario: Scenario;
    /** Expected values from the original at the final step: [left, top, xvel, yvel, map, score, coins, lives]. */
    final: [number, number, number, number, string, number, number, number];
    /** An intermediate checkpoint from the original: [step, left, top, xvel]. */
    checkpoint?: [number, number, number, number];
}

const goldens: Golden[] = [
    {
        name: "1-1 run, jump and stomp",
        scenario: {
            map: "1-1",
            location: 0,
            steps: 700,
            segments: [hold(["right", "sprint"], 0, 700), ...jumps([40, 120, 200, 260, 330, 400, 470, 540, 610])]
        },
        final: [64, 384, 0, 0, "1-1", 0, 0, 2],
        checkpoint: [15, 84.955, 384, 2.643]
    },
    {
        name: "1-1 mushroom and fire flower",
        scenario: {
            map: "1-1",
            location: 0,
            steps: 400,
            segments: [hold(["right"], 0, 400)],
            actions: [
                { at: 3, do: "addRel", args: ["Mushroom", 200, -60] },
                { at: 150, do: "addRel", args: ["FireFlower", 120, -60] }
            ]
        },
        final: [566, 384, 0.095, 0, "1-1", 2000, 0, 3]
    },
    {
        name: "1-2 pipe entry",
        scenario: {
            map: "1-2",
            location: 1,
            steps: 400,
            segments: [hold(["down"], 10, 40)],
            actions: [{ at: 1, do: "teleport", args: [3212, 320] }]
        },
        final: [64, 384, 0, 0, "1-2", 0, 0, 3],
        checkpoint: [40, 300, 319, 0]
    },
    {
        name: "2-2 swimming",
        scenario: {
            map: "2-2",
            location: 1,
            steps: 500,
            segments: [
                hold(["right"], 0, 500),
                ...jumps([10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340, 370, 400], 3)
            ]
        },
        final: [568.16, -619.269, 4.767, 8, "2-2", 0, 0, 3]
    },
    {
        name: "1-1 star power",
        scenario: {
            map: "1-1",
            location: 0,
            steps: 650,
            segments: [hold(["right", "sprint"], 0, 650), ...jumps([60, 150, 250])],
            actions: [{ at: 5, do: "star" }]
        },
        final: [568, 384, 0.191, 0, "1-1", 300, 1, 3]
    },
    {
        name: "4-1 Lakitu with star",
        scenario: {
            map: "4-1",
            location: 0,
            steps: 1500,
            segments: [
                hold(["right", "sprint"], 0, 1500),
                ...jumps([
                    40, 120, 200, 280, 360, 440, 520, 600, 680, 760, 840, 920, 1000, 1080, 1160, 1240, 1320, 1400
                ])
            ],
            actions: [
                { at: 1, do: "star" },
                { at: 400, do: "star" },
                { at: 800, do: "star" },
                { at: 1200, do: "star" }
            ]
        },
        final: [64, 384, 0, 0, "4-1", 600, 0, 2]
    },
    {
        name: "random overworld, seed 777",
        scenario: {
            map: "Random",
            location: "Overworld",
            seed: 777,
            steps: 500,
            segments: [hold(["right", "sprint"], 0, 500), ...jumps([40, 120, 200, 280, 360, 440])]
        },
        final: [64, 550.171, 0, 8, "Random", 200, 0, 1]
    },
    {
        name: "game over and restart",
        scenario: {
            map: "1-1",
            location: 0,
            steps: 900,
            segments: [hold(["right"], 0, 900)],
            actions: [
                { at: 2, do: "eval", args: ["FSM.ItemsHolder.setItem('lives', 1)"] },
                { at: 5, do: "kill" }
            ]
        },
        final: [64, 384, 0, 0, "1-1", 0, 0, 3]
    }
];

test.describe("golden traces from the original", () => {
    for (const golden of goldens) {
        test(golden.name, async ({ page }) => {
            const { errors } = collectPageErrors(page);
            const result = await runScenario(page, golden.scenario);

            expect(result.errors).toEqual([]);
            expect(errors).toEqual([]);
            expect(result.trace.length).toBe(golden.scenario.steps);

            const f = result.final!;
            expect([f.l, f.t, f.xv, f.yv, f.map, f.items[0], f.items[1], f.items[2]]).toEqual(golden.final);

            if (golden.checkpoint) {
                const [step, l, t, xv] = golden.checkpoint;
                const p = result.trace[step].p!;
                expect([p.l, p.t, p.xv]).toEqual([l, t, xv]);
            }
        });
    }

    test("the same scenario produces the same trace twice", async ({ browser }) => {
        const scenario = goldens[0].scenario;
        const a = await runScenario(await browser.newPage(), scenario);
        const b = await runScenario(await browser.newPage(), scenario);

        expect(JSON.stringify(a.trace)).toEqual(JSON.stringify(b.trace));
    });
});
