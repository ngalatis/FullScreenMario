/**
 * Spawn and activate functions: the spawn* callbacks run when Things enter
 * the screen, and the activate* callbacks for detector and trigger Things.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.spawnDeadGoomba(...) keep working unchanged.
 */
import * as AreaSpawnr from "../../engine/AreaSpawnr";
import * as MapScreenr from "../../engine/MapScreenr";
import * as MapsCreatr from "../../engine/MapsCreatr";
import type {
    IArea,
    IAreaSection,
    IMacroCommand,
    IBlooper,
    IBowser,
    IBulletBill,
    ICannon,
    ICastleBlock,
    ICastleFireball,
    ICharacter,
    ICheepCheep,
    ICustomText,
    ICustomTextInfo,
    IDetectCollision,
    IDetectWindow,
    IDetector,
    IMarioGame,
    IHammerBro,
    ILakitu,
    IPiranha,
    IPlatform,
    IPlayer,
    IPodoboo,
    IRandomSpawner,
    IRestingStone,
    IScrollBlocker,
    ISectionDetector,
    IText,
    IThing,
    IThingFloating,
    IThingSliding
} from "../types";
import { MarioGame } from "../MarioGame";

export const spawnMethods = {
    /* Spawn / activate functions
     */

    /**
     * Spawn callback for DeadGoombas. They simply disappear after 21 steps.
     *
     * @param thing   A DeadGoomba being spawned.
     */
    spawnDeadGoomba(this: MarioGame, thing: IThing): void {
        thing.FSM.TimeHandler.addEvent(MarioGame.prototype.killNormal, 21, thing);
    },

    /**
     * Spawn callback for HammerBros. Gravity is reduced, and the hammer and
     * jump event intervals are started. The cyclical movement counter is set to
     * 0.
     *
     * @param thing   A HammerBro being spawned.
     */
    spawnHammerBro(this: MarioGame, thing: IHammerBro): void {
        thing.counter = 0;

        thing.gravity = thing.FSM.MapScreener.gravity / 2.1;

        thing.FSM.TimeHandler.addEvent(thing.FSM.animateThrowingHammer, 35, thing, 7);
        thing.FSM.TimeHandler.addEventInterval(thing.FSM.animateJump, 140, Infinity, thing);
    },

    /**
     * Spawn callback for Bowsers. The cyclical movement counter is set to 0 and
     * the firing and jumping event intervals are started. If it also specifies
     * a throwing interval, that's started too.
     *
     * @param thing   A Bowser being spawned.
     */
    spawnBowser(this: MarioGame, thing: IBowser): void {
        var i: number;

        thing.counter = 0;
        thing.deathcount = 0;

        for (i = 0; i < thing.fireTimes.length; i += 1) {
            thing.FSM.TimeHandler.addEventInterval(thing.FSM.animateBowserFire, thing.fireTimes[i], Infinity, thing);
        }

        for (i = 0; i < thing.jumpTimes.length; i += 1) {
            thing.FSM.TimeHandler.addEventInterval(thing.FSM.animateBowserJump, thing.jumpTimes[i], Infinity, thing);
        }

        if (thing.throwing) {
            for (i = 0; i < thing.throwAmount; i += 1) {
                thing.FSM.TimeHandler.addEvent(
                    function (): void {
                        thing.FSM.TimeHandler.addEventInterval(
                            thing.FSM.animateBowserThrow,
                            thing.throwPeriod,
                            Infinity,
                            thing
                        );
                    },
                    thing.throwDelay + i * thing.throwBetween
                );
            }
        }
    },

    /**
     * Spawn callback for Piranhas. The movement counter and direction are
     * reset, and if the Piranha is on a pipe, it has a reduced height (6).
     *
     * @param thing   A Piranha being spawned.
     */
    spawnPiranha(this: MarioGame, thing: IPiranha): void {
        var bottom: number;

        thing.counter = 0;
        thing.direction = thing.FSM.unitsize / -40;

        if (thing.onPipe) {
            bottom = thing.bottom;
            thing.FSM.setHeight(thing, 6);
            thing.FSM.setBottom(thing, bottom);
        }
    },

    /**
     * Spawn callback for Bloopers. Its squeeze and movement counters are
     * set to 0.
     *
     * @param thing   A Blooper being spawned.
     */
    spawnBlooper(this: MarioGame, thing: IBlooper): void {
        thing.squeeze = 0;
        thing.counter = 0;
    },

    /**
     * Spawn callback for Podoboos. The jumping interval is set to the Thing's
     * frequency.
     *
     * @param thing   A Podoboo being spawned.
     */
    spawnPodoboo(this: MarioGame, thing: IPodoboo): void {
        thing.FSM.TimeHandler.addEventInterval(thing.FSM.animatePodobooJumpUp, thing.frequency, Infinity, thing);
    },

    /**
     * Spawn callback for Lakitus. MapScreenr registers the most recently
     * added Lakitu as some areas spawn them every once in a while.
     *
     * @param thing   A Lakitu being spawned.
     */
    spawnLakitu(this: MarioGame, thing: ILakitu): void {
        thing.FSM.MapScreener.lakitu = thing;

        thing.FSM.TimeHandler.addEventInterval(thing.FSM.animateLakituThrowingSpiny, 140, Infinity, thing);
    },

    /**
     * Spawning callback for Cannons. Unless specified by the noBullets flag,
     * the firing interval is set to the Thing's frequency.
     *
     * @param thing   A Cannon being spawned.
     */
    spawnCannon(this: MarioGame, thing: ICannon): void {
        if (thing.noBullets) {
            return;
        }

        thing.FSM.TimeHandler.addEventInterval(thing.FSM.animateCannonFiring, thing.frequency, thing.frequency, thing);
    },

    /**
     * Spawning callback for CastleBlocks. If the Thing has fireballs, an Array
     * of them are made and animated to tick around the block like a clock, set
     * by the thing's speed and direction.
     *
     * @param thing   A CastleBlock being spawned.
     */
    spawnCastleBlock(this: MarioGame, thing: ICastleBlock): void {
        if (!thing.fireballs) {
            return;
        }

        var balls: ICastleFireball[] = [],
            i: number;

        for (i = 0; i < thing.fireballs; i += 1) {
            balls.push(<ICastleFireball>thing.FSM.addThing("CastleFireball"));
            thing.FSM.setMidObj(balls[i], thing);
        }

        if (thing.speed >= 0) {
            thing.dt = 0.07;
            thing.angle = 0.25;
        } else {
            thing.dt = -0.07;
            thing.angle = -0.25;
        }

        if (!thing.direction) {
            thing.direction = -1;
        }

        thing.FSM.TimeHandler.addEventInterval(
            thing.FSM.animateCastleBlock,
            Math.round(7 / Math.abs(thing.speed)),
            Infinity,
            thing,
            balls
        );
    },

    /**
     * Spawning callback for floating Things, such as Koopas and Platforms. The
     * Thing's begin and end attributes are set relative to the MapScreener's
     * floor, so its movement can handle cycling between the two.
     *
     * @param thing   A Thing being spawned to float around.
     */
    spawnMoveFloating(this: MarioGame, thing: IThingFloating): void {
        // Make sure thing.begin <= thing.end
        thing.FSM.setMovementEndpoints(thing);

        // Make thing.begin and thing.end relative to the area's floor
        thing.begin = thing.FSM.MapScreener.floor * thing.FSM.unitsize - thing.begin;
        thing.end = thing.FSM.MapScreener.floor * thing.FSM.unitsize - thing.end;
    },

    /**
     * Spawning callback for sliding Things, such as Platforms. The Thing's
     * begin and end attributes do not need to be relative to anything.
     *
     * @param thing   A Thing being spawned to slide back and forth.
     */
    spawnMoveSliding(this: MarioGame, thing: IThingSliding): void {
        // Make sure thing.begin <= thing.end
        thing.FSM.setMovementEndpoints(thing);
    },

    /**
     * Spawning callback for a Platform that's a part of a Scale.
     *
     * @param thing   A Platform being spawned within a Scale group.
     */
    spawnScalePlatform(this: MarioGame, thing: IPlatform): void {
        var collection: any = thing.collection || {},
            ownKey: string = thing.collectionKey === "platformLeft" ? "Left" : "Right",
            partnerKey: string = ownKey === "Left" ? "Right" : "Left";

        thing.partners = {
            "ownString": collection["string" + ownKey],
            "partnerString": collection["string" + partnerKey],
            "partnerPlatform": collection["platform" + partnerKey]
        };
    },

    /**
     * Generator callback to create a random CheepCheep. The spawn is given a
     * random x-velocity, is placed at a random point just below the screen, and
     * is oriented towards a Player.
     *
     * @param FSM
     * @returns Whether CheepCheep spawning has been cancelled.
     */
    spawnRandomCheep(this: MarioGame, FSM: MarioGame): boolean {
        if (!FSM.MapScreener.spawningCheeps) {
            return true;
        }

        var spawn: ICheepCheep = FSM.ObjectMaker.make("CheepCheep", {
            "flying": true,
            "xvel": FSM.NumberMaker.random() * FSM.unitsize * 1.4,
            "yvel": FSM.unitsize * -1.4
        });

        FSM.addThing(spawn, FSM.NumberMaker.random() * FSM.MapScreener.width, FSM.MapScreener.height);

        if (spawn.left < FSM.MapScreener.width / 2) {
            FSM.flipHoriz(spawn);
        } else {
            spawn.xvel *= -1;
        }

        return false;
    },

    /**
     * Generator callback to create a BulleBill. The spawn moves horizontally
     * at a constant rate towards the left side of the bill, and is placed at a
     * random point to the right side of the screen.
     *
     * @param FSM
     * @returns Whether BulletBill spawning has been cancelled.
     */
    spawnRandomBulletBill(this: MarioGame, FSM: MarioGame): boolean {
        if (!FSM.MapScreener.spawningBulletBills) {
            return true;
        }

        var spawn: IBulletBill = FSM.ObjectMaker.make("BulletBill");
        spawn.direction = 1;
        spawn.moveleft = true;
        spawn.xvel *= -1;
        FSM.flipHoriz(spawn);

        FSM.addThing(
            spawn,
            FSM.MapScreener.width,
            Math.floor(FSM.NumberMaker.randomIntWithin(0, FSM.MapScreener.floor) / 8) * 8 * FSM.unitsize
        );

        return false;
    },

    /**
     * Spawns a CustomText by killing it and placing the contents of its texts
     * member variable. These are written with a determined amount of spacing
     * between them, as if by a typewriter.
     *
     * @param thing   A CustomText being spawned.
     */
    spawnCustomText(this: MarioGame, thing: ICustomText): void {
        var top: number = thing.top,
            texts: ICustomTextInfo[] = thing.texts,
            attributes: unknown = thing.textAttributes,
            spacingHorizontal: number = thing.spacingHorizontal * thing.FSM.unitsize,
            spacingVertical: number = thing.spacingVertical * thing.FSM.unitsize,
            spacingVerticalBlank: number = thing.spacingVerticalBlank * thing.FSM.unitsize,
            children: IText[] = [],
            textChild: IText,
            left: number,
            text: string,
            letter: string,
            i: number,
            j: number;

        thing.children = children;

        for (i = 0; i < texts.length; i += 1) {
            if (!texts[i]) {
                top += spacingVerticalBlank;
                continue;
            }

            text = texts[i].text;

            if (texts[i].offset) {
                left = thing.left + texts[i].offset * thing.FSM.unitsize;
            } else {
                left = thing.left;
            }

            for (j = 0; j < text.length; j += 1) {
                letter = text[j];

                if (thing.FSM.customTextMappings.hasOwnProperty(letter)) {
                    letter = thing.FSM.customTextMappings[letter];
                }
                letter = "Text" + thing.size + letter;

                textChild = thing.FSM.ObjectMaker.make(letter, attributes);
                textChild.FSM.addThing(textChild, left, top);
                children.push(textChild);

                left += textChild.width * thing.FSM.unitsize;
                left += spacingHorizontal;
            }
            top += spacingVertical;
        }

        thing.FSM.killNormal(thing);
    },

    /**
     * Spawning callback for generic detectors, activated as soon as they are
     * placed. The Thing's activate trigger is called, then it is killed.
     *
     * @param thing   A Detector being spawned.
     */
    spawnDetector(this: MarioGame, thing: IDetector): void {
        thing.activate(thing);
        thing.FSM.killNormal(thing);
    },

    /**
     * Spawning callback for ScrollBlockers. If the Thing is to the right of
     * the visible viewframe, it should limit scrolling when triggered.
     *
     * @param thing   A ScrollBlocker being spawned.
     */
    spawnScrollBlocker(this: MarioGame, thing: IScrollBlocker): void {
        if (thing.FSM.MapScreener.width < thing.right) {
            thing.setEdge = true;
        }
    },

    /**
     * Used by Things in a collection to register themselves as a part of their
     * container collection Object. This is called by onThingMake, so they're
     * immediately put in the collection and have it as a member variable.
     *
     * @param collection   The collection Object shared by all members.
     * @param thing   A member of the collection being spawned.
     */
    spawnCollectionComponent(this: MarioGame, collection: any, thing: IThing): void {
        thing.collection = collection;

        if (thing.collectionName !== undefined) {
            collection[thing.collectionName] = thing;
        }
    },

    /**
     * Spawning callback for RandomSpawner Things, which generate a set of
     * commands using the WorldSeeder to be piped into the AreaSpawnr, then
     * spawn the immediate area.
     *
     * @param thing   A RandomSpawner being spawned.
     */
    spawnRandomSpawner(this: MarioGame, thing: IRandomSpawner): void {
        var FSM: IMarioGame = thing.FSM,
            left: number = (thing.left + FSM.MapScreener.left) / FSM.unitsize;

        FSM.WorldSeeder.clearGeneratedCommands();
        FSM.WorldSeeder.generateFull({
            "title": thing.randomization,
            "top": thing.randomTop,
            "right": left + thing.randomWidth,
            "bottom": thing.randomBottom,
            "left": left,
            "width": thing.randomWidth,
            "height": thing.randomTop - thing.randomBottom
        });
        FSM.WorldSeeder.runGeneratedCommands();

        FSM.AreaSpawner.spawnArea(
            "xInc",
            FSM.QuadsKeeper.top / FSM.unitsize,
            FSM.QuadsKeeper.right / FSM.unitsize,
            FSM.QuadsKeeper.bottom / FSM.unitsize,
            FSM.QuadsKeeper.left / FSM.unitsize
        );
    },

    /**
     * Activation callback for starting spawnRandomCheep on an interval.
     * MapScreener is notified that spawningCheeps is true.
     *
     * @param thing   A Detector activated to start spawning CheepCheeps.
     */
    activateCheepsStart(this: MarioGame, thing: IDetector): void {
        thing.FSM.MapScreener.spawningCheeps = true;
        thing.FSM.TimeHandler.addEventInterval(thing.FSM.spawnRandomCheep, 21, Infinity, thing.FSM);
    },

    /**
     * Activation callback to stop spawning CheepCheeps. MapScreener is notified
     * that spawningCheeps is false.
     *
     * @param thing   A Detector activated to stop spawning CheepCheeps.
     */
    activateCheepsStop(this: MarioGame, thing: IDetector): void {
        thing.FSM.MapScreener.spawningCheeps = false;
    },

    /**
     * Activation callback for starting spawnRandomBulletBill on an interval.
     * MapScreener is notified that spawningBulletBills is true.
     *
     * @param thing   A Detector activated to start spawning BulletBills.
     */
    activateBulletBillsStart(this: MarioGame, thing: IDetector): void {
        thing.FSM.MapScreener.spawningBulletBills = true;
        thing.FSM.TimeHandler.addEventInterval(thing.FSM.spawnRandomBulletBill, 210, Infinity, thing.FSM);
    },

    /**
     * Activation callback to stop spawning BulletBills. MapScreener is notified
     * that spawningBulletBills is false.
     *
     * @param thing   A Detector activated to stop spawning BulletBills.
     */
    activateBulletBillsStop(this: MarioGame, thing: IDetector): void {
        thing.FSM.MapScreener.spawningBulletBills = false;
    },

    /**
     * Activation callback to tell the area's Lakitu, if it exists, to start
     * fleeing the scene.
     *
     * @param thing   A Detector activated to make the Lakitu flee.
     */
    activateLakituStop(this: MarioGame, thing: IDetector): void {
        var lakitu: ILakitu | undefined = thing.FSM.MapScreener.lakitu;

        if (!lakitu) {
            return;
        }

        lakitu.fleeing = true;
        lakitu.movement = thing.FSM.moveLakituFleeing;
    },

    /**
     * Activation callback for a warp world area, triggered by a Player
     * touching a collider on top of it. Piranhas disappear and texts are
     * revealed.
     *
     * @param thing   A Player activating the warp world.
     * @param other   A Detector triggered by thing to activate a warp world.
     */
    activateWarpWorld(this: MarioGame, thing: ICharacter, other: IDetectCollision): void {
        var collection: any = other.collection,
            key: number = 0,
            keyString: string,
            texts: IThing[],
            j: number;

        if (!thing.player) {
            return;
        }

        texts = collection.Welcomer.children;
        for (j = 0; j < texts.length; j += 1) {
            if (texts[j].title !== "TextSpace") {
                texts[j].hidden = false;
            }
        }

        while (true) {
            keyString = key + "-Text";
            if (!collection.hasOwnProperty(keyString)) {
                break;
            }

            texts = collection[keyString].children;
            for (j = 0; j < texts.length; j += 1) {
                if (texts[j].title !== "TextSpace") {
                    texts[j].hidden = false;
                }
            }

            thing.FSM.killNormal(collection[key + "-Piranha"]);

            key += 1;
        }
    },

    /**
     * Activation callback for when a Player lands on a RestingStone. The
     * stone "appears" (via opacity), the regular theme plays if it wasn't
     * already, and the RestingStone waits to kill itself when a Player isn't
     * touching it.
     *
     * @param thing   A RestingStone being landed on.
     * @param other   A Player landing on thing.
     */
    activateRestingStone(this: MarioGame, thing: IRestingStone, other: IPlayer): void {
        if (thing.activated) {
            return;
        }

        thing.activated = true;
        thing.opacity = 1;
        thing.FSM.AudioPlayer.playTheme();

        thing.FSM.TimeHandler.addEventInterval(
            function (): boolean {
                if (other.resting === thing) {
                    return false;
                }

                thing.FSM.killNormal(thing);
                return true;
            },
            1,
            Infinity
        );
    },

    /**
     * Generic activation callback for DetectWindow Things. This is typically
     * set as a .movement Function, so it waits until the calling Thing is
     * within the MapScreener's area to call the activate Function and kill
     * itself.
     *
     * @param thing   A DetectWindow that might be activated.
     */
    activateWindowDetector(this: MarioGame, thing: IDetectWindow): void {
        if (thing.FSM.MapScreener.right - thing.FSM.MapScreener.left < thing.left) {
            return;
        }

        thing.activate(thing);
        thing.FSM.killNormal(thing);
    },

    /**
     * Activation callback for ScrollBlocker Things. These are WindowDetectors
     * that set MapScreener.canscroll to false when they're triggered. If the
     * latest scrollWindow call pushed it too far to the left, it scrolls back
     * the other way.
     *
     * @param thing   A ScrollBlocker that might be activated.
     */
    activateScrollBlocker(this: MarioGame, thing: IScrollBlocker): void {
        var dx: number = thing.FSM.MapScreener.width - thing.left;

        thing.FSM.MapScreener.canscroll = false;
        if (thing.setEdge && dx > 0) {
            thing.FSM.scrollWindow(-dx);
        }
    },

    /**
     * Activation callback for ScrollBlocker Things. These are DetectCollision
     * that set MapScreener.canscroll to true when they're triggered.
     *
     * @param thing   An activated ScrollEnabler.
     */
    activateScrollEnabler(this: MarioGame, thing: IDetectCollision): void {
        thing.FSM.MapScreener.canscroll = true;
    },

    /**
     * Activates the "before" component of a stretchable section. The creation
     * commands of the section are loaded onto the screen as is and a
     * DetectWindow is added to their immediate right that will trigger the
     * equivalent activateSectionStretch.
     *
     * @param thing   An activated SectionDecider.
     */
    activateSectionBefore(this: MarioGame, thing: ISectionDetector): void {
        var FSM: IMarioGame = thing.FSM,
            MapsCreator: MapsCreatr.IMapsCreatr = FSM.MapsCreator,
            MapScreener: MapScreenr.MapScreenr = FSM.MapScreener,
            AreaSpawner: AreaSpawnr.IAreaSpawnr = FSM.AreaSpawner,
            area: IArea = <IArea>AreaSpawner.getArea(),
            map: MapsCreatr.IMapsCreatrMap = AreaSpawner.getMap(),
            prethings: MapsCreatr.IPreThingsContainers = AreaSpawner.getPreThings(),
            section: IAreaSection = area.sections![thing.section || 0],
            left: number = (thing.left + MapScreener.left) / FSM.unitsize,
            before: IMacroCommand[] | undefined = section.before ? section.before.creation : undefined,
            command: any,
            i: number;

        // If there is a before, parse each command into the prethings array
        if (before) {
            for (i = 0; i < before.length; i += 1) {
                // A copy of the command must be used to not modify the original
                command = FSM.proliferate({}, before[i]);

                // The command's x must be shifted by the thing's placement
                if (!command.x) {
                    command.x = left;
                } else {
                    command.x += left;
                }

                // For Platforms that slide around, start and end are dynamic
                if (command.sliding) {
                    command.begin += left;
                    command.end += left;
                }

                MapsCreator.analyzePreSwitch(command, prethings, area, map);
            }
        }

        // Add a prething at the end of all this to trigger the stretch part
        command = {
            "thing": "DetectWindow",
            "x": left + (before ? section.before!.width : 0),
            "y": 0,
            "activate": FSM.activateSectionStretch,
            "section": thing.section || 0
        };

        MapsCreator.analyzePreSwitch(command, prethings, area, map);

        // Spawn new Things that should be placed for being nearby
        AreaSpawner.spawnArea(
            "xInc",
            MapScreener.top / FSM.unitsize,
            (MapScreener.left + FSM.QuadsKeeper.right) / FSM.unitsize,
            MapScreener.bottom / FSM.unitsize,
            left
        );
    },

    /**
     * Activates the "stretch" component of a stretchable section. The creation
     * commands of the section are loaded onto the screen and have their widths
     * set to take up the entire width of the screen. A DetectWindow is added
     * to their immediate right that will trigger the equivalent
     * activateSectionAfter.
     *
     * @param thing   An activated SectionDetector.
     */
    activateSectionStretch(this: MarioGame, thing: ISectionDetector): void {
        var FSM: IMarioGame = thing.FSM,
            MapsCreator: MapsCreatr.IMapsCreatr = FSM.MapsCreator,
            MapScreener: MapScreenr.MapScreenr = FSM.MapScreener,
            AreaSpawner: AreaSpawnr.IAreaSpawnr = FSM.AreaSpawner,
            area: IArea = <IArea>AreaSpawner.getArea(),
            map: MapsCreatr.IMapsCreatrMap = AreaSpawner.getMap(),
            prethings: MapsCreatr.IPreThingsContainers = AreaSpawner.getPreThings(),
            section: IAreaSection = area.sections![thing.section || 0],
            stretch: IMacroCommand[] | undefined = section.stretch ? section.stretch.creation : undefined,
            left: number = (thing.left + MapScreener.left) / FSM.unitsize,
            width: number = MapScreener.width / FSM.unitsize,
            command: MapsCreatr.IPreThingSettings,
            i: number;

        // If there is a stretch, parse each command into the current prethings array
        if (stretch) {
            for (i = 0; i < stretch.length; i += 1) {
                // A copy of the command must be used, so the original isn't modified
                command = FSM.proliferate({}, stretch[i]);
                command.x = left;

                // "stretch" the command by making its width equal to the screen
                command.width = width;
                MapsCreator.analyzePreSwitch(command, prethings, area, map);
            }

            // Add a prething at the end of all this to trigger the after part
            command = {
                "thing": "DetectWindow",
                "x": left + width,
                "y": 0,
                "activate": FSM.activateSectionAfter,
                "section": thing.section || 0
            };
            MapsCreator.analyzePreSwitch(command, prethings, area, map);
        }

        // Spawn the map, so new Things that should be placed will be spawned if nearby
        AreaSpawner.spawnArea(
            "xInc",
            MapScreener.top / FSM.unitsize,
            left + MapScreener.width / FSM.unitsize,
            MapScreener.bottom / FSM.unitsize,
            left
        );
    },

    /**
     * Activates the "after" component of a stretchable sectin. The creation
     * commands of the stretch are loaded onto the screen as is.
     *
     * @param thing   An activated SectioNDetector.
     */
    activateSectionAfter(this: MarioGame, thing: ISectionDetector): void {
        // Since the section was passed, do the rest of things normally
        var FSM: IMarioGame = thing.FSM,
            MapsCreator: MapsCreatr.IMapsCreatr = FSM.MapsCreator,
            MapScreener: MapScreenr.MapScreenr = FSM.MapScreener,
            AreaSpawner: AreaSpawnr.IAreaSpawnr = FSM.AreaSpawner,
            area: IArea = <IArea>AreaSpawner.getArea(),
            map: MapsCreatr.IMapsCreatrMap = AreaSpawner.getMap(),
            prethings: MapsCreatr.IPreThingsContainers = AreaSpawner.getPreThings(),
            section: IAreaSection = area.sections![thing.section || 0],
            left: number = (thing.left + MapScreener.left) / FSM.unitsize,
            after: IMacroCommand[] | undefined = section.after ? section.after.creation : undefined,
            command: any,
            i: number;

        // If there is an after, parse each command into the current prethings array
        if (after) {
            for (i = 0; i < after.length; i += 1) {
                // A copy of the command must be used, so the original isn't modified
                command = FSM.proliferate({}, after[i]);

                // The command's x-location must be shifted by the thing's placement
                if (!command.x) {
                    command.x = left;
                } else {
                    command.x += left;
                }

                // For Platforms that slide around, start and end are dynamic
                if (command.sliding) {
                    command.begin += left;
                    command.end += left;
                }

                MapsCreator.analyzePreSwitch(command, prethings, area, map);
            }
        }

        // Spawn the map, so new Things that should be placed will be spawned if nearby
        AreaSpawner.spawnArea(
            "xInc",
            MapScreener.top / FSM.unitsize,
            left + MapScreener.right / FSM.unitsize,
            MapScreener.bottom / FSM.unitsize,
            left
        );
    }
};

export type SpawnMethods = typeof spawnMethods;
