import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

/**
 * Game controller support, driven by fake controllers.
 *
 * Every test installs a stand-in for navigator.getGamepads before the page loads. Like Chrome's, it answers each
 * call with brand new snapshot objects, so a game that keeps the first object it was given never sees a change.
 * The controllers are then played from the tests (press, release, tilt, unplug) through window.fakePads.
 *
 * Buttons use the standard layout: 0 bottom, 1 right, 2 left, 3 top, 4 to 7 shoulders and triggers, 8 Select,
 * 9 Start, 12 to 15 the D-pad (up, down, left, right).
 */

const BUTTON = {
    bottom: 0,
    right: 1,
    left: 2,
    top: 3,
    select: 8,
    start: 9,
    up: 12,
    down: 13,
    dpadLeft: 14,
    dpadRight: 15
};

/** Runs inside the page, before anything else, to replace navigator.getGamepads. */
function installFakePads(): void {
    interface FakePad {
        id: string;
        mapping: string;
        axes: number[];
        pressed: boolean[];
    }

    const slots: (FakePad | null)[] = [null, null, null, null];
    const counters = { reads: 0 };
    let failWith: string | null = null;

    const snapshot = (pad: FakePad, index: number) => ({
        id: pad.id,
        index,
        connected: true,
        mapping: pad.mapping,
        timestamp: performance.now(),
        axes: pad.axes.slice(),
        buttons: Array.from({ length: 17 }, (_, button) => ({
            pressed: !!pad.pressed[button],
            touched: !!pad.pressed[button],
            value: pad.pressed[button] ? 1 : 0
        })),
        vibrationActuator: null
    });

    const announce = (type: string, pad: FakePad, index: number): void => {
        const event = new Event(type);
        (event as any).gamepad = snapshot(pad, index);
        window.dispatchEvent(event);
    };

    (navigator as any).getGamepads = () => {
        counters.reads += 1;
        if (failWith) {
            throw new DOMException(failWith, "SecurityError");
        }
        return slots.map((pad, index) => (pad ? snapshot(pad, index) : null));
    };

    (window as any).fakePads = {
        counters,
        connect(index: number, mapping = "standard", announced = true): void {
            const pad: FakePad = { id: `Fake pad ${index}`, mapping, axes: [0, 0, 0, 0], pressed: [] };
            slots[index] = pad;
            if (announced) {
                announce("gamepadconnected", pad, index);
            }
        },
        disconnect(index: number, announced = true): void {
            const pad = slots[index];
            slots[index] = null;
            if (pad && announced) {
                announce("gamepaddisconnected", pad, index);
            }
        },
        press(index: number, button: number): void {
            slots[index]!.pressed[button] = true;
        },
        release(index: number, button: number): void {
            slots[index]!.pressed[button] = false;
        },
        tilt(index: number, x: number, y: number): void {
            slots[index]!.axes[0] = x;
            slots[index]!.axes[1] = y;
        },
        failWith(name: string | null): void {
            failWith = name;
        }
    };
}

/** Plays the fake controllers from the test. */
class Pads {
    constructor(private readonly page: Page) {}

    connect(index = 0, mapping = "standard", announced = true): Promise<void> {
        return this.page.evaluate(([i, m, a]) => (window as any).fakePads.connect(i, m, a), [
            index,
            mapping,
            announced
        ] as const);
    }

    disconnect(index = 0, announced = true): Promise<void> {
        return this.page.evaluate(([i, a]) => (window as any).fakePads.disconnect(i, a), [index, announced] as const);
    }

    press(button: number, index = 0): Promise<void> {
        return this.page.evaluate(([i, b]) => (window as any).fakePads.press(i, b), [index, button] as const);
    }

    release(button: number, index = 0): Promise<void> {
        return this.page.evaluate(([i, b]) => (window as any).fakePads.release(i, b), [index, button] as const);
    }

    tilt(x: number, y: number, index = 0): Promise<void> {
        return this.page.evaluate(([i, tx, ty]) => (window as any).fakePads.tilt(i, tx, ty), [index, x, y] as const);
    }

    reads(): Promise<number> {
        return this.page.evaluate(() => (window as any).fakePads.counters.reads as number);
    }
}

/** What the game believes the player is doing. */
async function readPlayer(page: Page) {
    return page.evaluate(() => {
        const player = (window as any).FSM.player;
        return {
            left: player.left as number,
            top: player.top as number,
            xvel: player.xvel as number,
            yvel: player.yvel as number,
            resting: !!player.resting,
            rightDown: !!player.keys.rightDown,
            leftDown: !!player.keys.leftDown,
            run: player.keys.run as number,
            up: !!player.keys.up,
            jump: !!player.keys.jump,
            crouch: !!player.keys.crouch,
            sprint: !!player.keys.sprint
        };
    });
}

const isPaused = (page: Page) => page.evaluate(() => (window as any).FSM.GamesRunner.getPaused() as boolean);
const isMuted = (page: Page) => page.evaluate(() => (window as any).FSM.AudioPlayer.getMuted() as boolean);

/** Waits for a number of game updates to pass, however slow the machine is. */
async function waitForUpdates(page: Page, updates: number): Promise<void> {
    await page.evaluate(
        (count) =>
            new Promise<void>((resolve) => {
                const runner = (window as any).FSM.GamesRunner;
                const analyzer = runner.getFPSAnalyzer();
                const start = analyzer.getNumRecorded ? analyzer.getNumRecorded() : 0;
                let frames = 0;
                const tick = () => {
                    frames += 1;
                    // Paused games make no updates, so frames are what can be counted then
                    if (runner.getPaused() ? frames >= count : analyzer.getNumRecorded() - start >= count) {
                        resolve();
                    } else {
                        requestAnimationFrame(tick);
                    }
                };
                requestAnimationFrame(tick);
            }),
        updates
    );
}

/** Opens the game with fake controllers installed and waits until Mario stands on the ground. */
async function startGame(page: Page): Promise<Pads> {
    await page.addInitScript(installFakePads);
    await bootGame(page);
    await page.waitForFunction(() => {
        const fsm = (window as any).FSM;
        return !fsm.GamesRunner.getPaused() && !!fsm.player.resting;
    });
    return new Pads(page);
}

/** Records every gamepad press the game is told about, as "onkeydown:right" and "onkeyup:right". */
async function recordInputs(page: Page): Promise<void> {
    await page.evaluate(() => {
        const writer = (window as any).FSM.InputWriter;
        const original = writer.callEvent.bind(writer);
        const calls: string[] = ((window as any).inputCalls = []);

        writer.callEvent = (event: unknown, key: unknown, source: unknown) => {
            if (typeof event === "string") {
                calls.push(`${event}:${String(key)}`);
            }
            return original(event, key, source);
        };
    });
}

const recordedInputs = (page: Page) => page.evaluate(() => [...((window as any).inputCalls as string[])]);

test.describe("moving", () => {
    test("D-pad right moves the player right, and letting go stops the walk", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);

        const before = await readPlayer(page);
        await pads.connect();
        await pads.press(BUTTON.dpadRight);

        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
        expect((await readPlayer(page)).rightDown).toBe(true);

        await pads.release(BUTTON.dpadRight);
        await page.waitForFunction(() => {
            const player = (window as any).FSM.player;
            return !player.keys.rightDown && player.keys.run === 0;
        });
        expect(errors).toEqual([]);
    });

    test("D-pad left moves the player left", async ({ page }) => {
        const pads = await startGame(page);

        // Walk right first so there is room to come back
        await pads.connect();
        await pads.press(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.xvel > 0.5);
        await pads.release(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.xvel === 0);

        const before = await readPlayer(page);
        await pads.press(BUTTON.dpadLeft);
        await page.waitForFunction((x) => (window as any).FSM.player.left < x - 8, before.left);
        expect((await readPlayer(page)).leftDown).toBe(true);
    });

    test("the left stick moves the player", async ({ page }) => {
        const pads = await startGame(page);

        const before = await readPlayer(page);
        await pads.connect();
        await pads.tilt(1, 0);

        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
        expect((await readPlayer(page)).rightDown).toBe(true);

        await pads.tilt(0, 0);
        await page.waitForFunction(() => !(window as any).FSM.player.keys.rightDown);
    });

    test("the run buttons make the player faster, and they work from every button meant for them", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        // Walk first, to find out how fast walking is
        await pads.press(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.xvel > 0.5);
        await waitForUpdates(page, 90);
        const walking = (await readPlayer(page)).xvel;
        expect((await readPlayer(page)).sprint).toBe(false);

        // Then run
        await pads.press(BUTTON.left);
        await page.waitForFunction(() => (window as any).FSM.player.keys.sprint === true);
        await page.waitForFunction((slow) => (window as any).FSM.player.xvel > slow * 1.2, walking);
        await pads.release(BUTTON.left);
        await page.waitForFunction(() => (window as any).FSM.player.keys.sprint === false);

        // Each of the others sets and clears the sprint key too
        for (const button of [BUTTON.top, 4, 5, 6, 7]) {
            await pads.press(button);
            await page.waitForFunction(() => (window as any).FSM.player.keys.sprint === true);
            await pads.release(button);
            await page.waitForFunction(() => (window as any).FSM.player.keys.sprint === false);
        }
    });

    test("a pad in slot 1 works while slot 0 is empty", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);

        const before = await readPlayer(page);
        await pads.connect(1);
        await pads.press(BUTTON.dpadRight, 1);

        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
        expect(errors).toEqual([]);
    });

    test("a pad that is plugged in without any event is found anyway", async ({ page }) => {
        const pads = await startGame(page);

        const before = await readPlayer(page);
        await pads.connect(2, "standard", false);
        await pads.press(BUTTON.dpadRight, 2);

        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
    });

    test("any of several pads can play, and a button stays down until every pad lets go of it", async ({ page }) => {
        const pads = await startGame(page);
        await recordInputs(page);
        await pads.connect(0);
        await pads.connect(1);

        await pads.press(BUTTON.dpadRight, 0);
        await pads.press(BUTTON.dpadRight, 1);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === true);

        await pads.release(BUTTON.dpadRight, 0);
        await waitForUpdates(page, 10);
        expect((await readPlayer(page)).rightDown).toBe(true);

        await pads.release(BUTTON.dpadRight, 1);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === false);

        expect(await recordedInputs(page)).toEqual(["onkeydown:right", "onkeyup:right"]);
    });

    test("a pad with an unknown layout is played like a standard one, and a stranger one is ignored", async ({
        page
    }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);

        await pads.connect(0, "");
        await pads.press(BUTTON.dpadRight, 0);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === true);
        await pads.release(BUTTON.dpadRight, 0);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === false);

        await pads.disconnect(0);
        await pads.connect(1, "xr-standard");
        await pads.press(BUTTON.dpadRight, 1);
        await pads.press(BUTTON.start, 1);
        await waitForUpdates(page, 20);
        expect((await readPlayer(page)).rightDown).toBe(false);
        expect(await isPaused(page)).toBe(false);
        expect(errors).toEqual([]);
    });
});

test.describe("jumping", () => {
    for (const [name, button] of [
        ["the bottom face button", BUTTON.bottom],
        ["the right face button", BUTTON.right],
        ["D-pad up", BUTTON.up]
    ] as const) {
        test(`${name} makes the player jump`, async ({ page }) => {
            const pads = await startGame(page);
            await pads.connect();

            const before = await readPlayer(page);
            await pads.press(button);
            await page.waitForFunction((top) => (window as any).FSM.player.top < top - 8, before.top);
            expect((await readPlayer(page)).up).toBe(true);

            await pads.release(button);
            await page.waitForFunction(() => (window as any).FSM.player.keys.up === false);
            await page.waitForFunction(() => !!(window as any).FSM.player.resting);
        });
    }

    test("pressing and letting go sends exactly one keydown and one keyup, however long it is held", async ({
        page
    }) => {
        const pads = await startGame(page);
        await recordInputs(page);
        await pads.connect();

        // Both jump buttons at once are still a single press of "up"
        await pads.press(BUTTON.bottom);
        await pads.press(BUTTON.right);
        await waitForUpdates(page, 40);
        await pads.release(BUTTON.bottom);
        await waitForUpdates(page, 10);
        await pads.release(BUTTON.right);
        await waitForUpdates(page, 10);

        await pads.press(BUTTON.left);
        await waitForUpdates(page, 30);
        await pads.release(BUTTON.left);
        await waitForUpdates(page, 10);

        expect(await recordedInputs(page)).toEqual([
            "onkeydown:up",
            "onkeyup:up",
            "onkeydown:sprint",
            "onkeyup:sprint"
        ]);
    });
});

test.describe("the left stick", () => {
    test("ignores small tilts", async ({ page }) => {
        const pads = await startGame(page);
        await recordInputs(page);
        await pads.connect();

        const before = await readPlayer(page);
        for (const [x, y] of [
            [0.15, 0.1],
            [-0.3, 0.2],
            [0.1, -0.35],
            [0, 0.4]
        ]) {
            await pads.tilt(x, y);
            await waitForUpdates(page, 15);
        }

        const after = await readPlayer(page);
        expect(after.left).toBe(before.left);
        expect(after.rightDown || after.leftDown || after.crouch || after.up).toBe(false);
        expect(await recordedInputs(page)).toEqual([]);
    });

    test("does not make the player jump or crouch while running diagonally", async ({ page }) => {
        const pads = await startGame(page);
        await recordInputs(page);
        await pads.connect();

        // Up and right, as far as a stick with a round gate goes, and then a square gate's corner
        for (const [x, y] of [
            [0.7, -0.7],
            [1, -1],
            [0.7, 0.7],
            [1, 1],
            [-0.7, -0.7],
            [-1, 1]
        ]) {
            await pads.tilt(x, y);
            await waitForUpdates(page, 12);
            const state = await readPlayer(page);
            expect(state.up, `up at ${x}, ${y}`).toBe(false);
            expect(state.crouch, `crouch at ${x}, ${y}`).toBe(false);
            expect(state.rightDown || state.leftDown, `run at ${x}, ${y}`).toBe(true);
        }

        // Straight up is not a button at all
        await pads.tilt(0, -1);
        await waitForUpdates(page, 12);
        expect((await readPlayer(page)).up).toBe(false);

        await pads.tilt(0, 0);
        await waitForUpdates(page, 5);
        expect((await recordedInputs(page)).filter((call) => call.includes(":up") || call.includes(":down"))).toEqual(
            []
        );
    });

    test("crouches when pushed clearly down, and lets go when it comes back", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await pads.tilt(0, 0.95);
        await page.waitForFunction(() => (window as any).FSM.player.keys.crouch === true);

        await pads.tilt(0, 0.1);
        await page.waitForFunction(() => (window as any).FSM.player.keys.crouch === false);
    });

    test("does not flutter when it rests near the edge of a dead zone", async ({ page }) => {
        const pads = await startGame(page);
        await recordInputs(page);
        await pads.connect();

        await pads.tilt(0.9, 0);
        await waitForUpdates(page, 5);
        // Wobbling between a clear lean and a lean that is a little less
        for (const x of [0.4, 0.8, 0.38, 0.7, 0.42]) {
            await pads.tilt(x, 0);
            await waitForUpdates(page, 4);
        }
        await pads.tilt(0, 0);
        await waitForUpdates(page, 5);

        expect(await recordedInputs(page)).toEqual(["onkeydown:right", "onkeyup:right"]);
    });
});

test.describe("pausing and muting", () => {
    test("Start pauses, and Start again unpauses, once per press", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);
        await pads.connect();

        // Held for a while, it is still one press
        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === true);
        await waitForUpdates(page, 30);
        expect(await isPaused(page)).toBe(true);
        await pads.release(BUTTON.start);
        await waitForUpdates(page, 10);
        expect(await isPaused(page)).toBe(true);

        // The game is paused, so its own loop is not running: only the controller check is
        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === false);
        await waitForUpdates(page, 30);
        expect(await isPaused(page)).toBe(false);
        await pads.release(BUTTON.start);

        expect(errors).toEqual([]);
    });

    test("pausing does not freeze a held direction for good", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === true);
        await pads.release(BUTTON.start);

        // Pressed while paused, held across the unpause
        await pads.press(BUTTON.dpadRight);
        await waitForUpdates(page, 10);
        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === false);
        await pads.release(BUTTON.start);

        const before = await readPlayer(page);
        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
        expect((await readPlayer(page)).rightDown).toBe(true);
    });

    test("a direction let go of during a pause does not stay held", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await pads.press(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === true);
        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === true);
        await pads.release(BUTTON.start);

        await pads.release(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === false);
    });

    test("Select toggles mute, once per press", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);
        await pads.connect();
        expect(await isMuted(page)).toBe(false);

        await pads.press(BUTTON.select);
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getMuted() === true);
        await waitForUpdates(page, 30);
        expect(await isMuted(page)).toBe(true);
        await pads.release(BUTTON.select);
        await waitForUpdates(page, 10);

        await pads.press(BUTTON.select);
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getMuted() === false);
        await pads.release(BUTTON.select);

        expect(errors).toEqual([]);
    });
});

test.describe("plugging in and out", () => {
    test("unplugging while holding right stops the player", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);
        await pads.connect();

        await pads.press(BUTTON.dpadRight);
        await pads.press(BUTTON.left);
        await page.waitForFunction(() => (window as any).FSM.player.xvel > 0.5);

        await pads.disconnect();
        await page.waitForFunction(() => {
            const keys = (window as any).FSM.player.keys;
            return !keys.rightDown && keys.run === 0 && !keys.sprint;
        });
        await page.waitForFunction(() => (window as any).FSM.player.xvel === 0, undefined, { timeout: 10_000 });

        expect(errors).toEqual([]);
    });

    test("a pad that vanishes without a disconnect event lets go of everything too", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await pads.press(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === true);

        await pads.disconnect(0, false);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === false);
    });

    test("unplugging while paused lets go too, and the pad can be plugged back in", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await pads.press(BUTTON.dpadRight);
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === true);
        await pads.press(BUTTON.start);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === true);

        await pads.disconnect();
        await page.waitForFunction(() => (window as any).FSM.player.keys.rightDown === false);

        // A different slot this time; Start must still unpause
        await pads.connect(3);
        await pads.press(BUTTON.start, 3);
        await page.waitForFunction(() => (window as any).FSM.GamesRunner.getPaused() === false);
    });
});

test.describe("without a controller", () => {
    test("nothing connected means no errors and next to no checking", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);

        await page.waitForTimeout(1500);
        const reads = await pads.reads();

        // A check on every one of the roughly 90 updates would be far above this
        expect(reads).toBeLessThan(40);
        expect(await isPaused(page)).toBe(false);
        expect(errors).toEqual([]);
    });

    test("a browser that never heard of controllers plays fine", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.addInitScript(() => {
            delete (Navigator.prototype as any).getGamepads;
        });
        await bootGame(page);
        await page.waitForTimeout(800);

        expect(await page.evaluate(() => typeof navigator.getGamepads)).toBe("undefined");
        expect(errors).toEqual([]);
    });

    test("a page that is not allowed to use controllers plays fine", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await page.addInitScript(installFakePads);
        await page.addInitScript(() => (window as any).fakePads.failWith("Gamepad access is blocked"));
        await bootGame(page);
        await page.waitForTimeout(800);

        // The game is not spammed with a failing call either
        expect(await new Pads(page).reads()).toBeLessThan(5);
        expect(errors).toEqual([]);
    });

    test("the keyboard still plays", async ({ page }) => {
        const pads = await startGame(page);
        await pads.connect();

        await page.locator("canvas").first().click();
        const before = await readPlayer(page);
        await page.keyboard.down("ArrowRight");
        await page.waitForFunction((x) => (window as any).FSM.player.left > x + 20, before.left);
        await page.keyboard.up("ArrowRight");
    });
});

test.describe("on a touch screen", () => {
    // Playwright forbids changing the browser type from inside a project, so only keep the emulation.
    const { defaultBrowserType: _ignored, ...iPhoneLandscape } = devices["iPhone 13 landscape"];
    test.use(iPhoneLandscape);

    test("the on-screen controls hide while a pad is played, and come back with a touch", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const pads = await startGame(page);
        await page.waitForTimeout(300);

        const controls = page.locator(".touch-passer-container");
        await expect(controls).toBeVisible();

        // Merely having a pad plugged in changes nothing
        await pads.connect();
        await waitForUpdates(page, 20);
        await expect(controls).toBeVisible();

        await pads.press(BUTTON.dpadRight);
        await expect(controls).toBeHidden();
        await pads.release(BUTTON.dpadRight);
        await waitForUpdates(page, 20);
        await expect(controls).toBeHidden();

        await page.touchscreen.tap(332, 150);
        await expect(controls).toBeVisible();

        // And the next press of the pad hides them again
        await pads.press(BUTTON.bottom);
        await expect(controls).toBeHidden();
        await pads.release(BUTTON.bottom);

        expect(errors).toEqual([]);
    });
});
