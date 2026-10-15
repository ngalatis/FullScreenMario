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
            loopingSources: ((window as any).__sources || []).filter((s: any) => s.loop && s.duration > 5)
                .length as number
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
        // Landscape: in portrait, phones get the "rotate your phone" overlay and the game pauses.
        test.use({ hasTouch: true, viewport: { width: 664, height: 390 } });

        test("a tap starts the theme", async ({ page }) => {
            const { errors } = collectPageErrors(page);
            await trackSources(page);

            await bootGame(page);
            await page.touchscreen.tap(332, 150);
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
                })
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

        await page.waitForFunction(
            () => (window as any).FSM.AudioPlayer.getThemeName() === "Hurry Overworld",
            undefined,
            {
                timeout: 15000
            }
        );
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
                    playing: "Player Dies" in fsm.AudioPlayer.getSounds()
                };
            })
        ).toEqual({ failed: true, playing: false });

        // The game carries on: a life is lost and the level restarts with a fresh player.
        await page.waitForFunction(
            () => {
                const fsm = (window as any).FSM;
                return fsm.player && fsm.player !== (window as any).__firstPlayer && !fsm.player.dead;
            },
            undefined,
            { timeout: 20000 }
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
                })
        );
        expect(released).toBe("released");

        // An undecodable file behaves the same way.
        await page.route(/Powerup(%20| )Appears\.mp3/, (route) =>
            route.fulfill({ status: 200, contentType: "audio/mpeg", body: "this is not an mp3" })
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
                })
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

/* Decoded audio memory: what is decoded, when, and what is dropped */

const MiB = 1024 * 1024;

/** The decoded audio the player holds right now (bytes by sound name, least recently played first). */
function decodedAudio(page: Page) {
    return page.evaluate(() => {
        const player = (window as any).FSM.AudioPlayer;
        return {
            decoded: player.getDecodedAudio() as Record<string, number>,
            budget: player.getCacheBytes() as number
        };
    });
}

/** Waits until the background preload is done and the level theme is decoded. */
async function waitForPreload(page: Page): Promise<string[]> {
    await page.waitForFunction(
        () => {
            const fsm = (window as any).FSM;
            const decoded = fsm.AudioPlayer.getDecodedAudio();
            return fsm.settings.audio.preload.every((name: string) => name in decoded) && "Overworld" in decoded;
        },
        undefined,
        { timeout: 30_000 }
    );

    return page.evaluate(() => (window as any).FSM.settings.audio.preload as string[]);
}

test.describe("decoded audio memory", () => {
    test("every sound measured, and the most the cache policy holds at once", async ({ page }) => {
        await bootGame(page);
        const preload = await waitForPreload(page);

        // Decoded size of every sound in the library: length x channels x 4 bytes, at the context's rate
        const measured = await page.evaluate(async () => {
            const settings = (window as any).FSM.settings.audio;
            const probe = new AudioContext();
            const sizes: Record<string, number> = {};

            for (const folder of Object.keys(settings.library)) {
                for (const name of settings.library[folder]) {
                    const type = settings.fileTypes[0];
                    const file = `${settings.directory}/${folder}/${type}/${name}.${type}`;
                    const buffer = await probe.decodeAudioData(await (await fetch(encodeURI(file))).arrayBuffer());
                    sizes[name] = buffer.length * buffer.numberOfChannels * 4;
                }
            }

            const sampleRate = probe.sampleRate;
            await probe.close();
            return { sizes, sampleRate };
        });
        const { decoded, budget } = await decodedAudio(page);
        const sum = (names: string[]) => names.reduce((total, name) => total + measured.sizes[name], 0);
        const all = Object.keys(measured.sizes);
        const onDemand = all.filter((name) => !preload.includes(name));
        const largestOnDemand = Math.max(...onDemand.map((name) => measured.sizes[name]));
        const mb = (bytes: number) => (bytes / MiB).toFixed(2) + " MB";
        // At 48 kHz (most phones) every size is 48 / 44.1 times its size at 44.1 kHz
        const at44k = (bytes: number) => (bytes * 44100) / measured.sampleRate;

        const before = sum(all);
        const resident = sum(preload);
        // Preloaded sounds, plus the budget or the one theme in use when that is larger
        const peak = resident + Math.max(budget, largestOnDemand);
        console.log(
            "decoded-audio",
            JSON.stringify({
                sampleRate: measured.sampleRate,
                perSound: Object.fromEntries(all.map((name) => [name, mb(measured.sizes[name])])),
                allDecoded: mb(before),
                preloaded: mb(resident),
                cacheBudget: mb(budget),
                largestOnDemand: mb(largestOnDemand),
                mostHeldAtOnce: mb(peak)
            })
        );

        // What the player holds after boot is exactly the preload and the level theme
        expect(Object.keys(decoded).sort()).toEqual([...preload, "Overworld"].sort());
        for (const name of Object.keys(decoded)) {
            expect(decoded[name], name).toBe(measured.sizes[name]);
        }

        // Keeping everything decoded, as before, took about 86 MB; now at most about 24 MB is held
        expect(at44k(before)).toBeGreaterThan(80 * MiB);
        expect(at44k(resident)).toBeLessThan(11 * MiB);
        expect(at44k(peak)).toBeLessThan(25 * MiB);
        // The longest theme fits in the budget, so the level theme survives a star or a death
        expect(budget).toBeGreaterThanOrEqual(largestOnDemand);
    });

    test("themes are decoded when played, the least recently played go first, and Star stays warm", async ({
        page
    }) => {
        const { errors } = collectPageErrors(page);
        const themeDownloads: string[] = [];
        page.on("request", (request) => {
            const match = /Themes\/mp3\/([^/]+)\.mp3$/.exec(decodeURIComponent(new URL(request.url()).pathname));
            if (match) {
                themeDownloads.push(match[1]);
            }
        });

        await bootGame(page);
        const preload = await waitForPreload(page);
        const onDemand = (decoded: Record<string, number>) => Object.keys(decoded).filter((n) => !preload.includes(n));
        const playTheme = async (name: string) => {
            await page.evaluate((theme) => (window as any).FSM.AudioPlayer.playTheme(theme), name);
            await page.waitForFunction((theme) => theme in (window as any).FSM.AudioPlayer.getDecodedAudio(), name);
            const state = await decodedAudio(page);
            const cached = onDemand(state.decoded).reduce((total, n) => total + state.decoded[n], 0);
            expect(cached).toBeLessThanOrEqual(state.budget);
            expect(state.decoded.Star).toBeGreaterThan(0);
            return onDemand(state.decoded);
        };

        // Of the themes and long jingles, only the level theme is decoded at boot (and Star, preloaded)
        expect(onDemand((await decodedAudio(page)).decoded)).toEqual(["Overworld"]);
        expect(themeDownloads.sort()).toEqual(["Overworld", "Star"]);

        // Overworld (13 MB) and Underworld (4 MB) do not fit together: Overworld, no longer the theme, is let go
        expect(await playTheme("Underworld")).toEqual(["Underworld"]);
        expect(await page.evaluate(() => (window as any).FSM.AudioPlayer.getLibrary().Overworld.readyState)).toBe(0);

        // Sky is small: the previous theme is kept
        expect(await playTheme("Sky")).toEqual(["Underworld", "Sky"]);

        // Underworld played again becomes the most recent, so Sky goes first to make room for Underwater
        expect(await playTheme("Underworld")).toEqual(["Sky", "Underworld"]);
        expect(await playTheme("Underwater")).toEqual(["Underworld", "Underwater"]);

        // A theme that was let go is decoded again from its kept file, with no second download
        expect(await playTheme("Overworld")).toEqual(["Overworld"]);
        expect(themeDownloads.filter((name) => name === "Overworld")).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test("the hurry theme is decoded while the hurry jingle plays, in place of the level theme", async ({ page }) => {
        const { errors } = collectPageErrors(page);

        await bootGame(page);
        await waitForPreload(page);
        await page.mouse.click(100, 100);
        await page.evaluate(() => (window as any).FSM.AudioPlayer.playThemePrefixed("Hurry"));

        // Ready before the jingle (3 seconds) ends, and the level theme made room for it
        await page.waitForFunction(() => {
            const player = (window as any).FSM.AudioPlayer;
            return "Hurry Overworld" in player.getDecodedAudio() && player.getThemeName() === "Overworld";
        });
        expect("Overworld" in (await decodedAudio(page)).decoded).toBe(false);

        await page.waitForFunction(
            () => (window as any).FSM.AudioPlayer.getThemeName() === "Hurry Overworld",
            undefined,
            {
                timeout: 15000
            }
        );
        await page.waitForFunction(() => {
            const theme = (window as any).FSM.AudioPlayer.getTheme();
            return !theme.paused && theme.audible && theme.loop;
        });
        expect(errors).toEqual([]);
    });

    test("a theme still loading starts when ready, unless it was replaced or stopped meanwhile", async ({ page }) => {
        const { errors } = collectPageErrors(page);
        const release: Record<string, () => void> = {};
        await trackSources(page);

        // Hold these downloads until the test lets them through
        for (const name of ["Underwater", "Underworld", "Castle"]) {
            const released = new Promise<void>((resolve) => (release[name] = resolve));
            await page.route(new RegExp(`Themes/mp3/${name}\\.mp3$`), async (route) => {
                await released;
                await route.continue();
            });
        }

        await bootGame(page);
        await page.mouse.click(100, 100);
        await expectThemeAudible(page);

        const sound = (name: string) =>
            page.evaluate((n) => {
                const s = (window as any).FSM.AudioPlayer.getLibrary()[n];
                return { paused: s.paused as boolean, audible: s.audible as boolean, duration: s.duration as number };
            }, name);
        const sourcesLasting = (seconds: number) =>
            page.evaluate(
                (d) => (window as any).__sources.filter((s: any) => Math.abs(s.duration - d) < 0.01).length as number,
                seconds
            );
        const decodedNow = (name: string) =>
            page.waitForFunction((n) => (window as any).FSM.AudioPlayer.getLibrary()[n].readyState === 4, name);

        // Replaced: Underwater is asked for, then Underworld, before either has arrived
        await page.evaluate(() => {
            const player = (window as any).FSM.AudioPlayer;
            player.playTheme("Underwater");
            player.playTheme("Underworld");
        });
        release.Underwater();
        await decodedNow("Underwater");
        await page.waitForTimeout(300);
        const underwater = await sound("Underwater");
        expect(underwater).toMatchObject({ paused: true, audible: false });
        expect(await sourcesLasting(underwater.duration)).toBe(0);
        expect(await page.evaluate(() => (window as any).FSM.AudioPlayer.getThemeName())).toBe("Underworld");

        // Still wanted: Underworld starts as soon as it is in
        release.Underworld();
        await page.waitForFunction(() => {
            const theme = (window as any).FSM.AudioPlayer.getTheme();
            return theme.name === "Underworld" && !theme.paused && theme.audible;
        });
        expect(await sound("Underwater")).toMatchObject({ paused: true, audible: false });

        // Stopped: Castle is asked for, and the theme cleared, before it has arrived
        await page.evaluate(() => {
            const player = (window as any).FSM.AudioPlayer;
            player.playTheme("Castle");
            player.clearTheme();
        });
        release.Castle();
        await decodedNow("Castle");
        await page.waitForTimeout(300);
        const castle = await sound("Castle");
        expect(castle).toMatchObject({ paused: true, audible: false });
        expect(await sourcesLasting(castle.duration)).toBe(0);
        expect(await page.evaluate(() => (window as any).FSM.AudioPlayer.getTheme())).toBeUndefined();

        expect(errors).toEqual([]);
    });
});
