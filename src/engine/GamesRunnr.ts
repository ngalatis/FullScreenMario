import * as FPSAnalyzr from "./FPSAnalyzr";

/**
 * A callback for when the game changes playing state (pause or play).
 */
export interface ITriggerCallback {
    (...args: any[]): void;
}

/**
 * A callback to schedule each frame of the loop.
 *
 * The default scheduler is requestAnimationFrame and ignores the timeout,
 * because the loop works out for itself how many upkeeps each frame is owed.
 * A custom scheduler (for example one built on setTimeout) is still honored:
 * it only has to call the callback later, optionally passing a timestamp in
 * milliseconds as the first argument (otherwise the FPSAnalyzer's clock is
 * read).
 *
 * @param callback   The next frame to run.
 * @param timeout   A hint of how long until the next upkeep is due.
 * @returns A unique identifier that can be passed to an upkeep cancellation.
 */
export interface IUpkeepScheduler {
    (callback: Function, timeout: number): number;
}

/**
 * A callback to disable a scheduled frame.
 *
 * @param handle   The unique identifier of the frame to cancel.
 */
export interface IUpkeepCanceller {
    (handle: number): void;
}

/**
 * Settings to initialize a new IGamesRunnr instance.
 */
export interface IGamesRunnrSettings {
    /**
     * The Array of Functions to run on each upkeep (each fixed logic update).
     */
    games: Function[];

    /**
     * Functions to run once per displayed frame, after the upkeeps that frame
     * is owed (and after a manual upkeep, step or play). Rendering belongs
     * here: when several upkeeps are owed in one frame, only the final state
     * is drawn. If omitted, nothing extra is run, so a renderer left in games
     * is simply run on every upkeep as before.
     */
    renderers?: Function[];

    /**
     * How often, in milliseconds, to call upkeep (by default, 1000/60).
     */
    interval?: number;

    /**
     * A multiplier for interval that can be set independently.
     */
    speed?: number;

    /**
     * Kept for compatibility. Timing is always compensated by the fixed
     * timestep accumulator, so there is nothing left to adjust.
     */
    adjustFramerate?: boolean;

    /**
     * The most upkeeps a single frame may run to catch up (by default, 5, at
     * speed 1; the limit grows in proportion to speed above 1). Any time owed
     * beyond it is dropped, so a stall never fast-forwards the game.
     */
    maxUpdatesPerFrame?: number;

    /**
     * A callback to run when upkeep is paused.
     */
    onPause?: ITriggerCallback;

    /**
     * A callback to run when upkeep is played.
     */
    onPlay?: ITriggerCallback;

    /**
     * Arguments to be passed to onPause and onPlay (by default, [this]).
     */
    callbackArguments?: any[];

    /**
     * A Function to replace requestAnimationFrame as the upkeepScheduler.
     */
    upkeepScheduler?: IUpkeepScheduler;

    /**
     * A Function to replace cancelAnimationFrame as the upkeepCanceller.
     */
    upkeepCanceller?: IUpkeepCanceller;

    /**
     * A scope for games to be run on (defaults to the calling GamesRunnr).
     */
    scope?: any;

    /**
     * An FPSAnalyzr to provide statistics on automated playback. If not
     * provided, a new one will be made.
     */
    FPSAnalyzer?: FPSAnalyzr.IFPSAnalyzr;

    /**
     * Settings to create a new FPSAnalyzr, if one isn't provided.
     */
    FPSAnalyzerSettings?: FPSAnalyzr.IFPSAnalyzrSettings;
}

/**
 * A class to continuously series of "game" Functions. Each game is run in a
 * set order and the group is run as a whole at a particular interval, with a
 * configurable speed. Playback can be triggered manually, or driven by the
 * display's frames with pause and play hooks. For automated playback,
 * statistics are available via an internal FPSAnalyzer.
 */
export interface IGamesRunnr {
    /**
     * @returns The FPSAnalyzer used in the GamesRunnr.
     */
    getFPSAnalyzer(): FPSAnalyzr.IFPSAnalyzr;

    /**
     * @returns Whether this is paused.
     */
    getPaused(): boolean;

    /**
     * @returns The Array of game Functions.
     */
    getGames(): any[];

    /**
     * @returns The Array of render Functions, run once per displayed frame.
     */
    getRenderers(): any[];

    /**
     * @returns The interval between upkeeps.
     */
    getInterval(): number;

    /**
     * @returns The speed multiplier being applied to the interval.
     */
    getSpeed(): number;

    /**
     * @returns The most upkeeps one frame may run to catch up, at speed 1.
     */
    getMaxUpdatesPerFrame(): number;

    /**
     * @returns The optional trigger to be called on pause.
     */
    getOnPause(): any;

    /**
     * @returns The optional trigger to be called on play.
     */
    getOnPlay(): any;

    /**
     * @returns Arguments to be given to the optional trigger Functions.
     */
    getCallbackArguments(): any[];

    /**
     * @returns Function used to schedule the next frame.
     */
    getUpkeepScheduler(): IUpkeepScheduler;

    /**
     * @returns {Function} Function used to cancel the next frame.
     */
    getUpkeepCanceller(): IUpkeepCanceller;

    /**
     * Meaty function, run once per fixed timestep (every <interval/speed>
     * milliseconds of display time), to run every game once and mark an FPS
     * measurement. The frame loop calls this as many times as each frame is
     * owed; calling it by hand (outside a frame) also runs the renderers.
     *
     * @param [time]   A timestamp for the FPS measurement (by default, the
     *                 FPSAnalyzer's clock is read).
     */
    upkeep(time?: number): void;

    /**
     * A utility for this.upkeep that calls the same games.forEach(run), timing
     * the total execution time.
     *
     * @returns The total time spent, in milliseconds.
     */
    upkeepTimed(): number;

    /**
     * Runs every renderer once.
     */
    render(): void;

    /**
     * Continues execution by running an upkeep immediately and then starting
     * the frame loop. If an onPlay has been defined, it's called before.
     */
    play(): void;

    /**
     * Stops execution of the frame loop, and cancels the next frame. If an
     * onPause has been defined, it's called after.
     */
    pause(): void;

    /**
     * Calls upkeep a <num or 1> number of times, immediately.
     *
     * @param [num]   How many times to upkeep (by default, 1).
     */
    step(times?: number): void;

    /**
     * Toggles whether this is paused, and calls the appropriate Function.
     */
    togglePause(): void;

    /**
     * Sets the interval between between upkeeps.
     *
     * @param interval   The new time interval in milliseconds.
     */
    setInterval(interval: number): void;

    /**
     * Sets the speed multiplier for the interval.
     *
     * @param speed   The new speed multiplier. 2 will cause interval to be
     *                twice as fast, and 0.5 will be half as fast.
     */
    setSpeed(speed: number): void;

    /**
     * Sets the most upkeeps one frame may run to catch up.
     *
     * @param maxUpdatesPerFrame   The new limit, at speed 1.
     */
    setMaxUpdatesPerFrame(maxUpdatesPerFrame: number): void;
}

/**
 * Frame deltas this close (in milliseconds) to a whole ratio of the interval
 * (one, two, three... frames per upkeep or upkeeps per frame) are treated as
 * exactly that ratio. This keeps display timestamp noise from tipping a
 * frame between zero and two upkeeps when a display is in step with the game.
 * The snapped-over difference is tracked, so the total never drifts further
 * than this from real time.
 */
const SNAP_TOLERANCE = 0.3;

/**
 * Float slack, in milliseconds, when deciding whether an upkeep is owed.
 */
const EPSILON = 0.001;

/**
 * An absolute ceiling on upkeeps per frame, so no setting can spin forever.
 */
const MAX_UPDATES_CEILING = 1000;

/**
 * Default upkeepScheduler: requestAnimationFrame, which syncs the loop with
 * the display. Hosts without it (such as a test runner) fall back to timers.
 */
function scheduleFrame(callback: Function, timeout: number): number {
    if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(<FrameRequestCallback>callback);
    }

    return <any>setTimeout(callback, timeout);
}

/**
 * Default upkeepCanceller, the pair of scheduleFrame.
 */
function cancelFrame(handle: number): void {
    if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(handle);
    } else {
        clearTimeout(<any>handle);
    }
}

/**
 * A class to continuously series of "game" Functions. Each game is run in a
 * set order and the group is run as a whole at a particular interval, with a
 * configurable speed.
 *
 * Playback is driven by display frames with a fixed timestep: every frame, the
 * real time since the last one is added to an accumulator, and one upkeep is
 * run for each whole interval in it. The game therefore advances by exactly
 * <interval/speed> milliseconds of display time per upkeep, no matter the
 * refresh rate (a 120 Hz display runs one upkeep every other frame, a 30 Hz
 * display two per frame). Physics are counted per upkeep, so they never change
 * with the display or with speed; speed only shortens or lengthens the step.
 *
 * To never fast-forward after a stall, a frame runs at most maxUpdatesPerFrame
 * upkeeps and drops the rest, and the accumulator restarts when playback
 * resumes or the page's visibility changes. Rendering runs once per frame
 * that ran an upkeep. Playback can also be triggered manually, with pause and
 * play hooks. For automated playback, statistics are available via an
 * internal FPSAnalyzer.
 */
export class GamesRunnr implements IGamesRunnr {
    /**
     * Functions to be run, in order, on each upkeep.
     */
    private games: Function[];

    /**
     * Functions to be run, in order, once per displayed frame.
     */
    private renderers: Function[];

    /**
     * Optional trigger Function for this.pause.
     */
    private onPause: ITriggerCallback | undefined;

    /**
     * Optional trigger Function for this.play.
     */
    private onPlay: ITriggerCallback | undefined;

    /**
     * Arguments to be passed to the optional trigger Functions.
     */
    private callbackArguments: any[];

    /**
     * Reference to the next frame, such as requestAnimationFrame's returned int.
     */
    private upkeepNext!: number;

    /**
     * Function used to schedule the next frame, such as requestAnimationFrame.
     */
    private upkeepScheduler: IUpkeepScheduler;

    /**
     * Function used to cancel the next frame, such as cancelAnimationFrame.
     */
    private upkeepCanceller: (handle: number) => void;

    /**
     * this.frame bound to this GamesRunnr, for use in upkeepScheduler.
     */
    private frameBound: any;

    /**
     * this.onVisibilityChange bound to this GamesRunnr, for the document.
     */
    private visibilityBound: any;

    /**
     * Whether the document's visibility listener is currently attached.
     */
    private visibilityListening: boolean;

    /**
     * Whether the game is currently paused.
     */
    private paused: boolean;

    /**
     * The amount of time, in milliseconds, between each upkeep.
     */
    private interval: number;

    /**
     * The playback rate multiplier (defaults to 1, for no change).
     */
    private speed: number;

    /**
     * The actual step, as (1 / speed) * interval.
     */
    private intervalReal!: number;

    /**
     * The most upkeeps one frame may run, at speed 1.
     */
    private maxUpdatesPerFrame: number;

    /**
     * Time, in milliseconds, of the previous frame (undefined before the
     * first frame of a run, which then only marks a starting point).
     */
    private frameTime: number | undefined;

    /**
     * Display time received but not yet spent on upkeeps, in milliseconds.
     */
    private accumulator: number;

    /**
     * The timeline of upkeeps, advanced by one step per upkeep. It is used for
     * the FPS measurements, so they read the rate of logic updates without
     * being thrown off by several of them happening in the same frame.
     */
    private updateClock!: number;

    /**
     * How much real time has been absorbed by snapping frame deltas.
     */
    private snapDrift: number;

    /**
     * Whether the frame loop is currently running upkeeps, in which case
     * rendering waits until the end of the frame.
     */
    private inFrame: boolean;

    /**
     * Changes whenever playback stops or restarts, so a frame can tell it has
     * been interrupted by its own games.
     */
    private runId: number;

    /**
     * An internal FPSAnalyzr object that measures on each upkeep.
     */
    private FPSAnalyzer: FPSAnalyzr.IFPSAnalyzr;

    /**
     * An object to set as the scope for games, if not this GamesRunnr.
     */
    private scope: any;

    /**
     * Whether scheduling timeouts should adjust to elapsed upkeep time. No
     * longer used (the accumulator does this), kept for compatibility.
     */
    private adjustFramerate: boolean | undefined;

    /**
     * Initializes a new instance of the GamesRunnr class.
     *
     * @param settings   Settings to be used for initialization.
     */
    constructor(settings: IGamesRunnrSettings) {
        if (typeof settings === "undefined") {
            throw new Error("No settings object given GamesRunnr.");
        }
        if (typeof settings.games === "undefined") {
            throw new Error("No games given to GamesRunnr.");
        }

        var i: number;

        this.games = settings.games;
        this.interval = settings.interval || 1000 / 60;
        this.speed = settings.speed || 1;
        this.maxUpdatesPerFrame = settings.maxUpdatesPerFrame || 5;
        this.onPause = settings.onPause;
        this.onPlay = settings.onPlay;
        this.callbackArguments = settings.callbackArguments || [this];
        this.adjustFramerate = settings.adjustFramerate;
        this.FPSAnalyzer = settings.FPSAnalyzer || new FPSAnalyzr.FPSAnalyzr(settings.FPSAnalyzerSettings);

        this.scope = settings.scope || this;
        this.paused = true;
        this.accumulator = 0;
        this.snapDrift = 0;
        this.inFrame = false;
        this.runId = 0;
        this.visibilityListening = false;

        this.upkeepScheduler = settings.upkeepScheduler || scheduleFrame;
        this.upkeepCanceller = settings.upkeepCanceller || cancelFrame;

        this.frameBound = this.frame.bind(this);
        this.visibilityBound = this.onVisibilityChange.bind(this);

        for (i = 0; i < this.games.length; i += 1) {
            this.games[i] = this.games[i].bind(this.scope);
        }

        this.renderers = (settings.renderers || []).map((renderer: Function): Function => {
            return renderer.bind(this.scope);
        });

        this.setIntervalReal();
    }

    /* Gets
     */

    /**
     * @returns The FPSAnalyzer used in the GamesRunnr.
     */
    getFPSAnalyzer(): FPSAnalyzr.IFPSAnalyzr {
        return this.FPSAnalyzer;
    }

    /**
     * @returns Whether this is paused.
     */
    getPaused(): boolean {
        return this.paused;
    }

    /**
     * @returns The Array of game Functions.
     */
    getGames(): Function[] {
        return this.games;
    }

    /**
     * @returns The Array of render Functions, run once per displayed frame.
     */
    getRenderers(): Function[] {
        return this.renderers;
    }

    /**
     * @returns The interval between upkeeps.
     */
    getInterval(): number {
        return this.interval;
    }

    /**
     * @returns The speed multiplier being applied to the interval.
     */
    getSpeed(): number {
        return this.speed;
    }

    /**
     * @returns The most upkeeps one frame may run to catch up, at speed 1.
     */
    getMaxUpdatesPerFrame(): number {
        return this.maxUpdatesPerFrame;
    }

    /**
     * @returns The optional trigger to be called on pause.
     */
    getOnPause(): any {
        return this.onPause;
    }

    /**
     * @returns The optional trigger to be called on play.
     */
    getOnPlay(): any {
        return this.onPlay;
    }

    /**
     * @returns Arguments to be given to the optional trigger Functions.
     */
    getCallbackArguments(): any[] {
        return this.callbackArguments;
    }

    /**
     * @returns Function used to schedule the next frame.
     */
    getUpkeepScheduler(): IUpkeepScheduler {
        return this.upkeepScheduler;
    }

    /**
     * @returns {Function} Function used to cancel the next frame.
     */
    getUpkeepCanceller(): (handle: number) => void {
        return this.upkeepCanceller;
    }

    /* Runtime
     */

    /**
     * Meaty function, run once per fixed timestep (every <interval/speed>
     * milliseconds of display time), to run every game once and mark an FPS
     * measurement. The frame loop calls this as many times as each frame is
     * owed; calling it by hand (outside a frame) also runs the renderers.
     *
     * @param [time]   A timestamp for the FPS measurement (by default, the
     *                 FPSAnalyzer's clock is read).
     */
    upkeep(time?: number): void {
        if (this.paused) {
            return;
        }

        this.runAllGames();

        if (!this.inFrame) {
            this.render();
        }

        if (this.FPSAnalyzer) {
            this.FPSAnalyzer.measure(time);
        }
    }

    /**
     * A utility for this.upkeep that calls the same games.forEach(run), timing
     * the total execution time.
     *
     * @returns The total time spent, in milliseconds.
     */
    upkeepTimed(): number {
        if (!this.FPSAnalyzer) {
            throw new Error("An internal FPSAnalyzr is required for upkeepTimed.");
        }

        var now: number = this.FPSAnalyzer.getTimestamp();
        this.runAllGames();
        if (!this.inFrame) {
            this.render();
        }
        return this.FPSAnalyzer.getTimestamp() - now;
    }

    /**
     * Runs every renderer once.
     */
    render(): void {
        for (var i: number = 0; i < this.renderers.length; i += 1) {
            this.renderers[i]();
        }
    }

    /**
     * Continues execution by running an upkeep immediately and then starting
     * the frame loop. If an onPlay has been defined, it's called before.
     */
    play(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;

        if (this.onPlay) {
            this.onPlay.apply(this, this.callbackArguments);
        }

        try {
            this.upkeep();
        } finally {
            this.startLoop();
        }
    }

    /**
     * Stops execution of the frame loop, and cancels the next frame. If an
     * onPause has been defined, it's called after.
     */
    pause(): void {
        if (this.paused) {
            return;
        }
        this.paused = true;
        this.runId += 1;

        if (this.onPause) {
            this.onPause.apply(this, this.callbackArguments);
        }

        this.upkeepCanceller(this.upkeepNext);
        this.setVisibilityListening(false);
    }

    /**
     * Calls upkeep a <num or 1> number of times, immediately.
     *
     * @param [num]   How many times to upkeep (by default, 1).
     */
    step(times: number = 1): void {
        this.play();
        this.pause();
        if (times > 0) {
            this.step(times - 1);
        }
    }

    /**
     * Toggles whether this is paused, and calls the appropriate Function.
     */
    togglePause(): void {
        if (this.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    /* Games manipulations
     */

    /**
     * Sets the interval between between upkeeps.
     *
     * @param interval   The new time interval in milliseconds.
     */
    setInterval(interval: number): void {
        var intervalReal: number = Number(interval);

        if (isNaN(intervalReal)) {
            throw new Error("Invalid interval given to setInterval: " + interval);
        }

        this.interval = intervalReal;
        this.setIntervalReal();
    }

    /**
     * Sets the speed multiplier for the interval.
     *
     * @param speed   The new speed multiplier. 2 will cause interval to be
     *                twice as fast, and 0.5 will be half as fast.
     */
    setSpeed(speed: number): void {
        var speedReal: number = Number(speed);

        if (isNaN(speedReal)) {
            throw new Error("Invalid speed given to setSpeed: " + speed);
        }

        this.speed = speedReal;
        this.setIntervalReal();
    }

    /**
     * Sets the most upkeeps one frame may run to catch up.
     *
     * @param maxUpdatesPerFrame   The new limit, at speed 1.
     */
    setMaxUpdatesPerFrame(maxUpdatesPerFrame: number): void {
        var limit: number = Number(maxUpdatesPerFrame);

        if (isNaN(limit) || limit < 1) {
            throw new Error("Invalid maxUpdatesPerFrame given to setMaxUpdatesPerFrame: " + maxUpdatesPerFrame);
        }

        this.maxUpdatesPerFrame = limit;
    }

    /* Frame loop
     */

    /**
     * Starts a run of frames. The first frame only marks a starting point,
     * so time spent paused is never owed.
     */
    private startLoop(): void {
        if (this.paused) {
            return;
        }

        this.runId += 1;
        this.resetClock();
        this.setVisibilityListening(true);
        this.upkeepNext = this.upkeepScheduler(this.frameBound, this.intervalReal);
    }

    /**
     * One frame of the loop: spends the display time since the previous frame
     * on as many fixed-step upkeeps as it covers (at most the catch-up
     * limit), then renders once if anything ran.
     *
     * @param [time]   When the frame started, in milliseconds (the scheduler
     *                 normally provides it; by default, it is read).
     */
    private frame(time?: number): void {
        if (this.paused) {
            return;
        }

        var now: number = typeof time === "number" && isFinite(time) ? time : this.getNow();

        // Scheduling first keeps the loop alive if a game throws
        this.upkeepNext = this.upkeepScheduler(this.frameBound, this.intervalReal);

        if (typeof this.frameTime === "undefined") {
            this.restartClock(now);
            return;
        }

        var step: number = this.intervalReal,
            delta: number = Math.max(0, now - this.frameTime),
            limit: number = this.getUpdateLimit(),
            runId: number = this.runId,
            updates: number = 0;

        this.frameTime = now;
        this.accumulator += this.snapDelta(delta, step);

        this.inFrame = true;
        try {
            while (updates < limit && this.accumulator + EPSILON >= step) {
                this.accumulator -= step;
                this.updateClock += step;
                updates += 1;

                this.upkeep(this.updateClock);

                // A game may have paused, or paused and played again
                if (this.paused || this.runId !== runId) {
                    break;
                }
            }
        } finally {
            this.inFrame = false;
        }

        // Hit the limit with time still owed: it's dropped, not carried over
        if (updates >= limit && this.accumulator + EPSILON >= step) {
            this.restartClock(now);
        }

        if (updates > 0) {
            this.render();
        }
    }

    /**
     * Makes the next frame a fresh starting point, with no time owed.
     */
    private resetClock(): void {
        this.frameTime = undefined;
        this.accumulator = 0;
        this.snapDrift = 0;

        if (this.FPSAnalyzer && this.FPSAnalyzer.resetTimestamp) {
            this.FPSAnalyzer.resetTimestamp();
        }
    }

    /**
     * Starts the clock at a time, with no time owed.
     *
     * @param now   The time of the current frame.
     */
    private restartClock(now: number): void {
        this.frameTime = now;
        this.updateClock = now;
        this.accumulator = 0;
        this.snapDrift = 0;
    }

    /**
     * Frame times are only as steady as the display. When a delta is within
     * SNAP_TOLERANCE of a whole number of frames per upkeep (or upkeeps per
     * frame), it is made exactly that, so a display that is in step with the
     * game gets one steady upkeep per frame instead of flipping between none
     * and two on noise. Whatever was snapped over is tracked and handed back
     * the moment it grows past the tolerance, so real time is never lost.
     *
     * @param delta   Real time since the last frame, in milliseconds.
     * @param step   The time one upkeep covers, in milliseconds.
     * @returns The time to add to the accumulator.
     */
    private snapDelta(delta: number, step: number): number {
        if (!(delta > 0) || !(step > 0) || !isFinite(step)) {
            return delta;
        }

        var snapped: number =
            delta >= step ? Math.round(delta / step) * step : step / Math.max(1, Math.round(step / delta));

        if (Math.abs(delta - snapped) > SNAP_TOLERANCE) {
            return delta;
        }

        var drift: number = this.snapDrift + delta - snapped;
        if (Math.abs(drift) > SNAP_TOLERANCE) {
            var settled: number = delta + this.snapDrift;
            this.snapDrift = 0;
            return settled;
        }

        this.snapDrift = drift;
        return snapped;
    }

    /**
     * @returns The most upkeeps a single frame may run. It grows with speed
     *          (at 5x, five upkeeps are normal on a 60 Hz display).
     */
    private getUpdateLimit(): number {
        var limit: number = Math.ceil(this.maxUpdatesPerFrame * Math.max(1, this.speed));

        return Math.max(1, Math.min(limit || 1, MAX_UPDATES_CEILING));
    }

    /**
     * @returns A current timestamp, for schedulers that don't provide one.
     */
    private getNow(): number {
        if (this.FPSAnalyzer) {
            return this.FPSAnalyzer.getTimestamp();
        }

        return typeof performance === "undefined" ? Date.now() : performance.now();
    }

    /**
     * Frames stop while the page is hidden, so the time to the first frame
     * after it comes back must not be owed.
     */
    private onVisibilityChange(): void {
        this.resetClock();
    }

    /**
     * Attaches or detaches the document's visibility listener. It only lives
     * while playing, so paused or abandoned runners don't leak.
     *
     * @param listening   Whether the listener should be attached.
     */
    private setVisibilityListening(listening: boolean): void {
        if (this.visibilityListening === listening || typeof document === "undefined") {
            return;
        }

        this.visibilityListening = listening;

        if (listening) {
            document.addEventListener("visibilitychange", this.visibilityBound);
        } else {
            document.removeEventListener("visibilitychange", this.visibilityBound);
        }
    }

    /* Utilities
     */

    /**
     * Sets the intervalReal variable, which is interval * (inverse of speed).
     */
    private setIntervalReal(): void {
        this.intervalReal = (1 / this.speed) * this.interval;

        // Time owed at the old step must not turn into a burst at the new one
        this.accumulator = Math.min(this.accumulator, this.intervalReal);
    }

    /**
     * Runs all games in this.games.
     */
    private runAllGames(): void {
        for (var i: number = 0; i < this.games.length; i += 1) {
            this.games[i]();
        }
    }
}
