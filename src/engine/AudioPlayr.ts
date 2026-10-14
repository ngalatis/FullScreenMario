import * as ItemsHoldr from "./ItemsHoldr";

/**
 * Lookup for directories to the sounds contained within.
 */
export interface ILibrarySettings {
    [i: string]: string[];
}

/**
 * The subset of the HTMLAudioElement interface that AudioPlayr callers rely on,
 * implemented on top of the Web Audio API.
 *
 * Differences from an HTMLAudioElement worth knowing:
 *  - volume is relative to the player's master volume (which also carries mute),
 *    not an absolute level;
 *  - play() returns a promise that never rejects;
 *  - a sound that cannot be loaded or decoded "ends" right after it is played,
 *    so code waiting for its "ended" event never stalls.
 */
export interface ISound {
    /**
     * The name this sound was registered under.
     */
    readonly name: string;

    /**
     * Whether playback is stopped or paused (also true once it has ended).
     */
    readonly paused: boolean;

    /**
     * Whether playback reached the end (or failed to load).
     */
    readonly ended: boolean;

    /**
     * Whether the sound could not be fetched or decoded.
     */
    readonly failed: boolean;

    /**
     * Whether a source node is feeding this sound to the speakers right now.
     * This is false while the page is hidden or the browser still blocks audio.
     */
    readonly audible: boolean;

    /**
     * Length of the sound in seconds, or NaN until it has been decoded.
     */
    readonly duration: number;

    /**
     * 4 (HAVE_ENOUGH_DATA) once decoded, otherwise 0.
     */
    readonly readyState: number;

    /**
     * Whether playback restarts by itself when it reaches the end.
     */
    loop: boolean;

    /**
     * Volume in [0,1], relative to the player's master volume.
     */
    volume: number;

    /**
     * Playback position in seconds.
     */
    currentTime: number;

    /**
     * Starts or resumes playback (from the start if it had ended).
     */
    play(): Promise<void>;

    /**
     * Pauses playback, keeping the position.
     */
    pause(): void;

    /**
     * Adds a listener; "ended" is the only event that is ever dispatched.
     */
    addEventListener(type: string, listener: ISoundListener, options?: boolean | ISoundListenerOptions): void;

    /**
     * Removes a listener previously added with addEventListener.
     */
    removeEventListener(type: string, listener: ISoundListener): void;
}

/**
 * Callback for sound events.
 */
export type ISoundListener = (event?: ISoundEvent) => void;

/**
 * The only addEventListener option that is supported.
 */
export interface ISoundListenerOptions {
    once?: boolean;
}

/**
 * Event object handed to sound listeners.
 */
export interface ISoundEvent {
    type: string;
    target: ISound;
}

/**
 * Lookup for sounds keyed by their names.
 */
export interface ISoundsLibrary {
    [i: string]: ISound;
}

/**
 * Lookup for directories of sounds to their sound libraries.
 */
export interface IDirectoriesLibrary {
    [i: string]: ISoundsLibrary;
}

/**
 * Settings to initialize a new instance of an IAudioPlayr.
 */
export interface IAudioPlayrSettings {
    /**
     * The names of the audio files to be preloaded for on-demand playback.
     */
    library: ILibrarySettings;

    /**
     * The directory in which all sub-directories of audio files are stored.
     */
    directory: string;

    /**
     * The allowed filetypes for each audio file. Each of these should have a
     * directory of their name under the main directory, which should contain
     * each file of the filetype. They are tried in order until one decodes.
     */
    fileTypes: string[];

    /**
     * A storage container to store mute/volume status locally. This can be
     * either a ItemsHoldr or localStorage equivalent.
     */
    ItemsHolder: ItemsHoldr.IItemsHoldr | Storage;

    /**
     * A String or Function to get the default theme for playTheme calls.
     * Functions are called for a return value, and Strings are constant
     * (defaults to "Theme").
     *
     */
    getThemeDefault?: string | { (...args: any[]): string };

    /**
     * A Number or Function to get the "local" volume for playLocal calls.
     * Functions are called for a return value, and Numbers are constant
     * (defaults to 1).
     *
     */
    getVolumeLocal?: number | { (...args: any[]): number };
}

/**
 * An audio library to automate lazy loading and controlled playback of multiple
 * audio tracks through the Web Audio API.
 */
export interface IAudioPlayr {
    /**
     * @returns The listing of sounds, keyed by name.
     */
    getLibrary(): any;

    /**
     * @returns The allowed filetypes for audio files.
     */
    getFileTypes(): string[];

    /**
     * @returns The currently playing sounds, keyed by name.
     */
    getSounds(): any;

    /**
     * @returns The current playing theme's sound.
     */
    getTheme(): ISound;

    /**
     * @returns The name of the currently playing theme.
     */
    getThemeName(): string;

    /**
     * @returns The directory under which all filetype directories are to be located.
     */
    getDirectory(): string;

    /**
     * @returns The state of the shared AudioContext ("suspended" until the
     *          visitor's first gesture, then "running"), or "unavailable".
     */
    getContextState(): string;

    /**
     * @returns The gain of the master output: 0 when muted, otherwise the volume.
     */
    getOutputGain(): number;

    /**
     * @returns The current volume as a Number in [0,1], retrieved by the ItemsHoldr.
     */
    getVolume(): number;

    /**
     * Sets the current volume. If not muted, all sounds will have their volume
     * updated.
     *
     * @param volume   A Number in [0,1] to set as the current volume.
     */
    setVolume(volume: number): void;

    /**
     * @returns Whether this is currently muted.
     */
    getMuted(): boolean;

    /**
     * Calls either setMutedOn or setMutedOff as is appropriate.
     *
     * @param muted   The new status for muted.
     */
    setMuted(muted: boolean): void;

    /**
     * Calls either setMutedOn or setMutedOff to toggle whether this is muted.
     */
    toggleMuted(): void;

    /**
     * Silences the master output and stores the muted status as on in the
     * internal ItemsHoldr.
     */
    setMutedOn(): void;

    /**
     * Restores the master output to the volume and stores the muted status
     * as off in the internal ItemsHoldr.
     */
    setMutedOff(): void;

    /**
     * @returns The Function or Number used as the volume setter for local sounds.
     */
    getGetVolumeLocal(): any;

    /**
     * @param getVolumeLocal   A new Function or Number to use as the volume setter
     *                         for local sounds.
     */
    setGetVolumeLocal(getVolumeLocalNew: any): void;

    /**
     * @returns The Function or String used to get the default theme for playTheme.
     */
    getGetThemeDefault(): any;

    /**
     * @param getThemeDefaultNew A new Function or String to use as the source for
     *                           theme names in default playTheme calls.
     */
    setGetThemeDefault(getThemeDefaultNew: any): void;

    /**
     * Plays the sound of the given name.
     *
     * @param name   The name of the sound to play.
     * @returns The sound, now playing.
     * @remarks Internally, this stops any previously playing sound of that name
     *          and starts it again, at full relative volume.
     */
    play(name: string): ISound;

    /**
     * Pauses all currently playing sounds.
     */
    pauseAll(): void;

    /**
     * Un-pauses (resumes) all currently paused sounds.
     */
    resumeAll(): void;

    /**
     * Pauses the currently playing theme, if there is one.
     */
    pauseTheme(): void;

    /**
     * Resumes the theme, if there is one and it's paused.
     */
    resumeTheme(): void;

    /**
     * Stops all sounds and any theme, and removes all references to them.
     */
    clearAll(): void;

    /**
     * Pauses and removes the theme, if there is one.
     */
    clearTheme(): void;

    /**
     * "Local" version of play that changes the output sound's volume depending
     * on the result of a getVolumeLocal call.
     *
     * @param name   The name of the sound to play.
     * @param location   An argument for getVolumeLocal, if that's a Function.
     * @returns The sound, now playing.
     */
    playLocal(name: string, location?: any): ISound;

    /**
     * Pauses any previously playing theme and starts playback of a new theme.
     *
     * @param name   The name of the sound to be used as the theme. If not
     *               provided, getThemeDefault is used to
     *                          provide one.
     * @param loop   Whether the theme should always loop (by default, true).
     * @returns The theme's sound, now playing.
     * @remarks This is different from normal sounds in that it normally loops
     *          and is controlled by pauseTheme and co.
     */
    playTheme(name?: string, loop?: boolean): ISound;

    /**
     * Wrapper around playTheme that plays a sound, then a theme. This is
     * implemented using an event listener on the sound's ending.
     *
     * @param prefix    The name of a sound to play before the theme.
     * @param name   The name of the sound to be used as the theme. If not
     *               provided, getThemeDefault is used to
     *                          provide one.
     * @param loop   Whether the theme should always loop (by default, true).
     * @returns The sound, now playing.
     */
    playThemePrefixed(prefix?: string, name?: string, loop?: boolean): ISound;

    /**
     * Adds an event listener to a sound. The player keeps track of the
     * listeners it added, so they can be cancelled later.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     * @param callback   The Function to be called by the event.
     */
    addEventListener(name: string, event: string, callback: any): void;

    /**
     * Clears all events added by this.addEventListener to a sound under a given
     * event.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     */
    removeEventListeners(name: string, event: string): void;

    /**
     * Adds an event listener to a sound. If the sound doesn't exist or has
     * finished playing, it's called immediately.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     * @param callback   The Function to be called by the event.
     */
    addEventImmediate(name: string, event: string, callback: any): void;
}


/**
 * What a Sound needs from the player that owns it.
 */
interface ISoundHost {
    /**
     * @returns The shared context, if Web Audio is available.
     */
    getContext(): AudioContext | undefined;

    /**
     * @returns The master gain node every sound is connected to.
     */
    getOutput(): AudioNode | undefined;

    /**
     * @returns Whether the page is hidden, which freezes all sounds.
     */
    isHeld(): boolean;

    /**
     * @returns Whether the context is currently producing audio.
     */
    isContextRunning(): boolean;

    /**
     * Fetches and decodes a sound (once). Never rejects: resolves with
     * undefined when the sound cannot be loaded.
     */
    load(name: string): Promise<AudioBuffer | undefined>;
}

/**
 * Throws an error from a listener without breaking the code that dispatched it,
 * like the browser does for EventTarget listeners.
 */
function reportAsync(error: any): void {
    queueMicrotask((): void => {
        throw error;
    });
}

/**
 * A single named sound, emulating the part of HTMLAudioElement that the engine
 * uses. Playback position is tracked with the wall clock rather than the
 * AudioContext clock, so game logic waiting for the sound to end keeps working
 * even while the browser still blocks audio output (or when it never loads).
 * Audio nodes are only created while the context is running; the sound is
 * rejoined at its current position as soon as it is.
 */
class Sound implements ISound {
    private _loop = false;
    private _volume = 1;
    private _paused = true;
    private _ended = false;
    private _failed = false;

    /**
     * Seconds into the sound at the moment the clock last (re)started.
     */
    private offset = 0;

    /**
     * Wall-clock time (ms) at which the clock last (re)started.
     */
    private startedAt = 0;

    /**
     * Whether the clock is ticking: playing, not held, and loaded (or failed).
     */
    private running = false;

    /**
     * Whether a load is already in flight.
     */
    private loading = false;

    /**
     * Whether this was started while the page was hidden, in which case it is
     * dropped (as if it had ended) instead of played late, unless it loops.
     */
    private startedWhileHeld = false;

    private buffer: AudioBuffer | undefined;
    private source: AudioBufferSourceNode | undefined;
    private gain: GainNode | undefined;
    private timer: any;
    private listeners: { [type: string]: { callback: ISoundListener; once: boolean }[] } = {};

    constructor(public readonly name: string, private host: ISoundHost) { }

    get paused(): boolean {
        return this._paused;
    }

    get ended(): boolean {
        return this._ended;
    }

    get failed(): boolean {
        return this._failed;
    }

    get audible(): boolean {
        return !!this.source;
    }

    get duration(): number {
        return this.buffer ? this.buffer.duration : NaN;
    }

    get readyState(): number {
        return this.buffer ? 4 : 0;
    }

    get loop(): boolean {
        return this._loop;
    }

    set loop(loop: boolean) {
        loop = !!loop;
        if (loop === this._loop) {
            return;
        }

        this.restartClock((): void => {
            this._loop = loop;
        });
    }

    get volume(): number {
        return this._volume;
    }

    set volume(volume: number) {
        this._volume = Math.max(0, Math.min(1, Number(volume) || 0));
        if (this.gain) {
            this.gain.gain.value = this._volume;
        }
    }

    get currentTime(): number {
        return this._ended && this.buffer ? this.buffer.duration : this.position();
    }

    set currentTime(time: number) {
        this.restartClock((): void => {
            this.offset = Math.max(0, Number(time) || 0);
            this._ended = false;
        });
    }

    play(): Promise<void> {
        if (this._paused) {
            if (this._ended) {
                this.offset = 0;
                this._ended = false;
            }

            this._paused = false;
            this.startedWhileHeld = this.host.isHeld() && this.offset === 0;
            this.reconcile();
        }

        return Promise.resolve();
    }

    pause(): void {
        if (this._paused) {
            return;
        }

        this._paused = true;
        if (this.running) {
            this.halt();
        }
    }

    addEventListener(type: string, listener: ISoundListener, options?: boolean | ISoundListenerOptions): void {
        const list = this.listeners[type] || (this.listeners[type] = []);

        if (!listener || list.some((entry) => entry.callback === listener)) {
            return;
        }

        list.push({
            callback: listener,
            once: typeof options === "object" && !!options && !!options.once
        });
    }

    removeEventListener(type: string, listener: ISoundListener): void {
        const list = this.listeners[type];
        if (!list) {
            return;
        }

        for (let i = 0; i < list.length; i += 1) {
            if (list[i].callback === listener) {
                list.splice(i, 1);
                return;
            }
        }
    }

    /**
     * Reacts to the page being hidden or shown again.
     */
    syncHold(): void {
        if (!this.host.isHeld() && this.startedWhileHeld) {
            this.startedWhileHeld = false;
            if (!this._paused && !this._loop && !this.running) {
                this.finish();
                return;
            }
        }

        this.reconcile();
    }

    /**
     * Reacts to the context starting or stopping: audio nodes are rebuilt (or
     * dropped) at the current position, without disturbing the clock.
     */
    rebase(): void {
        this.restartClock();
    }

    /**
     * Brings the clock and audio nodes in line with what should be happening.
     */
    private reconcile(): void {
        if (this._paused || this.host.isHeld()) {
            if (this.running) {
                this.halt();
            }
            return;
        }

        if (this.running) {
            return;
        }

        if (this._failed) {
            // Nothing to play: behave as if the sound had ended already.
            this.running = true;
            this.timer = setTimeout(this.finish.bind(this), 0);
            return;
        }

        if (!this.buffer) {
            this.load();
            return;
        }

        this.begin();
    }

    private load(): void {
        if (this.loading) {
            return;
        }

        this.loading = true;
        this.host.load(this.name).then((buffer: AudioBuffer | undefined): void => {
            this.loading = false;
            if (buffer) {
                this.buffer = buffer;
            } else {
                this._failed = true;
            }
            this.reconcile();
        });
    }

    /**
     * Starts the clock (and the audio, if the context is running).
     */
    private begin(): void {
        const duration: number = this.buffer.duration;

        this.running = true;
        this.startedAt = performance.now();

        if (!this._loop && this.offset >= duration) {
            this.timer = setTimeout(this.finish.bind(this), 0);
            return;
        }

        this.startSource();

        if (!this._loop) {
            this.timer = setTimeout(this.finish.bind(this), (duration - this.offset) * 1000);
        }
    }

    /**
     * Stops the clock and the audio, remembering the position.
     */
    private halt(): void {
        this.offset = this.position();
        this.running = false;
        clearTimeout(this.timer);
        this.stopSource();
    }

    /**
     * Applies a change that needs the clock and nodes to be rebuilt.
     */
    private restartClock(change?: () => void): void {
        const wasRunning: boolean = this.running;

        if (wasRunning) {
            this.halt();
        }

        if (change) {
            change();
        }

        if (wasRunning) {
            this.reconcile();
        }
    }

    /**
     * Natural end of playback (or a failure to load): dispatches "ended".
     */
    private finish(): void {
        clearTimeout(this.timer);
        this.detachSource();
        this.running = false;
        this._paused = true;
        this._ended = true;
        this.offset = 0;
        this.startedWhileHeld = false;

        this.dispatch("ended");
    }

    private dispatch(type: string): void {
        const list = this.listeners[type];
        if (!list) {
            return;
        }

        const event: ISoundEvent = { type: type, target: this };

        for (const entry of list.slice()) {
            // Listeners removed by an earlier listener must not run.
            if (list.indexOf(entry) === -1) {
                continue;
            }

            if (entry.once) {
                this.removeEventListener(type, entry.callback);
            }

            try {
                entry.callback.call(this, event);
            } catch (error) {
                reportAsync(error);
            }
        }
    }

    /**
     * @returns The current position in seconds.
     */
    private position(): number {
        const duration: number = this.buffer ? this.buffer.duration : 0;

        if (!this.running || !duration) {
            return this.offset;
        }

        const position: number = this.offset + (performance.now() - this.startedAt) / 1000;
        return this._loop ? position % duration : Math.min(position, duration);
    }

    /**
     * Creates the audio nodes at the current position, if the context runs.
     */
    private startSource(): void {
        const context: AudioContext | undefined = this.host.getContext();
        if (!context || !this.buffer || !this.host.isContextRunning()) {
            return;
        }

        try {
            const source: AudioBufferSourceNode = context.createBufferSource();
            const gain: GainNode = context.createGain();

            source.buffer = this.buffer;
            source.loop = this._loop;
            gain.gain.value = this._volume;
            source.connect(gain);
            gain.connect(this.host.getOutput());
            source.onended = (): void => {
                source.disconnect();
                gain.disconnect();
            };

            source.start(0, this._loop ? this.offset % this.buffer.duration : this.offset);
            this.source = source;
            this.gain = gain;
        } catch (error) {
            // Audio output is unavailable; the clock keeps the game moving.
            this.source = this.gain = undefined;
        }
    }

    /**
     * Cuts the audio immediately.
     */
    private stopSource(): void {
        const source = this.source;
        const gain = this.gain;

        this.source = this.gain = undefined;
        if (!source) {
            return;
        }

        source.onended = null;
        try {
            source.stop();
        } catch (error) {
            // Already stopped.
        }
        try {
            source.disconnect();
            gain.disconnect();
        } catch (error) {
            // Already disconnected.
        }
    }

    /**
     * Lets the audio run out by itself (it ends at about the same time as the
     * clock), so the tail of the sound is not clipped.
     */
    private detachSource(): void {
        this.source = this.gain = undefined;
    }
}


/**
 * An audio library to automate lazy loading, background preloading and
 * controlled playback of multiple audio tracks, built on the Web Audio API:
 * one shared AudioContext, a master GainNode for volume and mute, and decoded
 * AudioBuffers cached by name.
 *
 * The context starts suspended in browsers that block autoplay. It is resumed
 * on the first keydown, pointerdown or touchstart, after which sounds that are
 * already playing (such as the level theme) become audible. The context is
 * suspended while the page is hidden.
 */
export class AudioPlayr implements IAudioPlayr {
    /**
     * Sounds keyed by their name.
     */
    private library: ISoundsLibrary;

    /**
     * Directories mapping folder names to sound libraries.
     */
    private directories: IDirectoriesLibrary;

    /**
     * Every sound in the library.
     */
    private allSounds: Sound[];

    /**
     * The folder each sound lives in, keyed by sound name.
     */
    private soundFolders: { [i: string]: string };

    /**
     * What file types to try for each sound, in order.
     */
    private fileTypes: string[];

    /**
     * Currently playing sound objects, keyed by name (excluding extensions).
     */
    private sounds: ISoundsLibrary;

    /**
     * Names of sounds that have been played at least once.
     */
    private used: { [i: string]: boolean };

    /**
     * The currently playing theme.
     */
    private theme: ISound;

    /**
     * The name of the currently playing theme.
     */
    private themeName: string;

    /**
     * Directory from which audio files are fetched.
     */
    private directory: string;

    /**
     * The Function or Number used to determine what playLocal's volume is.
     */
    private getVolumeLocal: any;

    /**
     * The Function or String used to get a default theme name.
     */
    private getThemeDefault: any;

    /**
     * Storage container for settings like volume and muted status.
     */
    private ItemsHolder: ItemsHoldr.IItemsHoldr | Storage;

    /**
     * Listeners added by addEventListener, so they can be removed again.
     */
    private addedEvents: { [name: string]: { [event: string]: any[] } };

    /**
     * The shared context, if the browser has Web Audio.
     */
    private context: AudioContext | undefined;

    /**
     * Master gain: the volume, or 0 when muted.
     */
    private output: GainNode | undefined;

    /**
     * Decoded (or failed, as undefined) buffers by sound name.
     */
    private buffers: { [i: string]: Promise<AudioBuffer | undefined> };

    /**
     * Whether the visitor has made a gesture that allows audio to start.
     */
    private unlocked: boolean;

    /**
     * Whether everything is frozen because the page is hidden.
     */
    private held: boolean;

    /**
     * What the sounds see of this player.
     */
    private host: ISoundHost;

    /**
     * Initializes a new instance of the AudioPlayr class.
     *
     * @param settings   Settings to use for initialization.
     */
    constructor(settings: IAudioPlayrSettings) {
        if (typeof settings.library === "undefined") {
            throw new Error("No library given to AudioPlayr.");
        }

        if (typeof settings.directory === "undefined") {
            throw new Error("No directory given to AudioPlayr.");
        }

        if (typeof settings.fileTypes === "undefined") {
            throw new Error("No fileTypes given to AudioPlayr.");
        }

        if (!settings.ItemsHolder) {
            throw new Error("No ItemsHoldr given to AudioPlayr.");
        }

        var volumeInitial: number;

        this.ItemsHolder = settings.ItemsHolder;

        this.directory = settings.directory;
        this.fileTypes = settings.fileTypes;
        this.getThemeDefault = settings.getThemeDefault || "Theme";
        this.getVolumeLocal = typeof settings.getVolumeLocal === "undefined"
            ? 1 : settings.getVolumeLocal;

        // Sounds should always start blank
        this.sounds = {};
        this.used = {};
        this.addedEvents = {};
        this.buffers = {};
        this.unlocked = false;
        this.held = typeof document !== "undefined" && document.visibilityState === "hidden";
        this.host = {
            getContext: (): AudioContext | undefined => this.context,
            getOutput: (): AudioNode | undefined => this.output,
            isHeld: (): boolean => this.held,
            isContextRunning: (): boolean => !!this.context && this.context.state === "running",
            load: (name: string): Promise<AudioBuffer | undefined> => this.loadBuffer(name)
        };

        this.createContext();
        this.generateLibraryFromSettings(settings.library);

        this.restore("volume");
        this.restore("muted");

        volumeInitial = this.ItemsHolder.getItem("volume");
        if (volumeInitial === undefined) {
            this.setVolume(1);
        } else {
            this.applyOutputGain();
        }

        this.watchPage();
        this.syncContext();
        this.preload(settings.library);
    }


    /* Simple getters
    */

    /**
     * @returns The listing of sounds, keyed by name.
     */
    getLibrary(): any {
        return this.library;
    }

    /**
     * @returns The allowed filetypes for audio files.
     */
    getFileTypes(): string[] {
        return this.fileTypes;
    }

    /**
     * @returns The currently playing sounds, keyed by name.
     */
    getSounds(): any {
        return this.sounds;
    }

    /**
     * @returns The current playing theme's sound.
     */
    getTheme(): ISound {
        return this.theme;
    }

    /**
     * @returns The name of the currently playing theme.
     */
    getThemeName(): string {
        return this.themeName;
    }

    /**
     * @returns The directory under which all filetype directories are to be located.
     */
    getDirectory(): string {
        return this.directory;
    }

    /**
     * @returns The state of the shared AudioContext ("suspended" until the
     *          visitor's first gesture, then "running"), or "unavailable".
     */
    getContextState(): string {
        return this.context ? this.context.state : "unavailable";
    }

    /**
     * @returns The gain of the master output: 0 when muted, otherwise the volume.
     */
    getOutputGain(): number {
        return this.output ? this.output.gain.value : 0;
    }


    /* Playback modifiers
    */

    /**
     * @returns The current volume as a Number in [0,1], retrieved by the ItemsHoldr.
     */
    getVolume(): number {
        return Number(this.ItemsHolder.getItem("volume") || 0);
    }

    /**
     * Sets the current volume. If not muted, the master output follows.
     *
     * @param volume   A Number in [0,1] to set as the current volume.
     */
    setVolume(volume: number): void {
        this.store("volume", volume.toString());
        this.applyOutputGain();
    }

    /**
     * @returns Whether this is currently muted.
     */
    getMuted(): boolean {
        return Boolean(Number(this.ItemsHolder.getItem("muted")));
    }

    /**
     * Calls either setMutedOn or setMutedOff as is appropriate.
     *
     * @param muted   The new status for muted.
     */
    setMuted(muted: boolean): void {
        muted ? this.setMutedOn() : this.setMutedOff();
    }

    /**
     * Calls either setMutedOn or setMutedOff to toggle whether this is muted.
     */
    toggleMuted(): void {
        this.setMuted(!this.getMuted());
    }

    /**
     * Silences the master output and stores the muted status as on in the
     * internal ItemsHoldr.
     */
    setMutedOn(): void {
        this.store("muted", "1");
        this.applyOutputGain();
    }

    /**
     * Restores the master output to the volume and stores the muted status
     * as off in the internal ItemsHoldr.
     */
    setMutedOff(): void {
        this.store("muted", "0");
        this.applyOutputGain();
    }


    /* Other modifiers
    */

    /**
     * @returns The Function or Number used as the volume setter for local sounds.
     */
    getGetVolumeLocal(): any {
        return this.getVolumeLocal;
    }

    /**
     * @param getVolumeLocal   A new Function or Number to use as the volume setter
     *                         for local sounds.
     */
    setGetVolumeLocal(getVolumeLocalNew: any): void {
        this.getVolumeLocal = getVolumeLocalNew;
    }

    /**
     * @returns The Function or String used to get the default theme for playTheme.
     */
    getGetThemeDefault(): any {
        return this.getThemeDefault;
    }

    /**
     * @param getThemeDefaultNew A new Function or String to use as the source for
     *                           theme names in default playTheme calls.
     */
    setGetThemeDefault(getThemeDefaultNew: any): void {
        this.getThemeDefault = getThemeDefaultNew;
    }


    /* Playback
    */

    /**
     * Plays the sound of the given name.
     *
     * @param name   The name of the sound to play.
     * @returns The sound, now playing.
     * @remarks Internally, this stops any previously playing sound of that name
     *          and starts it again, at full relative volume.
     */
    play(name: string): ISound {
        return this.startSound(name, false);
    }

    /**
     * Pauses all currently playing sounds.
     */
    pauseAll(): void {
        var i: string;

        for (i in this.sounds) {
            if (this.sounds.hasOwnProperty(i)) {
                this.sounds[i].pause();
            }
        }
    }

    /**
     * Un-pauses (resumes) all currently paused sounds.
     */
    resumeAll(): void {
        var i: string;

        for (i in this.sounds) {
            if (!this.sounds.hasOwnProperty(i)) {
                continue;
            }
            this.sounds[i].play();
        }
    }

    /**
     * Pauses the currently playing theme, if there is one.
     */
    pauseTheme(): void {
        if (this.theme) {
            this.theme.pause();
        }
    }

    /**
     * Resumes the theme, if there is one and it's paused.
     */
    resumeTheme(): void {
        if (this.theme) {
            this.theme.play();
        }
    }

    /**
     * Stops all sounds and any theme, and removes all references to them.
     */
    clearAll(): void {
        this.pauseAll();
        this.clearTheme();
        this.sounds = {};
    }

    /**
     * Pauses and removes the theme, if there is one.
     */
    clearTheme(): void {
        if (!this.theme) {
            return;
        }

        this.pauseTheme();
        delete this.sounds[this.theme.name];
        this.theme = undefined;
        this.themeName = undefined;
    }

    /**
     * "Local" version of play that changes the output sound's volume depending
     * on the result of a getVolumeLocal call.
     *
     * @param name   The name of the sound to play.
     * @param location   An argument for getVolumeLocal, if that's a Function.
     * @returns The sound, now playing.
     */
    playLocal(name: string, location?: any): ISound {
        var sound: ISound = this.play(name),
            volumeReal: number;

        switch (this.getVolumeLocal.constructor) {
            case Function:
                volumeReal = this.getVolumeLocal(location);
                break;
            case Number:
                volumeReal = this.getVolumeLocal;
                break;
            default:
                volumeReal = Number(this.getVolumeLocal) || 1;
                break;
        }

        sound.volume = volumeReal;

        return sound;
    }

    /**
     * Pauses any previously playing theme and starts playback of a new theme.
     *
     * @param name   The name of the sound to be used as the theme. If not
     *               provided, getThemeDefault is used to
     *                          provide one.
     * @param loop   Whether the theme should always loop (by default, true).
     * @returns The theme's sound, now playing.
     * @remarks This is different from normal sounds in that it normally loops
     *          and is controlled by pauseTheme and co. If loop is off and the
     *          sound wasn't played before, the default theme starts when it ends.
     */
    playTheme(name?: string, loop?: boolean): ISound {
        var first: boolean;

        this.pauseTheme();

        // Loop defaults to true
        loop = typeof loop !== "undefined" ? loop : true;

        // If name isn't given, use the default getter
        if (typeof name === "undefined") {
            switch (this.getThemeDefault.constructor) {
                case Function:
                    name = this.getThemeDefault();
                    break;
                default:
                    name = this.getThemeDefault;
                    break;
            }
        }

        // If a theme already exists, kill it
        if (typeof this.theme !== "undefined") {
            delete this.sounds[this.theme.name];
        }

        first = !this.used[name];
        this.themeName = name;
        this.theme = this.sounds[name] = this.startSound(name, loop);

        // If it's used (no repeat), add the event listener to resume theme
        if (first) {
            this.theme.addEventListener("ended", (event?: ISoundEvent): void => {
                // A sound that could not be loaded must not retry forever.
                if (!event || !(event.target as ISound).failed) {
                    this.playTheme();
                }
            });
        }

        return this.theme;
    }

    /**
     * Wrapper around playTheme that plays a sound, then a theme. This is
     * implemented using an event listener on the sound's ending.
     *
     * @param prefix    The name of a sound to play before the theme.
     * @param name   The name of the sound to be used as the theme. If not
     *               provided, getThemeDefault is used to
     *                          provide one.
     * @param loop   Whether the theme should always loop (by default, true).
     * @returns The sound, now playing.
     */
    playThemePrefixed(prefix: string, name?: string, loop?: boolean): ISound {
        var sound: ISound = this.play(prefix);

        this.pauseTheme();

        // If name isn't given, use the default getter
        if (typeof name === "undefined") {
            switch (this.getThemeDefault.constructor) {
                case Function:
                    name = this.getThemeDefault();
                    break;
                default:
                    name = this.getThemeDefault;
                    break;
            }
        }

        // Only the newest request counts, so they don't pile up over a session
        this.removeEventListeners(prefix, "ended");
        this.addEventListener(prefix, "ended", this.playTheme.bind(this, prefix + " " + name, loop));

        return sound;
    }


    /* Public utilities
    */

    /**
     * Adds an event listener to a sound. The player keeps track of the
     * listeners it added, so they can be cancelled later.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     * @param callback   The Function to be called by the event.
     */
    addEventListener(name: string, event: string, callback: any): void {
        var sound: ISound = this.library[name],
            events: { [event: string]: any[] };

        if (!sound) {
            throw new Error("Unknown name given to addEventListener: '" + name + "'.");
        }

        events = this.addedEvents[name] || (this.addedEvents[name] = {});

        if (!events[event]) {
            events[event] = [callback];
        } else {
            events[event].push(callback);
        }

        sound.addEventListener(event, callback);
    }

    /**
     * Clears all events added by this.addEventListener to a sound under a given
     * event.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     */
    removeEventListeners(name: string, event: string): void {
        var sound: ISound = this.library[name],
            events: any[],
            i: number;

        if (!sound) {
            throw new Error("Unknown name given to removeEventListeners: '" + name + "'.");
        }

        if (!this.addedEvents[name]) {
            return;
        }

        events = this.addedEvents[name][event];
        if (!events) {
            return;
        }

        for (i = 0; i < events.length; i += 1) {
            sound.removeEventListener(event, events[i]);
        }

        events.length = 0;
    }

    /**
     * Adds an event listener to a sound, to be called once. If the sound
     * doesn't exist or has finished playing, it's called immediately.
     *
     * @param name   The name of the sound.
     * @param event   The name of the event, such as "ended".
     * @param callback   The Function to be called by the event.
     */
    addEventImmediate(name: string, event: string, callback: any): void {
        if (!this.sounds.hasOwnProperty(name) || this.sounds[name].paused) {
            callback();
            return;
        }

        this.sounds[name].addEventListener(event, callback, { once: true });
    }


    /* Private utilities
    */

    /**
     * Restarts a sound from the beginning, at full relative volume.
     *
     * @param name   The name of the sound.
     * @param loop   Whether it repeats until stopped.
     * @returns The sound, now playing.
     */
    private startSound(name: string, loop: boolean): ISound {
        var sound: ISound;

        // If the sound isn't yet being played, see if it's in the library
        if (!this.sounds.hasOwnProperty(name)) {
            // If the sound also isn't in the library, it's unknown
            if (!this.library.hasOwnProperty(name)) {
                throw new Error("Unknown name given to AudioPlayr.play: '" + name + "'.");
            }
            sound = this.sounds[name] = this.library[name];
        } else {
            sound = this.sounds[name];
        }

        this.soundStop(sound);
        this.used[name] = true;

        sound.loop = loop;
        sound.volume = 1;
        sound.play();

        return sound;
    }

    /**
     * Called when a sound has completed to get it out of sounds.
     *
     * @param name   The name of the sound that just finished.
     */
    private soundFinish(name: string): void {
        if (this.sounds.hasOwnProperty(name)) {
            delete this.sounds[name];
        }
    }

    /**
     * Stops a sound and rewinds it.
     */
    private soundStop(sound: ISound): void {
        sound.pause();
        sound.currentTime = 0;
    }

    /**
     * Stores a setting. The game's ItemsHoldr only keeps items that are flagged
     * storeLocally (volume and muted are not) and only saves when asked, so the
     * setting is also written to localStorage, in the same format and under the
     * same key ItemsHoldr uses, to be still there after a reload.
     */
    private store(key: string, value: string): void {
        var holder: any = this.ItemsHolder,
            storage: any = typeof holder.getLocalStorage === "function" ? holder.getLocalStorage() : undefined;

        holder.setItem(key, value);

        if (!storage) {
            // A plain Storage keeps what it is given.
            return;
        }

        try {
            storage[holder.getPrefix() + key] = JSON.stringify(value);
        } catch (error) {
            // Storage is blocked (private browsing, quota): the setting lasts for this visit only.
        }
    }

    /**
     * Loads a setting saved by store.
     */
    private restore(key: string): void {
        var holder: any = this.ItemsHolder,
            storage: any = typeof holder.getLocalStorage === "function" ? holder.getLocalStorage() : undefined,
            saved: any;

        if (!storage) {
            return;
        }

        try {
            saved = storage[holder.getPrefix() + key];
            if (typeof saved === "string") {
                holder.setItem(key, JSON.parse(saved));
            }
        } catch (error) {
            // Unreadable: keep the default.
        }
    }

    /**
     * Points the master gain at the volume, or at 0 if muted.
     */
    private applyOutputGain(): void {
        if (this.output) {
            this.output.gain.value = this.getMuted() ? 0 : this.getVolume();
        }
    }


    /* Web Audio
    */

    /**
     * Creates the shared context and master gain. If there's no Web Audio,
     * the player still works silently, and every sound ends right away.
     */
    private createContext(): void {
        var Context: typeof AudioContext = typeof window === "undefined"
                ? undefined
                : (window.AudioContext || (window as any).webkitAudioContext);

        if (!Context) {
            return;
        }

        try {
            this.context = new Context();
            this.unlocked = this.context.state === "running"
                || !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
            this.output = this.context.createGain();
            this.output.connect(this.context.destination);
            this.context.addEventListener("statechange", this.onContextStateChange.bind(this));
        } catch (error) {
            this.context = this.output = undefined;
        }
    }

    /**
     * Starts and stops the context to match the page: it runs once the visitor
     * has made a gesture, except while the page is hidden.
     */
    private syncContext(): void {
        var context: AudioContext = this.context,
            state: string = context ? context.state : "closed";

        if (!context || state === "closed") {
            return;
        }

        try {
            if (this.held) {
                if (state === "running") {
                    Promise.resolve(context.suspend()).catch(this.ignoreError);
                }
            } else if (this.unlocked && state !== "running") {
                Promise.resolve(context.resume()).catch(this.ignoreError);
            }
        } catch (error) {
            // Not allowed (yet); the next gesture tries again.
        }
    }

    /**
     * Rejoins every playing sound to the context after it started or stopped.
     */
    private onContextStateChange(): void {
        if (this.context.state === "running") {
            this.unlocked = true;
        }

        this.allSounds.forEach((sound: Sound): void => sound.rebase());
    }

    /**
     * Adds the gesture and page visibility handlers.
     */
    private watchPage(): void {
        var gestures: string[] = ["keydown", "pointerdown", "touchstart", "pointerup", "touchend"],
            i: number;

        if (typeof window === "undefined") {
            return;
        }

        // Capture on window, so no game handler can swallow the gesture.
        for (i = 0; i < gestures.length; i += 1) {
            window.addEventListener(gestures[i], this.onGesture.bind(this), { capture: true, passive: true });
        }

        document.addEventListener("visibilitychange", this.onVisibilityChange.bind(this));
    }

    /**
     * The visitor did something that lets the browser start audio.
     */
    private onGesture(): void {
        this.unlocked = true;
        this.syncContext();
    }

    /**
     * Freezes the sounds and suspends the context while the page is hidden,
     * and wakes them up again when it is visible.
     */
    private onVisibilityChange(): void {
        var held: boolean = document.visibilityState === "hidden";

        if (held === this.held) {
            return;
        }

        this.held = held;

        if (held) {
            this.syncSoundsToHold();
            this.syncContext();
        } else {
            this.syncContext();
            this.syncSoundsToHold();
        }
    }

    /**
     * Tells every sound whether the page is hidden now.
     */
    private syncSoundsToHold(): void {
        this.allSounds.forEach((sound: Sound): void => sound.syncHold());
    }

    private ignoreError(): void { }


    /* Loading
    */

    /**
     * Creates a sound for every name in the library settings. Nothing is
     * fetched yet: that happens on first play, or in the background preload.
     */
    private generateLibraryFromSettings(librarySettings: ILibrarySettings): void {
        var directory: ISoundsLibrary = {},
            directorySoundNames: string[],
            directoryName: string,
            name: string,
            j: number;

        this.library = {};
        this.directories = {};
        this.allSounds = [];
        this.soundFolders = {};

        // For each given directory (e.g. names, themes):
        for (directoryName in librarySettings) {
            if (!librarySettings.hasOwnProperty(directoryName)) {
                continue;
            }

            directory = {};
            directorySoundNames = librarySettings[directoryName];

            // For each audio file to be loaded in that directory:
            for (j = 0; j < directorySoundNames.length; j += 1) {
                name = directorySoundNames[j];

                // Create the sound and store it in the container
                this.library[name] = directory[name] = this.createSound(name);
                this.soundFolders[name] = directoryName;
            }

            // The full directory is stored in the master directories
            this.directories[directoryName] = directory;
        }
    }

    /**
     * Creates a sound that gets itself out of the playing sounds when it ends.
     *
     * @param name   The name of the sound.
     */
    private createSound(name: string): ISound {
        var sound: Sound = new Sound(name, this.host);

        sound.addEventListener("ended", this.soundFinish.bind(this, name));
        this.allSounds.push(sound);

        return sound;
    }

    /**
     * Fetches and decodes sounds one after another in the background: themes
     * first (the "Hurry" ones last, since they're needed less often), then the
     * rest. A sound that is played earlier is loaded right then instead.
     */
    private preload(librarySettings: ILibrarySettings): void {
        var themes: string[] = [],
            hurryThemes: string[] = [],
            others: string[] = [],
            directoryName: string,
            names: string[],
            queue: string[],
            next: () => void,
            j: number;

        if (!this.context) {
            return;
        }

        for (directoryName in librarySettings) {
            if (!librarySettings.hasOwnProperty(directoryName)) {
                continue;
            }

            names = librarySettings[directoryName];
            for (j = 0; j < names.length; j += 1) {
                if (!/theme/i.test(directoryName)) {
                    others.push(names[j]);
                } else if (/^hurry/i.test(names[j])) {
                    hurryThemes.push(names[j]);
                } else {
                    themes.push(names[j]);
                }
            }
        }

        queue = themes.concat(others, hurryThemes);
        next = (): void => {
            if (queue.length) {
                this.loadBuffer(queue.shift()).then(next);
            }
        };

        // Don't compete with the rest of the boot.
        setTimeout(next, 0);
    }

    /**
     * Fetches and decodes a sound the first time it's needed.
     *
     * @param name   The name of the sound.
     * @returns A promise for the decoded sound, or undefined if it failed.
     */
    private loadBuffer(name: string): Promise<AudioBuffer | undefined> {
        if (!this.buffers.hasOwnProperty(name)) {
            this.buffers[name] = this.fetchBuffer(name).catch((): undefined => undefined);
        }

        return this.buffers[name];
    }

    private async fetchBuffer(name: string): Promise<AudioBuffer | undefined> {
        var type: string,
            url: string,
            controller: AbortController,
            timeout: any,
            response: Response,
            i: number;

        if (!this.context || typeof fetch === "undefined") {
            return undefined;
        }

        for (i = 0; i < this.fileTypes.length; i += 1) {
            type = this.fileTypes[i];
            url = this.directory + "/" + this.soundFolders[name] + "/" + type + "/" + name + "." + type;
            controller = new AbortController();
            // A request that never answers must not leave the game waiting.
            timeout = setTimeout((): void => controller.abort(), 20000);

            try {
                response = await fetch(url, { signal: controller.signal });
                if (response.ok) {
                    return await this.decode(await response.arrayBuffer());
                }
            } catch (error) {
                // Try the next file type.
            } finally {
                clearTimeout(timeout);
            }
        }

        return undefined;
    }

    private decode(data: ArrayBuffer): Promise<AudioBuffer> {
        return new Promise((resolve, reject): void => {
            try {
                // Older Safari only knows the callback form.
                var result: any = this.context.decodeAudioData(data, resolve, reject);

                if (result && typeof result.catch === "function") {
                    result.catch(reject);
                }
            } catch (error) {
                reject(error);
            }
        });
    }
}
