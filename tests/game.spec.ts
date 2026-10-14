import { devices, expect, test } from "@playwright/test";

import { bootGame, collectPageErrors, mapNames } from "./helpers";

test.describe("boot", () => {
    test("boots without page errors and exposes window.FSM and a canvas", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);

        await expect(page.locator("canvas").first()).toBeVisible();
        expect(await page.evaluate(() => typeof (window as any).FSM)).toBe("object");

        // Let the game loop run for a moment to catch errors thrown by early frames.
        await page.waitForTimeout(1000);
        expect(errors).toEqual([]);
    });

    test("every mod can be enabled and disabled", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        const modNames: string[] = await page.evaluate(() =>
            (window as any).FSM.settings.mods.mods.map((mod: { name: string }) => mod.name)
        );
        expect(modNames.length).toBeGreaterThan(5);

        for (const name of modNames) {
            await page.evaluate((modName) => (window as any).FSM.ModAttacher.enableMod(modName), name);
            await page.waitForTimeout(50);
            await page.evaluate((modName) => (window as any).FSM.ModAttacher.disableMod(modName), name);
        }

        await page.waitForTimeout(300);
        expect(errors).toEqual([]);
    });
});

test.describe("maps", () => {
    for (const mapName of mapNames) {
        test(`loads ${mapName} with the player alive`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            await bootGame(page);
            await page.evaluate((name) => (window as any).FSM.setMap(name), mapName);
            await page.waitForTimeout(1200);

            const player = await page.evaluate(() => {
                const p = (window as any).FSM.player;
                return { exists: !!p, dead: !!(p && p.dead) };
            });

            expect(player).toEqual({ exists: true, dead: false });
            expect(errors).toEqual([]);

            // Ported from the old mocha suite: every location of the map must load too.
            const locations: string[] = await page.evaluate(
                (name) => Object.keys((window as any).FSM.settings.maps.library[name].locations),
                mapName
            );
            for (const location of locations) {
                await page.evaluate(([name, loc]) => (window as any).FSM.setMap(name, loc), [mapName, location]);
                await page.waitForTimeout(100);
            }

            expect(await page.evaluate(() => !!(window as any).FSM.player)).toBe(true);
            expect(errors).toEqual([]);
        });
    }
});

test.describe("screen sizes", () => {
    // Ported from the old mocha suite, which constructed the game at these sizes.
    for (const [width, height] of [
        [512, 464],
        [2048, 1152],
        [320, 288]
    ]) {
        test(`boots at ${width}x${height}`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            await page.setViewportSize({ width, height });
            await bootGame(page);
            await page.waitForTimeout(500);

            expect(errors).toEqual([]);
        });
    }
});

test.describe("level editor", () => {
    test("formats exported levels as readable text that can be imported again", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);

        const exported: string = await page.evaluate(() => {
            const editor = (window as any).FSM.LevelEditor;
            editor.enable();
            return (document.querySelector(".EditorJSONInput") as HTMLTextAreaElement).value;
        });

        // Readable: indented over several lines, and plain JSON.
        expect(exported.split("\n").length).toBeGreaterThan(5);
        expect(exported).toContain('\n    "');
        const level = JSON.parse(exported);
        expect(Object.keys(level).length).toBeGreaterThan(0);

        // Compact text from a hand-written or pasted level is formatted the same way,
        // and text that is not valid JSON yet is left alone for the user to finish.
        const formatted: string = await page.evaluate(
            (json) => (window as any).FSM.LevelEditor.beautify(json),
            JSON.stringify(level)
        );
        expect(formatted).toBe(exported);
        expect(JSON.parse(formatted)).toEqual(level);
        expect(await page.evaluate(() => (window as any).FSM.LevelEditor.beautify('{"a": 1,'))).toBe('{"a": 1,');

        // Importing compact text puts the readable form back in the editor without errors.
        const reimported = await page.evaluate((json) => {
            const editor = (window as any).FSM.LevelEditor;
            editor.setCurrentJSON(json);
            return {
                text: (document.querySelector(".EditorJSONInput") as HTMLTextAreaElement).value,
                message: (document.querySelector(".EditorJSONInfo") as HTMLElement).textContent
            };
        }, JSON.stringify(level));

        expect(reimported.message).toBe("");
        expect(reimported.text).toBe(exported);
        expect(errors).toEqual([]);
    });
});

test.describe("gameplay", () => {
    // A narrow window makes the screen start scrolling after about 400px, which Mario reaches
    // (deterministically) before the first goomba of world 1-1 gets to him.
    test.use({ viewport: { width: 800, height: 600 } });

    test("holding right (with jumps) moves the player and scrolls the screen", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.waitForTimeout(500);

        const readState = () =>
            page.evaluate(() => {
                const fsm = (window as any).FSM;
                return { x: fsm.player.left as number, scroll: fsm.MapScreener.left as number };
            });
        const before = await readState();

        // The click is the user gesture browsers want before the game receives key input.
        await page.locator("canvas").first().click();
        await page.keyboard.down("ArrowRight");
        for (let i = 0; i < 8; i += 1) {
            await page.waitForTimeout(300);
            await page.keyboard.down("ArrowUp");
            await page.waitForTimeout(200);
            await page.keyboard.up("ArrowUp");
        }
        await page.keyboard.up("ArrowRight");

        const after = await readState();
        expect(after.x).toBeGreaterThan(before.x);
        expect(after.scroll).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });
});

test.describe("phone", () => {
    // Playwright forbids changing the browser type from inside a project, so only keep the emulation.
    const { defaultBrowserType: _ignored, ...iPhone } = devices["iPhone 13"];
    test.use(iPhone);

    test("boots on an iPhone 13 viewport without page errors", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await expect(page.locator("canvas").first()).toBeVisible();
        await page.waitForTimeout(1000);

        expect(errors).toEqual([]);
    });
});
