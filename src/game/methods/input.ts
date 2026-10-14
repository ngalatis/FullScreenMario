/**
 * Input handling: keyboard key down/up handlers, mouse and device-motion
 * input, and the check for whether inputs may currently trigger.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.keyDownLeft(...) keep working unchanged.
 */
import type { IDeviceMotionStatus, IPlayer } from "../types";
import type { MarioGame } from "../MarioGame";

export const inputMethods = {
    /* Input
    */

    /**
     * Reacts to the left key being pressed. keys.run and leftDown are marked 
     * and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownLeft(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        var player: IPlayer = FSM.player;

        player.keys.run = -1;
        player.keys.leftDown = true; // independent of changes to keys.run
        player.FSM.ModAttacher.fireEvent("onKeyDownLeft");
    },

    /**
     * Reacts to the right key being pressed. keys.run and keys.rightDown are
     * marked and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownRight(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        var player: IPlayer = FSM.player;

        player.keys.run = 1;
        player.keys.rightDown = true; // independent of changes to keys.run
        player.FSM.ModAttacher.fireEvent("onKeyDownRight");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the up key being pressed. If a Player can jump, it does, and
     * underwater paddling is checked. The mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownUp(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        var player: IPlayer = FSM.player;

        player.keys.up = true;

        if (player.canjump && (player.resting || FSM.MapScreener.underwater)) {
            player.keys.jump = true;
            player.canjump = false;
            player.keys.jumplev = 0;

            if (player.power > 1) {
                FSM.AudioPlayer.play("Jump Super");
            } else {
                FSM.AudioPlayer.play("Jump Small");
            }

            if (FSM.MapScreener.underwater) {
                FSM.TimeHandler.addEvent(
                    function (): void {
                        player.jumping = player.keys.jump = false;
                    },
                    14);
            }
        }

        FSM.ModAttacher.fireEvent("onKeyDownUp");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the down key being pressed. A player's keys.crouch is marked 
     * and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownDown(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        var player: IPlayer = FSM.player;

        player.keys.crouch = true;
        FSM.ModAttacher.fireEvent("onKeyDownDown");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the sprint key being pressed. Firing happens if a Player is
     * able, keys.spring is marked, and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownSprint(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        var player: IPlayer = FSM.player;

        if (player.power === 3 && player.keys.sprint === false && !player.crouching) {
            player.fire(player);
        }

        player.keys.sprint = true;
        player.FSM.ModAttacher.fireEvent("onKeyDownSprint");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the pause key being pressed. The game is either paused or unpaused,
     * and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownPause(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            FSM.GamesRunner.play();
        } else {
            FSM.GamesRunner.pause();
        }

        FSM.ModAttacher.fireEvent("onKeyDownPause");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the mute key being lifted. Muting is toggled and the mod event
     * is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyDownMute(this: MarioGame, FSM: MarioGame, event?: Event): void {
        if (FSM.GamesRunner.getPaused()) {
            return;
        }

        FSM.AudioPlayer.toggleMuted();
        FSM.ModAttacher.fireEvent("onKeyDownMute");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the left key being lifted. keys.run and keys.leftDown are 
     * marked and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpLeft(this: MarioGame, FSM: MarioGame, event?: Event): void {
        var player: IPlayer = FSM.player;

        player.keys.run = 0;
        player.keys.leftDown = false;

        FSM.ModAttacher.fireEvent("onKeyUpLeft");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the right key being lifted. keys.run and keys.rightDown are 
     * marked and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpRight(this: MarioGame, FSM: MarioGame, event?: Event): void {
        var player: IPlayer = FSM.player;

        player.keys.run = 0;
        player.keys.rightDown = false;

        FSM.ModAttacher.fireEvent("onKeyUpRight");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the up key being lifted. Jumping stops and the mod event is
     * fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpUp(this: MarioGame, FSM: MarioGame, event?: Event): void {
        var player: IPlayer = FSM.player;

        if (!FSM.MapScreener.underwater) {
            player.keys.jump = player.keys.up = false;
        }

        player.canjump = true;
        FSM.ModAttacher.fireEvent("onKeyUpUp");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the down key being lifted. keys.crouch is marked, crouch
     * removal happens if necessary, and the mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpDown(this: MarioGame, FSM: MarioGame, event?: Event): void {
        var player: IPlayer = FSM.player;

        player.keys.crouch = false;

        if (!player.piping) {
            FSM.animatePlayerRemoveCrouch(player);
        }

        FSM.ModAttacher.fireEvent("onKeyUpDown");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the spring key being lifted. keys.sprint is marked and the mod
     * event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpSprint(this: MarioGame, FSM: MarioGame, event?: Event): void {
        var player: IPlayer = FSM.player;

        player.keys.sprint = false;
        FSM.ModAttacher.fireEvent("onKeyUpSprint");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to the pause key being lifted. The mod event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    keyUpPause(this: MarioGame, FSM: MarioGame, event?: Event): void {
        FSM.ModAttacher.fireEvent("onKeyUpPause");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to a right click being pressed. Pausing is toggled and the mod
     * event is fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    mouseDownRight(this: MarioGame, FSM: MarioGame, event?: Event): void {
        FSM.GamesRunner.togglePause();
        FSM.ModAttacher.fireEvent("onMouseDownRight");

        if (event && event.preventDefault !== undefined) {
            event.preventDefault();
        }
    },

    /**
     * Reacts to a regularly caused device motion event. Acceleration is checked
     * for changed tilt horizontally (to trigger left or right key statuses) or
     * changed tilt vertically (jumping). The mod event is also fired.
     * 
     * @param FSM
     * @param event   The original user-caused Event.
     */
    deviceMotion(this: MarioGame, FSM: MarioGame, event: DeviceMotionEvent): void {
        var player: IPlayer = FSM.player,
            deviceMotionStatus: IDeviceMotionStatus = FSM.deviceMotionStatus,
            acceleration: DeviceMotionEventAcceleration = event.accelerationIncludingGravity;

        FSM.ModAttacher.fireEvent("onDeviceMotion", event);

        if (deviceMotionStatus.y !== undefined) {
            deviceMotionStatus.dy = acceleration.y - deviceMotionStatus.y;
            if (deviceMotionStatus.dy > 0.21) {
                FSM.keyDownUp(FSM);
            } else if (deviceMotionStatus.dy < -0.14) {
                FSM.keyUpUp(FSM);
            }
        }

        deviceMotionStatus.x = acceleration.x;
        deviceMotionStatus.y = acceleration.y;

        if (deviceMotionStatus.x > 2.1) {
            if (!deviceMotionStatus.motionLeft) {
                player.FSM.keyDownLeft(FSM);
                deviceMotionStatus.motionLeft = true;
            }
        } else if (deviceMotionStatus.x < -2.1) {
            if (!deviceMotionStatus.motionRight) {
                player.FSM.keyDownRight(FSM);
                deviceMotionStatus.motionRight = true;
            }
        } else {
            if (deviceMotionStatus.motionLeft) {
                player.FSM.keyUpLeft(FSM);
                deviceMotionStatus.motionLeft = false;
            }
            if (deviceMotionStatus.motionRight) {
                player.FSM.keyUpRight(FSM);
                deviceMotionStatus.motionRight = false;
            }
        }
    },

    /**
     * Checks whether inputs can be fired, which is equivalent to the status of
     * the MapScreener's nokeys variable (an inverse value).
     * 
     * @param FSM
     * @returns Whether inputs are allowed to trigger.
     */
    canInputsTrigger(this: MarioGame, FSM: MarioGame): boolean {
        return !FSM.MapScreener.nokeys;
    },
};

export type InputMethods = typeof inputMethods;
