import * as InputWritr from "./InputWritr";

/**
 * A gamepad, as navigator.getGamepads gives it. Only the parts that are read
 * are listed.
 */
export interface IGamepad {
    /**
     * Where each stick is leaning, from -1 to 1. Pairs of axes belong to one
     * stick: horizontal first, then vertical (down is positive).
     */
    axes: ArrayLike<number>;

    /**
     * The state of each button.
     */
    buttons: ArrayLike<IGamepadButton | number>;

    /**
     * The layout of the controls: "standard" if the browser knows the
     * controller, "" if it does not.
     */
    mapping?: string;

    /**
     * Whether the gamepad is still plugged in.
     */
    connected?: boolean;
}

/**
 * A single button in an IGamepad.
 */
export interface IGamepadButton {
    /**
     * How far the button is pressed, from 0 to 1 (triggers are analog).
     */
    value?: number;

    /**
     * Whether the browser counts the button as pressed.
     */
    pressed?: boolean;
}

/**
 * The trigger each button of a standard gamepad sets, by button index. The
 * triggers are InputWritr labels, such as "left" or "sprint".
 */
export interface IButtonTriggers {
    [index: number]: string;
}

/**
 * What leaning the left stick does. A direction that is left out does nothing.
 *
 * The horizontal directions start at "press" and stop at "release", which is
 * lower, so a stick resting near the edge of the dead zone does not flutter
 * between the two. The vertical directions are stricter, because a stick is
 * pushed up and down by accident far more than it is pushed sideways: they
 * need a longer lean and a stick pointing nearly straight along them.
 */
export interface IStickSettings {
    /**
     * Trigger for leaning left.
     */
    left?: string;

    /**
     * Trigger for leaning right.
     */
    right?: string;

    /**
     * Trigger for leaning up.
     */
    up?: string;

    /**
     * Trigger for leaning down.
     */
    down?: string;

    /**
     * How far a stick must lean sideways to start (by default, 0.45).
     */
    press?: number;

    /**
     * How far a stick must still lean sideways to keep going (by default, 0.3).
     */
    release?: number;

    /**
     * How far a stick must lean up or down to start (by default, 0.75).
     */
    pressVertical?: number;

    /**
     * How far a stick must still lean up or down to keep going (by default,
     * 0.55).
     */
    releaseVertical?: number;

    /**
     * How much sideways lean an up or down lean may have, as a share of the
     * lean itself (by default, 0.6, which is about 30 degrees off straight).
     * Once started it may have half as much again.
     */
    straightness?: number;
}

/**
 * Equivalent event keys from "on" and "off" activations to pass to the InputWritr.
 */
export interface IAliases {
    /**
     * The name of the event key for "on" activations.
     */
    on: string;

    /**
     * The name of the event key for "off" activations.
     */
    off: string;
}

/**
 * Settings to initialize a new IDeviceLayr instance.
 */
export interface IDeviceLayrSettings {
    /**
     * The IInputWritr to pipe button and stick triggers.
     */
    InputWriter: InputWritr.IInputWritr;

    /**
     * Which trigger each button of a standard gamepad sets.
     */
    buttons?: IButtonTriggers;

    /**
     * What leaning the left stick does.
     */
    stick?: IStickSettings;

    /**
     * Triggers that happen once per press instead of lasting while a button
     * is held, such as pausing. They are sent even while the game is paused.
     */
    actions?: string[];

    /**
     * For "on" and "off" activations, equivalent event keys to pass
     * to the IInputWritr.
     */
    aliases?: IAliases;

    /**
     * A callback for when a control is pressed on any gamepad, such as to
     * hide the touch controls.
     */
    onInput?: () => void;
}

/**
 * A layer on InputWritr to map Gamepad API devices to InputWritr pipes.
 *
 * Gamepads are read again on every poll, because browsers hand out snapshots
 * that never change (Chrome) and because a gamepad can be in any slot, come and
 * go at any time, and be one of several. Everything the gamepads are doing is
 * merged: a trigger is down while any control mapped to it on any gamepad is
 * down, and the InputWritr is told exactly once when it goes down and once when
 * it comes up. Whatever is down when the last gamepad leaves is let go of.
 */
export interface IDeviceLayr {
    /**
     * @returns The InputWritr being piped button and stick triggers.
     */
    getInputWritr(): InputWritr.IInputWritr;

    /**
     * @returns For "on" and "off" activations, the equivalent event keys
     *          to pass to the internal InputWritr.
     */
    getAliases(): IAliases;

    /**
     * @returns Whether a gamepad was found by the latest poll that looked.
     */
    getHasGamepads(): boolean;

    /**
     * Reads the gamepads and tells the InputWritr what changed since the last
     * poll. Meant to be called once per game update. When no gamepad is known
     * it almost always returns straight away, and only looks now and then.
     */
    poll(): void;

    /**
     * Starts polling by itself, one poll per animation frame, whenever a
     * gamepad is known and the game is paused. The game's own updates poll
     * the rest of the time, so a paused game can still be unpaused.
     *
     * @param isPaused   Whether the game is paused (and so makes no updates).
     */
    watch(isPaused: () => boolean): void;

    /**
     * Lets go of everything that is held down.
     */
    releaseAll(): void;

    /**
     * Stops watching and listening for good. Held triggers are forgotten, not
     * released.
     */
    dispose(): void;
}

/**
 * The directions a stick is currently leaning in.
 */
interface IStickLean {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
}

/**
 * Layouts that are read as a standard gamepad. Controllers the browser does not
 * know have an empty mapping, but most of them (the cheap USB ones in
 * particular) put the usual controls where a standard gamepad does, with the
 * D-pad on the first stick. Anything else (such as a VR controller) is ignored.
 */
const readableMappings: string[] = ["", "standard"];

/**
 * A layer on InputWritr to map Gamepad API devices to InputWritr pipes.
 */
export class DeviceLayr implements IDeviceLayr {
    /**
     * How many polls go by between looks for new gamepads, when none is known.
     * Browsers announce gamepads with an event, so this is a safety net (for a
     * game that was rebuilt after the event, or a browser that stays quiet),
     * not the way gamepads are normally found.
     */
    private static readonly idleScanInterval: number = 12;

    /**
     * How far a button must be pressed to count when the browser does not say.
     */
    private static readonly pressedValue: number = 0.5;

    /**
     * The InputWritr being piped button and stick triggers.
     */
    private InputWritr: InputWritr.IInputWritr;

    /**
     * For "on" and "off" activations, the equivalent event keys to pass to the
     * internal InputWritr.
     */
    private aliases: IAliases;

    /**
     * Each mapped button and the trigger it sets, in order.
     */
    private buttons: [number, string][];

    /**
     * The stick settings, with every default filled in.
     */
    private stick: Required<IStickSettings>;

    /**
     * Every trigger there is, whichever control sets it.
     */
    private names: string[];

    /**
     * Whether each trigger happens once per press (pausing), by name.
     */
    private actions: { [name: string]: boolean };

    /**
     * Whether any control mapped to each trigger is down right now, by name.
     */
    private down: { [name: string]: boolean };

    /**
     * What down was at the last poll, by name.
     */
    private wasDown: { [name: string]: boolean };

    /**
     * Whether each trigger is held according to the InputWritr (the last thing
     * it was told), by name.
     */
    private held: { [name: string]: boolean };

    /**
     * Which way each gamepad's stick leans, by slot.
     */
    private leaning: Map<number, IStickLean> = new Map();

    /**
     * A callback for when a control is pressed.
     */
    private onInput: (() => void) | undefined;

    /**
     * Tells whether the game is paused, once watch has been called.
     */
    private isPaused: (() => boolean) | undefined;

    /**
     * Whether a usable gamepad was found by the latest look.
     */
    private hasGamepads: boolean = false;

    /**
     * Whether the next poll must look, because a gamepad came or went.
     */
    private lookNow: boolean = false;

    /**
     * How many polls are left until the next look, while no gamepad is known.
     */
    private idleWait: number = 0;

    /**
     * Whether the browser can be asked for gamepads at all.
     */
    private supported: boolean = true;

    /**
     * Whether a poll is running, so one that the poll causes (by unpausing the
     * game, for example) is skipped.
     */
    private polling: boolean = false;

    /**
     * Whether the game accepted gameplay inputs at the last poll.
     */
    private wasPlaying: boolean = false;

    /**
     * Whether dispose has been called.
     */
    private disposed: boolean = false;

    /**
     * The pending animation frame of the paused watcher, if any.
     */
    private frame: number | undefined;

    /**
     * Bound handlers, kept so dispose can remove them.
     */
    private connectionHandler: () => void = this.onConnectionChange.bind(this);
    private frameHandler: () => void = this.onFrame.bind(this);

    /**
     * Initializes a new instance of the DeviceLayr class.
     *
     * @param settings   Settings to use for initialization.
     */
    constructor(settings: IDeviceLayrSettings) {
        if (typeof settings === "undefined") {
            throw new Error("No settings object given to DeviceLayr.");
        }
        if (typeof settings.InputWriter === "undefined") {
            throw new Error("No InputWriter given to DeviceLayr.");
        }

        const stick: IStickSettings = settings.stick || {};

        this.InputWritr = settings.InputWriter;
        this.aliases = settings.aliases || {
            "on": "on",
            "off": "off"
        };
        this.onInput = settings.onInput;

        this.buttons = Object.keys(settings.buttons || {}).map((index: string): [number, string] => [
            Number(index),
            (<IButtonTriggers>settings.buttons)[Number(index)]
        ]);
        this.stick = {
            left: stick.left || "",
            right: stick.right || "",
            up: stick.up || "",
            down: stick.down || "",
            press: stick.press ?? 0.45,
            release: stick.release ?? 0.3,
            pressVertical: stick.pressVertical ?? 0.75,
            releaseVertical: stick.releaseVertical ?? 0.55,
            straightness: stick.straightness ?? 0.6
        };

        this.names = [];
        for (const name of this.buttons
            .map((button: [number, string]): string => button[1])
            .concat(this.stick.left, this.stick.right, this.stick.up, this.stick.down)) {
            if (name && this.names.indexOf(name) === -1) {
                this.names.push(name);
            }
        }

        this.actions = {};
        this.down = {};
        this.wasDown = {};
        this.held = {};
        for (const name of this.names) {
            this.actions[name] = (settings.actions || []).indexOf(name) !== -1;
            this.down[name] = this.wasDown[name] = this.held[name] = false;
        }

        if (typeof window !== "undefined") {
            window.addEventListener("gamepadconnected", this.connectionHandler);
            window.addEventListener("gamepaddisconnected", this.connectionHandler);
        }

        // A game that is rebuilt while a gamepad is plugged in gets no event for it
        this.lookNow = true;
    }

    /* Simple gets
     */

    /**
     * @returns The InputWritr being piped button and stick triggers.
     */
    getInputWritr(): InputWritr.IInputWritr {
        return this.InputWritr;
    }

    /**
     * @returns For "on" and "off" activations, the equivalent event keys
     *          to pass to the internal InputWritr.
     */
    getAliases(): IAliases {
        return this.aliases;
    }

    /**
     * @returns Whether a gamepad was found by the latest poll that looked.
     */
    getHasGamepads(): boolean {
        return this.hasGamepads;
    }

    /* Polling
     */

    /**
     * Reads the gamepads and tells the InputWritr what changed since the last
     * poll. Meant to be called once per game update. When no gamepad is known
     * it almost always returns straight away, and only looks now and then.
     */
    poll(): void {
        if (this.polling || this.disposed || !this.supported) {
            return;
        }

        if (!this.hasGamepads && !this.lookNow) {
            this.idleWait -= 1;

            if (this.idleWait > 0) {
                return;
            }
        }

        this.idleWait = DeviceLayr.idleScanInterval;
        this.lookNow = false;
        this.polling = true;

        try {
            this.setHasGamepads(this.readGamepads() > 0);
            this.sendChanges();
        } finally {
            this.polling = false;
        }
    }

    /**
     * Starts polling by itself, one poll per animation frame, whenever a
     * gamepad is known and the game is paused. The game's own updates poll
     * the rest of the time, so a paused game can still be unpaused.
     *
     * @param isPaused   Whether the game is paused (and so makes no updates).
     */
    watch(isPaused: () => boolean): void {
        this.isPaused = isPaused;

        if (this.hasGamepads) {
            this.scheduleFrame();
        }
    }

    /**
     * Lets go of everything that is held down.
     */
    releaseAll(): void {
        for (const name of this.names) {
            this.down[name] = false;
            this.wasDown[name] = false;

            if (this.held[name]) {
                this.held[name] = false;
                this.send(name, false);
            }
        }

        this.leaning.clear();
    }

    /**
     * Stops watching and listening for good. Held triggers are forgotten, not
     * released.
     */
    dispose(): void {
        this.disposed = true;

        if (typeof window !== "undefined") {
            window.removeEventListener("gamepadconnected", this.connectionHandler);
            window.removeEventListener("gamepaddisconnected", this.connectionHandler);

            if (this.frame !== undefined) {
                window.cancelAnimationFrame(this.frame);
                this.frame = undefined;
            }
        }
    }

    /* Reading
     */

    /**
     * Asks the browser for the gamepads and works out which triggers their
     * controls hold down, filling in this.down.
     *
     * @returns How many usable gamepads there are.
     */
    private readGamepads(): number {
        let list: ArrayLike<IGamepad | null> | null | undefined,
            found: number = 0;

        for (const name of this.names) {
            this.down[name] = false;
        }

        try {
            list = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : undefined;
        } catch (error) {
            // Not allowed: an embedding page can switch gamepads off with a permissions policy
            this.supported = false;
        }

        if (list) {
            for (let slot: number = 0; slot < list.length; slot += 1) {
                const gamepad: IGamepad | null = list[slot];

                if (!DeviceLayr.isUsable(gamepad)) {
                    this.leaning.delete(slot);
                    continue;
                }

                found += 1;
                this.readButtons(gamepad);
                this.readStick(slot, gamepad);
            }
        }

        return found;
    }

    /**
     * Marks the triggers of the pressed buttons of a gamepad as down.
     *
     * @param gamepad   A usable gamepad.
     */
    private readButtons(gamepad: IGamepad): void {
        for (const [index, name] of this.buttons) {
            if (index < gamepad.buttons.length && DeviceLayr.isPressed(gamepad.buttons[index])) {
                this.down[name] = true;
            }
        }
    }

    /**
     * Marks the triggers of the directions a gamepad's left stick is leaning in
     * as down.
     *
     * @param slot   The place of the gamepad in the browser's list.
     * @param gamepad   A usable gamepad.
     */
    private readStick(slot: number, gamepad: IGamepad): void {
        const stick: Required<IStickSettings> = this.stick,
            x: number = DeviceLayr.readAxis(gamepad.axes, 0),
            y: number = DeviceLayr.readAxis(gamepad.axes, 1);
        let lean: IStickLean | undefined = this.leaning.get(slot);

        if (!lean) {
            lean = { left: false, right: false, up: false, down: false };
            this.leaning.set(slot, lean);
        }

        // A direction without a trigger is not tracked at all
        lean.left = !!stick.left && this.isLeaning(-x, y, lean.left, false);
        lean.right = !!stick.right && this.isLeaning(x, y, lean.right, false);
        lean.up = !!stick.up && this.isLeaning(-y, x, lean.up, true);
        lean.down = !!stick.down && this.isLeaning(y, x, lean.down, true);

        if (lean.left) {
            this.down[stick.left] = true;
        }
        if (lean.right) {
            this.down[stick.right] = true;
        }
        if (lean.up) {
            this.down[stick.up] = true;
        }
        if (lean.down) {
            this.down[stick.down] = true;
        }
    }

    /**
     * Decides whether a stick leans in a direction.
     *
     * @param along   How far the stick leans in the direction, negative if it
     *                leans the other way.
     * @param across   How far it leans at a right angle to the direction.
     * @param wasLeaning   Whether it leaned in the direction at the last poll.
     * @param vertical   Whether the direction is up or down, which is stricter.
     * @returns Whether the stick leans in the direction.
     */
    private isLeaning(along: number, across: number, wasLeaning: boolean, vertical: boolean): boolean {
        const stick: Required<IStickSettings> = this.stick,
            start: number = vertical ? stick.pressVertical : stick.press,
            keep: number = vertical ? stick.releaseVertical : stick.release;

        if (along < (wasLeaning ? keep : start)) {
            return false;
        }

        // Sideways, any lean past the dead zone counts, however far up or down the stick also points
        if (!vertical) {
            return true;
        }

        return Math.abs(across) <= (wasLeaning ? stick.straightness * 1.5 : stick.straightness) * along;
    }

    /* Telling the game
     */

    /**
     * Compares what the controls hold down with what the InputWritr was last
     * told, and tells it the difference. Gameplay triggers wait while the game
     * ignores them, and are sent again when it listens once more, because what
     * was held down may have been lost meanwhile (a button pressed during a
     * pause, a player that was replaced).
     */
    private sendChanges(): void {
        const paused: boolean = !!this.isPaused && this.isPaused(),
            open: boolean = this.canTrigger(),
            playing: boolean = open && !paused,
            resumed: boolean = playing && !this.wasPlaying;
        let pressed: boolean = false;

        this.wasPlaying = playing;

        for (const name of this.names) {
            if (this.down[name] && !this.wasDown[name]) {
                pressed = true;
            }
            this.wasDown[name] = this.down[name];
        }

        if (pressed && this.onInput) {
            this.onInput();
        }

        for (const name of this.names) {
            const action: boolean = this.actions[name];

            if (this.down[name]) {
                if (!this.held[name]) {
                    if (action || playing) {
                        this.held[name] = true;
                        this.send(name, true);
                    }
                } else if (resumed && !action) {
                    this.send(name, true);
                }
            } else if (this.held[name] && (action || open)) {
                this.held[name] = false;
                this.send(name, false);
            }
        }
    }

    /**
     * Tells the InputWritr that a trigger went down or came up.
     *
     * @param name   The trigger, such as "left".
     * @param isDown   Whether it went down (otherwise it came up).
     */
    private send(name: string, isDown: boolean): void {
        const alias: string = isDown ? this.aliases.on : this.aliases.off;

        // Not every trigger has both halves (mute has no key up), and a missing one is an error to call
        if (this.InputWritr.hasEvent(alias, name)) {
            this.InputWritr.callEvent(alias, name);
        }
    }

    /**
     * @returns Whether the game takes inputs at all right now (cutscenes and
     *          deaths do not).
     */
    private canTrigger(): boolean {
        return this.InputWritr.getCanTrigger()(this.aliases.on, "");
    }

    /* Gamepads coming and going
     */

    /**
     * Reacts to a gamepad being plugged in or out by looking again at the next
     * poll, and by watching if the game is paused.
     */
    private onConnectionChange(): void {
        this.lookNow = true;
        this.scheduleFrame();
    }

    /**
     * Notes whether any gamepad is known, which decides whether to watch.
     *
     * @param hasGamepads   Whether the latest look found a usable gamepad.
     */
    private setHasGamepads(hasGamepads: boolean): void {
        this.hasGamepads = hasGamepads;

        if (hasGamepads) {
            this.scheduleFrame();
        }
    }

    /**
     * Asks for the next animation frame of the paused watcher, unless one is
     * already on the way or watching has not been asked for.
     */
    private scheduleFrame(): void {
        if (
            this.frame !== undefined ||
            this.disposed ||
            !this.isPaused ||
            typeof window === "undefined" ||
            typeof window.requestAnimationFrame !== "function"
        ) {
            return;
        }

        this.frame = window.requestAnimationFrame(this.frameHandler);
    }

    /**
     * One animation frame of the paused watcher: polls if the game is paused,
     * and keeps going while a gamepad is known.
     */
    private onFrame(): void {
        this.frame = undefined;

        if (this.disposed || (!this.hasGamepads && !this.lookNow)) {
            return;
        }

        // First, so the watcher outlives anything the poll throws
        this.scheduleFrame();

        if (this.isPaused && this.isPaused()) {
            this.poll();
        }
    }

    /* Private utilities
     */

    /**
     * @param gamepad   An entry of the browser's list of gamepads.
     * @returns Whether it is a gamepad that is plugged in and read as standard.
     */
    private static isUsable(gamepad: IGamepad | null | undefined): gamepad is IGamepad {
        return (
            !!gamepad &&
            gamepad.connected !== false &&
            readableMappings.indexOf(gamepad.mapping || "") !== -1 &&
            !!gamepad.buttons &&
            typeof gamepad.buttons.length === "number" &&
            !!gamepad.axes
        );
    }

    /**
     * @param button   A button of a gamepad (a plain number in the oldest browsers).
     * @returns Whether it is pressed.
     */
    private static isPressed(button: IGamepadButton | number | undefined): boolean {
        if (!button) {
            return false;
        }

        if (typeof button === "number") {
            return button >= DeviceLayr.pressedValue;
        }

        return button.pressed === true || (button.value ?? 0) >= DeviceLayr.pressedValue;
    }

    /**
     * @param axes   The axes of a gamepad.
     * @param index   Which axis.
     * @returns Where the axis is, or 0 if it is missing or not a number.
     */
    private static readAxis(axes: ArrayLike<number>, index: number): number {
        const value: number = index < axes.length ? axes[index] : 0;

        return typeof value === "number" && isFinite(value) ? value : 0;
    }
}
