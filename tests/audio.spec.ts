import { expect, test, type Page } from "@playwright/test";

import { bootGame, collectPageErrors } from "./helpers";

// Pin the strict autoplay policy, so the AudioContext reliably starts suspended.
test.use({ launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } });

/**
 * Counts the audio sources the page starts, independently of the game's own
 * bookkeeping, so tests can tell that sound really was sent to the speakers.
 */
async function trackSources(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as any;
        w.__sources = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...args: any[]) {
            w.__sources.push({ duration: this.buffer ? this.buffer.duration : 0, loop: this.loop });
            return (start as any).apply(this, args);
        };
    });
}

/** The audio state the game reports. */
function audioState(page: Page) {
    return page.evaluate(() => {
        const player = (window as any).FSM.AudioPlayer;
        const theme = player.getTheme();
        return {
            context: player.getContextState() as string,
            gain: player.getOutputGain() as number,
            muted: player.getMuted() as boolean,
            volume: player.getVolume() as number,
            themeName: player.getThemeName() as string,
            themePaused: theme ? (theme.paused as boolean) : undefined,
            themeAudible: theme ? (theme.audible as boolean) : undefined,
            loopingSources: ((window as any).__sources || []).filter((s: any) => s.loop && s.duration > 5).length as number,
        };
    });
}

/** The volume setting is stored exactly, and the (float32) output gain follows it. */
async function expectVolume(page: Page, volume: number): Promise<void> {
    const state = await audioState(page);
    expect(state.volume).toBe(volume);
    expect(state.gain).toBeCloseTo(volume, 5);
}

/** Waits until the level theme is really sounding. */
async function expectThemeAudible(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const player = (window as any).FSM.AudioPlayer;
        const theme = player.getTheme();
        return player.getContextState() === "running" && !!theme && !theme.paused && theme.audible;
    });
    const state = await audioState(page);
    expect(state.themeName).toBe("Overworld");
    expect(state.loopingSources).toBeGreaterThanOrEqual(1);
}

test.describe("autoplay", () => {
    test("boots silently without page errors before any gesture", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.waitForTimeout(1500);

        const state = await audioState(page);
        expect(state.context).toBe("suspended");
        // The theme has been requested, and the game clock follows it, but nothing is audible yet.
        expect(state.themeName).toBe("Overworld");
        expect(state.themePaused).toBe(false);
        expect(state.themeAudible).toBe(false);
        expect(state.loopingSources).toBe(0);
        expect(errors).toEqual([]);
    });

    test("a click starts the theme", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.waitForTimeout(500);
        expect((await audioState(page)).context).toBe("suspended");

        await page.mouse.click(100, 100);
        await expectThemeAudible(page);
        expect((await audioState(page)).gain).toBe(1);

        await page.waitForTimeout(500);
        expect(errors).toEqual([]);
    });

    test("a key press starts the theme", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.keyboard.press("ArrowRight");
        await expectThemeAudible(page);

        expect(errors).toEqual([]);
    });

    test.describe("touch", () => {
        test.use({ hasTouch: true, viewport: { width: 390, height: 664 } });

        test("a tap starts the theme", async ({ page }) => {
            const { errors } = collectPageErrors(page);
            await trackSources(page);

            await bootGame(page);
            await page.touchscreen.tap(195, 300);
            await expectThemeAudible(page);

            expect(errors).toEqual([]);
        });
    });

    test("sounds played before the first gesture still end on time", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        expect((await audioState(page)).context).toBe("suspended");

        // The 0.7 second pause bleep: game logic waiting for it must not depend on the speakers.
        const started = Date.now();
        await page.evaluate(
            () =>
                new Promise<void>((resolve) => {
                    const player = (window as any).FSM.AudioPlayer;
                    player.play("Pause");
                    player.addEventImmediate("Pause", "ended", resolve);
                }),
        );
        expect(Date.now() - started).toBeLessThan(5000);
        expect(errors).toEqual([]);
    });
});

test.describe("mute and volume", () => {
    test("mute silences the output and survives a reload", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.mouse.click(100, 100);
        await expectThemeAudible(page);
        expect((await audioState(page)).gain).toBe(1);

        await page.evaluate(() => (window as any).FSM.AudioPlayer.toggleMuted());
        let state = await audioState(page);
        expect(state).toMatchObject({ muted: true, gain: 0, themePaused: false });

        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        state = await audioState(page);
        expect(state).toMatchObject({ muted: true, gain: 0 });

        // The theme still plays (silently) after another gesture.
        await page.mouse.click(100, 100);
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getContextState() === "running");
        expect((await audioState(page)).gain).toBe(0);

        // And unmuting brings it back, persistently.
        await page.evaluate(() => (window as any).FSM.AudioPlayer.toggleMuted());
        expect(await audioState(page)).toMatchObject({ muted: false, gain: 1 });
        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        expect(await audioState(page)).toMatchObject({ muted: false, gain: 1 });

        expect(errors).toEqual([]);
    });

    test("volume drives the output gain and survives a reload", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.evaluate(() => (window as any).FSM.AudioPlayer.setVolume(0.4));
        await expectVolume(page, 0.4);

        // Muting keeps the volume, and unmuting restores it.
        await page.evaluate(() => (window as any).FSM.AudioPlayer.setMutedOn());
        expect(await audioState(page)).toMatchObject({ volume: 0.4, gain: 0 });
        await page.evaluate(() => (window as any).FSM.AudioPlayer.setMutedOff());
        await expectVolume(page, 0.4);

        await page.reload();
        await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
        await expectVolume(page, 0.4);

        expect(errors).toEqual([]);
    });
});

test.describe("playback", () => {
    test("pausing the game silences the theme and unpausing brings it back", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.mouse.click(100, 100);
        await expectThemeAudible(page);

        await page.evaluate(() => (window as any).FSM.GamesRunner.pause());
        expect(await audioState(page)).toMatchObject({ themePaused: true, themeAudible: false });

        await page.evaluate(() => (window as any).FSM.GamesRunner.play());
        await expectThemeAudible(page);

        expect(errors).toEqual([]);
    });

    test("the hurry jingle hands over to the hurry theme when it ends", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.mouse.click(100, 100);
        await page.evaluate(() => (window as any).FSM.AudioPlayer.playThemePrefixed("Hurry"));

        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getThemeName() === "Hurry Overworld", undefined, {
            timeout: 15000,
        });
        await page.waitForFunction(() => {
            const theme = (window as any).FSM.AudioPlayer.getTheme();
            return !theme.paused && theme.audible && theme.loop;
        });

        expect(errors).toEqual([]);
    });
});

test.describe("sound events", () => {
    test("behave like the audio elements they replace", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await page.mouse.click(100, 100);

        const result = await page.evaluate(async () => {
            const player = (window as any).FSM.AudioPlayer;
            const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
            const log: Record<string, any> = {};
            let ends = 0;
            const count = () => (ends += 1);

            // Listeners stay on the sound and fire every time it ends, until removed.
            player.play("Kick");
            player.addEventListener("Kick", "ended", count);
            await wait(1200);
            player.play("Kick");
            await wait(1200);
            log.endsWhileListening = ends;
            player.removeEventListeners("Kick", "ended");
            player.play("Kick");
            await wait(1200);
            log.endsAfterRemoval = ends;

            // Stopping a sound is not it ending.
            let stoppedEnded = false;
            player.play("Pause");
            player.addEventListener("Pause", "ended", () => (stoppedEnded = true));
            player.clearAll();
            await wait(1200);
            log.endedAfterClearAll = stoppedEnded;
            log.stillPlaying = Object.keys(player.getSounds());

            // A paused sound keeps its place, and its remaining time, and ends after resuming.
            let coinEnded = 0;
            player.play("Coin");
            player.addEventListener("Coin", "ended", () => (coinEnded = performance.now()));
            await wait(300);
            player.pauseAll();
            await wait(1500);
            log.endedWhilePaused = coinEnded !== 0;
            const resumedAt = performance.now();
            player.resumeAll();
            await wait(1500);
            log.msAfterResume = coinEnded ? Math.round(coinEnded - resumedAt) : -1;
            log.coinPlayerAfter = "Coin" in player.getSounds();

            // A listener added with addEventImmediate runs once only.
            let immediate = 0;
            player.play("Kick");
            player.addEventImmediate("Kick", "ended", () => (immediate += 1));
            await wait(1200);
            player.play("Kick");
            await wait(1200);
            log.immediate = immediate;

            return log;
        });

        expect(result.endsWhileListening).toBe(2);
        expect(result.endsAfterRemoval).toBe(2);
        expect(result.endedAfterClearAll).toBe(false);
        expect(result.stillPlaying).toEqual([]);
        expect(result.endedWhilePaused).toBe(false);
        // Coin lasts about 0.95 seconds; roughly 0.65 remain after pausing at 0.3.
        expect(result.msAfterResume).toBeGreaterThan(300);
        expect(result.msAfterResume).toBeLessThan(1000);
        expect(result.coinPlayerAfter).toBe(false);
        expect(result.immediate).toBe(1);
        expect(errors).toEqual([]);
    });
});

test.describe("hidden tab", () => {
    test("audio is suspended while the page is hidden and returns when it is visible", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await trackSources(page);

        await bootGame(page);
        await page.mouse.click(100, 100);
        await expectThemeAudible(page);

        const setVisibility = (state: "hidden" | "visible") =>
            page.evaluate((value) => {
                Object.defineProperty(document, "visibilityState", { value, configurable: true });
                document.dispatchEvent(new Event("visibilitychange"));
            }, state);

        await setVisibility("hidden");
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getContextState() === "suspended");
        expect((await audioState(page)).themeAudible).toBe(false);

        await setVisibility("visible");
        await expectThemeAudible(page);

        expect(errors).toEqual([]);
    });
});

test.describe("sounds that fail to load", () => {
    test("a blocked death sound does not stall the death sequence", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await page.route(/Player(%20| )Dies\.mp3/, (route) => route.abort());

        await bootGame(page);
        await page.mouse.click(100, 100);
        await page.waitForFunction(() => (window as any).FSM.AudioPlayer.getContextState() === "running");

        const lives = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            fsm.AudioPlayer.addEventListener("Player Dies", "ended", () => ((window as any).__deathEnded = true));
            return fsm.ItemsHolder.getItem("lives") as number;
        });
        const firstPlayer = await page.evaluate(() => {
            const fsm = (window as any).FSM;
            (window as any).__firstPlayer = fsm.player;
            fsm.killPlayer(fsm.player, 2);
            return true;
        });
        expect(firstPlayer).toBe(true);

        // The failed sound counts as ended right away, and is not left behind as "playing".
        await page.waitForFunction(() => (window as any).__deathEnded === true, undefined, { timeout: 5000 });
        expect(
            await page.evaluate(() => {
                const fsm = (window as any).FSM;
                return {
                    failed: fsm.AudioPlayer.getLibrary()["Player Dies"].failed,
                    playing: "Player Dies" in fsm.AudioPlayer.getSounds(),
                };
            }),
        ).toEqual({ failed: true, playing: false });

        // The game carries on: a life is lost and the level restarts with a fresh player.
        await page.waitForFunction(
            () => {
                const fsm = (window as any).FSM;
                return fsm.player && fsm.player !== (window as any).__firstPlayer && !fsm.player.dead;
            },
            undefined,
            { timeout: 20000 },
        );
        expect(await page.evaluate(() => (window as any).FSM.ItemsHolder.getItem("lives"))).toBe(lives - 1);

        // Other sounds and the theme are unaffected.
        await expectThemeAudibleAfterRestart(page);
        expect(errors).toEqual([]);
    });

    test("a missing end-of-level jingle still releases the level transition", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await page.route(/Stage(%20| )Clear\.mp3/, (route) => route.fulfill({ status: 404, body: "" }));

        await bootGame(page);

        // The same call the castle and flagpole cutscenes use to wait for the jingle.
        const released = await page.evaluate(
            () =>
                new Promise<string>((resolve) => {
                    const player = (window as any).FSM.AudioPlayer;
                    const timeout = setTimeout(() => resolve("stalled"), 3000);
                    player.play("Stage Clear");
                    player.addEventImmediate("Stage Clear", "ended", () => {
                        clearTimeout(timeout);
                        resolve("released");
                    });
                }),
        );
        expect(released).toBe("released");

        // An undecodable file behaves the same way.
        await page.route(/Powerup(%20| )Appears\.mp3/, (route) =>
            route.fulfill({ status: 200, contentType: "audio/mpeg", body: "this is not an mp3" }),
        );
        const decoded = await page.evaluate(
            () =>
                new Promise<string>((resolve) => {
                    const player = (window as any).FSM.AudioPlayer;
                    const timeout = setTimeout(() => resolve("stalled"), 3000);
                    player.play("Powerup Appears");
                    player.addEventListener("Powerup Appears", "ended", () => {
                        clearTimeout(timeout);
                        resolve("ended");
                    });
                }),
        );
        expect(decoded).toBe("ended");

        expect(errors).toEqual([]);
    });

    test("a blocked theme neither loops forever nor breaks the game", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        await page.route(/Overworld\.mp3/, (route) => route.abort());

        await bootGame(page);
        await page.mouse.click(100, 100);
        await page.waitForTimeout(1500);

        const theme = await page.evaluate(() => {
            const t = (window as any).FSM.AudioPlayer.getTheme();
            return { failed: t.failed, paused: t.paused, ended: t.ended };
        });
        expect(theme).toEqual({ failed: true, paused: true, ended: true });
        expect(errors).toEqual([]);
    });
});

/** After a restart the level theme is playing again. */
async function expectThemeAudibleAfterRestart(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const player = (window as any).FSM.AudioPlayer;
        const theme = player.getTheme();
        return player.getContextState() === "running" && !!theme && !theme.paused && theme.audible;
    });
}
