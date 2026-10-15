/**
 * Maps and locations: setting the map and location, the entrance and exit
 * routines used when entering or leaving an area, area initialization and
 * backgrounds, and adding PreThings to the area being created.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.setMap(...) keep working unchanged.
 */
import * as AreaSpawnr from "../../engine/AreaSpawnr";
import * as MapsCreatr from "../../engine/MapsCreatr";
import type { INumberMakrState } from "../../engine/NumberMakr";
import type { IArea, IMarioGame, ILocation, IMap, IMapScreenr, IPipe, IPlayer, IThing, IVine } from "../types";
import { MarioGame } from "../MarioGame";

/**
 * The pending setMap("Random") call of each game, while the map generator is being fetched.
 */
const pendingRandomMaps: WeakMap<MarioGame, object> = new WeakMap();

export const mapMethods = {
    /* Map sets
     */

    /**
     * Sets the game state to a new map, resetting all Things and inputs in the
     * process. The mod events are fired.
     *
     * @param name   The name of the map (by default, the currently
     *               played one).
     * @param location   The name of the location within the map (by
     *                   default, 0 for the first in Array form).
     * @remarks Most of the work here is done by setLocation.
     */
    setMap(this: MarioGame, name?: string | IMarioGame, location?: string | number): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            time: number | undefined,
            map: IMap;

        if (typeof name === "undefined" || name.constructor === MarioGame) {
            name = FSM.AreaSpawner.getMapName();
        }

        // Setting a map cancels a Random map still waiting for the map generator
        pendingRandomMaps.delete(FSM);

        if (name === "Random" && !FSM.WorldSeeder) {
            FSM.setRandomMapWhenLoaded(location);
            return;
        }

        map = FSM.AreaSpawner.setMap(<string>name);

        FSM.ModAttacher.fireEvent("onPreSetMap", map);

        if (map.seed) {
            FSM.NumberMaker.resetFromSeed(map.seed);
        }

        FSM.ItemsHolder.setItem("world", name);
        FSM.InputWriter.restartHistory();

        if (!FSM.titleScreen) {
            FSM.rememberLevel(<string>name);
        }

        FSM.ModAttacher.fireEvent("onSetMap", map);

        FSM.setLocation(location || map.locationDefault || FSM.settings.maps.locationDefault);

        time = (<IArea>FSM.AreaSpawner.getArea()).time || (<IMap>FSM.AreaSpawner.getMap()).time;
        FSM.ItemsHolder.setItem("time", Number(time));
    },

    /**
     * setMap for the Random map while the map generator is not loaded yet: the generator
     * and the map are a separate chunk, fetched now. The map is set once they are in,
     * unless another map was set meanwhile, and with the random number generator put
     * back as it was at this call, so a seed set right before still decides the map.
     *
     * @param location   The name of the location within the Random map.
     */
    setRandomMapWhenLoaded(this: MarioGame, location?: string | number): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            request: object = {},
            state: INumberMakrState = FSM.NumberMaker.getState();

        pendingRandomMaps.set(FSM, request);

        void FSM.loadWorldSeeder().then((): void => {
            if (pendingRandomMaps.get(FSM) === request) {
                FSM.NumberMaker.setState(state);
                FSM.setMap("Random", location);
            }
        });
    },

    /**
     * Sets the game state to a location within the current map, resetting all
     * Things, inputs, the current Area, PixelRender, and MapScreener in the
     * process. The location's entry Function is called to bring a new Player
     * into the game. The mod events are fired.
     *
     * @param name   The name of the location within the map (by
     *               default, 0 for the first in Array form).
     */
    setLocation(this: MarioGame, name: string | number = 0): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            location: ILocation;

        // Any continue offer belongs to the area being left (a title card makes a new one)
        FSM.continueOffer = undefined;

        (<IMapScreenr>FSM.MapScreener).nokeys = false;
        (<IMapScreenr>FSM.MapScreener).notime = false;
        (<IMapScreenr>FSM.MapScreener).canscroll = true;
        FSM.MapScreener.clearScreen();
        FSM.GroupHolder.clearArrays();
        FSM.TimeHandler.cancelAllEvents();

        FSM.AreaSpawner.setLocation((name || 0).toString());
        FSM.MapScreener.setVariables();
        location = <ILocation>FSM.AreaSpawner.getLocation((name || 0).toString());

        FSM.ModAttacher.fireEvent("onPreSetLocation", location);

        FSM.PixelDrawer.setBackground((<IArea>FSM.AreaSpawner.getArea()).background);

        FSM.TimeHandler.addEventInterval(FSM.maintainTime, 25, Infinity, FSM);
        FSM.TimeHandler.addEventInterval(FSM.maintainScenery, 350, Infinity, FSM);

        FSM.AudioPlayer.clearAll();
        FSM.AudioPlayer.playTheme();

        FSM.QuadsKeeper.resetQuadrants();

        location.entry?.(FSM, location);

        FSM.ModAttacher.fireEvent("onSetLocation", location);

        FSM.GamesRunner.play();
    },

    /* Map entrances
     */

    /**
     * Standard map entrance Function for dropping from the ceiling. A new
     * player is placed 16x16 units away from the top-left corner, with
     * location.xloc scrolling applied if necessary.
     *
     * @param FSM
     * @param location   The calling Location entering into (by default,
     *                   not used).
     */
    mapEntranceNormal(this: MarioGame, FSM: MarioGame, location?: ILocation): void {
        if (location && location.xloc) {
            FSM.scrollWindow(location.xloc * FSM.unitsize);
        }

        FSM.addPlayer(FSM.unitsize * 16, FSM.unitsize * 16);
    },

    /**
     * Standard map entrance Function for starting on the ground. A new player
     * is placed 16x16 units away from the top-left corner, with location.xloc
     * scrolling applied if necessary.
     *
     * @param FSM
     * @param location   The calling Location entering into (by default,
     *                   not used).
     */
    mapEntrancePlain(this: MarioGame, FSM: MarioGame, location?: ILocation): void {
        if (location && location.xloc) {
            FSM.scrollWindow(location.xloc * FSM.unitsize);
        }

        FSM.addPlayer(FSM.unitsize * 16, FSM.MapScreener.floor * FSM.unitsize);
    },

    /**
     * Map entrance Function for starting on the ground and immediately walking
     * as if in a cutscene. mapEntrancePlain is immediately called, and the
     * player has movement forced to be walking, with nokeys and notime set to
     * true.
     *
     * @param FSM
     * @param location   The calling Location entering into (by default,
     *                   not used).
     */
    mapEntranceWalking(this: MarioGame, FSM: MarioGame, location?: ILocation): void {
        FSM.mapEntrancePlain(FSM, location);

        FSM.player.keys.run = 1;
        FSM.player.maxspeed = FSM.player.walkspeed;

        FSM.MapScreener.nokeys = true;
        FSM.MapScreener.notime = true;
    },

    /**
     * Map entrance Function for entering a castle area. A player is simply
     * added at 2 x 56.
     *
     * @param FSM
     */
    mapEntranceCastle(this: MarioGame, FSM: MarioGame): void {
        FSM.addPlayer(FSM.unitsize * 2, FSM.unitsize * 56);
    },

    /**
     * Map entrance Function for entering an area climbing a Vine. The Vine
     * enters first by growing, then a Player climbs it and hops off. The
     * player's actions are done via mapEntranceVinePlayer and are triggered
     * when the Vine's top reaches its threshold.
     *
     * @param FSM
     */
    mapEntranceVine(this: MarioGame, FSM: MarioGame): void {
        var threshold: number = FSM.MapScreener.bottom - FSM.unitsize * 40,
            vine: IVine = <IVine>FSM.addThing("Vine", FSM.unitsize * 32, FSM.MapScreener.bottom + FSM.unitsize * 8);

        FSM.TimeHandler.addEventInterval(
            function (): boolean {
                if (vine.top >= threshold) {
                    return false;
                }

                vine.movement = undefined;
                FSM.mapEntranceVinePlayer(FSM, vine);
                return true;
            },
            1,
            Infinity
        );
    },

    /**
     * Continuation of mapEntranceVine for a Player's actions. A player
     * climbs up the Vine; once it reaches the threshold, it hops off using
     * animatePlayerOffVine.
     *
     * @param FSM
     * @param vine   A Vine bringing a Player up.
     */
    mapEntranceVinePlayer(this: MarioGame, FSM: MarioGame, vine: IVine): void {
        var threshold: number = FSM.MapScreener.bottom - FSM.unitsize * 24,
            speed: number = FSM.unitsize / -4,
            player: IPlayer = FSM.addPlayer(FSM.unitsize * 29, FSM.MapScreener.bottom - FSM.unitsize * 4);

        FSM.shiftVert(player, player.height * FSM.unitsize);

        FSM.collideVine(player, vine);

        FSM.TimeHandler.addEventInterval(
            function (): boolean {
                FSM.shiftVert(player, speed);
                if (player.top < threshold) {
                    FSM.TimeHandler.addEvent(FSM.animatePlayerOffVine, 49, player);
                    return true;
                }
                return false;
            },
            1,
            Infinity
        );
    },

    /**
     * Map entrance Function for coming in through a vertical Pipe. A player
     * is added just below the top of the Pipe, and is animated to rise up
     * through it like an Italian chestburster.
     *
     * @param FSM
     * @param location   The calling Location entering into (by default,
     *                   not used).
     */
    mapEntrancePipeVertical(this: MarioGame, FSM: MarioGame, location?: ILocation): void {
        if (location && location.xloc) {
            FSM.scrollWindow(location.xloc * FSM.unitsize);
        }

        // Entering from a pipe requires a Location with an entrance Thing
        if (!location || !location.entrance) {
            return;
        }

        var entrance: IThing = location.entrance;

        FSM.addPlayer(
            entrance.left + (FSM.player.width * FSM.unitsize) / 2,
            entrance.top + FSM.player.height * FSM.unitsize
        );

        FSM.animatePlayerPipingStart(FSM.player);
        FSM.AudioPlayer.play("Pipe");
        // Drop the listener from the previous entrance so they do not pile up
        FSM.AudioPlayer.removeEventListeners("Pipe", "ended");
        FSM.AudioPlayer.addEventListener("Pipe", "ended", function (): void {
            FSM.AudioPlayer.playTheme();
        });

        FSM.TimeHandler.addEventInterval(
            function (): boolean {
                FSM.shiftVert(FSM.player, FSM.unitsize / -4);

                if (FSM.player.bottom <= entrance.top) {
                    FSM.animatePlayerPipingEnd(FSM.player);
                    return true;
                }

                return false;
            },
            1,
            Infinity
        );
    },

    /**
     * Map entrance Function for coming in through a horizontal Pipe. A player
     * is added just to the left of the entrance, and is animated to pass  
     * through it like an Italian chestburster.
     *
     * @param FSM
     * @param location   The calling Location entering into (by default,
     *                   not used).
     */
    mapEntrancePipeHorizontal(this: MarioGame, FSM: MarioGame, location?: ILocation): void {
        throw new Error("mapEntrancePipeHorizontal is not yet implemented.");
    },

    /**
     * Map entrance Function for a Player reincarnating into a level,
     * typically from a random map. A player is placed at 16 x 0 and a
     * Resting Stone placed some spaces below via playerAddRestingStone.
     *
     * @param FSM
     */
    mapEntranceRespawn(this: MarioGame, FSM: MarioGame): void {
        FSM.MapScreener.nokeys = false;
        FSM.MapScreener.notime = false;
        FSM.MapScreener.canscroll = true;

        FSM.addPlayer(FSM.unitsize * 16, 0);
        FSM.animateFlicker(FSM.player);

        if (!FSM.MapScreener.underwater) {
            FSM.playerAddRestingStone(FSM.player);
        }

        FSM.ModAttacher.fireEvent("onPlayerRespawn");
    },

    /* Map exits
     */

    /**
     * Map exit Function for leaving through a vertical Pipe. A player is
     * animated to pass through it and then transfer locations.
     *
     * @param thing   A Player exiting through other.
     * @param other   A Pipe sucking in thing.
     */
    mapExitPipeVertical(this: MarioGame, thing: IPlayer, other: IPipe): void {
        if (
            !thing.resting ||
            typeof other.transport === "undefined" ||
            thing.right + thing.FSM.unitsize * 2 > other.right ||
            thing.left - thing.FSM.unitsize * 2 < other.left
        ) {
            return;
        }

        thing.FSM.animatePlayerPipingStart(thing);
        thing.FSM.AudioPlayer.play("Pipe");

        thing.FSM.TimeHandler.addEventInterval(
            function (): boolean {
                thing.FSM.shiftVert(thing, thing.FSM.unitsize / 4);

                if (thing.top <= other.top) {
                    return false;
                }

                thing.FSM.TimeHandler.addEvent(function (): void {
                    if (other.transport.constructor === Object) {
                        thing.FSM.setMap(other.transport.map);
                    } else {
                        thing.FSM.setLocation(other.transport);
                    }
                }, 42);

                return true;
            },
            1,
            Infinity
        );
    },

    /**
     * Map exit Function for leaving through a horiontal Pipe. A player is
     * animated to pass through it and then transfer locations.
     *
     * @param thing   A Player exiting through other.
     * @param other   A Pipe sucking in thing.
     * @param shouldTransport   Whether not resting and not paddling does
     *                          not imply a Player cannot pass through the
     *                          Pipe (by default, false, as this is normal).
     * @remarks The shouldTransport argument was added because the "Bouncy
     *          Bounce!" mod rendered some areas unenterable without it.
     */
    mapExitPipeHorizontal(this: MarioGame, thing: IPlayer, other: IPipe, shouldTransport?: boolean): void {
        if (!shouldTransport && !thing.resting && !thing.paddling) {
            return;
        }

        if (thing.top < other.top || thing.bottom > other.bottom) {
            return;
        }

        if (!thing.keys.run) {
            return;
        }

        thing.FSM.animatePlayerPipingStart(thing);
        thing.FSM.AudioPlayer.play("Pipe");

        thing.FSM.TimeHandler.addEventInterval(
            function (): boolean {
                thing.FSM.shiftHoriz(thing, thing.FSM.unitsize / 4);

                if (thing.left <= other.left) {
                    return false;
                }

                thing.FSM.TimeHandler.addEvent(function (): void {
                    thing.FSM.setLocation(other.transport);
                }, 42);

                return true;
            },
            1,
            Infinity
        );
    },

    /* Map creation
     */

    /**
     * The onMake callback for Areas. Attributes are copied as specified in the
     * prototype, and the background is set based on the setting.
     *
     * @remarks The scope for this will be an Area.
     */
    initializeArea(this: MarioGame): void {
        var scope: IArea = <IArea>(<any>this),
            i: string;

        // Copy all attributes, if they exist
        if (scope.attributes) {
            for (i in scope.attributes) {
                if (scope.hasOwnProperty(i) && (<any>scope)[i]) {
                    MarioGame.prototype.proliferate(scope, scope.attributes[i]);
                }
            }
        }

        scope.setBackground(scope);
    },

    /**
     * Sets an area's background as a function of its setting.
     *
     * @param area   An Area having its background set.
     * @remarks In the future, it might be more elegant to make Areas inherit
     * from base Area types (Overworld, etc.) so this inelegant switch
     * statement doesn't have to be used.
     */
    setAreaBackground(this: MarioGame, area: IArea): void {
        // Non-underwater Underworld, Castle, and all Nights: black background
        if (
            area.setting.indexOf("Underwater") === -1 &&
            (area.setting.indexOf("Underworld") !== -1 ||
                area.setting.indexOf("Castle") !== -1 ||
                area.setting.indexOf("Night") !== -1)
        ) {
            area.background = "#000000";
        } else {
            // Default (typically Overworld): sky blue background
            area.background = "#5c94fc";
        }
    },

    /**
     * Determines the absolute height of a y-location, which is the distance
     * from the absolute base (bottom of the user's viewport) to a specific
     * height above the floor.
     *
     * @param yloc   A height to find the distance to the floor from.
     * @param correctUnitsize   Whether the yloc accounts for unitsize
     *                          expansion (e.g. 48 rather than 12, for
     *                          unitsize=4).
     * @returns The absolute height of the y-location.
     */
    getAbsoluteHeight(this: MarioGame, yloc: number, correctUnitsize?: boolean): number {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            height: number = yloc + FSM.MapScreener.height;

        if (!correctUnitsize) {
            height *= FSM.unitsize;
        }

        return height;
    },

    /**
     * Adds a PreThing to the map and stretches it to fit a width equal to the
     * current map's outermost boundaries.
     *
     * @param prethingRaw   A raw PreThing descriptor.
     * @returns A strethed Thing, newly added via addThing.
     */
    mapAddStretched(this: MarioGame, prethingRaw: string | MapsCreatr.IPreThingSettings): IThing {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            boundaries: any = FSM.AreaSpawner.getArea().boundaries,
            prething: MapsCreatr.IPreThingSettings =
                typeof prethingRaw === "string" ? { "thing": prethingRaw } : prethingRaw,
            y: number = ((<IMapScreenr>FSM.MapScreener).floor - (prething.y || 0)) * FSM.unitsize,
            // It is assumed the PreThing does have a .thing if it's a stretch
            thing: IThing = FSM.ObjectMaker.make((<any>prething).thing, {
                "width": boundaries.right - boundaries.left,
                "height": prething.height || FSM.getAbsoluteHeight(prething.y || 0)
            });

        return <IThing>FSM.addThing(thing, boundaries.left, y);
    },

    /**
     * Analyzes a PreThing to be placed to the right of the current map's
     * boundaries (after everything else).
     *
     * @param prethingRaw   A raw PreThing descriptor.
     */
    mapAddAfter(this: MarioGame, prethingRaw: string | MapsCreatr.IPreThingSettings): void {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            MapsCreator: MapsCreatr.IMapsCreatr = FSM.MapsCreator,
            AreaSpawner: AreaSpawnr.IAreaSpawnr = FSM.AreaSpawner,
            prethings: MapsCreatr.IPreThingsContainers = AreaSpawner.getPreThings(),
            prething: MapsCreatr.IPreThingSettings =
                typeof prethingRaw === "string"
                    ? {
                          "thing": prethingRaw
                      }
                    : prethingRaw,
            area: IArea = <IArea>AreaSpawner.getArea(),
            map: MapsCreatr.IMapsCreatrMap = AreaSpawner.getMap(),
            boundaries: any = FSM.AreaSpawner.getArea().boundaries;

        prething.x = boundaries.right;
        MapsCreator.analyzePreSwitch(prething, prethings, area, map);
    }
};

export type MapMethods = typeof mapMethods;
