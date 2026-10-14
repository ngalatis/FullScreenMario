/**
 * Collision handlers: the hit-check generators and the collide* functions
 * that react when one Thing touches another (solids, items, enemies, shells,
 * pipes, vines, the flagpole, castle pieces, detectors, and so on).
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.generateHitCharacterSolid(...) keep working unchanged.
 */
import type { IBlock, IBrick, ICastleAxe, ICastleFireball, ICharacter, ICharacterOverlapping, ICoin, IDetectCollision, IEnemy, IFireball, IItem, IPlayer, IShell, ISolid, ISpringboard, IStar, IVine } from "../types";
import type { MarioGame } from "../MarioGame";

export const collisionHandlerMethods = {
    /* Collision functions
    */

    /**
     * Function generator for the generic hitCharacterSolid callback. This is 
     * used repeatedly by ThingHittr to generate separately optimized Functions
     * for different Thing types.
     * 
     * @returns A Function that generates hitCharacterSolid.
     */
    generateHitCharacterSolid(this: MarioGame): (thing: ICharacter, other: ISolid) => void {
        /**
         * Generic callback for when a character touches a solid. Solids that 
         * "up" kill anything that didn't cause the up, but otherwise this will
         * normally involve the solid's collide callback being called and
         * under/undermid checks activating.
         * 
         * @param thing
         * @param other
         * @returns Whether thing is hitting other.
         */
        return function hitCharacterSolid(thing: ICharacter, other: ISolid): void {
            // "Up" solids are special (they kill things that aren't their .up)
            if (other.up && thing !== other.up) {
                return thing.FSM.collideCharacterSolidUp(thing, other);
            }

            other.collide(thing, other);

            // If a character is bumping into the bottom, call that
            if (thing.undermid) {
                if (thing.undermid.bottomBump) {
                    thing.undermid.bottomBump(thing.undermid, thing);
                }
            } else if (thing.under && thing.under && (<any>thing.under).bottomBump) {
                (<any>thing.under).bottomBump(thing.under[0], thing);
            }

            // If the character is overlapping the solid, call that too
            if (
                thing.checkOverlaps
                && thing.FSM.isCharacterOverlappingSolid(thing, other)) {
                thing.FSM.markOverlap(<ICharacterOverlapping>thing, other);
            }
        };
    },

    /**
     * Function generator for the generic hitCharacterCharacter callback. This
     * is used repeatedly by ThingHittr to generate separately optimized 
     * Functions for different Thing types.
     * 
     * @returns A Function that generates hitCharacterCharacter.
     */
    generateHitCharacterCharacter(this: MarioGame): (thing: ICharacter, other: ICharacter) => void {
        /**
         * Generic callback for when a character touches another character. The
         * first Thing's collide callback is called unless it's a player, in 
         * which the other Thing's is.
         *  
         * @param thing
         * @param other
         * @returns Whether thing is hitting other.
         */
        return function hitCharacterCharacter(thing: ICharacter, other: ICharacter): void {
            // a Player calls the other's collide function, such as playerStar
            if (thing.player) {
                if (other.collide) {
                    return other.collide(thing, other);
                }
            } else if (thing.collide) {
                // Otherwise just use thing's collide function
                thing.collide(other, thing);
            }
        };
    },

    /**
     * Collision callback used by most Items. The item's action callback will
     * be called only if the first Thing is a player.
     * 
     * @param thing   A Character touching other.
     * @param other   An Item being touched by thing.
     */
    collideFriendly(this: MarioGame, thing: ICharacter, other: IItem): void {
        if (!thing.player || !thing.FSM.isThingAlive(other)) {
            return;
        }

        if (other.action) {
            other.action(<IPlayer>thing, other);
        }

        other.death(other);
    },

    /**
     * General callback for when a character touches a solid. This mostly 
     * determines if the character is on top (it should rest on the solid), to
     * the side (it should shouldn't overlap), or undernearth (it also shouldn't
     * overlap).
     * 
     * @param thing   A Character touching other.
     * @param other   A Solid being touched by thing.
     */
    collideCharacterSolid(this: MarioGame, thing: ICharacter, other: ISolid): void {
        if (other.up === thing) {
            return;
        }

        // Character on top of solid
        if (thing.FSM.isCharacterOnSolid(thing, other)) {
            if (other.hidden && !other.collideHidden) {
                return;
            }

            if (thing.resting !== other) {
                thing.resting = other;
                if (thing.onResting) {
                    thing.onResting(thing, other);
                }
                if (other.onRestedUpon) {
                    other.onRestedUpon(other, thing);
                }
            }
        } else if (thing.FSM.isSolidOnCharacter(other, thing)) {
            // Solid on top of character
            var midx: number = thing.FSM.getMidX(thing);

            if (midx > other.left && midx < other.right) {
                thing.undermid = other;
            } else if (other.hidden && !other.collideHidden) {
                return;
            }

            if (!thing.under) {
                thing.under = [other];
            } else {
                thing.under.push(other);
            }

            if (thing.player) {
                (<IPlayer>thing).keys.jump = false;
                thing.FSM.setTop(thing, other.bottom - thing.toly + other.yvel);
            }

            thing.yvel = other.yvel;
        }

        if (other.hidden && !other.collideHidden) {
            return;
        }

        // Character bumping into the side of the solid
        if (
            thing.resting !== other
            && !thing.FSM.isCharacterBumpingSolid(thing, other)
            && !thing.FSM.isThingOnThing(thing, other)
            && !thing.FSM.isThingOnThing(other, thing)
            && !thing.under
        ) {
            // Character to the left of the solid
            if (thing.right <= other.right) {
                thing.xvel = Math.min(thing.xvel, 0);
                thing.FSM.shiftHoriz(
                    thing,
                    Math.max(
                        other.left + thing.FSM.unitsize - thing.right,
                        thing.FSM.unitsize / -2
                    )
                );
            } else {
                // Character to the right of the solid
                thing.xvel = Math.max(thing.xvel, 0);
                thing.FSM.shiftHoriz(
                    thing,
                    Math.min(
                        other.right - thing.FSM.unitsize - thing.left,
                        thing.FSM.unitsize / 2
                    )
                );
            }

            // Non-players flip horizontally
            if (!thing.player) {
                if (!thing.noflip) {
                    thing.moveleft = !thing.moveleft;
                }
                // Some items require fancy versions (e.g. Shell)
                if ((<IItem>thing).item) {
                    thing.collide(other, thing);
                }
            } else if (other.actionLeft) {
                // Players trigger other actions (e.g. Pipe's mapExitPipeHorizontal)
                thing.FSM.ModAttacher.fireEvent("onPlayerActionLeft", thing, other);
                other.actionLeft(thing, other, other.transport);
            }
        }
    },

    /**
     * Collision callback for a character hitting an "up" solid. If it has an
     * onCollideUp callback, that is called; otherwise, it is killed.
     * 
     * @param thing   A Character touching other.
     * @param other   A Solid being touched by thing.
     */
    collideCharacterSolidUp(this: MarioGame, thing: ICharacter, other: ISolid): void {
        if (thing.onCollideUp) {
            thing.onCollideUp(thing, other);
        } else {
            thing.FSM.scoreOn(thing.scoreBelow, thing);
            thing.death(thing, 2);
        }
    },

    /**
     * Collision callback for an item hitting an "up" solid. Items just hop
     * and switch direction.
     * 
     * @param thing   An Item touching other.
     * @param other   A Solid being touched by thing.
     */
    collideUpItem(this: MarioGame, thing: IItem, other: ISolid): void {
        thing.FSM.animateCharacterHop(thing);
        thing.moveleft = thing.FSM.objectToLeft(thing, other);
    },

    /**
     * Collision callback for a floating coin being hit by an "up" solid. It is
     * animated, as if it were hit as the contents of a solid.
     * 
     * @param thing   A Coin being touched by other.
     * @param other   A Solid touching thing.
     */
    collideUpCoin(this: MarioGame, thing: ICoin, other: ISolid): void {
        thing.blockparent = other;
        thing.animate(thing, other);
    },

    /**
     * Collision callback for a player hitting a regular Coin. The Coin
     * disappears but points and Coin totals are both increased, along with
     * the "Coin" sound being played.
     * 
     * @param thing   A Player touching other.
     * @param other   A Coin being touched by thing.
     */
    collideCoin(this: MarioGame, thing: IPlayer, other: ICoin): void {
        if (!thing.player) {
            return;
        }

        thing.FSM.AudioPlayer.play("Coin");
        thing.FSM.ItemsHolder.increase("score", 200);
        thing.FSM.ItemsHolder.increase("coins", 1);
        thing.FSM.killNormal(other);
    },

    /**
     * Collision callback for a player hitting a Star. The Star is killed, and
     * a PlayerStarUp trigger is called on the Thing.
     * 
     * @param thing   A Player touching other.
     * @param other   A Star being touched by thing.
     */
    collideStar(this: MarioGame, thing: IPlayer, other: IStar): void {
        if (!thing.player || thing.star) {
            return;
        }

        thing.FSM.playerStarUp(thing);
        thing.FSM.ModAttacher.fireEvent("onCollideStar", thing, other);
    },

    /**
     * Collision callback for a character being hit by a fireball. It will
     * most likely be killed with an explosion unless it has the nofiredeath 
     * flag, in which case only the fireball dies.
     * 
     * @param thing   A Character being touched by other.
     * @param other   A Fireball touching thing.
     */
    collideFireball(this: MarioGame, thing: ICharacter, other: IFireball): void {
        if (!thing.FSM.isThingAlive(thing) || thing.height < thing.FSM.unitsize) {
            return;
        }

        if (thing.nofire) {
            if (thing.nofire > 1) {
                other.death(other);
            }
            return;
        }

        if (thing.nofiredeath) {
            thing.FSM.AudioPlayer.playLocal(
                "Bump", thing.FSM.getMidX(other));
            thing.death(thing);
        } else {
            thing.FSM.AudioPlayer.playLocal(
                "Kick", thing.FSM.getMidX(other));
            thing.death(thing, 2);
            thing.FSM.scoreOn(thing.scoreFire, thing);
        }

        other.death(other);
    },

    /**
     * Collision callback for hitting a CastleFireball. The character is killed
     * unless it has the star flag, in which case the CastleFireball is.
     * 
     * @param thing   A Character being touched by other.
     * @param other   A CastleFireball touching thing.
     */
    collideCastleFireball(this: MarioGame, thing: ICharacter, other: ICastleFireball): void {
        if ((<any>thing).star) {
            other.death(other);
        } else {
            thing.death(thing);
        }
    },

    /**
     * Collision callback for when a character hits a Shell. This covers various
     * cases, such as deaths, side-to-side Shell collisions, player stomps, and
     * so on.
     * 
     * @param thing   A Character touching other.
     * @param other   A Shell being touched by thing.
     */
    collideShell(this: MarioGame, thing: ICharacter, other: IShell): void {
        // If only one is a shell, it should be other, not thing
        if (thing.shell) {
            if (other.shell) {
                return thing.FSM.collideShellShell(<IShell>thing, other);
            }
            return thing.FSM.collideShell(thing, other);
        }

        // Hitting a solid (e.g. wall) 
        if (thing.groupType === "Solid") {
            return thing.FSM.collideShellSolid(<any>thing, other);
        }

        // Hitting a Player
        if (thing.player) {
            return thing.FSM.collideShellPlayer(<any>thing, <any>other);
        }

        // Assume anything else to be an enemy, which only moving shells kill
        if (other.xvel) {
            thing.FSM.killFlip(thing);
            if (thing.shellspawn) {
                thing = <any>thing.FSM.killSpawn(thing);
            }

            thing.FSM.AudioPlayer.play("Kick");
            thing.FSM.scoreOn(thing.FSM.findScore(other.enemyhitcount), thing);
            other.enemyhitcount += 1;
        } else {
            thing.moveleft = thing.FSM.objectToLeft(thing, other);
        }
    },

    /**
     * Collision callback for a solid being hit by a Shell. The Shell will 
     * bounce the opposition direction.
     * 
     * @param thing   A Solid being touched by other.
     * @param other   A Shell touching thing.
     */
    collideShellSolid(this: MarioGame, thing: ISolid, other: IShell): void {
        if (other.right < thing.right) {
            thing.FSM.AudioPlayer.playLocal("Bump", thing.left);
            thing.FSM.setRight(other, thing.left);
            other.xvel = -other.speed;
            other.moveleft = true;
        } else {
            thing.FSM.AudioPlayer.playLocal("Bump", thing.right);
            thing.FSM.setLeft(other, thing.right);
            other.xvel = other.speed;
            other.moveleft = false;
        }
    },

    /**
     * Collision callback for when a Player hits a Shell. This covers all the
     * possible scenarios, and is much larger than common sense dictates.
     * 
     * @param thing   A Player touching other.
     * @param other   A Shell being touched by thing.
     */
    collideShellPlayer(this: MarioGame, thing: IPlayer, other: IShell): void {
        var shelltoleft: boolean = thing.FSM.objectToLeft(other, thing),
            playerjump: boolean = thing.yvel > 0 && (
                thing.bottom <= other.top + thing.FSM.unitsize * 2);

        // Star players kill the shell no matter what
        if (thing.star) {
            thing.FSM.scorePlayerShell(thing, other);
            other.death(other, 2);
            return;
        }

        // If the shell is already being landed on by a Player, see if it's
        // still being pushed to the side, or has reversed direction (is deadly)
        if (other.landing) {
            // Equal shelltoleft measurements: it's still being pushed
            if (other.shelltoleft === shelltoleft) {
                // Tepmorarily increase the landing count of the shell; if it is 
                // just being started, that counts as the score hit
                other.landing += 1;
                if (other.landing === 1) {
                    thing.FSM.scorePlayerShell(thing, other);
                }
                thing.FSM.TimeHandler.addEvent(
                    function (other: IShell): void {
                        other.landing -= 1;
                    },
                    2,
                    other);
            } else {
                // Different shelltoleft measurements: it's deadly
                thing.death(thing);
            }
            return;
        }

        // If the shell is being kicked by a Player, either by hitting a still
        // shell or jumping onto an already moving one
        if (other.xvel === 0 || playerjump) {
            // Reset any signs of peeking from the shell
            other.counting = 0;

            // If the shell is standing still, make it move
            if (other.xvel === 0) {
                thing.FSM.AudioPlayer.play("Kick");
                thing.FSM.scorePlayerShell(thing, other);
                if (shelltoleft) {
                    other.moveleft = true;
                    other.xvel = -other.speed;
                } else {
                    other.moveleft = false;
                    other.xvel = other.speed;
                }
                other.hitcount += 1;
                thing.FSM.TimeHandler.addEvent(
                    function (other: IShell): void {
                        other.hitcount -= 1;
                    },
                    2,
                    other);
            } else {
                // Otherwise it was moving, but should now be still
                other.xvel = 0;
            }

            if (other.peeking) {
                other.peeking = 0;
                thing.FSM.removeClass(other, "peeking");
                other.height -= thing.FSM.unitsize / 8;
                thing.FSM.updateSize(other);
            }

            // If a Player is landing on the shell (with movements and xvels
            // already set), a Player should then jump up a bit
            if (playerjump) {
                thing.FSM.AudioPlayer.play("Kick");

                if (!other.xvel) {
                    thing.FSM.jumpEnemy(thing, other);
                    thing.yvel *= 2;
                    // thing.FSM.scorePlayerShell(thing, other);
                    thing.FSM.setBottom(thing, other.top - thing.FSM.unitsize);
                } else {
                    // thing.FSM.scorePlayerShell(thing, other);
                }

                other.landing += 1;
                other.shelltoleft = shelltoleft;
                thing.FSM.TimeHandler.addEvent(
                    function (other: IShell): void {
                        other.landing -= 1;
                    },
                    2,
                    other);
            }
        } else {
            // Since a Player is touching the shell normally, that's a death if
            // the shell isn't moving away
            if (!other.hitcount && (
                (shelltoleft && other.xvel > 0)
                || (!shelltoleft && other.xvel < 0)
            )) {
                thing.death(thing);
            }
        }
    },

    /**
     * Collision callback for two Shells. If one is moving, it kills the other;
     * otherwise, they bounce off.
     * 
     * @param thing   A Shell touching other.
     * @param other   A Shell being touched by thing.
     */
    collideShellShell(this: MarioGame, thing: IShell, other: IShell): void {
        if (thing.xvel !== 0) {
            if (other.xvel !== 0) {
                var temp: number = thing.xvel;
                thing.xvel = other.xvel;
                other.xvel = temp;

                thing.FSM.shiftHoriz(thing, thing.xvel);
                thing.FSM.shiftHoriz(other, other.xvel);
            } else {
                thing.FSM.ItemsHolder.increase("score", 500);
                other.death(other);
            }
        } else {
            thing.FSM.ItemsHolder.increase("score", 500);
            thing.death(thing);
        }
    },

    /**
     * Collision callback for a general character hitting an enemy. This covers
     * many general cases, most of which involve a player and an enemy.
     * 
     * @param thing   A Character touching other.
     * @param other   An Enemy being touched by thing.
     */
    collideEnemy(this: MarioGame, thing: ICharacter, other: IEnemy): void {
        // If either is a player, make it thing (not other)
        if (!thing.player && other.player) {
            return thing.FSM.collideEnemy(thing, other);
        }

        // Death: nothing happens
        if (!thing.FSM.isThingAlive(thing) || !thing.FSM.isThingAlive(other)) {
            return;
        }

        // Items
        if ((<IItem>thing).item) {
            if (thing.collidePrimary) {
                return thing.collide(other, thing);
            }
            return;
        }

        // For non-players, it's just to characters colliding: they bounce
        if (!thing.player) {
            thing.moveleft = thing.FSM.objectToLeft(thing, other);
            other.moveleft = !thing.moveleft;
            return;
        }

        // Player landing on top of an enemy
        if (
            ((<IStar>thing).star && !other.nostar)
            || (
                !thing.FSM.MapScreener.underwater
                && (!other.deadly && thing.FSM.isThingOnThing(thing, other))
            )
        ) {
            // For the sake of typing. Should be optimized during runtime.
            var player: IPlayer = <IPlayer>thing;

            // Enforces toly (not touching means stop)
            if (player.FSM.isCharacterAboveEnemy(player, other)) {
                return;
            }

            // A star player just kills the enemy, no matter what
            if (player.star) {
                other.nocollide = true;
                other.death(other, 2);
                player.FSM.scoreOn(other.scoreStar, other);
                player.FSM.AudioPlayer.play("Kick");
            } else {
                // A non-star player kills the enemy with spawn, and hops
                player.FSM.setBottom(
                    player,
                    Math.min(player.bottom, other.top + player.FSM.unitsize)
                );
                player.FSM.TimeHandler.addEvent(player.FSM.jumpEnemy, 0, player, other);

                other.death(other, player.star ? 2 : 0);

                player.FSM.addClass(player, "hopping");
                player.FSM.removeClasses(
                    player, "running skidding jumping one two three"
                );
                player.hopping = true;

                if (player.power === 1) {
                    player.FSM.setPlayerSizeSmall(player);
                }
            }
        } else if (!thing.FSM.isCharacterAboveEnemy(thing, other)) {
            // Player being landed on by an enemy
            thing.death(thing);
        }
    },

    /**
     * Collision callback for a character bumping into the bottom of a solid.
     * Only players cause the solid to jump and be considered "up", though large
     * players will kill solids that have the breakable flag on. If the solid 
     * does jump and has contents, they emerge.
     * 
     * @param thing   A Brick being touched by other.
     * @param other   A Character touching thing.
     */
    collideBottomBrick(this: MarioGame, thing: IBrick, other: ICharacter): void {
        if ((<any>other).solid && !thing.solid) {
            return thing.FSM.collideBottomBrick(<any>other, <any>thing);
        }

        if (thing.up || !other.player) {
            return;
        }

        thing.FSM.AudioPlayer.play("Bump");

        if (thing.used) {
            return;
        }

        thing.up = other;
        if ((<IPlayer>other).power > 1 && thing.breakable && !thing.contents) {
            thing.FSM.TimeHandler.addEvent(
                thing.FSM.killBrick, 2, thing, other);
            return;
        }

        thing.FSM.animateSolidBump(thing);

        if (thing.contents) {
            thing.FSM.TimeHandler.addEvent(
                function (): void {
                    thing.FSM.animateSolidContents(thing, <any>other);

                    if (thing.contents !== "Coin") {
                        thing.FSM.animateBlockBecomesUsed(<any>thing);
                    } else {
                        if (thing.lastcoin) {
                            thing.FSM.animateBlockBecomesUsed(<any>thing);
                        } else {
                            thing.FSM.TimeHandler.addEvent(
                                function (): void {
                                    thing.lastcoin = true;
                                },
                                245);
                        }
                    }
                },
                7);
        }
    },

    /**
     * Collision callback for a Player hitting the bottom of a Block. Unused
     * Blocks have their contents emerge (by default a Coin), while used Blocks
     * just have a small bump noise played.
     * 
     * @param thing   A Block being touched by other.
     * @param other   A Player touching thing.
     */
    collideBottomBlock(this: MarioGame, thing: IBlock, other: IPlayer): void {
        if ((<any>other).solid && !thing.solid) {
            return thing.FSM.collideBottomBlock(<any>other, <any>thing);
        }

        if (thing.up || !other.player) {
            return;
        }

        if (thing.used) {
            thing.FSM.AudioPlayer.play("Bump");
            return;
        }

        thing.used = true;
        thing.hidden = false;
        thing.up = other;

        thing.FSM.animateSolidBump(thing);
        thing.FSM.removeClass(thing, "hidden");
        thing.FSM.switchClass(thing, "unused", "used");
        thing.FSM.TimeHandler.addEvent(
            thing.FSM.animateSolidContents, 7, thing, other);
    },

    /**
     * Collision callback for Vines. A player becomes "attached" to the Vine
     * and starts climbing it, with movement set to movePlayerVine.
     * 
     * @param thing   A Player touching other.
     * @param other   A Solid being touched by thing.
     */
    collideVine(this: MarioGame, thing: IPlayer, other: IVine): void {
        if (!thing.player || thing.attachedSolid || thing.climbing) {
            return;
        }

        if (thing.bottom > other.bottom + thing.FSM.unitsize * 2) {
            return;
        }

        other.attachedCharacter = thing;
        thing.attachedSolid = other;

        thing.nofall = true;
        thing.checkOverlaps = false;
        thing.resting = undefined;

        // To the left of the vine
        if (thing.right < other.right) {
            thing.lookleft = false;
            thing.moveleft = false;
            thing.attachedDirection = -1;
            thing.FSM.unflipHoriz(thing);
        } else {
            // To the right of the vine
            thing.lookleft = true;
            thing.moveleft = true;
            thing.attachedDirection = 1;
            thing.FSM.flipHoriz(thing);
        }

        thing.FSM.animateCharacterPauseVelocity(thing);
        thing.FSM.addClass(thing, "climbing");
        thing.FSM.removeClasses(
            thing, "running", "jumping", "skidding");

        thing.FSM.TimeHandler.cancelClassCycle(thing, "running");
        thing.FSM.TimeHandler.addClassCycle(
            thing, ["one", "two"], "climbing", 0
        );

        thing.attachedLeft = !thing.FSM.objectToLeft(thing, other);
        thing.attachedOff = thing.attachedLeft ? 1 : -1;

        thing.movement = thing.FSM.movePlayerVine;
    },

    /**
     * Collision callback for a character hitting a Springboard. This acts as a
     * normal solid to non-players, and only acts as a spring if a Player is
     * above it and moving down.
     * 
     * @param thing   A Character touching other.
     * @param other   A Springboard being touched by thing.
     */
    collideSpringboard(this: MarioGame, thing: ICharacter, other: ISpringboard): void {
        if (
            thing.player && thing.yvel >= 0 && !other.tension
            && thing.FSM.isCharacterOnSolid(thing, other)
        ) {
            other.tension = other.tensionSave = Math.max(
                thing.yvel * 0.77,
                thing.FSM.unitsize
            );
            thing.movement = thing.FSM.movePlayerSpringboardDown;
            (<IPlayer>thing).spring = other;
            thing.xvel /= 2.8;
        } else {
            thing.FSM.collideCharacterSolid(thing, other);
        }
    },

    /**
     * Collision callback for a character hitting a WaterBlocker on the top of
     * an underwater area. It simply stops them from moving up.
     * 
     * @param thing   A Character touching other.
     * @param other   A WaterBlocker being touched by thing.
     */
    collideWaterBlocker(this: MarioGame, thing: ICharacter, other: ISolid): void {
        thing.FSM.collideCharacterSolid(thing, other);
    },

    /**
     * Collision callback for the DetectCollision on a flagpole at the end of an
     * EndOutsideCastle. The Flagpole cutscene is started.
     * 
     * @param thing   A Player touching other.
     * @param other   A DetectCollision being touched by thing.
     */
    collideFlagpole(this: MarioGame, thing: IPlayer, other: IDetectCollision): void {
        if (thing.bottom > other.bottom) {
            return;
        }

        thing.FSM.ScenePlayer.startCutscene("Flagpole", {
            "player": thing,
            "collider": other
        });
    },

    /**
     * Collision callback for a Player hitting a CastleAxe. A player and
     * screen are paused for 140 steps (other callbacks should be animating
     * the custcene).
     * 
     * @param thing   A Player touching other.
     * @param other   A CastleAxe being touched by thing.
     */
    collideCastleAxe(this: MarioGame, thing: IPlayer, other: ICastleAxe): void {
        if (!thing.FSM.MathDecider.compute("canPlayerTouchCastleAxe", thing, other)) {
            return;
        }

        thing.FSM.ScenePlayer.startCutscene("BowserVictory", {
            "player": thing,
            "axe": other
        });
    },

    /**
     * Collision callback for a player hitting the DetectCollision placed next 
     * a CastleDoor in EndOutsideCastle. Things and the current time are added
     * to cutscene settings. Infinite time goes directly to the Fireworks
     * routine, while having non-infinite time goes to the Countdown routine.
     * 
     * @param thing   A Player touching other.
     * @param other   A DetectCollision being touched by thing.
     */
    collideCastleDoor(this: MarioGame, thing: IPlayer, other: IDetectCollision): void {
        thing.FSM.killNormal(thing);
        if (!thing.player) {
            return;
        }

        var time: number = thing.FSM.ItemsHolder.getItem("time");

        thing.FSM.ScenePlayer.addCutsceneSetting("player", thing);
        thing.FSM.ScenePlayer.addCutsceneSetting("detector", other);
        thing.FSM.ScenePlayer.addCutsceneSetting("time", time);

        if (time === Infinity) {
            thing.FSM.ScenePlayer.playRoutine("Fireworks");
        } else {
            thing.FSM.ScenePlayer.playRoutine("Countdown");
        }
    },

    /** 
     * Collision callback for a player reaching a castle NPC. Things and
     * the NPC's keys are added to cutscene settings, and the Dialog routine
     * is played.
     * 
     * @param thing   A Player touching other.
     * @param other   A DetectCollision being touched by thing.
     */
    collideCastleNPC(this: MarioGame, thing: IPlayer, other: IDetectCollision): void {
        var keys: any[] = other.collection.npc.collectionKeys;

        thing.FSM.ScenePlayer.addCutsceneSetting("keys", keys);
        thing.FSM.ScenePlayer.addCutsceneSetting("player", thing);
        thing.FSM.ScenePlayer.addCutsceneSetting("detector", other);

        thing.FSM.ScenePlayer.playRoutine("Dialog");
    },

    /**
     * Collision callback for a player hitting the transportation Platform in
     * cloud worlds. A player collides with it as normal for solids, but if
     * a Player is then resting on it, it becomes a normal moving platform
     * with only horizontal momentum.
     * 
     * @param thing   A Player touching other.
     * @param other   A Solid being touched by thing.
     */
    collideTransport(this: MarioGame, thing: IPlayer, other: ISolid): void {
        if (!thing.player) {
            return;
        }

        thing.FSM.collideCharacterSolid(thing, other);
        if (thing.resting !== other) {
            return;
        }

        other.xvel = thing.FSM.unitsize / 2;
        other.movement = thing.FSM.movePlatform;
        other.collide = thing.FSM.collideCharacterSolid;
    },

    /**
     * General collision callback for DetectCollision Things. The real activate
     * callback is only hit if the Thing is a player; otherwise, an optional
     * activateFail may be activated. The DetectCollision is then killed if it
     * doesn't have the noActivateDeath flag.
     * 
     * @param thing   A Character touching other.
     * @param other   A DetectCollision being touched by thing.
     */
    collideDetector(this: MarioGame, thing: ICharacter, other: IDetectCollision): void {
        if (!thing.player) {
            if (other.activateFail) {
                other.activateFail(thing);
            }
            return;
        }

        other.activate(thing, other);

        if (!other.noActivateDeath) {
            thing.FSM.killNormal(other);
        }
    },

    /**
     * Collision callback for level transports (any Thing with a .transport 
     * attribute). Depending on the transport, either the map or location are 
     * shifted to it.
     * 
     * @param thing   A Player touching other.
     * @param other   A Solid being touched by thing.
     */
    collideLevelTransport(this: MarioGame, thing: IPlayer, other: ISolid): void {
        if (!thing.player) {
            return;
        }

        var transport: any = other.transport;

        if (typeof transport === "undefined") {
            throw new Error("No transport given to collideLevelTransport");
        }

        if (transport.constructor === String) {
            thing.FSM.setLocation(<string>transport);
        } else if (typeof transport.map !== "undefined") {
            if (typeof transport.location !== "undefined") {
                thing.FSM.setMap(transport.map, transport.location);
            } else {
                thing.FSM.setMap(transport.map);
            }
        } else if (typeof transport.location !== "undefined") {
            thing.FSM.setLocation(transport.location);
        } else {
            throw new Error("Unknown transport type:" + transport);
        }
    },
};

export type CollisionHandlerMethods = typeof collisionHandlerMethods;
