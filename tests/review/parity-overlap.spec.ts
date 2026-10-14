import { expect, test } from "@playwright/test";

import { collectPageErrors } from "../helpers";
import { runScenario } from "./parityHarness";

/**
 * Review item 2a: setOverlapBoundaries (src/game/methods/lifecycle.ts) never
 * updates rightX/leftX inside its loop, so the midpoint is NaN and a character
 * overlapping two solids is always pushed left of the LAST overlap, which leaves
 * big Mario still embedded in the other solid. This matches the original 0.10.3
 * byte for byte (traces identical), so the test documents the behaviour and the
 * effect of the proposed fix (update rightX/leftX in the loop):
 *
 *   bricks at [44..76] and [76..108], Mario at [64..96] (centre 80, right of the midpoint 76)
 *   quirk: Mario ends at left=16 (right edge 48, 4px inside the left brick)
 *   fix:   Mario ends at left=108 (pushed out to the nearer, right side, clear of both)
 *
 * The second assertion therefore fails until the fix is applied.
 */
test.describe("two-solid overlap", () => {
    test("growing under two bricks pushes Mario clear of both", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        const result = await runScenario(page, {
            map: "1-1",
            location: 0,
            steps: 120,
            // two bricks one block above the floor, so big Mario (64px) spans them vertically
            actions: [
                { at: 2, do: "addRel", args: ["Brick", -20, -32] },
                { at: 2, do: "addRel", args: ["Brick", 12, -32] },
                { at: 5, do: "big" }
            ]
        });

        expect(result.errors).toEqual([]);
        expect(errors).toEqual([]);

        const f = result.final!;
        expect(f.pw).toBe(1); // power item is unchanged by playerGetsBig itself
        expect(f.t).toBe(352); // big Mario is standing on the floor

        // Fully outside both bricks horizontally (bricks span 44..108)
        const right = f.l + 32;
        const clear = right <= 44 || f.l >= 108;
        expect({ left: f.l, right, clear }).toEqual({ left: 108, right: 140, clear: true });
    });
});
