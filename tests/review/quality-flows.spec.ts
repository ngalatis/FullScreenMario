import { expect, test, type Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "../helpers";

/**
 * Review tests for player-facing flows that the main suite did not exercise: mutation checks
 * showed that sending 1-1 to the wrong next level, or never saving a menu option, left the
 * suite green. These run the real game (at 5x speed where a cutscene would otherwise take
 * a long time) and only use the console API documented in the README.
 */

/** Moves the player dx pixels further into the map, scrolling the screen along so the map spawns as when walking. */
async function advancePlayer(page: Page, dx: number): Promise<void> {
    await page.evaluate((distance) => {
        const fsm = (window as any).FSM;
        let left = distance;

        while (left > 0) {
            const step = Math.min(left, 64);
            fsm.scrollPlayer(step);
            left -= step;
        }
    }, dx);
}

/** How many pixels the player must advance to be at map x (the screen scrolls, so thing.left alone is screen relative). */
async function distanceToMapX(page: Page, x: number): Promise<number> {
    return page.evaluate((target) => {
        const fsm = (window as any).FSM;
        const playerX = (fsm.MapScreener.left + fsm.player.left) / fsm.unitsize;

        return (target - playerX) * fsm.unitsize;
    }, x);
}

test.describe("level flow", () => {
    test("the castle door at the end of 1-1 leads to 1-2", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.locator("canvas").first().click();
        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.setMap("1-1");
            fsm.GamesRunner.setSpeed(5);
        });
        await page.waitForTimeout(200);

        // The EndOutsideCastle macro of 1-1 sits at x 1584; its pole is 3 units further right.
        await advancePlayer(page, await distanceToMapX(page, 1584 + 3 - 14));

        // The flagpole and castle spawned with the end of the map. The castle door detector carries
        // the transport to the next level; entering the door is what the flagpole cutscene ends with.
        const placed = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            const groups = fsm.GroupHolder.getGroups();
            const all: any[] = Object.keys(groups).flatMap((name) => groups[name]);
            const pole = all.find((thing) => thing.title === "FlagPole");
            const door = all.find((thing) => thing.title === "DetectCollision" && thing.transport && thing.transport.map);

            if (!pole || !door) {
                return false;
            }

            fsm.collideLevelTransport(fsm.player, door);
            return true;
        });
        expect(placed).toBe(true);

        await page.waitForFunction(
            () => {
                const fsm = (window as any).FSM;
                return fsm.ItemsHolder.getItem("world") === "1-2" || fsm.player.dead;
            },
            undefined,
            { timeout: 45_000 },
        );
        const outcome = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            return {
                world: fsm.ItemsHolder.getItem("world"),
                dead: !!fsm.player.dead,
                x: (fsm.MapScreener.left + fsm.player.left) / fsm.unitsize,
            };
        });
        expect(outcome, JSON.stringify(outcome)).toMatchObject({ world: "1-2", dead: false });
        await page.evaluate(() => (window as any).FSM.keyUpRight((window as any).FSM));
        await page.waitForTimeout(300);

        expect(await page.evaluate(() => !(window as any).FSM.player.dead)).toBe(true);
        expect(errors).toEqual([]);
    });

    test("crouching on the first pipe of 1-1 takes the player to the underground area", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.setMap("1-1");
            fsm.GamesRunner.setSpeed(5);
        });
        await page.waitForTimeout(200);

        // The Pipe macro at x 456 has "transport": 2 (the coin cellar), and is 16 units wide.
        await advancePlayer(page, await distanceToMapX(page, 456 + 8));

        const placed = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            const pipe = fsm.GroupHolder.getGroup("Solid").find(
                (thing: any) => String(thing.title).startsWith("Pipe") && thing.transport !== undefined && thing.actionTop,
            );

            if (!pipe) {
                return false;
            }

            fsm.setMidXObj(fsm.player, pipe);
            fsm.setBottom(fsm.player, pipe.top);
            fsm.player.yvel = 0;
            (window as any).__areaBefore = fsm.AreaSpawner.getArea();
            return true;
        });
        expect(placed).toBe(true);

        await page.waitForTimeout(200);
        await page.evaluate(() => (window as any).FSM.keyDownDown((window as any).FSM));
        await page.waitForFunction(
            () => (window as any).FSM.AreaSpawner.getArea() !== (window as any).__areaBefore,
            undefined,
            { timeout: 20_000 },
        );
        await page.evaluate(() => (window as any).FSM.keyUpDown((window as any).FSM));
        await page.waitForTimeout(300);

        const state = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            return { world: fsm.ItemsHolder.getItem("world"), dead: !!fsm.player.dead };
        });
        expect(state).toEqual({ world: "1-1", dead: false });
        expect(errors).toEqual([]);
    });

    test("losing the last life shows GAME OVER and restarts at 1-1 with three lives", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.setMap("1-2");
            fsm.GamesRunner.setSpeed(5);
            fsm.ItemsHolder.setItem("lives", 1);
        });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.killPlayer(fsm.player, 2);
        });

        // "GAME OVER" is drawn as a CustomText thing.
        await page.waitForFunction(
            () => {
                const groups = (window as any).FSM.GroupHolder.getGroups();
                return Object.keys(groups).some((name) =>
                    groups[name].some((thing: any) => thing.texts && thing.texts[0] && thing.texts[0].text === "GAME OVER"),
                );
            },
            undefined,
            { timeout: 20_000 },
        );

        await page.waitForFunction(
            () => {
                const fsm = (window as any).FSM;
                return fsm.ItemsHolder.getItem("world") === "1-1" && fsm.ItemsHolder.getItem("lives") === 3 && !fsm.player.dead;
            },
            undefined,
            { timeout: 30_000 },
        );
        expect(errors).toEqual([]);
    });
});

test.describe("keyboard", () => {
    test("the up arrow makes the player jump", async ({ page }) => {
        await bootGame(page);
        await page.waitForTimeout(500);
        await page.locator("canvas").first().click();

        const topBefore = await page.evaluate(() => (window as any).FSM.player.top as number);
        await page.keyboard.down("ArrowUp");
        await page.waitForFunction(
            (before) => {
                const player = (window as any).FSM.player;
                return player.top < before - 8 && player.yvel < 0;
            },
            topBefore,
            { timeout: 3000 },
        );
        await page.keyboard.up("ArrowUp");
    });
});

test.describe("saved options", () => {
    test("a menu option chosen by the player survives a reload", async ({ page }) => {
        await bootGame(page);

        const speed = page.locator("select").filter({ hasText: "2x" }).first();
        await speed.selectOption({ label: "2x" });
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getSpeed())).toBe(2);

        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);

        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getSpeed())).toBe(2);
        await expect(page.locator("select").filter({ hasText: "2x" }).first()).toHaveValue("2x");
    });
});
