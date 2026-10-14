import { readFileSync } from "node:fs";
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
                source: readFileSync(fileURLToPath(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url)), "utf8"),
            });
        },
    };
}

export default defineConfig({
    // Relative asset URLs so dist/ works from any folder or subdomain.
    base: "./",
    plugins: [thirdPartyNotices()],
    build: {
        target: "es2022",
        // The whole game is one bundle (the original loaded ~70 scripts).
        chunkSizeWarningLimit: 1000,
    },
});
