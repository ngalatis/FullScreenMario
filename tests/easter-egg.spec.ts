import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

/**
 * The footer easter egg for wefixit.gr (easter-egg/). It is not part of the game build, so these
 * tests serve the demo page and the script from a made-up origin, and stub the game itself.
 */

const SITE = "https://www.wefixit.test";
const GAME = "https://mario.wefixit.gr/";
const KONAMI = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a"
];
const RIDDLE = "Psst! Are you old enough to remember the Konami code? Enter it anywhere on this site.";
const HINT = "↑ ↑ ↓ ↓ ← → ← → B A (you didn't hear it from me)";
const PLUMBER = "The WeFixIt plumber. Press for a riddle";

function readEggFile(name: string): string {
    return readFileSync(new URL(`../easter-egg/${name}`, import.meta.url), "utf8");
}

/**
 * Opens the demo page. `?lang=el` turns it into a Greek page and `?twice` includes the script twice.
 */
async function openDemo(page: Page, query = ""): Promise<void> {
    await page.route(`${SITE}/**`, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith(".js")) {
            return route.fulfill({ contentType: "text/javascript", body: readEggFile("wefixit-easter-egg.js") });
        }
        let html = readEggFile("demo.html");
        if (url.searchParams.get("lang") === "el") {
            html = html.replace('<html lang="en"', '<html lang="el"');
        }
        if (url.searchParams.has("twice")) {
            html = html.replace("</body>", '<script src="wefixit-easter-egg.js"></script></body>');
        }
        return route.fulfill({ contentType: "text/html", body: html });
    });
    await page.route(`${GAME}**`, (route) =>
        route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Game stub</title><p>game</p>" })
    );
    await page.goto(`${SITE}/demo.html${query}`);
}

async function typeCode(page: Page, keys = KONAMI): Promise<void> {
    for (const key of keys) {
        await page.keyboard.press(key);
    }
}

/** Scrolls to the footer, so the plumber walks in, and waits until he has stopped walking. */
async function meetPlumber(page: Page) {
    const plumber = page.getByRole("button", { name: PLUMBER });
    await page.locator("footer wefixit-easter-egg").scrollIntoViewIfNeeded();
    await expect(plumber).toBeInViewport();
    let previous = "";
    await expect(async () => {
        const box = JSON.stringify(await plumber.boundingBox());
        const stopped = box === previous;
        previous = box;
        expect(stopped).toBe(true);
    }).toPass({ intervals: [300], timeout: 10_000 });
    return plumber;
}

const overlay = (page: Page) => page.locator("wefixit-easter-egg-overlay");

test.describe("WeFixIt easter egg", () => {
    test("the plumber works in the footer, once even if the script is included twice", async ({ page }) => {
        await openDemo(page, "?twice");
        const strip = page.locator("footer wefixit-easter-egg");
        await expect(strip).toHaveCount(1);
        const plumber = await meetPlumber(page);

        const footer = (await page.locator("footer").boundingBox())!;
        const box = (await plumber.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(footer.y);
        expect(box.y + box.height).toBeLessThanOrEqual(footer.y + footer.height + 1);
        expect(box.height).toBeGreaterThanOrEqual(64);

        // The strip sits below the last footer line instead of covering it.
        const credits = (await page.getByText("created by yours truly...").boundingBox())!;
        expect((await strip.boundingBox())!.y).toBeGreaterThanOrEqual(credits.y + credits.height);

        const paintedPixels = await plumber.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
            const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
            return data.filter((_, i) => i % 4 === 3 && data[i] > 0).length;
        });
        expect(paintedPixels).toBeGreaterThan(100);
    });

    test("clicking him tells the riddle, clicking again gives the hint", async ({ page }) => {
        await openDemo(page);
        const plumber = await meetPlumber(page);
        const bubble = page.getByRole("dialog", { name: "Riddle" });
        await expect(bubble).toBeHidden();

        await plumber.click();
        await expect(bubble).toBeVisible();
        await expect(bubble).toContainText(RIDDLE);
        await expect(plumber).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("dialog").getByText(HINT)).toBeHidden();
        // Screen readers hear it through a polite live region.
        await expect(page.locator("wefixit-easter-egg [aria-live=polite]")).toHaveText(RIDDLE);
        // No controller on a desktop with a mouse.
        await expect(page.getByText("No keyboard? Use my controller:")).toBeHidden();

        await plumber.click();
        await expect(page.getByRole("dialog").getByText(HINT)).toBeVisible();
        await expect(page.getByRole("button", { name: "Hint?" })).toBeHidden();
        await expect(page.locator("wefixit-easter-egg [aria-live=polite]")).toHaveText(HINT);
    });

    test("the Hint button, Escape, the close button and a click outside all behave", async ({ page }) => {
        await openDemo(page);
        const plumber = await meetPlumber(page);
        const bubble = page.getByRole("dialog");

        await plumber.click();
        await page.getByRole("button", { name: "Hint?" }).click();
        await expect(page.getByRole("dialog").getByText(HINT)).toBeVisible();
        await expect(page.getByRole("button", { name: "Close" })).toBeFocused();

        await page.keyboard.press("Escape");
        await expect(bubble).toBeHidden();
        await expect(plumber).toBeFocused();
        await expect(plumber).toHaveAttribute("aria-expanded", "false");

        await plumber.press("Enter");
        await expect(bubble).toBeVisible();
        await page.getByRole("button", { name: "Close" }).click();
        await expect(bubble).toBeHidden();
        await expect(plumber).toBeFocused();

        await plumber.click();
        await expect(bubble).toBeVisible();
        await page.getByText("We are always online").click();
        await expect(bubble).toBeHidden();

        // Escape leaves focus alone when the keyboard user has moved it out of the bubble.
        await plumber.click();
        await page.locator("#search").focus();
        await page.keyboard.press("Escape");
        await expect(bubble).toBeHidden();
        await expect(page.locator("#search")).toBeFocused();
    });

    test("the Konami code plays the transition, then opens the game", async ({ page }) => {
        await openDemo(page);
        await typeCode(page);
        await expect(overlay(page)).toBeAttached();
        expect(page.url()).toBe(`${SITE}/demo.html`);
        await expect(page.locator('link[rel=preconnect][href="https://mario.wefixit.gr"]')).toBeAttached();
        await page.waitForURL(GAME);
        await expect(page).toHaveTitle("Game stub");
    });

    test("a wrong sequence does nothing", async ({ page }) => {
        await openDemo(page);
        await typeCode(page, [...KONAMI.slice(0, 8), "a", "b"]);
        await typeCode(page, [
            "ArrowUp",
            "ArrowUp",
            "ArrowDown",
            "x",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "ArrowLeft",
            "ArrowRight",
            "b",
            "a"
        ]);
        await page.waitForTimeout(1500);
        await expect(overlay(page)).toHaveCount(0);
        expect(page.url()).toBe(`${SITE}/demo.html`);
    });

    test("a code that starts with an extra up still counts", async ({ page }) => {
        await openDemo(page);
        await typeCode(page, ["ArrowUp", ...KONAMI.slice(0, 8), "B", "A"]);
        await page.waitForURL(GAME);
    });

    test("typing the code into a form field does nothing", async ({ page }) => {
        await openDemo(page);
        await page.locator("#search").click();
        await typeCode(page);
        await expect(page.locator("#search")).toHaveValue("ba");
        await page.waitForTimeout(1500);
        await expect(overlay(page)).toHaveCount(0);
        expect(page.url()).toBe(`${SITE}/demo.html`);
    });

    test("Greek pages get the Greek riddle", async ({ page }) => {
        await openDemo(page, "?lang=el");
        const plumber = page.getByRole("button", { name: "Ο υδραυλικός της WeFixIt. Πάτησε για έναν γρίφο" });
        await page.locator("footer wefixit-easter-egg").scrollIntoViewIfNeeded();
        await plumber.click();
        await expect(page.getByRole("dialog", { name: "Γρίφος" })).toContainText(
            "Ψιτ! Είσαι από τους παλιούς που θυμούνται τον κωδικό Konami; Πληκτρολόγησέ τον οπουδήποτε σε αυτό το site."
        );
        await plumber.click();
        await expect(page.getByRole("dialog").getByText("↑ ↑ ↓ ↓ ← → ← → B A (δεν το άκουσες από μένα)")).toBeVisible();
    });

    test("a config object set before the script can change the target", async ({ page }) => {
        await page.addInitScript(() => {
            (window as any).wefixitEasterEgg = { target: "https://mario.wefixit.gr/?from=config", sound: false };
        });
        await openDemo(page);
        await typeCode(page);
        await page.waitForURL(`${GAME}?from=config`);
    });

    test("a target that is not http(s) falls back to the game", async ({ page }) => {
        await page.addInitScript(() => {
            (window as any).wefixitEasterEgg = { target: "javascript:alert(1)" };
        });
        await openDemo(page);
        await typeCode(page);
        await page.waitForURL(GAME);
    });

    test("a target that is not a string falls back to the game", async ({ page }) => {
        await page.addInitScript(() => {
            (window as any).wefixitEasterEgg = { target: { toString: () => "https://elsewhere.example/" } };
        });
        await openDemo(page);
        await typeCode(page);
        await page.waitForURL(GAME);
    });

    test("Escape during the transition cancels it and gives the page back", async ({ page }) => {
        await openDemo(page);
        await typeCode(page);
        await expect(overlay(page)).toBeAttached();
        await page.keyboard.press("Escape");
        await expect(overlay(page)).toHaveCount(0);
        await page.waitForTimeout(2000);
        expect(page.url()).toBe(`${SITE}/demo.html`);

        await typeCode(page);
        await page.waitForURL(GAME);
    });

    test("with reduced motion it fades instead, and still opens the game", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openDemo(page);
        await page.locator("footer wefixit-easter-egg").scrollIntoViewIfNeeded();
        // He is already at work: no walk-in to wait for.
        const plumber = page.getByRole("button", { name: PLUMBER });
        const first = await plumber.boundingBox();
        await page.waitForTimeout(400);
        expect(await plumber.boundingBox()).toEqual(first);

        await typeCode(page);
        await expect(overlay(page)).toHaveClass("fade");
        await page.waitForURL(GAME);
    });

    test("coming back from the back/forward cache removes the overlay", async ({ page }) => {
        await openDemo(page);
        await typeCode(page);
        await expect(overlay(page)).toBeAttached();
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await expect(overlay(page)).toHaveCount(0);
        await page.waitForTimeout(2000);
        expect(page.url()).toBe(`${SITE}/demo.html`);

        // And the code works again afterwards.
        await typeCode(page);
        await page.waitForURL(GAME);
    });

    test("nothing logs an error along the way", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") {
                errors.push(message.text());
            }
        });
        await openDemo(page);
        const plumber = await meetPlumber(page);
        await plumber.click();
        await plumber.click();
        await page.keyboard.press("Escape");
        await typeCode(page);
        await page.waitForURL(GAME);
        expect(errors).toEqual([]);
    });

    test("no horizontal overflow on a 320px wide screen", async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await openDemo(page);
        const plumber = await meetPlumber(page);
        await plumber.click();
        await plumber.click();
        await expect(page.getByRole("dialog").getByText(HINT)).toBeVisible();
        const bubble = (await page.getByRole("dialog").boundingBox())!;
        expect(bubble.x).toBeGreaterThanOrEqual(0);
        expect(bubble.x + bubble.width).toBeLessThanOrEqual(320);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    });
});

test.describe("WeFixIt easter egg on a phone", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("the bubble has a little controller that enters the code", async ({ page }) => {
        await openDemo(page);
        const plumber = await meetPlumber(page);
        await plumber.tap();
        await expect(page.getByText("No keyboard? Use my controller:")).toBeVisible();
        await plumber.tap();
        await expect(page.getByRole("dialog").getByText(HINT)).toBeVisible();

        const names = ["Up", "Up", "Down", "Down", "Left", "Right", "Left", "Right", "B", "A"];
        for (const name of names.slice(0, 9)) {
            const button = page.getByRole("button", { name, exact: true });
            const box = (await button.boundingBox())!;
            expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
            await button.tap();
        }
        expect(page.url()).toBe(`${SITE}/demo.html`);
        await page.getByRole("button", { name: "A", exact: true }).tap();
        await expect(overlay(page)).toBeAttached();
        await page.waitForURL(GAME);
    });

    test("once the riddle has been opened, swipes and two taps anywhere enter the code", async ({ page }) => {
        await openDemo(page);
        const plumber = await meetPlumber(page);
        await plumber.tap();
        await expect(page.getByRole("dialog")).toBeVisible();
        // Armed for the rest of the browsing session, so on the next page too.
        await page.goto(`${SITE}/demo.html`);
        const cdp = await page.context().newCDPSession(page);
        await swipeArrows(cdp);
        await tap(cdp, 60, 200);
        expect(page.url()).toBe(`${SITE}/demo.html`);
        await tap(cdp, 60, 200);
        await expect(overlay(page)).toBeAttached();
        await page.waitForURL(GAME);
    });

    test("swipes and taps do nothing while the riddle has not been opened", async ({ page }) => {
        await openDemo(page);
        const cdp = await page.context().newCDPSession(page);
        await swipeArrows(cdp);
        await tap(cdp, 60, 200);
        await tap(cdp, 60, 200);
        await page.waitForTimeout(2000);
        await expect(overlay(page)).toHaveCount(0);
        expect(page.url()).toBe(`${SITE}/demo.html`);
    });
});

/** Swipes up, up, down, down, left, right, left, right. */
async function swipeArrows(cdp: CDPSession): Promise<void> {
    const swipes: [number, number, number, number][] = [
        [195, 600, 195, 400],
        [195, 600, 195, 400], // up, up
        [195, 300, 195, 500],
        [195, 300, 195, 500], // down, down
        [300, 400, 100, 400],
        [100, 400, 300, 400], // left, right
        [300, 400, 100, 400],
        [100, 400, 300, 400] // left, right
    ];
    for (const [x1, y1, x2, y2] of swipes) {
        await swipe(cdp, x1, y1, x2, y2);
    }
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
