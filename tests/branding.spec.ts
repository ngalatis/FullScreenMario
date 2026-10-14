import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { bootGame } from "./helpers";

/** Names of the original project and its social presence, which must not appear in the shipped game. */
const forbiddenTerms = ["fullscreenmario", "fullscreenshenanigans", "goldberg", "twitter", "facebook", "github"];

/** The one shipped file that is required to name the original author. */
const noticesFileName = "third-party-notices.txt";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));

function listFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);

        return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

function findForbiddenTerms(text: string): string[] {
    const lower = text.toLowerCase();

    return forbiddenTerms.filter((term) => lower.includes(term));
}

test.describe("branding", () => {
    test("the rendered page has no references to the original project", async ({ page }) => {
        await bootGame(page);

        expect(findForbiddenTerms(await page.content())).toEqual([]);
        await expect(page).toHaveTitle("Super Mario Bros.");
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    });

    test("the built files have no references to the original project", () => {
        const files = listFiles(distDirectory).filter((file) => !file.endsWith(noticesFileName));
        expect(files.length).toBeGreaterThan(5);

        const offenders: string[] = [];

        for (const file of files) {
            const name = relative(distDirectory, file);
            const found = [
                ...findForbiddenTerms(name),
                // latin1 keeps binary files (images, fonts, audio) scannable byte for byte.
                ...findForbiddenTerms(readFileSync(file, "latin1"))
            ];

            if (found.length > 0) {
                offenders.push(`${name}: ${[...new Set(found)].join(", ")}`);
            }
        }

        expect(offenders).toEqual([]);
    });

    test("the built game ships the third-party license notices", () => {
        const notices = readFileSync(join(distDirectory, noticesFileName), "utf8");

        expect(notices).toContain("Josh Goldberg");
    });

    test("search engines are told to stay away", () => {
        expect(readFileSync(join(distDirectory, "robots.txt"), "utf8")).toMatch(/Disallow:\s*\/\s*$/m);
    });
});
