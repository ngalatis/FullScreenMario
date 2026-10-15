/**
 * Scoring and audio helpers: awarding and animating points, plus the
 * volume and audio-theme lookups used by the audio settings.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.findScore(...) keep working unchanged.
 */
import type { IArea, IPlayer, IShell, IText, IThing } from "../types";
import { MarioGame } from "../MarioGame";

export const scoringMethods = {
    /* Scoring
     */

    /**
     * Determines how many points should be gained from a number of consecutive
     * enemy deaths (such as via hops or shells).
     *
     * @param level   How many deaths have happened.
     * @returns How many points should be gained (or 0, for having gained a life).
     */
    findScore(this: MarioGame, level: number): number {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this);

        if (level < FSM.pointLevels.length) {
            return FSM.pointLevels[level];
        }

        FSM.gainLife(1);
        return 0;
    },

    /**
     * Driver function to score some number of points for a Player and show
     * the gains via an animation.
     *
     * @param value   How many points a Player is receiving.
     * @param continuation   Whether the game shouldn't increase the score
     *                       amount in the ItemsHoldr (this will only be
     *                       false on the first score() call).
     * @remarks For point gains that should not have a visual animation,
     *          directly call ItemsHolder.increase("score", value).
     * @remarks The calling chain will be:
     *              score -> scoreOn -> scoreAnimateOn -> scoreAnimate  
     */
    score(this: MarioGame, value: number, continuation?: boolean): void {
        if (!value) {
            return;
        }
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this);

        FSM.scoreOn(value, FSM.player, true);

        if (!continuation) {
            this.ItemsHolder.increase("score", value);
        }
    },

    /**
     * Scores a given number of points for a Player, and shows the gains via
     * an animation centered at the top of a thing.
     *
     * @param value   How many points a Player is receiving.
     * @param thing   An in-game Thing to place the visual score text
     *                        on top of and centered.
     * @param continuation   Whether the game shouldn't increase the score
     *                       amount in the ItemsHoldr (this will only be
     *                       false on the first score() call).
     * @remarks The calling chain will be:
     *              scoreOn -> scoreAnimateOn -> scoreAnimate  
     */
    scoreOn(this: MarioGame, value: number, thing: IThing, continuation?: boolean): void {
        if (!value) {
            return;
        }
        var text: IText = <IText>thing.FSM.addThing("Text" + value);

        thing.FSM.scoreAnimateOn(<IText>text, thing);

        if (!continuation) {
            this.ItemsHolder.increase("score", value);
        }

        thing.FSM.ModAttacher.fireEvent("onScoreOn", value, thing, continuation);
    },

    /**
     * Centers a text associated with some points gain on the top of a Thing,
     * and animates it updward, setting an event for it to die.
     *
     * @param text   The text whose position is being manipulated.
     * @param thing   An in-game Thing to place the visual score text
     *                on top of and centered.
     * @remarks The calling chain will be:
     *              scoreAnimateOn -> scoreAnimate  
     */
    scoreAnimateOn(this: MarioGame, text: IText, thing: IThing): void {
        thing.FSM.setMidXObj(text, thing);
        thing.FSM.setBottom(text, thing.top);
        thing.FSM.scoreAnimate(text);
    },

    /**
     * Animates a score on top of a Thing.
     *
     * @param thing   An in-game Thing to place the visual score text
     *                on top of and centered.
     * @param timeout   How many game ticks to wait before killing
     *                  the text (by default, 28).
     * @remarks This is the last function in the score() calling chain:
     *              scoreAnimate <- scoreAnimateOn <- scoreOn <- score
     */
    scoreAnimate(this: MarioGame, thing: IThing, timeout: number = 28): void {
        thing.FSM.TimeHandler.addEventInterval(thing.FSM.shiftVert, 1, timeout, thing, -thing.FSM.unitsize / 6);

        thing.FSM.TimeHandler.addEvent(thing.FSM.killNormal, timeout, thing);
    },

    /**
     * Inelegant catch-all Function for when a Player has hit a shell and
     * needs points to be scored. This takes into account player star status and
     * Shell resting and peeking. With none of those modifiers, it defaults to
     * scoreOn with 400.
     *
     * @param thing   A Player hitting other.
     * @param other   A Shell being hit by thing.
     * @remarks See http://themushroomkingdom.net/smb_breakdown.shtml
     */
    scorePlayerShell(this: MarioGame, thing: IPlayer, other: IShell): void {
        // Star player: 200 points
        if (thing.star) {
            thing.FSM.scoreOn(200, other);
            return;
        }

        // Shells in the air: 8000 points (see guide)
        if (!other.resting) {
            thing.FSM.scoreOn(8000, other);
            return;
        }

        // Peeking shells: 1000 points
        if (other.peeking) {
            thing.FSM.scoreOn(1000, other);
            return;
        }

        // Already hopping: 500 points
        if (thing.jumpcount) {
            thing.FSM.scoreOn(500, other);
            return;
        }

        // All other cases: the shell's default
        thing.FSM.scoreOn(400, other);
    },

    /**
     * Determines the amount a Player should score upon hitting a flagpole,
     * based on the Player's y-position.
     *
     * @param thing   A Player hitting a flagpole
     * @param difference   How far up the pole the collision happened,
     *                     by absolute amount (not multiplied by
     *                     unitsize).
     * @returns How many points to award.
     * @remarks See http://themushroomkingdom.net/smb_breakdown.shtml
     */
    scorePlayerFlag(this: MarioGame, thing: IThing, difference: number): number {
        var amount: number;

        if (difference < 28) {
            amount = difference < 8 ? 100 : 400;
        } else if (difference < 40) {
            amount = 800;
        } else {
            amount = difference < 62 ? 2000 : 5000;
        }

        return amount;
    },

    /* Audio
     */

    /**
     * Determines how loud a sound should be at an x-location. This
     * is louder closer to a Player, and nothing to the right of the
     * visible screen.
     *
     * @param FSM
     * @param xloc   The x-location of the sound's source.
     * @returns How loud the sound should be, in [0,1].
     */
    getVolumeLocal(this: MarioGame, FSM: MarioGame, xloc: number): number {
        if (xloc > FSM.MapScreener.right) {
            return 0;
        }

        return Math.max(
            0.14,
            Math.min(0.84, (FSM.MapScreener.width - Math.abs(xloc - FSM.player.left)) / FSM.MapScreener.width)
        );
    },

    /**
     * Determines the name of the default theme for the current area,
     * which is the first word in the area's setting (split on spaces).
     *
     * @param FSM
     * @returns The default theme for the current area.
     */
    getAudioThemeDefault(this: MarioGame, FSM: MarioGame): string {
        return (<IArea>FSM.AreaSpawner.getArea()).setting.split(" ")[0];
    }
};

export type ScoringMethods = typeof scoringMethods;
