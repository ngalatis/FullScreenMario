/**
 * Review repros for the rewritten subsystems (audio, loop, touch/layout, service worker).
 *
 * Tests marked test.fail() document a bug: they assert the behavior that should hold, and
 * Playwright reports them as failing-as-expected until the bug is fixed (then they flip).
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test, type Page } from "@playwright/test";
import { bootGame, collectPageErrors } from "../helpers";

const distDirectory = fileURLToPath(new URL("../../dist", import.meta.url));
const { defaultBrowserType: _browser, ...iPhoneLandscape } = devices["iPhone 13 landscape"];

/* Audio: one AudioContext per game instance, and the game is re-created on every View Mode change */

test.describe("audio lifetime across View Mode changes", () => {
    test("S: switching the View Mode must not leak AudioContexts and page listeners", async ({ page }) => {
        await page.addInitScript(() => {
            const created: AudioContext[] = [];
            const counts: Record<string, number> = {};
            const Original = window.AudioContext;

            class Counting extends Original {
                constructor(...args: any[]) {
                    super(...args);
                    created.push(this);
                }
            }

            (window as any).__audioContexts = created;
            (window as any).__listenerCounts = counts;
            (window as any).AudioContext = Counting;
            (window as any).webkitAudioContext = Counting;

            // The counts are the listeners alive right now: adds minus matching removes (the DOM ignores
            // a repeated add of the same listener and a remove of one that is not there, so do the same)
            const live = new Map<string, Set<unknown>>();
            const captureOf = (options: unknown): boolean =>
                typeof options === "object" && options !== null
                    ? !!(options as AddEventListenerOptions).capture
                    : !!options;

            for (const target of [window, document] as const) {
                const originalAdd = target.addEventListener.bind(target);
                const originalRemove = target.removeEventListener.bind(target);
                const label = target === window ? "window" : "document";
                target.addEventListener = function (type: string, listener: unknown, options?: unknown): void {
                    const key = label + ":" + type;
                    const set = live.get(key + ":" + captureOf(options)) || new Set<unknown>();
                    live.set(key + ":" + captureOf(options), set);
                    if (listener && !set.has(listener)) {
                        set.add(listener);
                        counts[key] = (counts[key] || 0) + 1;
                    }
                    (originalAdd as any)(type, listener, options);
                } as any;
                target.removeEventListener = function (type: string, listener: unknown, options?: unknown): void {
                    const key = label + ":" + type;
                    const set = live.get(key + ":" + captureOf(options));
                    if (set && set.delete(listener)) {
                        counts[key] = (counts[key] || 0) - 1;
                    }
                    (originalRemove as any)(type, listener, options);
                } as any;
            }
        });

        const errors = collectPageErrors(page);
        await bootGame(page);
        const snapshot = () =>
            page.evaluate(() => ({
                contexts: (window as any).__audioContexts.length,
                open: (window as any).__audioContexts.filter((c: AudioContext) => c.state !== "closed").length,
                visibility: (window as any).__listenerCounts["document:visibilitychange"] || 0,
                pointerdown: (window as any).__listenerCounts["window:pointerdown"] || 0
            }));
        const before = await snapshot();

        // Let the first game finish its background preload, so its decoded buffers are what gets retained
        await page.waitForFunction(() => Object.keys((window as any).FSM.AudioPlayer.buffers).length >= 40, undefined, {
            timeout: 45_000
        });
        await page.evaluate(() => {
            (window as any).__oldPlayers = [];
        });

        for (const size of ["NES", "Large", "Wide", "NES", "Wide"]) {
            await page.evaluate(() => (window as any).__oldPlayers.push(new WeakRef((window as any).FSM.AudioPlayer)));
            await page.evaluate((name) => (window as any).FSM.UserWrapper.setCurrentSize(name), size);
            await page.waitForFunction(() => !!(window as any).FSM.player);
        }

        const cdp = await page.context().newCDPSession(page);
        await cdp.send("HeapProfiler.collectGarbage");
        await page.waitForTimeout(500);
        await cdp.send("HeapProfiler.collectGarbage");
        const retained = await page.evaluate(async () => {
            const alive = (window as any).__oldPlayers.map((ref: WeakRef<any>) => ref.deref()).filter(Boolean);
            let bytes = 0;
            for (const player of alive) {
                const buffers: (AudioBuffer | undefined)[] = await Promise.all(
                    Object.keys(player.buffers).map((name) => player.buffers[name])
                );
                bytes += buffers.reduce(
                    (sum, buffer) => sum + (buffer ? buffer.length * buffer.numberOfChannels * 4 : 0),
                    0
                );
            }
            return { oldPlayersAlive: alive.length, decodedMegabytesRetained: Math.round(bytes / 1048576) };
        });

        const after = await snapshot();
        console.log("S-audio-leak", JSON.stringify({ before, after, retained }));
        expect(retained.oldPlayersAlive).toBe(0);
        expect(errors.errors).toEqual([]);
        expect(after.contexts - before.contexts).toBe(5);
        // What should hold: only the current game's context stays open and listening.
        expect(after.open).toBe(1);
        expect(after.pointerdown - before.pointerdown).toBe(0);
        expect(after.visibility - before.visibility).toBe(0);
    });

    test("decoded audio footprint after the background preload (informational)", async ({ page }) => {
        await bootGame(page);
        await page.waitForFunction(
            () => {
                const buffers = (window as any).FSM.AudioPlayer.buffers;
                return Object.keys(buffers).length >= 40;
            },
            undefined,
            { timeout: 45_000 }
        );

        const footprint = await page.evaluate(async () => {
            const player = (window as any).FSM.AudioPlayer;
            const names = Object.keys(player.buffers);
            const buffers: (AudioBuffer | undefined)[] = await Promise.all(names.map((name) => player.buffers[name]));
            let bytes = 0;
            let seconds = 0;
            const perTheme: Record<string, number> = {};
            buffers.forEach((buffer, i) => {
                if (!buffer) {
                    return;
                }
                const size = buffer.length * buffer.numberOfChannels * 4;
                bytes += size;
                seconds += buffer.duration;
                if (/Castle|Overworld|Underwater|Underworld|Star|Sky/.test(names[i])) {
                    perTheme[names[i]] = Math.round(size / 1048576);
                }
            });
            return {
                count: buffers.filter(Boolean).length,
                megabytes: Math.round(bytes / 1048576),
                seconds: Math.round(seconds),
                sampleRate: player.context.sampleRate,
                perTheme
            };
        });
        console.log("S-audio-footprint", JSON.stringify(footprint));
        expect(footprint.count).toBeGreaterThanOrEqual(40);
    });
});

/* Layout: the View Mode choices and the desktop canvas scale */

test.describe("desktop layout", () => {
    test("the View Mode has no legacy Full! size, and switching it never raises a dialog", async ({ page }) => {
        const dialogs: string[] = [];
        page.on("dialog", (dialog) => {
            dialogs.push(dialog.message());
            dialog.dismiss().catch(() => undefined);
        });
        const errors = collectPageErrors(page);

        await bootGame(page);
        // (The options menu may be collapsed, so read the markup and drive the select without actionability checks)
        const viewMode = page.locator("tr", { has: page.locator("td.options-label-ScreenSize") }).locator("select");
        const choices = await viewMode.locator("option").allTextContents();
        console.log("S-view-mode-choices", JSON.stringify(choices));
        expect(choices).not.toContain("Full!");
        expect(choices).toEqual(expect.arrayContaining(["NES", "Wide", "Large"]));

        await viewMode.selectOption("NES", { force: true });
        await page.waitForFunction(
            () => (window as any).FSM.UserWrapper.getCurrentSize().name === "NES" && !!(window as any).FSM.player
        );
        await viewMode.selectOption("Wide", { force: true });
        await page.waitForFunction(
            () => (window as any).FSM.UserWrapper.getCurrentSize().name === "Wide" && !!(window as any).FSM.player
        );
        await page.waitForTimeout(200);

        expect(dialogs).toEqual([]);
        expect(errors.errors).toEqual([]);
    });

    test("the canvas is shown at its native pixel size on a desktop window", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await bootGame(page);
        await page.waitForTimeout(300);
        const sizes = await page.evaluate(() => {
            const canvas = (window as any).FSM.canvas as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            return {
                width: canvas.width,
                height: canvas.height,
                cssWidth: rect.width,
                cssHeight: rect.height,
                bodyWidth: document.body.clientWidth
            };
        });
        console.log("S-desktop-scale", JSON.stringify(sizes));
        expect(sizes.cssWidth).toBe(sizes.width);
        expect(sizes.cssHeight).toBe(sizes.height);
    });
});

/* Touch: where the D-pad sits relative to where Mario starts a level */

test.describe("iPhone 13 landscape", () => {
    test.use(iPhoneLandscape);

    test("S: the D-pad does not cover Mario where a level starts", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(300);
        const geometry = await page.evaluate(() => {
            const FSM = (window as any).FSM;
            const canvas = FSM.canvas as HTMLCanvasElement;
            const canvasRect = canvas.getBoundingClientRect();
            const scale = canvasRect.width / canvas.width;
            const player = FSM.player;
            const mario = {
                left: canvasRect.left + player.left * scale,
                top: canvasRect.top + player.top * scale,
                right: canvasRect.left + player.right * scale,
                bottom: canvasRect.top + player.bottom * scale
            };
            const pad = document.querySelector('[data-touch-control="DPad"] .control-inner')!.getBoundingClientRect();
            const overlapWidth = Math.max(0, Math.min(mario.right, pad.right) - Math.max(mario.left, pad.left));
            const overlapHeight = Math.max(0, Math.min(mario.bottom, pad.bottom) - Math.max(mario.top, pad.top));
            const area = (mario.right - mario.left) * (mario.bottom - mario.top);
            return {
                mario,
                pad: { left: pad.left, top: pad.top, right: pad.right, bottom: pad.bottom },
                covered: area ? (overlapWidth * overlapHeight) / area : 0
            };
        });
        console.log("S-dpad-mario", JSON.stringify(geometry));
        expect(geometry.covered).toBe(0);
    });
});

/* Service worker: deploys, a broken deploy, and Range requests */

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

/** A static server whose root directory can be swapped, to play a sequence of deploys. */
async function serveSwappable(
    initialRoot: string
): Promise<{ url: string; setRoot: (root: string) => void; stop: () => Promise<void> }> {
    let root = initialRoot;
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
        const file = join(root, path === "/" ? "index.html" : path);
        try {
            if (!file.startsWith(root) || !statSync(file).isFile()) {
                throw new Error("not found");
            }
            response.writeHead(200, { "Content-Type": mimeTypes[extname(file)] ?? "application/octet-stream" });
            response.end(readFileSync(file));
        } catch (error) {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    return {
        url: `http://127.0.0.1:${port}/`,
        setRoot: (next) => {
            root = next;
        },
        stop: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            })
    };
}

/** Builds fake deploys out of dist/: v1 as built, v2 with a renamed bundle, v3 whose precache names a missing file. */
function makeDeploys(): { base: string; v1: string; v2: string; v3: string; v1Bundle: string } {
    const base = mkdtempSync(join(tmpdir(), "mario-deploys-"));
    const v1 = join(base, "v1");
    const v2 = join(base, "v2");
    const v3 = join(base, "v3");
    cpSync(distDirectory, v1, { recursive: true });
    cpSync(distDirectory, v2, { recursive: true });

    const bundle = readdirSync(join(v2, "assets")).find((name) => /^index-.*\.js$/.test(name))!;
    const renamed = bundle.replace(/^index-/, "index-v2");
    renameSync(join(v2, "assets", bundle), join(v2, "assets", renamed));
    for (const file of ["index.html", "sw.js"]) {
        writeFileSync(join(v2, file), readFileSync(join(v2, file), "utf8").split(bundle).join(renamed));
    }
    writeFileSync(
        join(v2, "index.html"),
        readFileSync(join(v2, "index.html"), "utf8").replace("<head>", '<head><meta name="build" content="v2" />')
    );
    writeFileSync(
        join(v2, "sw.js"),
        readFileSync(join(v2, "sw.js"), "utf8").replace(/CACHE_PREFIX \+ "[0-9a-f]+"/, 'CACHE_PREFIX + "v2deploy"')
    );

    cpSync(v2, v3, { recursive: true });
    writeFileSync(
        join(v3, "index.html"),
        readFileSync(join(v3, "index.html"), "utf8").replace('content="v2"', 'content="v3"')
    );
    writeFileSync(
        join(v3, "sw.js"),
        readFileSync(join(v3, "sw.js"), "utf8")
            .replace('"v2deploy"', '"v3deploy"')
            .replace("const PRECACHE = [", 'const PRECACHE = [\n    "does-not-exist.txt",')
    );

    return { base, v1, v2, v3, v1Bundle: bundle };
}

const buildMarker = (page: Page) =>
    page.evaluate(() => document.querySelector('meta[name="build"]')?.getAttribute("content") ?? "v1");
const cacheNames = (page: Page) =>
    page.evaluate(() => caches.keys().then((names) => names.filter((name) => name.startsWith("mario-")).sort()));

test.describe("service worker deploys", () => {
    test("a new deploy replaces the old cache, a broken deploy leaves the working one in place, and Range requests are honored", async ({
        page
    }) => {
        test.setTimeout(120_000);
        const deploys = makeDeploys();
        const v1Bundle = deploys.v1Bundle;
        const server = await serveSwappable(deploys.v1);
        const errors = collectPageErrors(page);
        /** 200 only from the v1 worker (the v1 bundle is in no other cache and on no later server). */
        const v1BundleStatus = () =>
            page.evaluate((bundle) => fetch("assets/" + bundle).then((response) => response.status), v1Bundle);

        try {
            await page.addInitScript((bundle) => {
                (window as any).__v1Bundle = bundle;
            }, v1Bundle);
            await page.goto(server.url);
            await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
            await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
            await page.reload();
            await page.waitForFunction(() => !!navigator.serviceWorker.controller);
            expect(await buildMarker(page)).toBe("v1");
            expect(await cacheNames(page)).toHaveLength(1);

            // Range requests go through the worker (the page is controlled)
            const ranges = await page.evaluate(async () => {
                const url = "Sounds/Sounds/mp3/Coin.mp3";
                const full = await fetch(url);
                const size = (await full.arrayBuffer()).byteLength;
                const probe = async (range: string) => {
                    try {
                        const response = await fetch(url, { headers: { Range: range } });
                        const body = await response.arrayBuffer();
                        return {
                            status: response.status,
                            length: body.byteLength,
                            contentRange: response.headers.get("Content-Range")
                        };
                    } catch (error) {
                        return { status: 0, length: 0, contentRange: String(error) };
                    }
                };
                return {
                    size,
                    first100: await probe("bytes=0-99"),
                    last100: await probe("bytes=-100"),
                    open: await probe("bytes=100-"),
                    multi: await probe("bytes=0-1,5-9"),
                    beyond: await probe("bytes=" + (size + 10) + "-"),
                    inverted: await probe("bytes=50-10")
                };
            });
            console.log("S-sw-ranges", JSON.stringify(ranges));
            expect(ranges.first100).toMatchObject({ status: 206, length: 100 });
            expect(ranges.last100).toMatchObject({ status: 206, length: 100 });
            expect(ranges.open).toMatchObject({ status: 206, length: ranges.size - 100 });
            expect(ranges.beyond.status).toBe(416);
            expect(ranges.inverted.status).toBe(416);
            // (multi-range: see the test below)

            // Deploy v2 while the v1 page is open: the new worker installs, takes over and drops the v1 cache
            server.setRoot(deploys.v2);
            await page.evaluate(() =>
                navigator.serviceWorker.getRegistration().then((registration) => registration!.update())
            );
            // Node-side polling with short evaluates: a long in-page loop stalls under tracing
            await expect
                .poll(() => cacheNames(page), { timeout: 30_000, message: "v2 cache alone" })
                .toEqual(["mario-v2deploy"]);
            await expect
                .poll(
                    () =>
                        page.evaluate(
                            async () =>
                                !!navigator.serviceWorker.controller &&
                                navigator.serviceWorker.controller.state === "activated" &&
                                (await fetch("assets/" + (window as any).__v1Bundle)).status === 404
                        ),
                    { timeout: 30_000, message: "v2 worker in control" }
                )
                .toBe(true);
            // The old page keeps working for what it still needs (sounds are fetched lazily)
            expect(
                await page.evaluate(() =>
                    fetch("Sounds/Sounds/mp3/Jump%20Small.mp3").then((response) => response.status)
                )
            ).toBe(200);
            expect(await buildMarker(page)).toBe("v1");

            await page.reload();
            await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
            expect(await buildMarker(page)).toBe("v2");
            expect(await cacheNames(page)).toEqual(["mario-v2deploy"]);
            expect(await v1BundleStatus()).toBe(404);

            // Deploy v3, whose precache has a file the server does not have: install fails, v2 stays
            server.setRoot(deploys.v3);
            await page.evaluate(() =>
                navigator.serviceWorker
                    .getRegistration()
                    .then((registration) => registration!.update().catch(() => undefined))
            );
            await expect
                .poll(
                    () =>
                        page.evaluate(async () => {
                            const registration = await navigator.serviceWorker.getRegistration();
                            return !!registration && !registration.installing && !registration.waiting;
                        }),
                    { timeout: 30_000, message: "v3 install settled" }
                )
                .toBe(true);
            await page.waitForTimeout(1000);
            const cachesAfterBrokenDeploy = await cacheNames(page);
            console.log("S-sw-broken-deploy", JSON.stringify({ caches: cachesAfterBrokenDeploy }));
            // The failed install removed its half-filled "mario-v3deploy" cache and left the working one alone
            expect(cachesAfterBrokenDeploy).toEqual(["mario-v2deploy"]);
            await page.reload();
            await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
            expect(await buildMarker(page)).toBe("v2");
            expect(errors.errors).toEqual([]);
        } finally {
            await server.stop();
            rmSync(deploys.base, { recursive: true, force: true });
        }
    });

    test("S: a Range the worker cannot slice (multi-range) still gets the whole file", async ({ page }) => {
        await bootGame(page);
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await page.reload();
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        const result = await page.evaluate(async () => {
            const url = "Sounds/Sounds/mp3/Coin.mp3";
            const size = (await (await fetch(url)).arrayBuffer()).byteLength;
            try {
                const response = await fetch(url, { headers: { Range: "bytes=0-1,5-9" } });
                return { size, status: response.status, length: (await response.arrayBuffer()).byteLength };
            } catch (error) {
                return { size, status: 0, length: 0, error: String(error) };
            }
        });
        console.log("S-sw-multirange", JSON.stringify(result));
        expect(result.status).toBe(200);
        expect(result.length).toBe(result.size);
    });
});

/* Layout pauses versus the player's own pause */

test.describe("iPhone 13 landscape, pause interplay", () => {
    test.use(iPhoneLandscape);

    const isPaused = (page: Page) => page.evaluate(() => (window as any).FSM.GamesRunner.getPaused() as boolean);

    /** Fakes the tab being hidden or shown, the way the page sees it. */
    const setHidden = (page: Page, hidden: boolean) =>
        page.evaluate(
            (state) => {
                Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
                Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
                document.dispatchEvent(new Event("visibilitychange"));
            },
            hidden ? "hidden" : "visible"
        );

    test("rotating to portrait and back keeps a game the player paused with Start paused", async ({ page }) => {
        const errors = collectPageErrors(page);
        await bootGame(page);
        await page.waitForTimeout(200);
        expect(await isPaused(page)).toBe(false);

        await page.locator('[data-touch-control="Start"] .control-inner').tap();
        expect(await isPaused(page)).toBe(true);

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator("#rotate-overlay")).toBeVisible();
        expect(await isPaused(page)).toBe(true);

        await page.setViewportSize({ width: 844, height: 390 });
        await expect(page.locator("#rotate-overlay")).toBeHidden();
        await page.waitForTimeout(300);
        expect(await isPaused(page)).toBe(true);

        // And the player can still unpause
        await page.locator('[data-touch-control="Start"] .control-inner').tap();
        expect(await isPaused(page)).toBe(false);
        expect(errors.errors).toEqual([]);
    });

    test("opening and closing the menu keeps a game the player paused paused", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(200);
        await page.locator('[data-touch-control="Start"] .control-inner').tap();
        expect(await isPaused(page)).toBe(true);

        await page.locator("#menu-button").tap();
        await expect(page.locator("body")).toHaveClass(/menu-open/);
        await page.locator("#menu-button").tap();
        await expect(page.locator("body")).not.toHaveClass(/menu-open/);
        await page.waitForTimeout(200);
        expect(await isPaused(page)).toBe(true);
    });

    test("a tab hidden in landscape and shown again in portrait stays paused until the phone is turned back", async ({
        page
    }) => {
        await bootGame(page);
        await page.waitForTimeout(200);
        await setHidden(page, true);
        expect(await isPaused(page)).toBe(true);

        await page.setViewportSize({ width: 390, height: 844 });
        await setHidden(page, false);
        await page.waitForTimeout(200);
        expect(await isPaused(page)).toBe(true);

        await page.setViewportSize({ width: 844, height: 390 });
        await expect(page.locator("#rotate-overlay")).toBeHidden();
        await page.waitForTimeout(300);
        expect(await isPaused(page)).toBe(false);
    });
});
