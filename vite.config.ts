import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

/**
 * Ships the third-party license notices (MIT and BSD) with the built game, as
 * required by those licenses. The source of truth stays in THIRD_PARTY_NOTICES.md.
 */
function thirdPartyNotices(): Plugin {
    return {
        name: "third-party-notices",
        generateBundle() {
            this.emitFile({
                type: "asset",
                fileName: "third-party-notices.txt",
                source: readFileSync(fileURLToPath(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url)), "utf8")
            });
        }
    };
}

/**
 * The lazy chunks (see codeSplitting below): the level editor and the map generator.
 */
const lazyChunks: string[] = ["level-editor", "map-generator"];

/**
 * Names the files of each lazy chunk in the page, as <meta name="lazy-chunk:NAME" content="FILE FILE...">:
 * the chunk and the chunks it imports that the page has not loaded already. A browser remembers a module
 * that failed to download for as long as the page is open, and fails every later import of it straight
 * away. So GameStartr first fetches the files (see fetchLazyChunk), and only imports the chunk once that
 * worked: a chunk the network could not deliver is then still downloaded next time.
 */
function lazyChunkNames(): Plugin {
    return {
        name: "lazy-chunk-names",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html, context) {
                const bundle = context.bundle ?? {};
                const isEntry = (file: string): boolean => {
                    const output = bundle[file];
                    return !!output && output.type === "chunk" && output.isEntry;
                };

                return Object.values(bundle).flatMap((output) =>
                    output.type === "chunk" && lazyChunks.includes(output.name)
                        ? [
                              {
                                  tag: "meta",
                                  attrs: {
                                      name: `lazy-chunk:${output.name}`,
                                      content: [
                                          output.fileName,
                                          ...output.imports.filter((file) => !isEntry(file))
                                      ].join(" ")
                                  },
                                  injectTo: "head" as const
                              }
                          ]
                        : []
                );
            }
        }
    };
}

/**
 * The service worker that makes the game installable and playable offline. It is generated after the
 * build, when dist/ holds every final file, so it can precache all of them: the page, the hashed
 * bundles, fonts, sounds, icons and the manifest.
 *
 * - The cache name carries a hash of all file names and contents, so every deploy that changes
 *   anything gets a fresh cache, and the old one is deleted when the new worker activates.
 * - Precached files are served cache-first (with Range support, which browsers need for audio).
 *   Anything else goes to the network. Offline, page loads fall back to the cached index.html.
 * - All URLs are relative to the worker's own scope, so it works on a subdomain or in a subfolder.
 */
function offlineSupport(): Plugin {
    let outDirectory = "";

    return {
        name: "offline-support",
        apply: "build",
        enforce: "post",
        configResolved(config) {
            outDirectory = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            const files = listFiles(outDirectory)
                .map((file) => relative(outDirectory, file).split("\\").join("/"))
                .filter((file) => file !== "sw.js")
                .sort();
            const hash = createHash("sha256");

            for (const file of files) {
                hash.update(file)
                    .update("\0")
                    .update(readFileSync(join(outDirectory, file)))
                    .update("\0");
            }

            // encodeURI because several sound files have spaces in their names
            const precache = files.map((file) => encodeURI(file));

            writeFileSync(
                join(outDirectory, "sw.js"),
                serviceWorkerSource
                    .replace("__CACHE_VERSION__", hash.digest("hex").slice(0, 12))
                    .replace("__PRECACHE__", JSON.stringify(precache, null, 4))
            );
        }
    };
}

function listFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);

        return entry.isDirectory() ? listFiles(path) : [path];
    });
}

const serviceWorkerSource = String.raw`"use strict";

const CACHE_PREFIX = "mario-";
const CACHE_NAME = CACHE_PREFIX + "__CACHE_VERSION__";
const PRECACHE = __PRECACHE__;

// Everything is resolved against the scope, never against the origin root
const scope = self.registration.scope;
const toUrl = (path) => new URL(path, scope).href;
const indexUrl = toUrl("index.html");
const shellPaths = [new URL(scope).pathname, new URL(indexUrl).pathname];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            // "reload" skips the browser's HTTP cache, so the precache holds exactly this deploy's files
            .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(toUrl(path), { cache: "reload" }))))
            .then(() => self.skipWaiting())
            // A failed install must not leave a half-filled cache behind
            .catch((error) => caches.delete(CACHE_NAME).then(() => { throw error; })));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))))
            .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(respond(request));
});

async function respond(request) {
    const isNavigation = request.mode === "navigate";
    const isShell = isNavigation && shellPaths.includes(new URL(request.url).pathname);
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isShell ? indexUrl : request.url);

    if (cached) {
        return request.headers.has("range") ? toRangeResponse(request, cached) : cached;
    }

    try {
        return await fetch(request);
    } catch (error) {
        const fallback = isNavigation ? await cache.match(indexUrl) : undefined;

        if (fallback) {
            return fallback;
        }

        throw error;
    }
}

/** Audio elements ask for byte ranges and Safari insists on a 206 answer, so slice the cached file. */
async function toRangeResponse(request, response) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");

    // Multi-range and "bytes=-" requests cannot be sliced: hand back the untouched full response
    if (!match || (match[1] === "" && match[2] === "")) {
        return response;
    }

    const blob = await response.blob();
    const size = blob.size;
    const start = match[1] === "" ? Math.max(size - Number(match[2]), 0) : Number(match[1]);
    const end = match[1] === "" || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);

    if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
    }

    return new Response(blob.slice(start, end + 1), {
        status: 206,
        statusText: "Partial Content",
        headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
            "Content-Length": String(end - start + 1),
            "Content-Range": "bytes " + start + "-" + end + "/" + size,
        },
    });
}
`;

export default defineConfig({
    // Relative asset URLs so dist/ works from any folder or subdomain.
    base: "./",
    plugins: [thirdPartyNotices(), lazyChunkNames(), offlineSupport()],
    build: {
        target: "es2022",
        // The game is one bundle (the original loaded ~70 scripts), except for the rarely used level
        // editor and map generator: each is a chunk of its own, fetched the first time it is needed
        // (see loadLevelEditor and loadWorldSeeder in GameStartr). The service worker precaches them.
        chunkSizeWarningLimit: 1000,
        rolldownOptions: {
            output: {
                codeSplitting: {
                    // Only the modules named here: their imports (the game itself) stay in the main bundle
                    includeDependenciesRecursively: false,
                    groups: [
                        {
                            name: lazyChunks[0],
                            test: /[\\/]src[\\/](engine[\\/]LevelEditr|game[\\/]settings[\\/]editor)\./
                        },
                        {
                            name: lazyChunks[1],
                            test: /[\\/]src[\\/](engine[\\/]WorldSeedr|game[\\/]settings[\\/](generator|maps[\\/]Random))\./
                        }
                    ]
                }
            }
        }
    }
});
