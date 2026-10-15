import { devices, expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

// Playwright forbids changing the browser type from inside a project, so only keep the emulation.
const { defaultBrowserType: _landscapeBrowser, ...iPhoneLandscape } = devices["iPhone 13 landscape"];
const { defaultBrowserType: _portraitBrowser, ...iPhonePortrait } = devices["iPhone 13"];

/** Where the middle of an element is on the page. */
async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} should be on the page`).not.toBeNull();
    return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Real touches, which Playwright's tap() cannot hold down: dispatched through the DevTools protocol. */
class Fingers {
    private constructor(private readonly cdp: CDPSession) {}

    static async attach(page: Page): Promise<Fingers> {
        return new Fingers(await page.context().newCDPSession(page));
    }

    private send(
        type: "touchStart" | "touchMove" | "touchEnd",
        touchPoints: { x: number; y: number; id: number }[]
    ): Promise<unknown> {
        return this.cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    }

    /** Puts these fingers on the screen (and keeps the ones already there). */
    down(...points: { x: number; y: number; id: number }[]): Promise<unknown> {
        return this.send("touchStart", points);
    }

    /** Slides fingers that are on the screen. Every finger still down must be listed. */
    move(...points: { x: number; y: number; id: number }[]): Promise<unknown> {
        return this.send("touchMove", points);
    }

    /** Lifts the listed fingers; with none listed, lifts every finger still down. */
    up(...lifted: { x: number; y: number; id: number }[]): Promise<unknown> {
        return this.send("touchEnd", lifted);
    }
}

const readPlayer = (page: Page) =>
    page.evaluate(() => {
        const player = (window as any).FSM.player;
        return {
            left: player.left as number,
            top: player.top as number,
            rightDown: !!player.keys.rightDown,
            leftDown: !!player.keys.leftDown,
            crouch: !!player.keys.crouch,
            up: !!player.keys.up
        };
    });

test.describe("iPhone 13, landscape", () => {
    test.use(iPhoneLandscape);

    test("has a viewport meta and a page that does not scroll sideways", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.waitForTimeout(500);

        const content = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(content).toContain("width=device-width");
        expect(content).toContain("initial-scale=1");
        expect(content).toContain("viewport-fit=cover");

        const scroll = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            innerWidth: window.innerWidth,
            // A phone must be laid out at device width, not as a shrunken 980px desktop page.
            layoutWidth: document.documentElement.clientWidth
        }));
        expect(scroll.layoutWidth).toBeLessThanOrEqual(scroll.innerWidth);
        expect(scroll.innerWidth).toBeLessThan(980);
        expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
        expect(scroll.bodyScrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
        expect(errors).toEqual([]);
    });

    test("the canvas fits the viewport and fills it", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(500);

        const { canvas, viewport } = await page.evaluate(() => {
            const rect = document.querySelector("canvas")!.getBoundingClientRect();
            return {
                canvas: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
                viewport: { width: window.innerWidth, height: window.innerHeight }
            };
        });

        expect(canvas.left).toBeGreaterThanOrEqual(-0.5);
        expect(canvas.top).toBeGreaterThanOrEqual(-0.5);
        expect(canvas.right).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(canvas.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
        // "Fills": at least one dimension is the whole viewport (the other may be letterboxed a little).
        expect(Math.max(canvas.right - canvas.left, canvas.bottom - canvas.top)).toBeGreaterThan(
            Math.min(viewport.width, viewport.height) * 0.95
        );
        expect(canvas.bottom - canvas.top).toBeGreaterThan(viewport.height * 0.9);
        // The touch controls have a gutter on each side of the picture, so it is not as wide as the screen.
        expect(canvas.right - canvas.left).toBeGreaterThan(viewport.width * 0.55);
    });

    test("shows no rotate overlay, and the touch controls are on, translucent and clear of the HUD", async ({
        page
    }) => {
        await bootGame(page);
        await page.waitForTimeout(500);

        await expect(page.locator("#rotate-overlay")).toBeHidden();
        await expect(page.locator(".touch-passer-container")).toBeVisible();

        const canvasBox = (await page.locator("canvas").first().boundingBox())!;
        const names = ["DPad", "A", "B", "Start"];
        const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};

        for (const name of names) {
            const inner = page.locator(`[data-touch-control="${name}"] > .control-inner`);
            await expect(inner).toBeVisible();
            boxes[name] = (await inner.boundingBox())!;
        }

        // D-pad on the left, jump and run on the right, Start between them.
        const middle = canvasBox.x + canvasBox.width / 2;
        expect(boxes.DPad.x + boxes.DPad.width).toBeLessThan(middle);
        expect(boxes.A.x).toBeGreaterThan(middle);
        expect(boxes.B.x).toBeGreaterThan(middle);
        expect(boxes.Start.x).toBeLessThan(middle);
        expect(boxes.Start.x + boxes.Start.width).toBeGreaterThan(middle);

        // Nothing reaches into the top half of the picture, where the HUD is.
        for (const name of names) {
            expect(boxes[name].y, `${name} should stay below the HUD`).toBeGreaterThan(
                canvasBox.y + canvasBox.height * 0.45
            );
            expect(boxes[name].y + boxes[name].height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 0.5);
        }

        const opacity = await page
            .locator('[data-touch-control="DPad"]')
            .evaluate((element) => Number(getComputedStyle(element).opacity));
        expect(opacity).toBeGreaterThan(0.2);
        expect(opacity).toBeLessThan(0.9);
    });

    test("holding the right touch control moves Mario right, and letting go stops him", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.waitForTimeout(500);

        const fingers = await Fingers.attach(page);
        const right = { ...(await centerOf(page, '[data-touch-control="DPad"] [data-direction="right"]')), id: 1 };
        const before = await readPlayer(page);

        await fingers.down(right);
        await page.waitForTimeout(700);
        const during = await readPlayer(page);
        expect(during.rightDown).toBe(true);
        expect(during.left).toBeGreaterThan(before.left);

        await fingers.up();
        await page.waitForTimeout(1500);
        const after = await readPlayer(page);
        expect(after.rightDown).toBe(false);

        await page.waitForTimeout(400);
        expect((await readPlayer(page)).left).toBe(after.left);
        expect(errors).toEqual([]);
    });

    test("sliding the thumb across the D-pad switches direction without lifting", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(500);

        const fingers = await Fingers.attach(page);
        const right = { ...(await centerOf(page, '[data-touch-control="DPad"] [data-direction="right"]')), id: 1 };
        const left = { ...(await centerOf(page, '[data-touch-control="DPad"] [data-direction="left"]')), id: 1 };

        await fingers.down(right);
        await page.waitForTimeout(200);
        expect(await readPlayer(page)).toMatchObject({ rightDown: true, leftDown: false });

        await fingers.move(left);
        await page.waitForTimeout(200);
        expect(await readPlayer(page)).toMatchObject({ rightDown: false, leftDown: true });

        await fingers.up();
        await page.waitForTimeout(200);
        expect(await readPlayer(page)).toMatchObject({ rightDown: false, leftDown: false });
    });

    test("two thumbs work at once: run right with the D-pad while jumping with A", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(500);

        const fingers = await Fingers.attach(page);
        const right = { ...(await centerOf(page, '[data-touch-control="DPad"] [data-direction="right"]')), id: 1 };
        const jump = { ...(await centerOf(page, '[data-touch-control="A"] > .control-inner')), id: 2 };
        const before = await readPlayer(page);

        await fingers.down(right);
        await page.waitForTimeout(150);
        await fingers.down(right, jump);

        let highest = before.top;
        for (let i = 0; i < 8; i += 1) {
            await page.waitForTimeout(60);
            highest = Math.min(highest, (await readPlayer(page)).top);
        }

        const during = await readPlayer(page);
        expect(during.rightDown).toBe(true);
        expect(during.up).toBe(true);
        expect(highest).toBeLessThan(before.top);

        // Lifting the jump finger must leave the run finger down.
        await fingers.up(jump);
        await page.waitForTimeout(150);
        expect(await readPlayer(page)).toMatchObject({ rightDown: true, up: false });

        await fingers.up();
    });

    test("pinching the page cannot zoom it", async ({ page }) => {
        await bootGame(page);

        const touchAction = await page.evaluate(() => ({
            game: getComputedStyle(document.querySelector("#game")!).touchAction,
            controls: getComputedStyle(document.querySelector(".touch-passer-container")!).touchAction,
            overscroll: getComputedStyle(document.body).overscrollBehaviorY
        }));
        expect(touchAction).toEqual({ game: "none", controls: "none", overscroll: "none" });
    });

    test("the game follows the window when it is resized", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.waitForTimeout(300);
        const logical = await page.evaluate(() => {
            const canvas = document.querySelector("canvas")!;
            return { width: canvas.width, height: canvas.height };
        });

        for (const size of [
            { width: 640, height: 300 },
            { width: 844, height: 390 }
        ]) {
            await page.setViewportSize(size);
            await page.waitForTimeout(300);

            const fit = await page.evaluate(() => {
                const rect = document.querySelector("canvas")!.getBoundingClientRect();
                return { width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
            });
            expect(fit.right).toBeLessThanOrEqual(size.width + 0.5);
            expect(fit.bottom).toBeLessThanOrEqual(size.height + 0.5);
            expect(fit.height).toBeGreaterThan(size.height * 0.85);
            // Same picture at any size: the aspect ratio never changes, and the game is not restarted.
            expect(fit.width / fit.height).toBeCloseTo(logical.width / logical.height, 1);
        }

        expect(await page.evaluate(() => (window as any).FSM.player.dead)).toBeFalsy();
        expect(errors).toEqual([]);
    });

    test("the menu button opens the menus over a paused game, and closes them again", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(300);

        await expect(page.locator("#controls")).toBeHidden();
        await page.locator("#menu-button").tap();
        await expect(page.locator("#controls")).toBeVisible();
        await expect(page.locator("#control-Options")).toBeVisible();
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);

        await page.locator("#menu-button").tap();
        await expect(page.locator("#controls")).toBeHidden();
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(false);
    });

    test("the Touch Controls option can still turn them off and on", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(300);

        await page.locator("#menu-button").tap();
        const toggle = page
            .locator("#control-Options tr", { hasText: "Touch Controls" })
            .locator(".options-button-option");
        await expect(toggle).toHaveText("on");

        await toggle.tap();
        await expect(toggle).toHaveText("off");
        await page.locator("#menu-button").tap();
        await expect(page.locator(".touch-passer-container")).toBeHidden();

        await page.locator("#menu-button").tap();
        await toggle.tap();
        await expect(toggle).toHaveText("on");
        await page.locator("#menu-button").tap();
        await expect(page.locator(".touch-passer-container")).toBeVisible();
    });
});

test.describe("iPhone 13, portrait", () => {
    test.use(iPhonePortrait);

    test("asks the player to rotate the phone, and holds the game paused behind it", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);

        const overlay = page.locator("#rotate-overlay");
        await expect(overlay).toBeVisible();
        await expect(overlay).toContainText("Rotate your phone");

        // It covers the whole screen, so the little game cannot be mistaken for the real thing.
        const covers = await page.evaluate(() => {
            const rect = document.querySelector("#rotate-overlay")!.getBoundingClientRect();
            return rect.width >= window.innerWidth - 1 && rect.height >= window.innerHeight - 1;
        });
        expect(covers).toBe(true);

        await expect.poll(() => page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });

    test("turning the phone sideways removes the overlay and starts the game", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await expect(page.locator("#rotate-overlay")).toBeVisible();
        await expect.poll(() => page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);

        await page.setViewportSize({ width: 750, height: 342 });
        await expect(page.locator("#rotate-overlay")).toBeHidden();
        await expect.poll(() => page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(false);

        // The game was built while upright, yet it is the normal landscape picture once turned.
        await expect
            .poll(async () => {
                const box = await page.locator("canvas").first().boundingBox();
                return box!.height;
            })
            .toBeGreaterThan(342 * 0.9);
        await expect(page.locator(".touch-passer-container")).toBeVisible();
        expect(errors).toEqual([]);
    });
});

test.describe("desktop", () => {
    test("keeps the touch controls hidden by default, with the menus below the game", async ({ page }) => {
        await bootGame(page);

        await expect(page.locator(".touch-passer-container")).toBeHidden();
        await expect(page.locator("#rotate-overlay")).toBeHidden();
        await expect(page.locator("#menu-button")).toBeHidden();
        await expect(page.locator("#controls")).toBeVisible();

        const layout = await page.evaluate(() => ({
            canvasBottom: document.querySelector("canvas")!.getBoundingClientRect().bottom,
            controlsTop: document.querySelector("#controls")!.getBoundingClientRect().top
        }));
        expect(layout.controlsTop).toBeGreaterThanOrEqual(layout.canvasBottom - 1);
    });

    test("the Touch Controls option turns them on and off", async ({ page }) => {
        await bootGame(page);

        const toggle = page
            .locator("#control-Options tr", { hasText: "Touch Controls" })
            .locator(".options-button-option");
        await expect(toggle).toHaveText("off");

        await toggle.dispatchEvent("click");
        await expect(toggle).toHaveText("on");
        await expect(page.locator(".touch-passer-container")).toBeVisible();
        await expect(page.locator('[data-touch-control="DPad"] > .control-inner')).toBeVisible();

        await toggle.dispatchEvent("click");
        await expect(page.locator(".touch-passer-container")).toBeHidden();
    });

    test("has a fullscreen button that asks for the game container, then tries a landscape lock", async ({ page }) => {
        await bootGame(page);

        const button = page.locator("#fullscreen-button");
        await expect(button).toBeVisible();
        await expect(button).toHaveText("Fullscreen");

        // Record the requests instead of really going fullscreen, which headless runs may not allow.
        await page.evaluate(() => {
            const calls: string[] = [];
            (window as any).__fullscreenCalls = calls;
            Element.prototype.requestFullscreen = function (this: Element) {
                calls.push(this.id);
                return Promise.resolve();
            };
            (window as any).__lockCalls = [];
            screen.orientation.lock = (orientation: string) => {
                (window as any).__lockCalls.push(orientation);
                return Promise.reject(new Error("not supported here"));
            };
        });

        await button.click();
        await expect.poll(() => page.evaluate(() => (window as any).__fullscreenCalls)).toEqual(["stage"]);
        // A refused lock must not surface as a page error.
        await expect.poll(() => page.evaluate(() => (window as any).__lockCalls)).toEqual(["landscape"]);

        // The container it asks for holds the game, its touch controls and the toolbar.
        const holds = await page.evaluate(() => {
            const stage = document.getElementById("stage")!;
            return [
                stage.contains(document.querySelector("canvas")),
                stage.contains(document.querySelector(".touch-passer-container")),
                stage.contains(document.getElementById("fullscreen-button"))
            ];
        });
        expect(holds).toEqual([true, true, true]);
    });

    test("hides the fullscreen button where the Fullscreen API is missing", async ({ page }) => {
        await page.addInitScript(() => {
            // What Safari on iPhone looks like to the page.
            delete (Element.prototype as any).requestFullscreen;
            delete (Element.prototype as any).webkitRequestFullscreen;
        });
        await bootGame(page);

        await expect(page.locator("#fullscreen-button")).toBeHidden();
    });

    test("scales the canvas with nearest-neighbor, never smoothing", async ({ page }) => {
        await bootGame(page);

        const rendering = await page
            .locator("canvas")
            .first()
            .evaluate((canvas) => getComputedStyle(canvas).imageRendering);
        expect(rendering).toBe("pixelated");
    });

    test("shrinks the game to fit when the window gets narrower, without restarting it", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.setViewportSize({ width: 1000, height: 700 });
        await bootGame(page);
        await page.waitForTimeout(300);

        const before = await page.evaluate(() => (window as any).FSM.player.left as number);
        const wide = await page.locator("canvas").first().boundingBox();
        expect(wide!.width).toBeGreaterThan(900);

        await page.setViewportSize({ width: 600, height: 700 });
        await expect
            .poll(async () => (await page.locator("canvas").first().boundingBox())!.width)
            .toBeLessThanOrEqual(600);
        await expect
            .poll(async () => {
                const box = (await page.locator("canvas").first().boundingBox())!;
                return Math.round((box.width / box.height) * 100);
            })
            .toBe(Math.round((wide!.width / wide!.height) * 100));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        expect(await page.evaluate(() => (window as any).FSM.player.left as number)).toBeGreaterThanOrEqual(before);
        expect(errors).toEqual([]);
    });
});
