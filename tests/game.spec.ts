import { devices, expect, test, type Page } from "@playwright/test";

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
        // The level editor is a separate chunk, fetched the first time it is needed.
        await page.evaluate(() => (window as any).FSM.loadLevelEditor());

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

test.describe("rarely used parts load on first use", () => {
    const lazyChunk = /assets\/(level-editor|map-generator)-[^/]*\.js$/;

    /**
     * Lists the lazy chunks the page has downloaded so far, each once: a chunk is fetched to check that it
     * arrives and then imported, normally from the cache (see fetchLazyChunk in GameStartr).
     */
    function trackLazyChunks(page: Page): string[] {
        const fetched: string[] = [];

        page.on("request", (request) => {
            const match = lazyChunk.exec(new URL(request.url()).pathname);

            if (match && !fetched.includes(match[1])) {
                fetched.push(match[1]);
            }
        });

        return fetched;
    }

    /** The solid Things on screen, by title and position in the map: what a random map is made of. */
    const solids = (page: Page) =>
        page.evaluate(() => {
            const fsm = (window as any).FSM;
            return fsm.GroupHolder.getGroup("Solid")
                .map((thing: any) => thing.title + "@" + Math.round(thing.left + fsm.MapScreener.left))
                .sort() as string[];
        });

    test("the game boots without the level editor and the map generator", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const fetched = trackLazyChunks(page);

        await bootGame(page);
        await page.waitForTimeout(1000);

        expect(fetched).toEqual([]);
        expect(
            await page.evaluate(() => {
                const fsm = (window as any).FSM;
                return {
                    editor: !!fsm.LevelEditor,
                    generator: !!fsm.WorldSeeder,
                    randomMap: "Random" in fsm.settings.maps.library
                };
            })
        ).toEqual({ editor: false, generator: false, randomMap: false });
        expect(errors).toEqual([]);
    });

    test("the Editor menu fetches the level editor, starts it and edits a built-in map", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const fetched = trackLazyChunks(page);

        await bootGame(page);
        await page
            .locator("#control-Editor .select-options-level-editor > .select-option")
            .first()
            .dispatchEvent("click");
        await page.waitForFunction(
            () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
        );
        expect(fetched).toEqual(["level-editor"]);

        // Editing a built-in map (on a fresh page) fetches the editor and loads the map into it
        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        fetched.length = 0;
        // The map buttons only answer while their menu is open (hovered)
        await page.locator("#control-Editor").dispatchEvent("mouseover");
        await expect(page.locator("#control-Editor")).toHaveAttribute("active", "on");
        await page
            .locator("#control-Editor .select-options-editor-maps-holder .maps-grid-option-range", { hasText: "1-2" })
            .dispatchEvent("click");
        await page.waitForFunction(
            () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
        );
        const edited = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            // (The editor flags the areas it builds with "editor": true)
            const withoutFlags = (json: string): unknown =>
                JSON.parse(json, (key: string, value: unknown) => (key === "editor" ? undefined : value));
            return {
                text: withoutFlags((document.querySelector(".EditorJSONInput") as HTMLTextAreaElement).value),
                map: withoutFlags(JSON.stringify(fsm.MapsCreator.getMapRaw("1-2")))
            };
        });
        expect(edited.text).toEqual(edited.map);
        expect(fetched).toEqual(["level-editor"]);
        expect(errors).toEqual([]);
    });

    test("the Map Generator fetches the generator and builds the same map from the same seed", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const fetched = trackLazyChunks(page);

        await bootGame(page);
        const seed = page.locator("#control-Maps .randomInput");
        await seed.evaluate((input: HTMLInputElement) => {
            input.value = "777";
            input.setAttribute("custom", "true");
        });
        await page
            .locator("#control-Maps .maps-grid-option-extra", { hasText: "Map Generator!" })
            .dispatchEvent("click");
        await page.waitForFunction(
            () => (window as any).FSM.AreaSpawner.getMapName() === "Random" && !!(window as any).FSM.player
        );
        expect(fetched).toEqual(["map-generator"]);
        const fromMenu = await solids(page);
        expect(fromMenu.length).toBeGreaterThan(5);

        // Now that the generator is in, the console cheat sets the map right away, from the same seed
        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.NumberMaker.resetFromSeed(777);
            fsm.setMap("Random");
        });
        expect(await solids(page)).toEqual(fromMenu);
        expect(fetched).toEqual(["map-generator"]);
        expect(errors).toEqual([]);
    });

    test("setMap('Random') from the console waits for the generator, unless another map is set meanwhile", async ({
        page
    }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        // Seeded first, as in the help menu's cheat: the seed still decides the map after the download
        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.NumberMaker.resetFromSeed(4321);
            fsm.setMap("Random", "Underworld");
            fsm.setMap("1-2");
        });
        await page.waitForFunction(() => !!(window as any).FSM.WorldSeeder);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => (window as any).FSM.AreaSpawner.getMapName())).toBe("1-2");

        await page.evaluate(() => (window as any).FSM.setMap("Random", "Underworld"));
        expect(
            await page.evaluate(() => [
                (window as any).FSM.AreaSpawner.getMapName(),
                (window as any).FSM.AreaSpawner.getAreaName()
            ])
        ).toEqual(["Random", "Underworld"]);
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
