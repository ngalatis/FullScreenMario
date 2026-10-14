import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Review test: a static host (or a security header added at the CDN) commonly sends a
 * Content-Security-Policy without 'unsafe-eval'. The game must still boot under it, which
 * means no eval() and no Function constructor anywhere in the bundle.
 */

const distDirectory = fileURLToPath(new URL("../../dist", import.meta.url));

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

const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // The game injects its own <style> element (UserWrappr styleSheet), which needs inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'"
].join("; ");

async function serveDistWithCsp(): Promise<{ url: string; stop: () => Promise<void> }> {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
        const file = join(distDirectory, path === "/" ? "index.html" : path.slice(1));

        try {
            if (!file.startsWith(distDirectory)) {
                throw new Error("not found");
            }

            response.writeHead(200, {
                "Content-Type": mimeTypes[extname(file)] ?? "application/octet-stream",
                "Content-Security-Policy": policy
            });
            response.end(readFileSync(file));
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

test.describe("content security policy", () => {
    test("the game boots under a policy without 'unsafe-eval'", async ({ page }) => {
        const violations: string[] = [];
        page.on("console", (message) => {
            if (/Content Security Policy|unsafe-eval/.test(message.text())) {
                violations.push(message.text());
            }
        });
        page.on("pageerror", (error) => violations.push(String(error.message)));

        const host = await serveDistWithCsp();
        let booted = false;

        try {
            await page.goto(host.url);
            await page
                .waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player, undefined, {
                    timeout: 15_000
                })
                .then(
                    () => (booted = true),
                    () => (booted = false)
                );
        } finally {
            await host.stop();
        }

        expect(violations).toEqual([]);
        expect(booted).toBe(true);
    });
});
