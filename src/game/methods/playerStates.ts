/**
 * Player state changes: gaining lives, bouncing off enemies, and the
 * mushroom, star, size and fire power-up states of the player (including their
 * animations), plus resting stones and overlap marking.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.gainLife(...) keep working unchanged.
 */
import * as TimeHandlr from "../../engine/TimeHandlr";
import type { ICharacter, ICharacterOverlapping, IEnemy, IItem, IPlayer, IRestingStone, ISolid } from "../types";
import { MarioGame } from "../MarioGame";

export const playerStateMethods = {
    /* Collision reactions
     */

    /**
     * Externally facing Function to gain some number of lives. ItemsHolder
     * increases the "score" statistic, an audio is played, and the mod event is
     * fired.
     *
     * @param amount   How many lives to gain (by default, 1).
     * @param nosound   Whether the sound should be skipped (by default,
     *                  false).
     */
    gainLife(this: MarioGame, amount: number, nosound?: boolean): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this);

        amount = Number(amount) || 1;

        FSM.ItemsHolder.increase("lives", amount);

        if (!nosound) {
            this.AudioPlayer.play("Gain Life");
        }

        FSM.ModAttacher.fireEvent("onGainLife", amount);
    },

    /**
     * Basic Function for an item to jump slightly into the air, such as from
     * a Player hitting a solid below it.
     *
     * @param thing   An item.
     * @remarks This simply moves the thing up slightly and decreases its
     *          y-velocity, without considering x-direction.
     */
    itemJump(this: MarioGame, thing: IItem): void {
        thing.yvel -= MarioGame.unitsize * 1.4;
        this.shiftVert(thing, -MarioGame.unitsize);
    },

    /**
     * Generic Function for when a Player jumps on top of an enemy. The enemy
     * is killed, a Player's velocity points upward, and score is gained.
     *
     * @param thing   A Player jumping on other.
     * @param other   An Enemy being jumped upon.
     */
    jumpEnemy(this: MarioGame, thing: IPlayer, other: IEnemy): void {
        if (thing.keys.up) {
            thing.yvel = thing.FSM.unitsize * -1.4;
        } else {
            thing.yvel = thing.FSM.unitsize * -0.7;
        }

        thing.xvel *= 0.91;
        thing.FSM.AudioPlayer.play("Kick");

        if (!(<IItem>thing).item || other.shell) {
            thing.jumpcount += 1;
            thing.FSM.scoreOn(thing.FSM.findScore(thing.jumpcount + thing.jumpers), other);
        }

        thing.jumpers += 1;
        thing.FSM.TimeHandler.addEvent(
            function (thing: IPlayer): void {
                thing.jumpers -= 1;
            },
            1,
            thing
        );
    },

    /**
     * Callback for a Player hitting a Mushroom or FireFlower. A player's
     * power and the ItemsHolder's "power" statistic both go up, and the
     * corresponding animations and mod event are triggered.
     *
     * @param thing   A Player powering up.
     * @param other   A Mushroom powering up hte Player.
     */
    playerShroom(this: MarioGame, thing: IPlayer, other: IItem): void {
        if (thing.shrooming || !thing.player) {
            return;
        }

        thing.FSM.AudioPlayer.play("Powerup");
        thing.FSM.scoreOn(1000, thing.FSM.player);

        if (thing.power < 3) {
            thing.FSM.ItemsHolder.increase("power");

            if (thing.power < 3) {
                thing.shrooming = true;
                thing.power += 1;

                if (thing.power === 3) {
                    thing.FSM.playerGetsFire(thing.FSM.player);
                } else {
                    thing.FSM.playerGetsBig(thing.FSM.player);
                }
            }
        }

        thing.FSM.ModAttacher.fireEvent("onPlayerShroom", thing, other);
    },

    /**
     * Callback for a Player hitting a Mushroom1Up. The game simply calls
     * gainLife and triggers the mod event.
     *
     * @param thing   A Player gaining a life.
     * @param other   The Mushroom1Up giving the life.
     */
    playerShroom1Up(this: MarioGame, thing: ICharacter, other: IItem): void {
        if (!thing.player) {
            return;
        }

        thing.FSM.gainLife(1);
        thing.FSM.ModAttacher.fireEvent("onPlayerShroom1Up", thing, other);
    },

    /**
     * Callback for a Player hitting a Star. A set of animation loops and
     * sounds play, and the mod event is triggered. After some long period time,
     * playerStarDown is called to start the process of removing star power.
     *
     * @param thing   A Player gaining star powers.
     * @param timeout   How long to wait before calling playerStarDown
     *                  (by default, 560).
     */
    playerStarUp(this: MarioGame, thing: IPlayer, timeout: number = 560): void {
        thing.star += 1;

        thing.FSM.switchClass(thing, "normal fiery", "star");

        thing.FSM.AudioPlayer.play("Powerup");
        thing.FSM.AudioPlayer.addEventListener(
            "Powerup",
            "ended",
            thing.FSM.AudioPlayer.playTheme.bind(thing.FSM.AudioPlayer, "Star", true)
        );

        thing.FSM.TimeHandler.addClassCycle(thing, ["star1", "star2", "star3", "star4"], "star", 2);

        thing.FSM.TimeHandler.addEvent(thing.FSM.playerStarDown, timeout || 560, thing);

        thing.FSM.ModAttacher.fireEvent("onPlayerStarUp", thing);
    },

    /**
     * Trigger to commence reducing a Player's star power. This slows the
     * class cycle, times a playerStarOffCycle trigger, and fires the mod event.
     *
     * @param thing   A Player losing star powers.
     */
    playerStarDown(this: MarioGame, thing: IPlayer): void {
        if (!thing.player) {
            return;
        }

        thing.FSM.TimeHandler.cancelClassCycle(thing, "star");
        thing.FSM.TimeHandler.addClassCycle(thing, ["star1", "star2", "star3", "star4"], "star", 5);

        thing.FSM.TimeHandler.addEvent(thing.FSM.playerStarOffCycle, 140, thing);

        thing.FSM.AudioPlayer.removeEventListeners("Powerup", "ended");

        thing.FSM.ModAttacher.fireEvent("onPlayerStarDown", thing);
    },

    /**
     * Trigger to continue reducing a Player's star power. This resumes
     * playing the regular theme, times a playerStarOffFinal trigger, and fires
     * the mod event.
     *
     * @param thing   A Player losing star powers.
     */
    playerStarOffCycle(this: MarioGame, thing: IPlayer): void {
        if (!thing.player) {
            return;
        }

        if (thing.star > 1) {
            thing.star -= 1;
            return;
        }

        var theme = thing.FSM.AudioPlayer.getTheme();

        if (theme && !theme.paused) {
            thing.FSM.AudioPlayer.playTheme();
        }

        thing.FSM.TimeHandler.addEvent(thing.FSM.playerStarOffFinal, 70, thing);

        thing.FSM.ModAttacher.fireEvent("onPlayerStarOffCycle", thing);
    },

    /**
     * Trigger to finish reducing a Player's star power. This actually reduces
     * a Player's star attribute, cancels the sprite cycle, adds the previous
     * classes back, and fires the mod event.
     *
     * @param thing   A Player losing star powers.
     */
    playerStarOffFinal(this: MarioGame, thing: IPlayer): void {
        if (!thing.player) {
            return;
        }

        thing.star -= 1;
        thing.FSM.TimeHandler.cancelClassCycle(thing, "star");
        thing.FSM.removeClasses(thing, "star star1 star2 star3 star4");
        thing.FSM.addClass(thing, "normal");

        if (thing.power === 3) {
            thing.FSM.addClass(thing, "fiery");
        }

        thing.FSM.ModAttacher.fireEvent("onPlayerStarOffFinal", thing);
    },

    /**
     * Sizing modifier for a Player, typically called when entering a location
     * or colliding with a Mushroom. This sets a Player's size to the large
     * mode and optionally plays the animation. The mod event is then fired.
     *
     * @param thing   A Player increasing in size.
     * @param noAnimation   Whether to skip the animation (by default,
     *                      false).
     */
    playerGetsBig(this: MarioGame, thing: IPlayer, noAnimation?: boolean): void {
        thing.FSM.setPlayerSizeLarge(thing);
        thing.FSM.removeClasses(thing, "crouching small");
        thing.FSM.updateBottom(thing, 0);
        thing.FSM.updateSize(thing);

        if (noAnimation) {
            thing.FSM.addClass(thing, "large");
        } else {
            thing.FSM.playerGetsBigAnimation(thing);
        }

        thing.FSM.ModAttacher.fireEvent("onPlayerGetsBig", thing);
    },

    /**
     * Animation scheduler for a Player getting big. The shrooming classes are
     * cycled through rapidly while a Player's velocity is paused.
     *
     * @param thing   A Player increasing in size.
     */
    playerGetsBigAnimation(this: MarioGame, thing: IPlayer): void {
        var stages: (string | TimeHandlr.IClassCalculator)[] = [
            "shrooming1",
            "shrooming2",
            "shrooming1",
            "shrooming2",
            "shrooming3",
            "shrooming2",
            "shrooming3"
        ];

        thing.FSM.addClass(thing, "shrooming");
        thing.FSM.animateCharacterPauseVelocity(thing);

        // The last stage in the events clears it, resets movement, and stops
        stages.push(function (): boolean {
            thing.shrooming = false;
            stages.length = 0;

            thing.FSM.addClass(thing, "large");
            thing.FSM.removeClasses(thing, "shrooming shrooming3");
            thing.FSM.animateCharacterResumeVelocity(thing);

            return true;
        });

        thing.FSM.TimeHandler.addClassCycle(thing, stages, "shrooming", 6);
    },

    /**
     * Sizing modifier for a Player, typically called when going down to
     * normal size after being large. This containst eha nimation scheduling
     * to cycle through paddling classes, then flickers a Player. The mod
     * event is fired.
     *
     * @param thing   A Player decreasing in size.
     */
    playerGetsSmall(this: MarioGame, thing: IPlayer): void {
        var bottom: number = thing.bottom;

        thing.FSM.animateCharacterPauseVelocity(thing);

        // Step one
        thing.nocollidechar = true;
        thing.FSM.animateFlicker(thing);
        thing.FSM.removeClasses(thing, "running skidding jumping fiery");
        thing.FSM.addClasses(thing, "paddling small");

        // Step two (t+21)
        thing.FSM.TimeHandler.addEvent(
            function (thing: IPlayer): void {
                thing.FSM.removeClass(thing, "large");
                thing.FSM.setPlayerSizeSmall(thing);
                thing.FSM.setBottom(thing, bottom - MarioGame.unitsize);
            },
            21,
            thing
        );

        // Step three (t+42)
        thing.FSM.TimeHandler.addEvent(
            function (thing: IPlayer): void {
                thing.FSM.animateCharacterResumeVelocity(thing, false);
                thing.FSM.removeClass(thing, "paddling");
                if (thing.running || thing.xvel) {
                    thing.FSM.addClass(thing, "running");
                }
                thing.FSM.PixelDrawer.setThingSprite(thing);
            },
            42,
            thing
        );

        // Step four (t+70)
        thing.FSM.TimeHandler.addEvent(
            function (thing: IPlayer): void {
                thing.nocollidechar = false;
            },
            70,
            thing
        );

        thing.FSM.ModAttacher.fireEvent("onPlayerGetsSmall");
    },

    /**
     * Visual changer for when a Player collides with a FireFlower. The
     * "fiery" class is added, and the mod event is fired.
     *
     * @param thing   A Player gaining fire powers.
     */
    playerGetsFire(this: MarioGame, thing: IPlayer): void {
        thing.shrooming = false;

        if (!thing.star) {
            thing.FSM.addClass(thing, "fiery");
        }

        thing.FSM.ModAttacher.fireEvent("onPlayerGetsFire");
    },

    /**
     * Actually sets the size for a player to small (8x8) via setSize and
     * updateSize.
     *
     * @param thing   A Player decreasing in size.
     */
    setPlayerSizeSmall(this: MarioGame, thing: IPlayer): void {
        thing.FSM.setSize(thing, 8, 8, true);
        thing.FSM.updateSize(thing);
    },

    /**
     * Actually sets the size for a player to large (8x16) via setSize and
     * updateSize.
     *
     * @param thing   A Player increasing in size.
     */
    setPlayerSizeLarge(this: MarioGame, thing: IPlayer): void {
        thing.FSM.setSize(thing, 8, 16, true);
        thing.FSM.updateSize(thing);
    },

    /**
     * Removes the crouching flag from a Player and re-adds the running cycle.
     * If a Player is large (has power > 1), size and classes must be set.
     *
     * @param thing   A Player that is no longer crouching.
     */
    animatePlayerRemoveCrouch(this: MarioGame, thing: IPlayer): void {
        thing.crouching = false;
        thing.toly = thing.tolyOld || 0;

        if (thing.power !== 1) {
            thing.FSM.setHeight(thing, 16, true, true);
            thing.FSM.removeClasses(thing, "crouching");
            thing.FSM.updateBottom(thing, 0);
            thing.FSM.updateSize(thing);
        }

        thing.FSM.animatePlayerRunningCycle(thing);
    },

    /**
     * Officially unattaches a player from a solid. The thing's physics flags
     * are reset to normal, the two have their attachment flags set, and the
     * thing is set to be jumping off.
     *
     * @param thing   A Player attached to other.
     * @param other   A Solid thing is attached to.
     */
    unattachPlayer(this: MarioGame, thing: IPlayer, other: ISolid): void {
        thing.nofall = false;
        thing.nocollide = false;
        thing.checkOverlaps = true;
        thing.attachedSolid = undefined;
        thing.xvel = thing.keys ? thing.keys.run : 0;
        thing.movement = thing.FSM.movePlayer;

        thing.FSM.addClass(thing, "jumping");
        thing.FSM.removeClasses(thing, "climbing", "animated");

        other.attachedCharacter = undefined;
    },

    /**
     * Adds an invisible RestingStone underneath a Player. It is hidden and
     * unable to collide until a Player falls to its level, at which point the
     * stone is set underneath a Player to be rested upon.
     *
     * @param thing   A Player respawning into the game.
     */
    playerAddRestingStone(this: MarioGame, thing: IPlayer): void {
        var stone: IRestingStone = <IRestingStone>(
            thing.FSM.addThing("RestingStone", thing.left, thing.top + thing.FSM.unitsize * 48)
        );

        thing.nocollide = true;

        thing.FSM.TimeHandler.addEventInterval(
            function (): boolean {
                if (thing.bottom < stone.top) {
                    return false;
                }

                thing.nocollide = false;
                thing.FSM.setMidXObj(stone, thing);
                thing.FSM.setBottom(thing, stone.top);
                return true;
            },
            1,
            Infinity
        );
    },

    /**
     * Marks a new overlapping Thing in the first Thing's overlaps Array,
     * creating the Array if needed.
     *
     * @param thing   The Thing that is overlapping another Thing.
     * @param other   The Thing being added to the overlaps Array.
     */
    markOverlap(this: MarioGame, thing: ICharacterOverlapping, other: ISolid): void {
        if (!thing.overlaps) {
            thing.overlaps = [other];
        } else {
            thing.overlaps.push(other);
        }
    }
};

export type PlayerStateMethods = typeof playerStateMethods;
