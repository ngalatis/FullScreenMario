import { expect, test } from "@playwright/test";

import { bootGame, collectPageErrors } from "../helpers";

/**
 * Review repro: leaving the level editor through the Maps menu.
 *
 * LevelEditr.disable() reads GameStarter.settings.statistics, which this game does not
 * have (its items live in settings.items), so the first map picked after the editor was
 * used throws inside the click handler: the map is not set, the editor stays enabled and
 * lives stay at Infinity.
 */
test.describe("leaving the level editor", () => {
    test("picking a map from the Maps menu after using the editor starts that map", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.evaluate(async () => {
            const editor = await (window as any).FSM.loadLevelEditor();
            editor.enable();
        });
        await page.waitForFunction(() => (window as any).FSM.LevelEditor.getEnabled());

        // The map buttons only answer while their menu is open (hovered)
        await page.locator("#control-Maps").dispatchEvent("mouseover");
        await expect(page.locator("#control-Maps")).toHaveAttribute("active", "on");
        await page.locator("#control-Maps .maps-grid-option-range", { hasText: "1-2" }).dispatchEvent("click");

        const state = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            return {
                map: fsm.AreaSpawner.getMapName() as string,
                editorEnabled: fsm.LevelEditor.getEnabled() as boolean,
                lives: fsm.ItemsHolder.getItem("lives") as number
            };
        });

        expect(errors).toEqual([]);
        expect(state.map).toBe("1-2");
        expect(state.editorEnabled).toBe(false);
        expect(state.lives).toBe(3);
    });
});
