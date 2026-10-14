import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
    testDir: "./tests",
    timeout: 60_000,
    fullyParallel: true,
    retries: 0,
    reporter: [["list"]],
    use: {
        baseURL: `http://localhost:${port}`,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        // Tests run against the production build, served by `vite preview`.
        command: `npm run build && npm run preview -- --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
