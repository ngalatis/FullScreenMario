import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));

/** Same as in the built game: an mp3 that is precached, and one that is not part of the build. */
const soundPath = "/Sounds/Sounds/mp3/Coin.mp3";

function listFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);

        return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

/** Width and height from the PNG header (the IHDR chunk always comes first). */
function pngSize(data: Buffer): { width: number; height: number } {
    expect(data.subarray(1, 4).toString("latin1")).toBe("PNG");

    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
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

/**
 * Serves dist/ from a subfolder of a throwaway server, so a test can shut the server down:
 * an offline test on the shared preview server cannot, because Playwright's offline mode does
 * not cover the requests a service worker makes itself.
 */
async function serveDistInSubfolder(prefix: string): Promise<{ url: string; stop: () => Promise<void> }> {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
        const relativePath = path.startsWith(prefix) ? path.slice(prefix.length) || "index.html" : "";
        const file = join(distDirectory, relativePath.endsWith("/") ? relativePath + "index.html" : relativePath);

        try {
            if (!relativePath || !file.startsWith(distDirectory)) {
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
        url: `http://127.0.0.1:${port}${prefix}`,
        stop: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            })
    };
}

/** Waits until a worker is active (so the precache is complete), then reloads so it controls the page. */
async function installAndReload(page: Page): Promise<void> {
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test.describe("installable app", () => {
    test("the page links a manifest with everything an installable game needs", async ({ page, request }) => {
        await bootGame(page);

        const href = await page.locator('link[rel="manifest"]').getAttribute("href");
        expect(href).toBeTruthy();

        const response = await request.get(new URL(href!, page.url()).href);
        expect(response.status()).toBe(200);

        const manifest = await response.json();
        expect(manifest).toMatchObject({
            name: "Super Mario Bros.",
            short_name: "Mario",
            start_url: "./",
            scope: "./",
            display: "fullscreen",
            display_override: ["fullscreen", "standalone"],
            orientation: "landscape"
        });
        expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

        // The installability checks want 192 and 512 icons, and a maskable one is needed for Android's round icons.
        const purposes = (size: string, purpose: string): boolean =>
            manifest.icons.some((icon: any) => icon.sizes === size && (icon.purpose ?? "any") === purpose);
        expect(purposes("192x192", "any")).toBe(true);
        expect(purposes("512x512", "any")).toBe(true);
        expect(purposes("512x512", "maskable")).toBe(true);

        // Phone browsers colour their chrome and launch standalone based on these tags.
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /^#[0-9a-f]{6}$/i);
        await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
        await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
        await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
            "content",
            "black-translucent"
        );
    });

    test("every icon loads as a PNG of the size it claims", async ({ page, request }) => {
        await bootGame(page);

        const manifestUrl = new URL((await page.locator('link[rel="manifest"]').getAttribute("href"))!, page.url());
        const manifest = await (await request.get(manifestUrl.href)).json();
        const icons: { url: string; size: number }[] = manifest.icons.map((icon: any) => ({
            url: new URL(icon.src, manifestUrl).href,
            size: Number(icon.sizes.split("x")[0])
        }));

        const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
        expect(touchIcon).toBeTruthy();
        icons.push({ url: new URL(touchIcon!, page.url()).href, size: 180 });

        for (const icon of icons) {
            const response = await request.get(icon.url);

            expect(response.status(), icon.url).toBe(200);
            expect(response.headers()["content-type"], icon.url).toBe("image/png");
            expect(pngSize(await response.body()), icon.url).toEqual({ width: icon.size, height: icon.size });
        }
    });
});

test.describe("offline", () => {
    test("the service worker precaches every file of the build", () => {
        const source = readFileSync(join(distDirectory, "sw.js"), "utf8");
        const precache: string[] = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(source)![1]);
        const expected = listFiles(distDirectory)
            .map((file) => encodeURI(relative(distDirectory, file).split("\\").join("/")))
            .filter((file) => file !== "sw.js");

        expect(expected.length).toBeGreaterThan(40);
        expect([...precache].sort()).toEqual([...expected].sort());
        // A different build gets a different cache name, so a deploy replaces the old files cleanly.
        expect(source).toMatch(/CACHE_NAME = CACHE_PREFIX \+ "[0-9a-f]{12}"/);
    });

    test("the service worker registers, precaches the game and controls the page after a reload", async ({ page }) => {
        // A cache left behind by an earlier deploy must go; one that belongs to somebody else must stay.
        await page.addInitScript(() => {
            // Runs on every load: only the first one, before any worker controls the page, seeds them
            if (!navigator.serviceWorker.controller) {
                void caches.open("mario-stale-deploy");
                void caches.open("not-ours");
            }
        });
        await bootGame(page);
        await installAndReload(page);

        const cached = await page.evaluate(async () => {
            const names = (await caches.keys()).filter((name) => name.startsWith("mario-"));
            const cache = await caches.open(names[0]);

            return { names, count: (await cache.keys()).length };
        });

        expect(cached.names).toHaveLength(1);
        expect(cached.names[0]).not.toBe("mario-stale-deploy");
        expect(cached.count).toBeGreaterThan(40);
        expect(await page.evaluate(() => caches.has("not-ours"))).toBe(true);
    });

    test("the game boots and plays sounds with no network", async ({ context, page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await installAndReload(page);

        await context.setOffline(true);

        const reloaded = await page.reload();
        expect(reloaded?.fromServiceWorker()).toBe(true);
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        await expect(page.locator("canvas").first()).toBeVisible();
        await expect(page).toHaveTitle("Super Mario Bros.");

        const sound = await page.evaluate(async (path) => {
            const whole = await fetch(path);
            const part = await fetch(path, { headers: { Range: "bytes=0-99" } });

            return {
                status: whole.status,
                type: whole.headers.get("content-type"),
                size: (await whole.arrayBuffer()).byteLength,
                partStatus: part.status,
                partRange: part.headers.get("content-range"),
                partSize: (await part.arrayBuffer()).byteLength
            };
        }, soundPath);

        expect(sound.status).toBe(200);
        expect(sound.type).toContain("audio");
        expect(sound.size).toBeGreaterThan(1000);
        // Audio elements fetch in byte ranges, and Safari needs a 206 for those.
        expect(sound.partStatus).toBe(206);
        expect(sound.partRange).toBe(`bytes 0-99/${sound.size}`);
        expect(sound.partSize).toBe(100);

        // The game itself must still run: step it and check Mario is alive.
        await page.keyboard.down("ArrowRight");
        await page.waitForFunction(() => (window as any).FSM.player.xvel > 0);
        await page.keyboard.up("ArrowRight");

        expect(errors).toEqual([]);
    });

    test("the game still boots after the server is gone, even when hosted in a subfolder", async ({
        context,
        page
    }) => {
        const host = await serveDistInSubfolder("/mario/");

        try {
            await page.goto(host.url);
            await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
            await installAndReload(page);
            expect(new URL(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).pathname).toBe(
                "/mario/sw.js"
            );
        } finally {
            await host.stop();
        }

        await context.setOffline(true);
        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        await expect(page.locator("canvas").first()).toBeVisible();

        // Sounds and the manifest come from the cache too
        const offline = await page.evaluate(async () => ({
            sound: (await fetch("Sounds/Sounds/mp3/Coin.mp3")).status,
            manifest: (await fetch("manifest.webmanifest")).status
        }));
        expect(offline).toEqual({ sound: 200, manifest: 200 });
    });

    for (const [name, script] of [
        ["rejects", "navigator.serviceWorker.register = () => Promise.reject(new Error('blocked'));"],
        ["throws", "navigator.serviceWorker.register = () => { throw new Error('blocked'); };"]
    ]) {
        test(`a registration that ${name} never shows up as a page error`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            await page.addInitScript(script);
            await bootGame(page);
            await page.waitForLoadState("load");
            // Registration waits for the load event: give it a moment to have been attempted.
            await page.waitForTimeout(300);

            expect(errors).toEqual([]);
            await expect(page.locator("canvas").first()).toBeVisible();
        });
    }
});
