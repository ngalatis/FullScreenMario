import * as AreaSpawnr from "../engine/AreaSpawnr";
import * as GameStartr from "../engine/GameStartr";
import * as MathDecidr from "../engine/MathDecidr";
import * as ObjectMakr from "../engine/ObjectMakr";
import type { IDeviceMotionStatus, IMarioGame, IMarioGameStoredSettings, IMapScreenr, IPlayer, ITextMappings, IThing } from "./types";
import { lifecycleMethods, type LifecycleMethods } from "./methods/lifecycle";
import { inputMethods, type InputMethods } from "./methods/input";
import { collisionDetectionMethods, type CollisionDetectionMethods } from "./methods/collisionDetection";
import { playerStateMethods, type PlayerStateMethods } from "./methods/playerStates";
import { spawnMethods, type SpawnMethods } from "./methods/spawning";
import { collisionHandlerMethods, type CollisionHandlerMethods } from "./methods/collisionHandlers";
import { movementMethods, type MovementMethods } from "./methods/movement";
import { animationMethods, type AnimationMethods } from "./methods/animations";
import { deathMethods, type DeathMethods } from "./methods/death";
import { scoringMethods, type ScoringMethods } from "./methods/scoring";
import { mapMethods, type MapMethods } from "./methods/maps";
import { cutsceneMethods, type CutsceneMethods } from "./methods/cutscenes";
import { macroMethods, type MacroMethods } from "./methods/macros";
import { castleMacroMethods, type CastleMacroMethods } from "./methods/macrosCastle";

/**
 * A free HTML5 remake of Nintendo's original Super Mario Bros, expanded for the
 * modern web. It includes the original 32 levels, a random map generator, a 
 * level editor, and over a dozen custom mods.
 */
export class MarioGame extends GameStartr.GameStartr implements IMarioGame {
    // For the sake of reset functions, constants are stored as members of the 
    // MarioGame Function itself - this allows prototype setters to use 
    // them regardless of whether the prototype has been instantiated yet.

    /**
     * Static settings passed to individual reset Functions. Each of these
     * should be filled out separately (by ./settings/*), after the MarioGame
     * class has been declared but before an instance has been instantiated.
     */
    public static settings: IMarioGameStoredSettings = <IMarioGameStoredSettings>{};

    /**
     * How much to expand each pixel from raw sizing measurements to in-game.
     */
    public static unitsize: number = 4;

    /**
     * How much to scale each pixel from PixelDrawr to the real canvas.
     */
    public static scale: number = 2;

    /**
     * How much falling Characters accelerate downward by default.
     */
    public static gravity: number = Math.round(12 * MarioGame.unitsize) / 100;

    /**
     * Levels of points to award for hopping on / shelling enemies.
     */
    public static pointLevels: number[] = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];

    /**
     * Useful for custom text Things, where "text!" cannot be a Function name.
     */
    public static customTextMappings: ITextMappings = {
        " ": "Space",
        ".": "Period",
        "!": "ExclamationMark",
        ":": "Colon",
        "/": "Slash",
        "©": "Copyright"
    };

    /**
     * Overriden MapScreenr refers to the IMapScreenr defined in types.ts.
     */
    public MapScreener!: IMapScreenr;

    /**
     * Stored settings to be stored separately and kept within a GameStartr.
     */
    public settings: IMarioGameStoredSettings;

    /**
     * How much to expand each pixel from raw sizing measurements to in-game.
     */
    public unitsize!: number;

    /**
     * Levels of points to award for hopping on / shelling enemies.
     */
    public pointLevels!: number[];

    /**
     * Internal reference to the static customTextMappings.
     */

    /**
     * Useful for custom text Things, where "text!" cannot be a Function name.
     */
    public customTextMappings!: ITextMappings;

    /**
     * The game's player, which (when defined) will always be a Player Thing.
     * It is assigned by addPlayer, once a map has started.
     */
    public player!: IPlayer;

    /**
     * Container for device motion information, used by this.deviceMotion.
     */
    public deviceMotionStatus: IDeviceMotionStatus;

    /**
     * Initializes a new instance of the MarioGame class using the static
     * settings stored in `MarioGame.setting`.
     * 
     * @param settings   Extra settings such as screen size.
     */
    constructor(settings: GameStartr.IGameStartrSettings) {
        // Native classes forbid touching `this` before super(). The base constructor
        // runs the reset chain, which reads `this.settings`, so the static settings are
        // exposed through the prototype (see MarioGame.prototype.settings below).
        super(
            MarioGame.prototype.proliferate(
                {
                    constantsSource: MarioGame,
                    constants: ["unitsize", "scale", "gravity", "pointLevels", "customTextMappings"]
                },
                settings));

        this.settings = MarioGame.settings;

        this.deviceMotionStatus = {
            motionLeft: false,
            motionRight: false,
            x: undefined,
            y: undefined,
            dy: undefined
        };
    }


    /* Resets
    */

    /**
     * Sets this.ObjectMaker.
     *
     * Because many Thing functions require access to other FSM modules, each is
     * given a reference to this container FSM via properties.thing.GameStarter.
     *
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetObjectMaker(FSM: MarioGame, settings: GameStartr.IGameStartrSettings): void {
        FSM.ObjectMaker = new ObjectMakr.ObjectMakr(
            FSM.proliferate(
                {
                    properties: {
                        Quadrant: {
                            EightBitter: FSM,
                            GameStarter: FSM,
                            FSM: FSM
                        },
                        Thing: {
                            EightBitter: FSM,
                            GameStarter: FSM,
                            FSM: FSM
                        }
                    }
                },
                FSM.settings.objects));
    }

    /**
     * Sets this.AudioPlayer.
     * 
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetAudioPlayer(FSM: MarioGame, settings: GameStartr.IGameStartrSettings): void {
        super.resetAudioPlayer(FSM, settings);

        FSM.AudioPlayer.setGetVolumeLocal(FSM.getVolumeLocal.bind(FSM, FSM));

        FSM.AudioPlayer.setGetThemeDefault(FSM.getAudioThemeDefault.bind(FSM, FSM));
    }

    /**
     * Sets this.AreaSpawner.
     * 
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetAreaSpawner(FSM: MarioGame, settings: GameStartr.IGameStartrSettings): void {
        FSM.AreaSpawner = new AreaSpawnr.AreaSpawnr({
            "MapsCreator": FSM.MapsCreator,
            "MapScreener": FSM.MapScreener,
            "screenAttributes": (<any>FSM.settings.maps).screenAttributes,
            "onSpawn": (<any>FSM.settings.maps).onSpawn.bind(FSM),
            "stretchAdd": FSM.mapAddStretched.bind(FSM),
            "afterAdd": FSM.mapAddAfter.bind(FSM)
        });
    }

    /**
     * Resets this.ItemsHolder via the parent GameStartr resetItemsHolder.
     * 
     * If the screen isn't wide enough to fit the "lives" display, it's hidden.
     * 
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetItemsHolder(FSM: MarioGame, settings: GameStartr.IGameStartrSettings): void {
        super.resetItemsHolder(FSM, settings);

        if (settings.width !== undefined && settings.width < 560) {
            (<HTMLElement>(<HTMLTableRowElement>FSM.ItemsHolder.getContainer().children[0]).cells[4]).style.display = "none";
        }
    }

    /**
     * Sets this.MathDecider, using its existing MapScreenr as its constants.
     * 
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetMathDecider(FSM: MarioGame, customs: GameStartr.IMathDecidrCustoms): void {
        FSM.MathDecider = new MathDecidr.MathDecidr(
            FSM.proliferate(
                {
                    "constants": FSM.MapScreener
                },
                FSM.settings.math));
    }

    /**
     * Sets this.container via the parent GameStartr resetContaienr.
     * 
     * The container is given the "Press Start" font, the PixelRender is told
     * to draw the scenery, solid, character, and text groups, and the container
     * width is set to the custom's width.
     * 
     * @param FSM
     * @param customs   Any optional custom settings.
     */
    resetContainer(FSM: MarioGame, settings: GameStartr.IGameStartrSettings): void {
        super.resetContainer(FSM, settings);

        FSM.container.style.fontFamily = "Press Start";
        FSM.container.className += " MarioGame";

        FSM.PixelDrawer.setThingArrays([
            <GameStartr.IThing[]>FSM.GroupHolder.getGroup("Scenery"),
            <GameStartr.IThing[]>FSM.GroupHolder.getGroup("Solid"),
            <GameStartr.IThing[]>FSM.GroupHolder.getGroup("Character"),
            <GameStartr.IThing[]>FSM.GroupHolder.getGroup("Text")
        ]);

        FSM.ItemsHolder.getContainer().style.width = settings.width + "px";
        FSM.container.appendChild(FSM.ItemsHolder.getContainer());
    }

    /**
     * Slight addition to the GameStartr thingProcess Function. The Thing's hit
     * check type is cached immediately.
     * 
     * @param thing   The Thing being processed.
     * @param title   What type Thing this is (the name of the class).
     * @param settings   Additional settings to be given to the Thing.
     * @param defaults   The default settings for the Thing's class.
     * @remarks This is generally called as the onMake call in an ObjectMakr.
     */
    thingProcess(thing: IThing, title: string, settings: any, defaults: any): void {
        // Infinite height refers to objects that reach exactly to the bottom
        if (<any>thing.height === "Infinity" || thing.height === Infinity) {
            thing.height = thing.FSM.getAbsoluteHeight(thing.y) / thing.FSM.unitsize;
        }

        super.thingProcess(thing, title, settings, defaults);

        thing.FSM.ThingHitter.cacheChecksForType(thing.title, thing.groupType);
    }

    // This method stays in the class (not in ./methods/lifecycle.ts): its default
    // parameter initializers read `this`, which makes the merged type of the
    // lifecycle group circular when it is declared outside the class.
    /**
     * Adds a new Player Thing to the game and sets it as EightBitter.play. Any
     * required additional settings (namely keys, power/size, and swimming) are
     * applied here.
     * 
     * @param left   A left edge to place the Thing at (by default, unitsize * 16).
     * @param bottom   A bottom to place the Thing upon (by default, unitsize * 16).
     * @returns A newly created Player in the game.
     */
    addPlayer(left: number = this.unitsize * 16, bottom: number = this.unitsize * 16): IPlayer {
        var FSM: MarioGame = MarioGame.prototype.ensureCorrectCaller(this),
            player: IPlayer;

        player = FSM.player = <IPlayer>FSM.ObjectMaker.make("Player", {
            "power": FSM.ItemsHolder.getItem("power")
        });
        player.keys = player.getKeys();

        if ((<IMapScreenr>FSM.MapScreener).underwater) {
            player.swimming = true;

            FSM.TimeHandler.addClassCycle(
                player,
                [
                    "swim1", "swim2"
                ],
                "swimming",
                5);

            FSM.TimeHandler.addEventInterval(
                player.FSM.animatePlayerBubbling,
                96, Infinity,
                player);
        }

        FSM.setPlayerSizeSmall(player);

        if (player.power >= 2) {
            FSM.playerGetsBig(player, true);
            if (player.power === 3) {
                FSM.playerGetsFire(player);
            }
        }

        FSM.addThing(player, left, bottom - player.height * FSM.unitsize);

        FSM.ModAttacher.fireEvent("onAddPlayer", player);

        return player;
    }


    /* Miscellaneous utilities
    */

    /**
     * Ensures the current object is a GameStartr by throwing an error if it 
     * is not. This should be used for functions in any GameStartr descendants
     * that have to call 'this' to ensure their caller is what the programmer
     * expected it to be.
     * 
     * @param {Mixed} current   
     */
    ensureCorrectCaller(current: any): MarioGame {
        if (!(current instanceof MarioGame)) {
            throw new Error("A function requires the scope ('this') to be the "
                + "manipulated MarioGame object. Unfortunately, 'this' is a "
                + typeof (this) + ".");
        }
        return current;
    }
}

/**
 * Declaration merging: the methods in ./methods/*.ts are installed onto the
 * prototype below, and merged into the class type here so that every caller
 * (including the "this" of each method) sees them as ordinary MarioGame members.
 */
type GroupMethods =
    LifecycleMethods &
    InputMethods &
    CollisionDetectionMethods &
    PlayerStateMethods &
    SpawnMethods &
    CollisionHandlerMethods &
    MovementMethods &
    AnimationMethods &
    DeathMethods &
    ScoringMethods &
    MapMethods &
    CutsceneMethods &
    MacroMethods &
    CastleMacroMethods;

/**
 * Group methods that override a method of the same name on GameStartr. An
 * interface may not extend two types whose same-named members differ, so these
 * are left out of the extended type and declared directly instead.
 */
type OverridingMethodName =
    "gameStart" |
    "generateThingKey" |
    "onGamePause" |
    "onGamePlay" |
    "canInputsTrigger" |
    "killNormal";

export interface MarioGame extends Omit<GroupMethods, OverridingMethodName> {
    gameStart: GroupMethods["gameStart"];
    generateThingKey: GroupMethods["generateThingKey"];
    onGamePause: GroupMethods["onGamePause"];
    onGamePlay: GroupMethods["onGamePlay"];
    canInputsTrigger: GroupMethods["canInputsTrigger"];
    killNormal: GroupMethods["killNormal"];
}

/**
 * Installs method groups onto a prototype with the same property attributes
 * that class methods have (writable, configurable, non-enumerable).
 */
function installMethods(target: object, ...groups: Record<string, unknown>[]): void {
    for (const group of groups) {
        for (const key of Object.keys(group)) {
            Object.defineProperty(target, key, {
                value: group[key],
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }
}

installMethods(
    MarioGame.prototype,
    lifecycleMethods,
    inputMethods,
    collisionDetectionMethods,
    playerStateMethods,
    spawnMethods,
    collisionHandlerMethods,
    movementMethods,
    animationMethods,
    deathMethods,
    scoringMethods,
    mapMethods,
    cutsceneMethods,
    macroMethods,
    castleMacroMethods
);

// The GameStartr constructor resets all modules from `this.settings` before this
// class's own constructor body runs, so the static settings are also exposed here.
MarioGame.prototype.settings = MarioGame.settings;
