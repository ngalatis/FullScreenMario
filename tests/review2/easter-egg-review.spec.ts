import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

/**
 * Review repros for the footer easter egg (easter-egg/wefixit-easter-egg.js). Same approach as
 * tests/easter-egg.spec.ts: the demo page and the script are served from a made-up origin and the
 * game is stubbed. The tests named E-xx reproduce findings of the review and are expected to fail
 * until the script is fixed; the rest pin down behaviour that was checked and found sound.
 */

const SITE = "https://www.wefixit.test";
const GAME = "https://mario.wefixit.gr/";
const ARROWS = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"];
const KONAMI = [...ARROWS, "b", "a"];
const PLUMBER = "The WeFixIt plumber. Press for a riddle";
const SAVED_SITE = "/tmp/claude-0/-home-user-FullScreenMario/69eb2cbc-434f-56d1-ad7a-a74a2369a936/scratchpad/site";

function readEggFile(name: string): string {
    return readFileSync(new URL(`../../easter-egg/${name}`, import.meta.url), "utf8");
}

type DemoOptions = { html?: (html: string) => string; game?: "stub" | "cancelled" };

async function openDemo(page: Page, options: DemoOptions = {}): Promise<void> {
    await page.route(`${SITE}/**`, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith(".js")) {
            return route.fulfill({ contentType: "text/javascript", body: readEggFile("wefixit-easter-egg.js") });
        }
        const html = options.html ? options.html(readEggFile("demo.html")) : readEggFile("demo.html");
        return route.fulfill({ contentType: "text/html", body: html });
    });
    await page.route(`${GAME}**`, (route) => {
        if (options.game === "cancelled") {
            // The navigation is cancelled (Stop or Back while it is pending, or "stay" at a beforeunload
            // prompt): Chromium reports ERR_ABORTED and keeps the current page, no error page.
            return route.abort("aborted");
        }
        return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Game stub</title><p>game</p>" });
    });
    await page.goto(`${SITE}/demo.html`);
}

/** The saved wefixit.gr homepage with its real stylesheet, third-party scripts stripped, plus the egg. */
async function openRealHomepage(page: Page): Promise<void> {
    const css = readFileSync(`${SAVED_SITE}/site.css`, "utf8");
    let html = readFileSync(`${SAVED_SITE}/index.html`, "utf8");
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, "");
    html = html.replace("</head>", '<link rel="stylesheet" href="/site.css"></head>');
    html = html.replace("</body>", '<script src="/wefixit-easter-egg.js"></script></body>');
    await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== SITE) {
            return route.abort();
        }
        if (url.pathname === "/site.css") {
            return route.fulfill({ contentType: "text/css", body: css });
        }
        if (url.pathname === "/wefixit-easter-egg.js") {
            return route.fulfill({ contentType: "text/javascript", body: readEggFile("wefixit-easter-egg.js") });
        }
        if (url.pathname === "/") {
            return route.fulfill({ contentType: "text/html", body: html });
        }
        return route.abort();
    });
    await page.goto(`${SITE}/`);
}

async function typeCode(page: Page, keys = KONAMI): Promise<void> {
    for (const key of keys) {
        await page.keyboard.press(key);
    }
}

/** A trusted key press as a browser sends it with a non-Latin layout: `key` is the letter, `code` the physical key. */
async function pressLayoutKey(cdp: CDPSession, key: string, code: string, keyCode: number): Promise<void> {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
}

async function swipe(cdp: CDPSession, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
    for (let step = 1; step <= 5; step++) {
        const x = x1 + ((x2 - x1) * step) / 5;
        const y = y1 + ((y2 - y1) * step) / 5;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const overlay = (page: Page) => page.locator("wefixit-easter-egg-overlay");

/** How many of the ten progress dots in the bubble are lit: the matcher's current prefix length. */
const litDots = (page: Page) =>
    page.evaluate(
        () => document.querySelector("wefixit-easter-egg")?.shadowRoot?.querySelectorAll(".dots .on").length ?? -1
    );

function collectErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        // Resource loads that the test itself blocks are not the script's errors.
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
            errors.push(message.text());
        }
    });
    return errors;
}

test.describe("easter egg review: findings", () => {
    test("E-01: the code works with a Greek keyboard layout (B and A send β and α)", async ({ page }) => {
        await openDemo(page);
        const cdp = await page.context().newCDPSession(page);
        await typeCode(page, ARROWS);
        // On the Greek layout the physical B and A keys report key "β" / "α" and code "KeyB" / "KeyA".
        await pressLayoutKey(cdp, "β", "KeyB", 66);
        await pressLayoutKey(cdp, "α", "KeyA", 65);
        await expect(overlay(page)).toBeAttached({ timeout: 3000 });
        await page.waitForURL(GAME);
    });

    test("E-02: a navigation that gets cancelled does not leave the site under a permanent overlay", async ({
        page
    }) => {
        await openDemo(page, { game: "cancelled" });
        const requests: string[] = [];
        page.on("request", (request) => requests.push(request.url()));
        await typeCode(page);
        await expect(overlay(page)).toBeAttached();
        // Dissolve (600 ms) plus intro (900 ms): location.assign() has been called and was cancelled.
        await expect.poll(() => requests.includes(GAME), { timeout: 5000 }).toBe(true);
        await page.waitForTimeout(500);
        expect(page.url()).toBe(`${SITE}/demo.html`);

        // Within a few seconds the page must be usable again: no full-screen overlay, keys and clicks work.
        await expect(overlay(page)).toHaveCount(0, { timeout: 8000 });
        const link = page.getByRole("link", { name: "Web design" });
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeVisible();
        await link.click({ trial: true, timeout: 2000 });
    });
});

test.describe("easter egg review: touch findings", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("E-03: ordinary scrolling and two taps on page content do not open the game", async ({ page }) => {
        await openDemo(page);
        const cdp = await page.context().newCDPSession(page);
        // A zoomed-in or carousel-browsing visitor: two flicks down the page, two back up, a left-right
        // wobble twice, then a double tap on a paragraph (the gesture that zooms out).
        const swipes: [number, number, number, number][] = [
            [195, 600, 195, 400],
            [195, 600, 195, 400],
            [195, 300, 195, 500],
            [195, 300, 195, 500],
            [300, 400, 100, 400],
            [100, 400, 300, 400],
            [300, 400, 100, 400],
            [100, 400, 300, 400]
        ];
        for (const [x1, y1, x2, y2] of swipes) {
            await swipe(cdp, x1, y1, x2, y2);
        }
        const paragraph = (await page.getByText("Lorem ipsum dolor sit amet").boundingBox())!;
        expect(await litDots(page)).toBe(8); // the eight flicks alone already match the code's first eight steps
        await tap(cdp, paragraph.x + 40, paragraph.y + 10);
        await tap(cdp, paragraph.x + 40, paragraph.y + 10);
        // The overlay is appended synchronously on the tenth input, so count it once, right away, rather
        // than with a retrying assertion that would wait out the 1.5 s transition and the navigation.
        expect(await overlay(page).count()).toBe(0);
        await page.waitForTimeout(3000);
        expect(page.url()).toBe(`${SITE}/demo.html`);
    });
});

test.describe("easter egg review: checked and sound", () => {
    test("a page without a footer still accepts the code and logs nothing", async ({ page }) => {
        const errors = collectErrors(page);
        await openDemo(page, { html: (html) => html.replace(/<footer[\s\S]*<\/footer>/, "") });
        await expect(page.locator("wefixit-easter-egg")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await typeCode(page);
        await page.waitForURL(GAME);
        expect(errors).toEqual([]);
    });

    test("keys with Ctrl, Alt or Meta held, and auto-repeated keys, never count", async ({ page }) => {
        await openDemo(page);
        await typeCode(page, [...ARROWS, "Control+b", "a"]);
        await typeCode(page, [...ARROWS, "Alt+b", "a"]);
        await page.evaluate(() => {
            // ArrowUp ArrowUp ArrowDown ArrowDown ... where the second of each pair is a held-key repeat.
            const press = (key: string, repeat: boolean) =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key, repeat, bubbles: true }));
            for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"]) {
                press(key, false);
            }
            press("ArrowLeft", false);
            press("ArrowRight", false);
            press("ArrowLeft", false);
            press("ArrowRight", true);
            press("b", false);
            press("a", false);
        });
        await page.waitForTimeout(1500);
        await expect(overlay(page)).toHaveCount(0);
        expect(page.url()).toBe(`${SITE}/demo.html`);
    });

    test("arrow keys and letters are not swallowed: default actions still happen", async ({ page }) => {
        await openDemo(page);
        await page.setViewportSize({ width: 800, height: 400 });
        const before = await page.evaluate(() => window.scrollY);
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
        const input = page.locator("#search");
        await input.focus();
        await page.keyboard.type("ba");
        await expect(input).toHaveValue("ba");
    });

    test("the real homepage markup and stylesheet: strip in the footer, no overflow, no errors", async ({ page }) => {
        const errors = collectErrors(page);
        await openRealHomepage(page);
        const strip = page.locator("footer wefixit-easter-egg");
        await expect(strip).toHaveCount(1);
        await strip.scrollIntoViewIfNeeded();
        const plumber = page.getByRole("button", { name: PLUMBER });
        await expect(plumber).toBeInViewport();
        await plumber.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        const bubble = (await page.getByRole("dialog").boundingBox())!;
        const viewport = page.viewportSize()!;
        expect(bubble.x).toBeGreaterThanOrEqual(0);
        expect(bubble.x + bubble.width).toBeLessThanOrEqual(viewport.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(errors).toEqual([]);
    });
});
