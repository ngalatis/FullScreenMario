/**
 * Saved progress: the top score, the last level started, and the "continue"
 * offer on the 1-1 title card that lets the player pick up at that level.
 *
 * The values live in the ItemsHoldr ("topScore" and "lastLevel", stored locally
 * under the game's prefix). Whatever comes back from storage is checked by the
 * helpers in ../progress before it is used.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.continueGame(...) keep working unchanged.
 */
import type {
    IMacroCommand,
    IMacroOutput,
    IMacroPreThings,
    IMacroTitleProgressSettings,
    IArea,
    IMap,
    IThing
} from "../types";
import { MarioGame } from "../MarioGame";
import {
    firstLevel,
    formatContinue,
    formatTopScore,
    hasCoarsePointer,
    maxTopScore,
    sanitizeLevel,
    sanitizeTopScore
} from "../progress";

export const progressMethods = {
    /* Saved values
     */

    /**
     * @returns The best score reached on this device (0 if none is saved).
     */
    getTopScore(this: MarioGame): number {
        return sanitizeTopScore(this.ItemsHolder.getItem("topScore"));
    },

    /**
     * @returns The last standard level started on this device, if one is saved.
     */
    getLastLevel(this: MarioGame): string | undefined {
        return sanitizeLevel(this.ItemsHolder.getItem("lastLevel"));
    },

    /**
     * Saves a level as the last one started. Anything but a standard level
     * (1-1 to 8-4) is ignored, so the random map and custom maps are not saved.
     *
     * @param name   The name of a map that is being started.
     */
    rememberLevel(this: MarioGame, name: string): void {
        var level: string | undefined = sanitizeLevel(name);

        if (level === undefined || level === this.getLastLevel()) {
            return;
        }

        this.ItemsHolder.setItem("lastLevel", level);
        this.ItemsHolder.saveItem("lastLevel");
    },

    /**
     * Raises the top score to the current score if it is higher. This runs
     * whenever the score changes, so the record is saved the moment it is
     * broken. Points that wrapped around (see scoreWrapped) still count.
     */
    updateTopScore(this: MarioGame): void {
        var wrapAt: number = (<any>this.settings.items.values).score.modularity,
            total: number = Math.min(
                maxTopScore,
                (this.scoreWraps || 0) * wrapAt + Number(this.ItemsHolder.getItem("score"))
            );

        if (total > this.getTopScore()) {
            this.ItemsHolder.setItem("topScore", total);
            this.ItemsHolder.saveItem("topScore");
        }
    },

    /**
     * Notes that the score went past its modularity and started again from 0
     * (which also earns a life), so the top score can add those points back.
     */
    scoreWrapped(this: MarioGame): void {
        this.scoreWraps = (this.scoreWraps || 0) + 1;
    },

    /**
     * Forgets the top score and the last level, and withdraws a continue offer
     * that is open. The title card shows the old values until it is spawned again.
     */
    resetProgress(this: MarioGame): void {
        this.ItemsHolder.setItem("topScore", 0);
        this.ItemsHolder.saveItem("topScore");
        this.ItemsHolder.setItem("lastLevel", "");
        this.ItemsHolder.saveItem("lastLevel");

        this.closeContinueOffer();
    },

    /* Continue
     */

    /**
     * @returns The level to offer to continue at: the saved one, unless it is
     *          1-1 (which is where the title card already leads).
     */
    findContinueOffer(this: MarioGame): string | undefined {
        var level: string | undefined = this.getLastLevel();

        return level === firstLevel ? undefined : level;
    },

    /**
     * Closes the continue offer if it is open, taking its line off the title card.
     *
     * @returns Whether an offer was open.
     */
    closeContinueOffer(this: MarioGame): boolean {
        var texts: IThing[], i: number;

        if (this.continueOffer === undefined) {
            return false;
        }

        this.continueOffer = undefined;

        texts = <IThing[]>this.GroupHolder.getGroup("Text");
        for (i = 0; i < texts.length; i += 1) {
            if ((<any>texts[i]).continueText) {
                this.killNormal(texts[i]);
            }
        }

        return true;
    },

    /**
     * Ends the continue offer because the player started to play the level the
     * title card leads to, which makes it the last level started.
     */
    endContinueOffer(this: MarioGame): void {
        if (this.closeContinueOffer()) {
            this.rememberLevel(<string>this.AreaSpawner.getMapName());
        }
    },

    /**
     * Starts a fresh game at a level, like the classic continue: lives, score
     * and coins start over.
     *
     * @param level   The level to start at (by default, the one on offer).
     */
    continueGame(this: MarioGame, level?: string): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            start: string | undefined = sanitizeLevel(level ?? FSM.continueOffer);

        if (start === undefined) {
            return;
        }

        FSM.continueOffer = undefined;
        FSM.scoreWraps = 0;
        FSM.ItemsHolder.setItem("lives", (<any>FSM.settings.items.values).lives.valueDefault);
        FSM.ItemsHolder.setItem("score", 0);
        FSM.ItemsHolder.setItem("coins", 0);
        FSM.ItemsHolder.setItem("power", 1);

        FSM.setMap(start);

        FSM.ModAttacher.fireEvent("onGameStart");
    },

    /**
     * Macro to place the saved progress on a title card: the top score and,
     * when the game has just started (see gameStart) and a level other than the
     * first was saved, a line offering to continue there. This runs every time
     * the area is spawned, so the text is always up to date.
     *
     * @alias TitleProgress
     * @param reference   Settings for a TitleProgress macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns The text lines.
     */
    macroTitleProgress(
        this: MarioGame,
        reference: IMacroTitleProgressSettings,
        prethings: IMacroPreThings,
        area: IArea,
        map: IMap,
        FSM: MarioGame
    ): IMacroOutput {
        var x: number = reference.x || 0,
            y: number = reference.y || 0,
            offer: string | undefined = FSM.titleScreen ? FSM.findContinueOffer() : undefined,
            output: IMacroCommand[] = [
                {
                    "thing": "CustomText",
                    "x": x,
                    "y": y,
                    "texts": [{ "text": formatTopScore(FSM.getTopScore()) }]
                }
            ];

        FSM.continueOffer = offer;

        if (offer !== undefined) {
            output.push({
                "thing": "CustomText",
                "x": reference.continueX ?? x,
                "y": reference.continueY ?? y - 8,
                "texts": [{ "text": formatContinue(offer, hasCoarsePointer()) }],
                "textAttributes": { "continueText": true }
            });
        }

        return output;
    }
};

export type ProgressMethods = typeof progressMethods;
