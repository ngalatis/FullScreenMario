import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "../helpers";

/**
 * Verification of the fixes for the review findings: the claims the fix tests do not pin down.
 * Lazy chunks (G-03): the files the page names are the files the import needs, the import after
 * the check is served from the cache, the dev server (no chunks) and a strict CSP still work.
 * Disposal (G-02): nothing of a replaced game stays alive, and the new game takes the keyboard.
 * The easter egg (E-02, E-03): Escape only acts on a running transition, a cancelled transition
 * leaves the code usable, and the swipes stay armed for the rest of the browsing session.
 */

const root = fileURLToPath(new URL("../..", import.meta.url));
const distDirectory = join(root, "dist");
const lazyFile = /assets\/(level-editor|map-generator|rolldown-runtime)-[^/]*\.js$/;

const clickStartEditor = (page: Page) =>
    page.locator("#control-Editor .select-options-level-editor > .select-option").first().dispatchEvent("click");

type Source = "network" | "memory" | "disk" | "service-worker" | "prefetch" | "revalidated";

/** Records where each response for a lazy chunk file came from, through the Chrome DevTools protocol. */
async function watchLazyFiles(page: Page): Promise<{ cdp: CDPSession; sources: Map<string, Source[]> }> {
    const cdp = await page.context().newCDPSession(page);
    const urls = new Map<string, string>();
    const fromMemory = new Set<string>();
    const sources = new Map<string, Source[]>();

    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (event) => urls.set(event.requestId, event.request.url));
    cdp.on("Network.requestServedFromCache", (event) => fromMemory.add(event.requestId));
    cdp.on("Network.responseReceived", (event) => {
        const url = urls.get(event.requestId) ?? event.response.url;
        const path = new URL(url).pathname;

        if (!lazyFile.test(path)) {
            return;
        }

        const response = event.response;
        const source: Source = fromMemory.has(event.requestId)
            ? "memory"
            : response.fromServiceWorker
              ? "service-worker"
              : response.fromDiskCache
                ? "disk"
                : response.fromPrefetchCache
                  ? "prefetch"
                  : response.status === 304
                    ? "revalidated"
                    : "network";

        sources.set(path, [...(sources.get(path) ?? []), source]);
    });

    return { cdp, sources };
}

const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".gif": "image/gif",
    ".mp3": "audio/mpeg",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml"
};

/** Serves dist/ the way the README asks a host to: immutable assets, plus any further headers. */
async function serveDist(headers: Record<string, string>): Promise<{ url: string; stop: () => Promise<void> }> {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
        const file = join(distDirectory, path === "/" ? "index.html" : path.slice(1));

        try {
            if (!file.startsWith(distDirectory)) {
                throw new Error("not found");
            }
            const body = readFileSync(file);
            response.writeHead(200, {
                "Content-Type": mimeTypes[extname(file)] ?? "application/octet-stream",
                "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
                ...headers
            });
            response.end(body);
        } catch (error) {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    return {
        url: `http://127.0.0.1:${port}/`,
        stop: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            })
    };
}

test.describe("G-03: the files of a lazy chunk", () => {
    // The service worker would serve the files itself; this checks the page and the HTTP cache alone
    test.use({ serviceWorkers: "block" });

    test("are all named in the page, downloaded once, and imported from the cache", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const { sources } = await watchLazyFiles(page);
        const site = await serveDist({});

        await page.goto(site.url);
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);

        const named = await page.evaluate(() =>
            Array.from(document.querySelectorAll('meta[name^="lazy-chunk:"]')).map((meta) => ({
                name: meta.getAttribute("name"),
                files: (meta.getAttribute("content") ?? "").split(" ")
            }))
        );
        expect(named.map((meta) => meta.name).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
            "lazy-chunk:level-editor",
            "lazy-chunk:map-generator"
        ]);

        const editorFiles = named.find((meta) => meta.name === "lazy-chunk:level-editor")!.files;
        const editorPaths = editorFiles.map((file) => new URL(file, page.url()).pathname);

        await clickStartEditor(page);
        await page.waitForFunction(
            () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
        );
        await page.waitForTimeout(500);

        // Every file the import needed was in the list, so a failed download of any of them is caught first
        const requested = Array.from(sources.keys()).sort((a, b) => a.localeCompare(b));
        expect(requested).toEqual([...editorPaths].sort((a, b) => a.localeCompare(b)));

        // The check downloads each file once, and the import that follows finds it in the cache (with the
        // README's headers; the preview server's "no-cache" answers the conditional request with a 200)
        for (const path of editorPaths) {
            const seen = sources.get(path) ?? [];
            expect(
                seen.filter((source) => source === "network"),
                `${path}: ${seen.join(", ")}`
            ).toHaveLength(1);
            expect(
                seen.filter((source) => source === "disk" || source === "memory"),
                `${path}: ${seen.join(", ")}`
            ).not.toHaveLength(0);
        }

        expect(errors).toEqual([]);
        await site.stop();
    });
});

test.describe("G-03: without chunk names in the page (the dev server)", () => {
    const port = Number(process.env.PW_PORT ?? 4173) + 10;
    let server: ChildProcess | undefined;

    test.beforeAll(async () => {
        server = spawn(
            join(root, "node_modules", ".bin", "vite"),
            ["--port", String(port), "--strictPort", "--host", "127.0.0.1"],
            {
                cwd: root,
                stdio: "ignore"
            }
        );

        const started = Date.now();
        for (;;) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/`);
                if (response.ok) {
                    break;
                }
            } catch (error) {
                // Not up yet
            }
            if (Date.now() - started > 30_000) {
                throw new Error("The dev server did not start.");
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    });

    test.afterAll(() => {
        server?.kill();
    });

    test("the level editor still loads", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        expect(await page.locator('meta[name^="lazy-chunk:"]').count()).toBe(0);

        await clickStartEditor(page);
        await page.waitForFunction(
            () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
        );

        expect(errors).toEqual([]);
    });
});

test.describe("G-03: under the deployment CSP", () => {
    const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self'",
        "connect-src 'self'"
    ].join("; ");

    test.use({ serviceWorkers: "block" });

    test("the chunk check and the import are both allowed", async ({ page }) => {
        const site = await serveDist({ "Content-Security-Policy": policy });

        try {
            const { errors } = collectPageErrors(page);
            const violations: string[] = [];
            page.on("console", (message) => {
                if (message.type() === "error") {
                    violations.push(message.text());
                }
            });

            await page.goto(site.url);
            await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
            await clickStartEditor(page);
            await page.waitForFunction(
                () => !!(window as any).FSM.LevelEditor && (window as any).FSM.LevelEditor.getEnabled()
            );

            expect(violations).toEqual([]);
            expect(errors).toEqual([]);
        } finally {
            await site.stop();
        }
    });
});

test.describe("G-02: a replaced game", () => {
    test("lets go of everything, and the keyboard drives the new game only", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        // A click starts the audio, so the old game has an AudioContext to let go of
        await page.mouse.click(200, 200);
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getContextState() !== "unavailable");
        await page.evaluate(() => {
            const w = window as any;
            w.oldGame = w.FSM;
            w.oldContext = w.FSM.AudioPlayer.context;
            w.FSM.UserWrapper.setCurrentSize("NES");
        });
        await page.waitForFunction(() => {
            const w = window as any;
            return w.FSM !== w.oldGame && !!w.FSM.player && !!w.FSM.player.resting;
        });

        const readOld = () =>
            page.evaluate(() => {
                const old = (window as any).oldGame;
                return {
                    disposed: old.disposed,
                    paused: old.GamesRunner.getPaused(),
                    events: Object.keys(old.TimeHandler.getEvents()).length,
                    padsDisposed: old.DeviceLayer.disposed,
                    audioDisposed: old.AudioPlayer.disposed,
                    audioContext: (window as any).oldContext ? (window as any).oldContext.state : "none",
                    inPage: old.container.isConnected
                };
            });

        expect(await readOld()).toEqual({
            disposed: true,
            paused: true,
            events: 0,
            padsDisposed: true,
            audioDisposed: true,
            audioContext: "closed",
            inPage: false
        });

        // The pause key reaches the new game, and the old one stays as it is
        await page.keyboard.press("p");
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === true);
        await page.keyboard.press("p");
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === false);
        await page.waitForTimeout(500);
        expect((await readOld()).paused).toBe(true);
        expect((await readOld()).events).toBe(0);

        // And so does the walk to the right
        const before = await page.evaluate(() => (window as any).FSM.player.left as number);
        await page.keyboard.down("ArrowRight");
        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before);
        await page.keyboard.up("ArrowRight");

        expect(errors).toEqual([]);
    });
});

/* The easter egg
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
const PLUMBER = "The WeFixIt plumber. Press for a riddle";

function readEggFile(name: string): string {
    return readFileSync(join(root, "easter-egg", name), "utf8");
}

async function openDemo(page: Page): Promise<void> {
    await page.route(`${SITE}/**`, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith(".js")) {
            return route.fulfill({ contentType: "text/javascript", body: readEggFile("wefixit-easter-egg.js") });
        }
        return route.fulfill({ contentType: "text/html", body: readEggFile("demo.html") });
    });
    await page.route(`${GAME}**`, (route) =>
        route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Game stub</title><p>game</p>" })
    );
    await page.goto(`${SITE}/demo.html`);
}

async function typeCode(page: Page): Promise<void> {
    for (const key of KONAMI) {
        await page.keyboard.press(key);
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

const overlay = (page: Page) => page.locator("wefixit-easter-egg-overlay");

const litDots = (page: Page) =>
    page.evaluate(
        () => document.querySelector("wefixit-easter-egg")?.shadowRoot?.querySelectorAll(".dots .on").length ?? -1
    );

test.describe("E-02: Escape", () => {
    test("stops a running transition, and the code works again afterwards", async ({ page }) => {
        await openDemo(page);
        await typeCode(page);
        await expect(overlay(page)).toBeAttached();

        await page.keyboard.press("Escape");
        await expect(overlay(page)).toHaveCount(0);
        expect(await litDots(page)).toBe(0);

        // The abandoned transition (dissolve 600 ms, intro 900 ms) never navigates
        await page.waitForTimeout(2000);
        expect(page.url()).toBe(`${SITE}/demo.html`);

        await typeCode(page);
        await page.waitForURL(GAME);
    });

    test("is left to the site when no transition runs", async ({ page }) => {
        await openDemo(page);
        await page.evaluate(() => {
            document.addEventListener("keydown", (event) => {
                (window as any).siteSawEscape = { key: event.key, prevented: event.defaultPrevented };
            });
        });

        await page.keyboard.press("Escape");
        expect(await page.evaluate(() => (window as any).siteSawEscape)).toEqual({ key: "Escape", prevented: false });

        // With the riddle open, Escape closes it and still reaches the site
        await page.getByRole("button", { name: PLUMBER }).click();
        await expect(page.getByRole("dialog", { name: "Riddle" })).toBeVisible();
        await page.evaluate(() => ((window as any).siteSawEscape = undefined));
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Riddle" })).toBeHidden();
        expect(await page.evaluate(() => (window as any).siteSawEscape)).toEqual({ key: "Escape", prevented: false });
    });
});

test.describe("E-03: the swipes", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("stay armed on the next page of the browsing session once the riddle was opened", async ({ page }) => {
        await openDemo(page);
        const cdp = await page.context().newCDPSession(page);

        await swipe(cdp, 195, 600, 195, 400);
        expect(await litDots(page)).toBe(0);

        await page.getByRole("button", { name: PLUMBER }).dispatchEvent("click");
        await expect(page.getByRole("dialog", { name: "Riddle" })).toBeVisible();
        expect(await page.evaluate(() => sessionStorage.getItem("wefixitEasterEggSwipes"))).toBe("1");

        await page.goto(`${SITE}/demo.html`);
        await swipe(cdp, 195, 600, 195, 400);
        await swipe(cdp, 195, 600, 195, 400);
        expect(await litDots(page)).toBe(2);
    });
});
