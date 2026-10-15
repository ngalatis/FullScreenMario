import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "../helpers";

/**
 * Review repros: the level editor and the map generator are fetched the first time they
 * are used. What happens when that fetch is slow (the game is rebuilt meanwhile) or fails.
 */

const generatorChunk = /assets\/map-generator-[^/]*\.js$/;
const editorChunk = /assets\/level-editor-[^/]*\.js$/;

// The service worker would answer the chunk requests itself, around page.route
test.use({ serviceWorkers: "block" });

/** Holds every request for a chunk until release() is called. */
async function holdChunk(page: Page, chunk: RegExp): Promise<() => void> {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });

    await page.route(chunk, async (route) => {
        await held;
        await route.continue();
    });

    return release;
}

const clickMapGenerator = (page: Page) =>
    page.locator("#control-Maps .maps-grid-option-extra", { hasText: "Map Generator!" }).dispatchEvent("click");

const clickStartEditor = (page: Page) =>
    page.locator("#control-Editor .select-options-level-editor > .select-option").first().dispatchEvent("click");

test.describe("a game rebuilt while the map generator is still downloading", () => {
    test("the old game stays stopped once the generator arrives", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const release = await holdChunk(page, generatorChunk);

        await bootGame(page);
        await page.evaluate(() => {
            const w = window as any;
            w.oldGame = w.FSM;
            w.FSM.setMap("Random");
        });

        // A View Mode change builds a new game and stops the old one for good
        await page.evaluate(() => (window as any).FSM.UserWrapper.setCurrentSize("NES"));
        await page.waitForFunction(() => {
            const w = window as any;
            return w.FSM !== w.oldGame && !!w.FSM.player && !!w.FSM.player.resting;
        });
        expect(await page.evaluate(() => (window as any).oldGame.GamesRunner.getPaused())).toBe(true);

        release();
        await page.waitForFunction(() => !!(window as any).oldGame.WorldSeeder);
        await page.waitForTimeout(500);

        const state = await page.evaluate(() => {
            const w = window as any;
            return {
                oldPaused: w.oldGame.GamesRunner.getPaused() as boolean,
                oldMap: w.oldGame.AreaSpawner.getMapName() as string,
                newMap: w.FSM.AreaSpawner.getMapName() as string,
                newPaused: w.FSM.GamesRunner.getPaused() as boolean
            };
        });

        expect(errors).toEqual([]);
        // The replaced game must not come back to life in the background
        expect(state.oldPaused).toBe(true);
        expect(state.oldMap).not.toBe("Random");
        expect(state.newPaused).toBe(false);
    });
});

test.describe("a chunk that cannot be downloaded", () => {
    test("the Map Generator button fails quietly and works once the network is back", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.route(generatorChunk, (route) => route.abort("failed"));
        await bootGame(page);

        await clickMapGenerator(page);
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => (window as any).FSM.AreaSpawner.getMapName())).toBe("1-1");
        // A failed download is not an uncaught error
        expect(errors).toEqual([]);

        await page.unroute(generatorChunk);
        await clickMapGenerator(page);
        await page.waitForFunction(
            () => (window as any).FSM.AreaSpawner.getMapName() === "Random" && !!(window as any).FSM.player
        );
        expect(errors).toEqual([]);
    });

    test("the Level Editor button fails quietly and works once the network is back", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.route(editorChunk, (route) => route.abort("failed"));
        await bootGame(page);

        await clickStartEditor(page);
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => !!(window as any).FSM.LevelEditor)).toBe(false);
        expect(errors).toEqual([]);

        await page.unroute(editorChunk);
        await clickStartEditor(page);
        await page.waitForFunction(
            () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
        );
        expect(errors).toEqual([]);
    });
});
