import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

/**
 * Tests for the game loop (GamesRunnr): a requestAnimationFrame loop with a fixed
 * timestep accumulator. The clock tests replace requestAnimationFrame with a fake whose
 * timestamps the test advances by hand, so the results do not depend on the machine.
 */

const STEP_MS = 1000 / 60;

/** Installs a manual requestAnimationFrame clock before the page's own scripts run. */
async function installFakeClock(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as any;
        let now = 1000;
        let nextId = 1;
        let queue: { id: number; callback: (time: number) => void }[] = [];

        w.requestAnimationFrame = (callback: (time: number) => void): number => {
            const id = nextId++;
            queue.push({ id, callback });
            return id;
        };
        w.cancelAnimationFrame = (id: number): void => {
            queue = queue.filter((entry) => entry.id !== id);
        };

        w.__counts = { upkeeps: 0, renders: 0 };
        w.__clock = {
            pending: (): number => queue.length,
            /** Runs one frame per delta, returning the [upkeeps, renders] each one caused. */
            run: (deltas: number[]): [number, number][] =>
                deltas.map((delta) => {
                    now += delta;
                    const upkeeps = w.__counts.upkeeps;
                    const renders = w.__counts.renders;
                    const due = queue;
                    queue = [];
                    due.forEach((entry) => entry.callback(now));
                    return [w.__counts.upkeeps - upkeeps, w.__counts.renders - renders];
                })
        };
    });
}

/** Boots the game under the fake clock and counts upkeeps (first game) and renders. */
async function bootWithFakeClock(page: Page): Promise<void> {
    await installFakeClock(page);
    await page.goto("/");
    // Interval polling: the default polls on animation frames, which this clock never delivers
    await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player, undefined, { polling: 50 });
    await page.evaluate(() => {
        const w = window as any;
        const games = w.FSM.GamesRunner.getGames();
        const firstGame = games[0];
        games[0] = function (this: unknown, ...args: unknown[]) {
            w.__counts.upkeeps += 1;
            return firstGame.apply(this, args);
        };

        const refill = w.FSM.PixelDrawer.refillGlobalCanvas;
        w.FSM.PixelDrawer.refillGlobalCanvas = function (this: unknown, ...args: unknown[]) {
            w.__counts.renders += 1;
            return refill.apply(this, args);
        };
    });
}

/** Advances the fake clock by one frame per delta; resolves to [upkeeps, renders] per frame. */
function runFrames(page: Page, deltas: number[]): Promise<[number, number][]> {
    return page.evaluate((frameDeltas) => (window as any).__clock.run(frameDeltas), deltas);
}

/** Runs the first frame of a run, which only marks a starting point and runs no upkeep. */
async function startClock(page: Page, hz: number): Promise<void> {
    const [[upkeeps]] = await runFrames(page, [1000 / hz]);
    expect(upkeeps).toBe(0);
}

const total = (frames: [number, number][], index = 0): number => frames.reduce((sum, frame) => sum + frame[index], 0);

const steady = (hz: number, seconds = 1): number[] => new Array(Math.round(hz * seconds)).fill(1000 / hz);

/** A small deterministic generator, so "random" jitter is the same on every run. */
function seededJitter(count: number, baseMs: number, amplitudeMs: number): number[] {
    let seed = 12345;
    return Array.from({ length: count }, () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return baseMs + (seed / 4294967296 - 0.5) * 2 * amplitudeMs;
    });
}

test.describe("fixed timestep loop (fake requestAnimationFrame)", () => {
    test.beforeEach(async ({ page }) => {
        await bootWithFakeClock(page);
    });

    for (const hz of [120, 60, 30, 144]) {
        test(`${hz} Hz runs about 60 upkeeps in one second`, async ({ page }) => {
            const { errors } = collectPageErrors(page);

            await startClock(page, hz);
            const frames = await runFrames(page, steady(hz));

            expect(Math.abs(total(frames) - 60)).toBeLessThanOrEqual(1);
            if (hz === 60) {
                expect(frames.every(([upkeeps]) => upkeeps === 1)).toBe(true);
            }
            if (hz === 30) {
                expect(frames.every(([upkeeps]) => upkeeps === 2)).toBe(true);
            }
            if (hz === 120) {
                expect(Math.max(...frames.map(([upkeeps]) => upkeeps))).toBe(1);
            }
            expect(errors).toEqual([]);
        });
    }

    test("timestamp noise does not flip frames between zero and two upkeeps", async ({ page }) => {
        // Timestamps rounded to 0.1 ms, as browsers do, average out to exactly 60 Hz: 16.6, 16.7, 16.7, ...
        await startClock(page, 60);
        const sixty = await runFrames(
            page,
            Array.from({ length: 180 }, (_, i) => (i % 3 === 0 ? 16.6 : 16.7))
        );
        expect(sixty.every(([upkeeps]) => upkeeps === 1)).toBe(true);

        // Likewise 120 Hz (8.3, 8.3, 8.4, ...): one upkeep on every other frame, steadily
        const hundredTwenty = await runFrames(
            page,
            Array.from({ length: 240 }, (_, i) => (i % 3 === 2 ? 8.4 : 8.3))
        );
        expect(hundredTwenty.every(([upkeeps], i) => upkeeps === (i % 2 === 1 ? 1 : 0))).toBe(true);
    });

    test("big frame jitter still keeps the long-run rate exact", async ({ page }) => {
        await startClock(page, 60);
        const deltas = seededJitter(600, STEP_MS, 4);
        const elapsed = deltas.reduce((sum, delta) => sum + delta, 0);
        const frames = await runFrames(page, deltas);

        expect(Math.abs(total(frames) - elapsed / STEP_MS)).toBeLessThanOrEqual(1);
    });

    test("a long stall runs at most the cap, then the game carries on normally", async ({ page }) => {
        await startClock(page, 60);
        await runFrames(page, steady(60, 0.5));

        const cap = await page.evaluate(() => (window as any).FSM.GamesRunner.getMaxUpdatesPerFrame());
        expect(cap).toBe(5);

        const [stall] = await runFrames(page, [5000]);
        expect(stall[0]).toBeGreaterThan(0);
        expect(stall[0]).toBeLessThanOrEqual(cap);

        // The dropped time is gone for good: no burst on the frames that follow
        const after = await runFrames(page, steady(60, 1));
        expect(after.every(([upkeeps]) => upkeeps === 1)).toBe(true);
    });

    test("pause stops upkeeps and the frame loop, play resumes without a burst", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await startClock(page, 60);
        expect(total(await runFrames(page, steady(60, 0.5)))).toBeGreaterThanOrEqual(29);

        await page.evaluate(() => (window as any).FSM.GamesRunner.pause());
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);
        expect(await page.evaluate(() => (window as any).__clock.pending())).toBe(0);
        expect(total(await runFrames(page, steady(60, 2)))).toBe(0);

        // play() runs one upkeep straight away, then the loop restarts from a fresh baseline
        const immediate = await page.evaluate(() => {
            const w = window as any;
            const before = w.__counts.upkeeps;
            w.FSM.GamesRunner.togglePause();
            return w.__counts.upkeeps - before;
        });
        expect(immediate).toBe(1);
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(false);

        const [firstAfterPlay] = await runFrames(page, [10_000]);
        expect(firstAfterPlay[0]).toBe(0);
        expect(Math.abs(total(await runFrames(page, steady(60))) - 60)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
    });

    test("pausing from inside an upkeep stops the rest of the frame", async ({ page }) => {
        await startClock(page, 30);
        const upkeeps = await page.evaluate(() => {
            const w = window as any;
            const games = w.FSM.GamesRunner.getGames();
            const inner = games[0];
            games[0] = function (this: unknown, ...args: unknown[]) {
                inner.apply(this, args);
                w.FSM.GamesRunner.pause();
            };
            const before = w.__counts.upkeeps;
            w.__clock.run([1000 / 30]);
            games[0] = inner;
            return w.__counts.upkeeps - before;
        });

        // Two upkeeps were owed, but the first one paused the game
        expect(upkeeps).toBe(1);
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);
        await page.evaluate(() => (window as any).FSM.GamesRunner.play());
    });

    test("speed 2x doubles the update rate through the timestep, 0.5x halves it", async ({ page }) => {
        await startClock(page, 60);

        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(2));
        const state = await page.evaluate(() => {
            const runner = (window as any).FSM.GamesRunner;
            return { speed: runner.getSpeed(), interval: runner.getInterval() };
        });
        expect(state.speed).toBe(2);
        expect(state.interval).toBeCloseTo(STEP_MS, 6);

        const fast60 = await runFrames(page, steady(60));
        expect(Math.abs(total(fast60) - 120)).toBeLessThanOrEqual(1);
        expect(fast60.every(([upkeeps]) => upkeeps === 2)).toBe(true);

        const fast120 = await runFrames(page, steady(120));
        expect(Math.abs(total(fast120) - 120)).toBeLessThanOrEqual(1);

        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(5));
        const veryFast = await runFrames(page, steady(60));
        expect(Math.abs(total(veryFast) - 300)).toBeLessThanOrEqual(1);

        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(0.5));
        const slow = await runFrames(page, steady(60, 2));
        expect(Math.abs(total(slow) - 60)).toBeLessThanOrEqual(1);

        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(1));
        const normal = await runFrames(page, steady(60));
        expect(Math.abs(total(normal) - 60)).toBeLessThanOrEqual(1);
    });

    test("a speed change does not turn owed time into a burst", async ({ page }) => {
        await startClock(page, 60);
        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(0.25));
        await runFrames(page, steady(60, 0.2));

        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(1));
        const frames = await runFrames(page, steady(60, 0.5));
        expect(Math.max(...frames.map(([upkeeps]) => upkeeps))).toBeLessThanOrEqual(1);
    });

    test("becoming visible again restarts the clock instead of catching up", async ({ page }) => {
        await startClock(page, 60);
        await runFrames(page, steady(60, 0.25));

        // Frames stop while hidden; the first one after coming back would otherwise be owed everything
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        const [back] = await runFrames(page, [3000]);
        expect(back[0]).toBe(0);
        expect(Math.abs(total(await runFrames(page, steady(60))) - 60)).toBeLessThanOrEqual(1);
    });

    test("rendering happens once per frame that ran upkeeps, not once per upkeep", async ({ page }) => {
        // 30 Hz: two upkeeps per frame, one render
        await startClock(page, 30);
        const slowScreen = await runFrames(page, steady(30));
        expect(total(slowScreen)).toBeGreaterThanOrEqual(59);
        expect(slowScreen.every(([upkeeps, renders]) => upkeeps === 2 && renders === 1)).toBe(true);

        // 120 Hz: frames without an upkeep draw nothing new
        const fastScreen = await runFrames(page, steady(120));
        expect(fastScreen.every(([upkeeps, renders]) => renders === Math.min(upkeeps, 1))).toBe(true);
        expect(total(fastScreen, 1)).toBe(total(fastScreen, 0));

        // 60 Hz at 2x: two upkeeps per frame, one render
        await page.evaluate(() => (window as any).FSM.GamesRunner.setSpeed(2));
        const doubled = await runFrames(page, steady(60, 0.5));
        expect(doubled.every(([upkeeps, renders]) => upkeeps === 2 && renders === 1)).toBe(true);
    });

    test("manual upkeeps and steps still render", async ({ page }) => {
        await page.evaluate(() => (window as any).FSM.GamesRunner.pause());
        const counts = await page.evaluate(() => {
            const w = window as any;
            const before = { ...w.__counts };
            w.FSM.GamesRunner.step(0);
            return { upkeeps: w.__counts.upkeeps - before.upkeeps, renders: w.__counts.renders - before.renders };
        });

        expect(counts).toEqual({ upkeeps: 1, renders: 1 });
        expect(await page.evaluate(() => (window as any).FSM.GamesRunner.getPaused())).toBe(true);
    });

    test("FPS measurements follow the logic rate, not the display's", async ({ page }) => {
        await startClock(page, 30);
        await runFrames(page, steady(30, 2));

        // Two upkeeps in one frame are not measured as an instant followed by a long gap
        const average = await page.evaluate(() => (window as any).FSM.FPSAnalyzer.getAverage());
        expect(average).toBeGreaterThan(58);
        expect(average).toBeLessThan(62);
    });
});

test.describe("configurable scheduler", () => {
    test("a custom upkeepScheduler and upkeepCanceller drive the loop, with timestamps from the FPSAnalyzer", async ({
        page
    }) => {
        await bootGame(page);

        const result = await page.evaluate(() => {
            const FSM = (window as any).FSM;
            const GamesRunnr = FSM.GamesRunner.constructor;
            const FPSAnalyzr = FSM.GamesRunner.getFPSAnalyzer().constructor;

            let time = 5000;
            let scheduled: (() => void) | undefined;
            const cancelled: number[] = [];
            let upkeeps = 0;
            let renders = 0;

            const runner = new GamesRunnr({
                games: [
                    () => {
                        upkeeps += 1;
                    }
                ],
                renderers: [
                    () => {
                        renders += 1;
                    }
                ],
                FPSAnalyzer: new FPSAnalyzr({ getTimestamp: () => time }),
                // A setTimeout-like scheduler: it never passes a timestamp
                upkeepScheduler: (callback: () => void) => {
                    scheduled = callback;
                    return 7;
                },
                upkeepCanceller: (handle: number) => {
                    cancelled.push(handle);
                    scheduled = undefined;
                }
            });

            runner.play();
            const afterPlay = upkeeps;

            // Frames every 20 ms for 2 seconds (the first one only sets the starting point)
            for (let i = 0; i < 100; i += 1) {
                time += 20;
                scheduled!();
            }
            const running = upkeeps - afterPlay;

            runner.pause();
            return {
                afterPlay,
                running,
                renders,
                cancelled,
                scheduledAfterPause: !!scheduled,
                average: runner.getFPSAnalyzer().getAverage()
            };
        });

        expect(result.afterPlay).toBe(1);
        expect(Math.abs(result.running - (99 * 20) / STEP_MS)).toBeLessThanOrEqual(1);
        // One render for the manual upkeep in play(), then one per frame that ran upkeeps
        expect(result.renders).toBe(1 + 99);
        expect(result.cancelled).toEqual([7]);
        expect(result.scheduledAfterPause).toBe(false);
        expect(result.average).toBeGreaterThan(58);
        expect(result.average).toBeLessThan(62);
    });
});

test.describe("real clock", () => {
    test("the game keeps its 60 updates per second and FSM.FPSAnalyzer averages about 60", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.evaluate(() => {
            const w = window as any;
            const games = w.FSM.GamesRunner.getGames();
            const firstGame = games[0];
            w.__upkeeps = 0;
            games[0] = function (this: unknown, ...args: unknown[]) {
                w.__upkeeps += 1;
                return firstGame.apply(this, args);
            };
        });

        await page.waitForTimeout(500);
        const startedAt = await page.evaluate(() => ({ time: performance.now(), upkeeps: (window as any).__upkeeps }));
        await page.waitForTimeout(2500);
        const endedAt = await page.evaluate(() => ({ time: performance.now(), upkeeps: (window as any).__upkeeps }));

        const perSecond = ((endedAt.upkeeps - startedAt.upkeeps) * 1000) / (endedAt.time - startedAt.time);
        expect(perSecond).toBeGreaterThan(54);
        expect(perSecond).toBeLessThan(66);

        const analyzer = await page.evaluate(() => {
            const fps = (window as any).FSM.FPSAnalyzer;
            return { average: fps.getAverage() as number, recorded: fps.getNumRecorded() as number };
        });
        expect(analyzer.recorded).toBeGreaterThan(35);
        expect(analyzer.average).toBeGreaterThan(55);
        expect(analyzer.average).toBeLessThan(65);
        expect(errors).toEqual([]);
    });
});
