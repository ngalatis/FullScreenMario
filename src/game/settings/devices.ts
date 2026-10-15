import { MarioGame } from "../MarioGame";
import type { IButtonTriggers, IDeviceLayrSettings, IStickSettings } from "../../engine/DeviceLayr";

/**
 * Game controllers, read through the Gamepad API (see DeviceLayr). Each control
 * sets one of the game's triggers, the same ones the keyboard sets (see
 * input.js): "left", "right", "up" (jump, and climb), "down" (crouch, and enter
 * pipes), "sprint" (run, and throw fireballs), "pause" and "mute".
 *
 * Buttons are numbered as on a standard gamepad, the layout browsers give every
 * controller they know:
 *
 *       4 / 6                       5 / 7       shoulders / triggers
 *     12 (D-pad up)                3 (top)
 *   14 (left)  15 (right)      2 (left)  1 (right)
 *     13 (down)                   0 (bottom)
 *                8 (Select)  9 (Start)
 */
const buttons: IButtonTriggers = {
    // The bottom and right face buttons jump, so the A and the B of any controller do
    0: "up",
    1: "up",
    // The left and top face buttons, the shoulders and the triggers run and throw fireballs
    2: "sprint",
    3: "sprint",
    4: "sprint",
    5: "sprint",
    6: "sprint",
    7: "sprint",
    // Select mutes, Start pauses (and unpauses)
    8: "mute",
    9: "pause",
    // The D-pad is the arrow keys
    12: "up",
    13: "down",
    14: "left",
    15: "right"
};

/**
 * The left stick moves like the D-pad, with a dead zone so that a stick that does
 * not rest exactly in the middle does not walk by itself.
 *
 * Up is deliberately left out. Up is jump here, and a stick gets pushed up by
 * accident all the time: whenever it swings through a diagonal while running, and
 * whenever it springs back after being pushed down. Jumping stays on the face
 * buttons and the D-pad, where it is always meant. Down (crouch, and pipes) is
 * kept, but only for a stick pointing nearly straight down, so running down and
 * to the right never crouches.
 */
const stick: IStickSettings = {
    left: "left",
    right: "right",
    down: "down"
};

/**
 * Set on the page from the first press on a controller until the screen is next
 * touched, the last controller is unplugged, or the game is rebuilt. styles.css
 * hides the on-screen touch controls meanwhile, so a phone or tablet with a
 * controller paired is not left with half a screen of buttons.
 */
const inUseClass = "gamepad-in-use";

const devices: Omit<IDeviceLayrSettings, "InputWriter"> = {
    buttons,
    stick,
    // Pausing and muting happen once per press, even while the game is paused
    actions: ["pause", "mute"],
    aliases: {
        on: "onkeydown",
        off: "onkeyup"
    },
    onInput: (): void => document.body.classList.add(inUseClass),
    onIdle: (): void => document.body.classList.remove(inUseClass)
};

// This file runs once, however often the game is rebuilt, so one listener is all it takes
document.addEventListener(
    "pointerdown",
    (event: PointerEvent): void => {
        if (event.pointerType !== "mouse") {
            document.body.classList.remove(inUseClass);
        }
    },
    true
);

MarioGame.settings.devices = devices;
