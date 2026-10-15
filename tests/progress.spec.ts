import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

/**
 * Saved progress: the top score and the "continue" offer on the 1-1 title card.
 * The values live in localStorage under the game's prefix (see settings/items.js).
 */
const topKey = "WeFixItMariotopScore";
const levelKey = "WeFixItMariolastLevel";

/** Opens the game with these localStorage entries already in place (nothing is written without them). */
async function bootWith(page: Page, stored: Record<string, string> = {}): Promise<void> {
    if (Object.keys(stored).length > 0) {
        // The origin's storage can only be reached once a page of it is open.
        await page.goto("/");
        await page.evaluate((entries) => {
            for (const [key, value] of Object.entries(entries)) {
                localStorage.setItem(key, value);
            }
        }, stored);
    }

    await bootGame(page);
}

/** The lines of text on the screen, as the pixel font letters spell them (top to bottom). */
const titleLines = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
        const game = (window as any).FSM;
        const characters: Record<string, string> = {};
        for (const [character, name] of Object.entries(game.customTextMappings as Record<string, string>)) {
            characters["Text" + name] = character;
        }

        const rows = new Map<number, { left: number; character: string }[]>();
        for (const thing of game.GroupHolder.getGroup("Text")) {
            const character = characters[thing.title] ?? (/^Text(.)$/.test(thing.title) ? thing.title[4] : undefined);
            if (character === undefined || !thing.alive) {
                continue;
            }
            rows.set(thing.top, [...(rows.get(thing.top) ?? []), { left: thing.left, character }]);
        }

        return [...rows.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, row]) =>
                row
                    .sort((a, b) => a.left - b.left)
                    .map((letter) => letter.character)
                    .join("")
            );
    });

/** What the game believes right now. */
const readState = (page: Page) =>
    page.evaluate(() => {
        const game = (window as any).FSM;
        const items = game.ItemsHolder;
        return {
            map: game.AreaSpawner.getMapName() as string,
            world: items.getItem("world") as string,
            lives: items.getItem("lives") as number,
            score: items.getItem("score") as number,
            coins: items.getItem("coins") as number,
            offer: game.continueOffer as string | undefined,
            top: game.getTopScore() as number,
            level: game.getLastLevel() as string | undefined,
            crouching: !!game.player.keys.crouch,
            alive: !!game.player && !game.player.dead
        };
    });

const stored = (page: Page, key: string): Promise<string | null> =>
    page.evaluate((name) => localStorage.getItem(name), key);

/** Adds points the way the game does, which is what raises the top score. */
const gainPoints = (page: Page, points: number): Promise<void> =>
    page.evaluate((amount) => (window as any).FSM.ItemsHolder.increase("score", amount), points);

const hasContinueLine = (lines: string[]): boolean => lines.some((line) => line.startsWith("CONTINUE"));

test.describe("top score", () => {
    test("is zero on a first visit, and shows on the title card as TOP- 000000", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page);

        expect(await titleLines(page)).toContain("TOP- 000000");
        expect((await readState(page)).top).toBe(0);
        expect(errors).toEqual([]);
    });

    test("is saved as soon as the score passes it, survives reloads, and only ever goes up", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page);
        await gainPoints(page, 1234);

        // Saved at once, so closing the tab in the middle of a level loses nothing.
        expect(await stored(page, topKey)).toBe("1234");

        await bootGame(page);
        expect(await titleLines(page)).toContain("TOP- 001234");
        expect((await readState(page)).score).toBe(0);

        // A lower score leaves the record alone; a higher one replaces it.
        await gainPoints(page, 500);
        expect(await stored(page, topKey)).toBe("1234");
        await gainPoints(page, 1000);
        expect(await stored(page, topKey)).toBe("1500");

        await bootGame(page);
        expect(await titleLines(page)).toContain("TOP- 001500");
        expect(errors).toEqual([]);
    });

    test("keeps counting when the score passes 100000 and starts over (which earns a life)", async ({ page }) => {
        await bootWith(page);
        await gainPoints(page, 99950);
        await gainPoints(page, 100);

        const state = await readState(page);
        expect(state.score).toBe(50);
        expect(state.lives).toBe(4);
        expect(state.top).toBe(100050);
        expect(await stored(page, topKey)).toBe("100050");

        await bootGame(page);
        expect(await titleLines(page)).toContain("TOP- 100050");
    });

    test("shows on the title card again after a game over", async ({ page }) => {
        await bootWith(page);
        await page.evaluate(() => {
            const game = (window as any).FSM;
            game.GamesRunner.setSpeed(5);
            game.ItemsHolder.setItem("lives", 1);
            game.ItemsHolder.increase("score", 4200);
            game.killPlayer(game.player, 2);
        });

        // The game over screen is shown for a while, then the game starts again with 3 lives.
        await page.waitForFunction(() => (window as any).FSM.ItemsHolder.getItem("lives") === 3, undefined, {
            timeout: 30_000
        });

        expect(await titleLines(page)).toContain("TOP- 004200");
    });
});

test.describe("continue", () => {
    test("is offered only when a level beyond 1-1 was saved", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page);
        expect(hasContinueLine(await titleLines(page))).toBe(false);
        expect((await readState(page)).offer).toBeUndefined();

        await bootWith(page, { [levelKey]: JSON.stringify("1-1") });
        expect(hasContinueLine(await titleLines(page))).toBe(false);
        expect((await readState(page)).offer).toBeUndefined();

        await bootWith(page, { [levelKey]: JSON.stringify("4-2") });
        expect(await titleLines(page)).toContain("CONTINUE 4-2: PRESS DOWN");
        expect((await readState(page)).offer).toBe("4-2");

        await bootWith(page, { [levelKey]: JSON.stringify("8-4") });
        expect(await titleLines(page)).toContain("CONTINUE 8-4: PRESS DOWN");
        expect(errors).toEqual([]);
    });

    for (const key of ["s", "ArrowDown"]) {
        test(`pressing ${key} during the offer starts the saved level as a fresh game`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            await bootWith(page, { [levelKey]: JSON.stringify("4-2"), [topKey]: "777" });
            await page.evaluate(() => {
                const items = (window as any).FSM.ItemsHolder;
                items.setItem("lives", 1);
                items.setItem("score", 500);
                items.setItem("coins", 7);
            });

            await page.keyboard.press(key);

            expect(await readState(page)).toMatchObject({
                map: "4-2",
                world: "4-2",
                lives: 3,
                score: 0,
                coins: 0,
                offer: undefined,
                top: 777,
                level: "4-2",
                alive: true
            });
            expect(hasContinueLine(await titleLines(page))).toBe(false);
            expect(errors).toEqual([]);
        });
    }

    test("a gamepad's down (the same down trigger) starts it too", async ({ page }) => {
        await bootWith(page, { [levelKey]: JSON.stringify("6-3") });

        await page.evaluate(() => (window as any).FSM.InputWriter.callEvent("onkeydown", "down"));

        expect(await readState(page)).toMatchObject({ map: "6-3", lives: 3, score: 0, offer: undefined });
    });

    test("comes back on the title card after a game over, and works from there", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page);
        // Starting a level (here as the Maps menu does) is what gets remembered.
        await page.evaluate(() => {
            const game = (window as any).FSM;
            game.setMap("3-2");
            game.GamesRunner.setSpeed(5);
            game.ItemsHolder.setItem("lives", 1);
            game.killPlayer(game.player, 2);
        });

        await page.waitForFunction(() => (window as any).FSM.continueOffer === "3-2", undefined, { timeout: 30_000 });
        expect(await titleLines(page)).toContain("CONTINUE 3-2: PRESS DOWN");

        await page.keyboard.press("s");
        expect(await readState(page)).toMatchObject({ map: "3-2", lives: 3, score: 0, offer: undefined });
        expect(errors).toEqual([]);
    });

    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "d", "w"]) {
        test(`the offer ends as soon as the player presses ${key}`, async ({ page }) => {
            await bootWith(page, { [levelKey]: JSON.stringify("4-2") });
            expect((await readState(page)).offer).toBe("4-2");

            await page.keyboard.down(key);
            await page.waitForTimeout(100);
            await page.keyboard.up(key);

            expect((await readState(page)).offer).toBeUndefined();
            expect(hasContinueLine(await titleLines(page))).toBe(false);
            // The rest of the title card stays.
            expect((await titleLines(page)).some((line) => line.startsWith("TOP-"))).toBe(true);

            // Down is an ordinary key again: it crouches, and does not start 4-2.
            await page.keyboard.down("s");
            const state = await readState(page);
            await page.keyboard.up("s");
            expect(state).toMatchObject({ map: "1-1", crouching: true });
        });
    }

    test("moving closes the offer but keeps the saved level for next time", async ({ page }) => {
        await bootWith(page, { [levelKey]: JSON.stringify("4-2") });

        await page.keyboard.down("ArrowRight");
        await page.waitForTimeout(100);
        await page.keyboard.up("ArrowRight");

        expect((await readState(page)).offer).toBeUndefined();
        expect(hasContinueLine(await titleLines(page))).toBe(false);
        expect(await stored(page, levelKey)).toBe(JSON.stringify("4-2"));

        await bootGame(page);
        expect((await readState(page)).offer).toBe("4-2");
        expect(hasContinueLine(await titleLines(page))).toBe(true);
    });

    test("the offer ends when 1-1 is left, and down is then an ordinary key", async ({ page }) => {
        await bootWith(page, { [levelKey]: JSON.stringify("4-2") });

        await page.evaluate(() => (window as any).FSM.setMap("2-1"));
        expect((await readState(page)).offer).toBeUndefined();

        await page.keyboard.down("s");
        const state = await readState(page);
        await page.keyboard.up("s");
        expect(state).toMatchObject({ map: "2-1", crouching: true });
        expect(state.lives).toBe(3);
    });

    test("starting 1-1 from the menu closes the offer and keeps the saved level", async ({ page }) => {
        await bootWith(page, { [levelKey]: JSON.stringify("4-2") });

        await page.evaluate(() => (window as any).FSM.setMap("1-1"));

        expect(await readState(page)).toMatchObject({ offer: undefined, level: "4-2" });
        expect(hasContinueLine(await titleLines(page))).toBe(false);
    });

    test("down crouches as usual when there is no offer", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page);
        await page.keyboard.down("s");
        expect(await readState(page)).toMatchObject({ map: "1-1", crouching: true, lives: 3, offer: undefined });
        await page.keyboard.up("s");
        expect((await readState(page)).crouching).toBe(false);
        expect(errors).toEqual([]);
    });

    test("the Maps menu still starts any level, and the choice is remembered", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page, { [levelKey]: JSON.stringify("2-1") });
        expect((await readState(page)).offer).toBe("2-1");

        // The menu only reacts once the mouse has been over the level for a moment.
        const level = page.locator("#control-Maps .maps-grid-option", { hasText: /^5-3$/ });
        await level.hover();
        await expect(page.locator("#control-Maps")).toHaveAttribute("active", "on");
        await level.click();
        expect(await readState(page)).toMatchObject({ map: "5-3", offer: undefined, level: "5-3" });
        expect(await stored(page, levelKey)).toBe(JSON.stringify("5-3"));

        await bootGame(page);
        expect(await titleLines(page)).toContain("CONTINUE 5-3: PRESS DOWN");
        expect(errors).toEqual([]);
    });

    test("the random map is not remembered", async ({ page }) => {
        await bootWith(page, { [levelKey]: JSON.stringify("2-1") });

        await page.evaluate(() => (window as any).FSM.setMap("Random"));

        expect((await readState(page)).level).toBe("2-1");
        expect(await stored(page, levelKey)).toBe(JSON.stringify("2-1"));
    });
});

test.describe("reset", () => {
    test("the Reset Progress option forgets the top score and the saved level, after asking", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page, { [levelKey]: JSON.stringify("4-2"), [topKey]: "5000" });
        const reset = page.locator("#control-Options .options-button-option", { hasText: "Reset Progress" });

        // Saying no changes nothing.
        page.once("dialog", (dialog) => void dialog.dismiss());
        await reset.click();
        expect(await readState(page)).toMatchObject({ top: 5000, level: "4-2", offer: "4-2" });

        page.once("dialog", (dialog) => void dialog.accept());
        await reset.click();
        expect(await readState(page)).toMatchObject({ top: 0, level: undefined, offer: undefined });
        expect(hasContinueLine(await titleLines(page))).toBe(false);

        await bootGame(page);
        expect(await titleLines(page)).toContain("TOP- 000000");
        expect(hasContinueLine(await titleLines(page))).toBe(false);
        expect(errors).toEqual([]);
    });
});

test.describe("stored values that are not valid", () => {
    // Text an older version or a person could have left behind: not JSON, wrong type, out of range.
    const badScores = ["abc", "-50", JSON.stringify("1234"), "1e99", "12.5", "null", "{}", "[1]", "true", "NaN", ""];
    const badLevels = [
        JSON.stringify("9-9"),
        JSON.stringify("Random"),
        JSON.stringify("1-1 "),
        JSON.stringify("0-1"),
        "4-2",
        "garbage{",
        "42",
        "null",
        "[]",
        ""
    ];

    for (const score of badScores) {
        test(`a stored top score of ${JSON.stringify(score)} is ignored`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            // A good level next to it still counts.
            await bootWith(page, { [topKey]: score, [levelKey]: JSON.stringify("4-2") });
            expect(await titleLines(page)).toContain("TOP- 000000");
            expect(await titleLines(page)).toContain("CONTINUE 4-2: PRESS DOWN");
            expect((await readState(page)).top).toBe(0);

            // The game plays on, and the next record replaces the bad value.
            await gainPoints(page, 300);
            expect(await stored(page, topKey)).toBe("300");
            expect(errors).toEqual([]);
        });
    }

    for (const level of badLevels) {
        test(`a stored level of ${JSON.stringify(level)} is ignored`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            // A good top score next to it still counts.
            await bootWith(page, { [levelKey]: level, [topKey]: "4321" });
            const lines = await titleLines(page);
            expect(lines).toContain("TOP- 004321");
            expect(hasContinueLine(lines)).toBe(false);
            expect(await readState(page)).toMatchObject({ offer: undefined, level: undefined, top: 4321 });

            // Down is an ordinary key: it crouches rather than starting anything.
            await page.keyboard.down("s");
            expect(await readState(page)).toMatchObject({ map: "1-1", crouching: true });
            expect(errors).toEqual([]);
        });
    }

    test("a score kept as a plain number is read", async ({ page }) => {
        await bootWith(page, { [topKey]: "12345" });

        expect(await titleLines(page)).toContain("TOP- 012345");
    });
});

test.describe("storage that fails", () => {
    const stubs: Record<string, string> = {
        "localStorage that throws when it is reached (blocked site data)": `
            Object.defineProperty(window, "localStorage", {
                configurable: true,
                get() {
                    throw new DOMException("The operation is insecure.", "SecurityError");
                }
            });`,
        "localStorage whose every method throws": `
            const fail = () => {
                throw new Error("storage is broken");
            };
            Object.defineProperty(window, "localStorage", {
                configurable: true,
                value: { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 }
            });`,
        "localStorage that is full": `
            Storage.prototype.setItem = function () {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            };`
    };

    for (const [name, stub] of Object.entries(stubs)) {
        test(`${name} does not break boot or play`, async ({ page }) => {
            const { errors } = collectPageErrors(page);
            await page.addInitScript(stub);

            await bootGame(page);
            expect(await titleLines(page)).toContain("TOP- 000000");

            // The top score still works for as long as the page is open.
            await gainPoints(page, 800);
            expect((await readState(page)).top).toBe(800);

            // Playing: moving, taking a level from the menu, dying, crouching.
            await page.keyboard.down("ArrowRight");
            await page.waitForTimeout(300);
            await page.keyboard.up("ArrowRight");
            await page.evaluate(() => (window as any).FSM.setMap("3-1"));
            expect(await readState(page)).toMatchObject({ map: "3-1", level: "3-1", top: 800 });
            await page.keyboard.down("s");
            expect((await readState(page)).crouching).toBe(true);
            await page.keyboard.up("s");
            await page.evaluate(() => {
                const game = (window as any).FSM;
                game.killPlayer(game.player, 2);
            });
            await page.waitForTimeout(500);

            // The options still save (they go through the same storage code).
            await page.evaluate(() => (window as any).FSM.resetProgress());
            expect((await readState(page)).top).toBe(0);
            expect(errors).toEqual([]);
        });
    }
});

test.describe("touch controls", () => {
    // A phone held sideways. hasTouch makes the primary pointer coarse, as on a real phone.
    test.use({ viewport: { width: 664, height: 390 }, hasTouch: true });

    test("the offer says TAP DOWN, and the D-pad's down button starts the level", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootWith(page, { [levelKey]: JSON.stringify("4-2"), [topKey]: "12345" });

        const lines = await titleLines(page);
        expect(lines).toContain("TOP- 012345");
        expect(lines).toContain("CONTINUE 4-2: TAP DOWN");
        expect(lines.join("\n")).not.toContain("PRESS");

        const box = await page.locator('[data-touch-control="DPad"] [data-direction="down"]').first().boundingBox();
        expect(box, "the D-pad is on screen").not.toBeNull();
        await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

        expect(await readState(page)).toMatchObject({ map: "4-2", lives: 3, score: 0, offer: undefined });
        expect(errors).toEqual([]);
    });

    test("without a saved level there is only the top score", async ({ page }) => {
        await bootWith(page, { [topKey]: "99" });

        const lines = await titleLines(page);
        expect(lines).toContain("TOP- 000099");
        expect(hasContinueLine(lines)).toBe(false);
    });
});
