import { defineConfig } from "vite";

export default defineConfig({
    // Relative asset URLs so dist/ works from any folder or subdomain.
    base: "./",
    build: {
        target: "es2022",
        // The whole game is one bundle (the original loaded ~70 scripts).
        chunkSizeWarningLimit: 1000,
    },
});
