/**
 * Game lifecycle and per-tick upkeep: starting and ending the game, adding
 * PreThings and the player, pause/play hooks, and the maintain* routines that
 * run every upkeep (time, scenery, solids, characters, overlaps, the player).
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.gameStart(...) keep working unchanged.
 */
import type { IArea, ICharacter, ICharacterOverlapping, ICustomText, IMapScreenr, IPlayer, IPreThing, IScenery, ISolid, IThing } from "../types";
import { MarioGame } from "../MarioGame";

export const lifecycleMethods = {
    /* Global manipulations
    */

    /**
     * Completely restarts the game. Lives are reset to 3, the map goes back
     * to default, and the onGameStart mod trigger is fired.
     */
    gameStart(this: MarioGame): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this);

        FSM.setMap(FSM.settings.maps.mapDefault, FSM.settings.maps.locationDefault);
        FSM.ItemsHolder.setItem(
            "lives",
            (<any>FSM.settings.items.values).lives.valueDefault);

        FSM.ModAttacher.fireEvent("onGameStart");
    },

    /**
     * Completely ends the game. All Thing groups are clared, sounds are 
     * stopped, the screen goes to black, "GAME OVER" is displayed. After a 
     * while, the game restarts again via gameStart.
     */
    gameOver(this: MarioGame): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            text: ICustomText = <ICustomText>FSM.ObjectMaker.make("CustomText", {
                "texts": [{
                    "text": "GAME OVER"
                }]
            }),
            texts: IThing[],
            textWidth: number,
            i: number;

        FSM.killNPCs();

        FSM.AudioPlayer.clearAll();
        FSM.AudioPlayer.play("Game Over");

        FSM.GroupHolder.clearArrays();
        FSM.ItemsHolder.hideContainer();
        FSM.TimeHandler.cancelAllEvents();
        FSM.PixelDrawer.setBackground("black");

        FSM.addThing(text, FSM.MapScreener.width / 2, FSM.MapScreener.height / 2);

        texts = text.children;
        textWidth = -(texts[texts.length - 1].right - texts[0].left) / 2;
        for (i = 0; i < texts.length; i += 1) {
            FSM.shiftHoriz(texts[i], textWidth);
        }

        FSM.TimeHandler.addEvent(
            function (): void {
                FSM.gameStart();
                FSM.ItemsHolder.displayContainer();
            },
            420);

        FSM.ModAttacher.fireEvent("onGameOver");
    },

    /**
     * Generates a key for a Thing based off the current area and the Thing's
     * basic attributes. This should be used for PixelRender.get calls, to
     * cache the Thing's sprite.
     * 
     * @param thing
     * @returns A key that to identify the Thing's sprite.
     */
    generateThingKey(this: MarioGame, thing: IThing): string {
        return (<IArea>thing.GameStarter.AreaSpawner.getArea()).setting
            + " " + thing.groupType + " "
            + thing.title + " " + thing.className;
    },

    /**
     * Adds a Thing via addPreThing based on the specifications in a PreThing.
     * This is done relative to MapScreener.left and MapScreener.floor.
     * 
     * @param prething   A PreThing whose Thing is to be added to the game.
     */
    addPreThing(this: MarioGame, prething: IPreThing): void {
        var thing: IThing = prething.thing,
            position: string = prething.position || thing.position;

        thing.FSM.addThing(
            thing,
            prething.left * thing.FSM.unitsize - thing.FSM.MapScreener.left,
            ((<IMapScreenr>thing.FSM.MapScreener).floor - prething.top) * thing.FSM.unitsize);

        // Either the prething or thing, in that order, may request to be in the
        // front or back of its container using the "position" attribute
        if (position) {
            thing.FSM.TimeHandler.addEvent(function (): void {
                switch (position) {
                    case "beginning":
                        thing.FSM.arrayToBeginning(thing, <any[]>thing.FSM.GroupHolder.getGroup(thing.groupType));
                        break;
                    case "end":
                        thing.FSM.arrayToEnd(thing, <any[]>thing.FSM.GroupHolder.getGroup(thing.groupType));
                        break;
                    default:
                        break;
                }
            });
        }

        thing.FSM.ModAttacher.fireEvent("onAddPreThing", prething);
    },

    /**
     * Shortcut to call scrollThing on a Player.
     * 
     * @param dx   How far to scroll horizontally.
     * @param dy   How far to scroll vertically.
     */
    scrollPlayer(this: MarioGame, dx: number, dy?: number): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this);

        FSM.scrollThing(FSM.player, dx, dy);

        FSM.ModAttacher.fireEvent("onScrollPlayer", dx, dy);
    },

    /**
     * Triggered Function for when the game is paused. Music stops, the pause
     * bleep is played, and the mod event is fired.
     * 
     * @param FSM
     */
    onGamePause(this: MarioGame, FSM: MarioGame): void {
        FSM.AudioPlayer.pauseAll();
        FSM.AudioPlayer.play("Pause");
        FSM.ModAttacher.fireEvent("onGamePause");
    },

    /**
     * Triggered Function for when the game is played or unpause. Music resumes 
     * and the mod event is fired.
     * 
     * @param FSM
     */
    onGamePlay(this: MarioGame, FSM: MarioGame): void {
        FSM.AudioPlayer.resumeAll();
        FSM.ModAttacher.fireEvent("onGamePlay");
    },

    /* Upkeep maintenence
    */

    /**
     * Regular maintenance Function called to decrease time every 25 game ticks.
     * 
     * @param FSM
     * @returns Whether time should stop counting, which is whether it's <= 0.
     */
    maintainTime(this: MarioGame, FSM: MarioGame): boolean {
        if (!(<IMapScreenr>FSM.MapScreener).notime) {
            FSM.ItemsHolder.decrease("time", 1);
            return false;
        }

        if (!FSM.ItemsHolder.getItem("time")) {
            return true;
        }

        return false;
    },

    /**
     * Regular maintenance Function called on the Scenery group every 350
     * upkeeps (slightly over 5 seconds). Things are checked for being alive
     * and to the left of QuadsKeeper.left; if they aren't, they are removed.
     * 
     * @param FSM
     */
    maintainScenery(this: MarioGame, FSM: MarioGame): void {
        var things: IScenery[] = <IScenery[]>FSM.GroupHolder.getGroup("Scenery"),
            delx: number = FSM.QuadsKeeper.left,
            thing: IThing,
            i: number;

        for (i = 0; i < things.length; i += 1) {
            thing = things[i];

            if (thing.right < delx && thing.outerok !== 2) {
                FSM.arrayDeleteThing(thing, things, i);
                i -= 1;
            }
        }
    },

    /**
     * Regular maintenance Function called on the Solids group every upkeep.  
     * Things are checked for being alive and to the right of QuadsKeeper.left; 
     * if they aren't, they are removed. Each Thing is also allowed a movement
     * Function.
     * 
     * @param FSM
     * @param solids   FSM's GroupHolder's Solid group.
     */
    maintainSolids(this: MarioGame, FSM: MarioGame, solids: ISolid[]): void {
        var delx: number = FSM.QuadsKeeper.left,
            solid: IThing,
            i: number;

        FSM.QuadsKeeper.determineAllQuadrants("Solid", solids);

        for (i = 0; i < solids.length; i += 1) {
            solid = solids[i];

            if (solid.alive && solid.right > delx) {
                if (solid.movement) {
                    solid.movement(solid);
                }
            } else if (!solid.alive || solid.outerok !== 2) {
                FSM.arrayDeleteThing(solid, solids, i);
                i -= 1;
            }
        }
    },

    /**
     * Regular maintenance Function called on the Characters group every upkeep.
     * Things have gravity and y-velocities, collision detection, and resting
     * checks applied before they're checked for being alive. If they are, they
     * are allowed a movement Function; if not, they are removed.
     * 
     * @param FSM
     * @param characters   FSM's GroupHolder's Characters group.
     */
    maintainCharacters(this: MarioGame, FSM: MarioGame, characters: ICharacter[]): void {
        var delx: number = FSM.QuadsKeeper.right,
            character: ICharacter,
            i: number;

        for (i = 0; i < characters.length; i += 1) {
            character = characters[i];

            // Gravity
            if (character.resting) {
                character.yvel = 0;
            } else {
                if (!character.nofall) {
                    character.yvel += character.gravity || FSM.MapScreener.gravity;
                }
                character.yvel = Math.min(character.yvel, FSM.MapScreener.maxyvel);
            }

            // Position updating and collision detection
            character.under = character.undermid = undefined;
            FSM.updatePosition(character);
            FSM.QuadsKeeper.determineThingQuadrants(character);
            FSM.ThingHitter.checkHitsForThing(character);

            // Overlaps
            if (character.overlaps && character.overlaps.length) {
                FSM.maintainOverlaps(<ICharacterOverlapping>character);
            }

            // Resting tests
            if (character.resting) {
                if (!FSM.isCharacterOnResting(character, character.resting)) {
                    if (character.onRestingOff) {
                        character.onRestingOff(character, character.resting);
                    } else {
                        // Necessary for moving platforms
                        character.resting = undefined;
                    }
                } else {
                    character.yvel = 0;
                    FSM.setBottom(character, character.resting.top);
                }
            }

            // Movement or deletion
            // To do: rethink this...
            if (character.alive) {
                if (!character.player &&
                    (character.numquads === 0 || character.left > delx) &&
                    (!character.outerok || (
                        character.outerok !== 2
                        && character.right < FSM.MapScreener.width - delx
                    ))) {
                    FSM.arrayDeleteThing(character, characters, i);
                    i -= 1;
                } else {
                    if (!character.nomove && character.movement) {
                        character.movement(character);
                    }
                }
            } else {
                FSM.arrayDeleteThing(character, characters, i);
                i -= 1;
            }
        }
    },

    /**
     * Maintenance Function only triggered for Things that are known to have 
     * overlapping Solids stored in their overlaps attribute. This will slide
     * the offending Thing away from the midpoint of those overlaps once a call
     * until it's past the boundary (and check for those boundaries if not 
     * already set).
     * 
     * @param character   A Character that is known to be overlapping Solid(s).
     */
    maintainOverlaps(this: MarioGame, character: ICharacterOverlapping): void {
        // If checkOverlaps is still true, this is the first maintain call
        if (character.checkOverlaps) {
            if (!character.FSM.setOverlapBoundaries(<ICharacterOverlapping>character)) {
                return;
            }
        }

        character.FSM.slideToX(character, character.overlapGoal, character.FSM.unitsize);

        // Goal to the right: has the thing gone far enough to the right?
        if (character.overlapGoRight) {
            if (character.left >= character.overlapCheck) {
                character.FSM.setLeft(character, character.overlapCheck);
            } else {
                return;
            }
        } else {
            // Goal to the left: has the thing gone far enough to the left?
            if (character.right <= character.overlapCheck) {
                character.FSM.setRight(character, character.overlapCheck);
            } else {
                return;
            }
        }

        // A check above didn't fail into a return, so overlapping is solved
        character.overlaps.length = 0;
        character.checkOverlaps = true;
    },

    /**
     * Sets the overlapping properties of a Thing when it is first detected as
     * overlapping in maintainOverlaps. All Solids in its overlaps Array are
     * checked to find the leftmost and rightmost extremes and midpoint.
     * Then, the Thing is checked for being to the left or right of the 
     * midpoint, and the goal set to move it away from the midpoint.
     * 
     * @param thing
     * @returns Whether the Thing's overlaps were successfully recorded.
     */
    setOverlapBoundaries(this: MarioGame, thing: ICharacterOverlapping): boolean {
        // Only having one overlap means nothing should be done
        if (thing.overlaps.length === 1) {
            thing.overlaps.length = 0;
            return false;
        }

        var rightX: number = -Infinity,
            leftX: number = Infinity,
            overlaps: ISolid[] = thing.overlaps,
            other: ISolid,
            leftThing: IThing,
            rightThing: IThing,
            midpoint: number,
            i: number;

        for (i = 0; i < overlaps.length; i += 1) {
            other = overlaps[i];

            if (other.right > rightX) {
                rightThing = other;
            }
            if (other.left < leftX) {
                leftThing = other;
            }
        }

        midpoint = (leftX + rightX) / 2;

        if (thing.FSM.getMidX(thing) >= midpoint) {
            thing.overlapGoal = Infinity;
            thing.overlapGoRight = true;
            thing.overlapCheck = rightThing.right;
        } else {
            thing.overlapGoal = -Infinity;
            thing.overlapGoRight = false;
            thing.overlapCheck = leftThing.left;
        }

        thing.checkOverlaps = false;

        return true;
    },

    /**
     * Regular maintenance Function called on a Player every upkeep. A barrage
     * of tests are applied, namely falling/jumping, dieing, x- and y-velocities,
     * running, and scrolling. This is separate from the movePlayer movement
     * Function that will be called in maintainCharacters.
     * 
     * @param FSM
     */
    maintainPlayer(this: MarioGame, FSM: MarioGame): void {
        var player: IPlayer = FSM.player;
        if (!FSM.isThingAlive(player)) {
            return;
        }

        // Player is falling
        if (player.yvel > 0) {
            if (!FSM.MapScreener.underwater) {
                player.keys.jump = false;
            }
            // Jumping?
            if (!player.jumping && !player.crouching) {
                // Paddling? (from falling off a solid)
                if (FSM.MapScreener.underwater) {
                    if (!player.paddling) {
                        FSM.switchClass(player, "paddling", "paddling");
                        player.paddling = true;
                    }
                } else {
                    FSM.addClass(player, "jumping");
                    player.jumping = true;
                }
            }
            // Player has fallen too far
            if (!player.dieing && player.top > FSM.MapScreener.bottom) {
                // If the map has an exit (e.g. cloud world), transport there
                if ((<IArea>FSM.AreaSpawner.getArea()).exit) {
                    FSM.setLocation((<IArea>FSM.AreaSpawner.getArea()).exit);
                } else {
                    // Otherwise, since Player is below the screen, kill him dead
                    FSM.killPlayer(player, 2);
                }

                return;
            }
        }

        // Player is moving to the right
        if (player.xvel > 0) {
            if (player.right > FSM.MapScreener.middleX) {
                // If Player is to the right of the screen's middle, move the screen
                if (player.right > FSM.MapScreener.right - FSM.MapScreener.left) {
                    player.xvel = Math.min(0, player.xvel);
                }
            }
        } else if (player.left < 0) {
            // Player is moving to the left
            // Stop Player from going to the left.
            player.xvel = Math.max(0, player.xvel);
        }

        // Player is hitting something (stop jumping)
        if (player.under) {
            player.jumpcount = 0;
        }

        // Scrolloffset is how far over the middle player's right is
        if (FSM.MapScreener.canscroll) {
            var scrolloffset: number = player.right - FSM.MapScreener.middleX;
            if (scrolloffset > 0) {
                FSM.scrollWindow(Math.min(player.scrollspeed, scrolloffset));
            }
        }
    },
};

export type LifecycleMethods = typeof lifecycleMethods;
