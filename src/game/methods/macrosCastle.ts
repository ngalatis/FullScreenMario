/**
 * Map macros (castles and sections): macro* functions for small and large
 * castles, the inside/outside castle start and end sequences, and the
 * section pass/fail/decider macros.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.macroCastleSmall(...) keep working unchanged.
 */
import * as MapsCreatr from "../../engine/MapsCreatr";
import type {
    IMacroCommand,
    IMacroOutput,
    IMacroPreThings,
    IArea,
    IMacroCastleSettings,
    IMacroEndInsideCastleSettings,
    IMacroEndOutsideCastleSettings,
    IMacroSectionDeciderSettings,
    IMacroSectionFailSettings,
    IMacroSectionPassSettings,
    IMacroSectionSettings,
    IMacroStartInsideCastleSettings,
    IMap,
    ISectionDetector,
    IThing
} from "../types";
import { MarioGame } from "../MarioGame";

export const castleMacroMethods = {
    /**
     * Macro to place a small castle, which is really a collection of sceneries.
     *
     * @alias CastleSmall
     * @param reference   Settings for a CastleSmall macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns A small castle.
     */
    macroCastleSmall(
        this: MarioGame,
        reference: IMacroCastleSettings,
        prethings: IMacroPreThings,
        area: IArea,
        map: IMap,
        FSM: MarioGame
    ): IMacroOutput {
        var output: IMacroCommand[] = [],
            x: number = reference.x || 0,
            y: number = reference.y || 0,
            i: number,
            j: number;

        // Base filling left
        for (i = 0; i < 2; i += 1) {
            // x
            output.push({
                "thing": "BrickHalf",
                "x": x + i * 8,
                "y": y + 4,
                "position": "end"
            });

            for (j = 1; j < 3; j += 1) {
                // y
                output.push({
                    "thing": "BrickPlain",
                    "x": x + i * 8,
                    "y": y + 4 + j * 8,
                    "position": "end"
                });
            }
        }

        // Base filling right
        for (i = 0; i < 2; i += 1) {
            // x
            output.push({
                "thing": "BrickHalf",
                "x": x + 24 + i * 8,
                "y": y + 4,
                "position": "end"
            });

            for (j = 1; j < 3; j += 1) {
                // y
                output.push({
                    "thing": "BrickPlain",
                    "x": x + 24 + i * 8,
                    "y": y + 4 + j * 8,
                    "position": "end"
                });
            }
        }

        // Medium railing left
        output.push({
            "thing": "CastleRailing",
            "x": x,
            "y": y + 24,
            "position": "end"
        });

        // Medium railing center
        for (i = 0; i < 3; i += 1) {
            output.push({
                "thing": "CastleRailingFilled",
                "x": x + (i + 1) * 8,
                "y": y + 24,
                "position": "end"
            });
        }

        // Medium railing right
        output.push({
            "thing": "CastleRailing",
            "x": x + 32,
            "y": y + 24,
            "position": "end"
        });

        // Top railing
        for (i = 0; i < 3; i += 1) {
            output.push({
                "thing": "CastleRailing",
                "x": x + (i + 1) * 8,
                "y": y + 40,
                "position": "end"
            });
        }

        // Top bricking
        for (i = 0; i < 2; i += 1) {
            output.push({
                "thing": "CastleTop",
                "x": x + 8 + i * 12,
                "y": y + 36,
                "position": "end"
            });
        }

        // Door, and detector if required
        output.push({
            "thing": "CastleDoor",
            "x": x + 16,
            "y": y + 20,
            "position": "end"
        });
        if (reference.transport) {
            output.push({
                "thing": "DetectCollision",
                "x": x + 24,
                "y": y + 16,
                "height": 16,
                "activate": FSM.collideCastleDoor,
                "transport": reference.transport,
                "position": "end"
            });
        }

        return output;
    },

    /**
     * Macro to place a large castle, which is really a collection of sceneries
     * underneath a small castle.
     *
     * @alias CastleLarge
     * @param reference   Settings for a CastleLarge macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns A large castle.
     */
    macroCastleLarge(
        this: MarioGame,
        reference: IMacroCastleSettings,
        prethings: IMacroPreThings,
        area: MapsCreatr.IMapsCreatrArea,
        map: MapsCreatr.IMapsCreatrMap,
        FSM: MarioGame
    ): IMacroOutput {
        var output: IMacroCommand[] = [],
            x: number = reference.x || 0,
            y: number = reference.y || 0,
            i: number,
            j: number;

        output.push({
            "macro": "CastleSmall",
            "x": x + 16,
            "y": y + 48
        });

        // CastleWalls left
        for (i = 0; i < 2; i += 1) {
            // x
            output.push({
                "thing": "CastleWall",
                "x": x + i * 8,
                "y": y + 48
            });
        }

        // Bottom doors with bricks on top
        for (i = 0; i < 3; i += 1) {
            // x
            output.push({
                "thing": "CastleDoor",
                "x": x + 16 + i * 16,
                "y": y + 20,
                "position": "end"
            });
            for (j = 0; j < 2; j += 1) {
                output.push({
                    "thing": "BrickPlain",
                    "x": x + 16 + i * 16,
                    "y": y + 28 + j * 8
                });
                output.push({
                    "thing": "BrickHalf",
                    "x": x + 16 + i * 16,
                    "y": y + 40 + j * 4
                });
            }
        }

        // Bottom bricks with doors on top
        for (i = 0; i < 2; i += 1) {
            // x
            for (j = 0; j < 3; j += 1) {
                // y
                output.push({
                    "thing": "BrickPlain",
                    "x": x + 24 + i * 16,
                    "y": y + 8 + j * 8
                });
            }
            output.push({
                "thing": "CastleDoor",
                "x": x + 24 + i * 16,
                "y": y + 44
            });
        }

        // Railing (filled)
        for (i = 0; i < 5; i += 1) {
            // x
            output.push({
                "thing": "CastleRailingFilled",
                "x": x + 16 + i * 8,
                "y": y + 48
            });
        }

        // CastleWalls right
        j = reference.walls ?? 2;
        for (i = 0; i < j; i += 1) {
            // x
            output.push({
                "thing": "CastleWall",
                "x": x + 56 + i * 8,
                "y": y + 48,
                "position": "end"
            });
        }

        if (reference.transport) {
            output.push({
                "thing": "DetectCollision",
                "x": x + 24,
                "y": y + 16,
                "height": 16,
                "activate": FSM.collideCastleDoor,
                "transport": reference.transport,
                "position": "end"
            });
        }

        return output;
    },

    /**
     * Macro to place the typical starting Things for the inside of a castle
     * area.
     *
     * @alias StartInsideCastle
     * @param reference   Settings for a StartInsideCastle macro.
     * @returns A starting zone for the inside of a castle.
     */
    macroStartInsideCastle(this: MarioGame, reference: IMacroStartInsideCastleSettings): IMacroOutput {
        var x: number = reference.x || 0,
            y: number = reference.y || 0,
            width: number = (reference.width || 0) - 40,
            output: IMacroCommand[] = [
                {
                    "thing": "Stone",
                    "x": x,
                    "y": y + 48,
                    "width": 24,
                    "height": Infinity
                },
                {
                    "thing": "Stone",
                    "x": x + 24,
                    "y": y + 40,
                    "width": 8,
                    "height": Infinity
                },
                {
                    "thing": "Stone",
                    "x": x + 32,
                    "y": y + 32,
                    "width": 8,
                    "height": Infinity
                }
            ];

        if (width > 0) {
            output.push({
                "macro": "Floor",
                "x": x + 40,
                "y": y + 24,
                "width": width
            });
        }

        return output;
    },

    /**
     * Macro to place the typical ending Things for the inside of an outdoor
     * area.
     *
     * @alias EndOutsideCastle
     * @param reference   Settings for an EndOutsideCastle macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns An outdoors castle ending.
     */
    macroEndOutsideCastle(
        this: MarioGame,
        reference: IMacroEndOutsideCastleSettings,
        prethings: IMacroPreThings,
        area: MapsCreatr.IMapsCreatrArea,
        map: MapsCreatr.IMapsCreatrMap,
        FSM: MarioGame
    ): IMacroOutput {
        var x: number = reference.x || 0,
            y: number = reference.y || 0,
            collectionName: string = "EndOutsideCastle-" + [reference.x, reference.y, reference.large].join(","),
            output: IMacroCommand[];

        // Output starts off with the general flag & collision detection
        output = [
            // Initial collision detector
            {
                "thing": "DetectCollision",
                x: x,
                y: y + 108,
                height: 100,
                "activate": MarioGame.prototype.collideFlagpole,
                "activateFail": MarioGame.prototype.killNormal,
                "noActivateDeath": true,
                "collectionName": collectionName,
                "collectionKey": "DetectCollision"
            },
            // Flag (scenery)
            {
                "thing": "Flag",
                "x": x - 4.5,
                "y": y + 79.5,
                "collectionName": collectionName,
                "collectionKey": "Flag"
            },
            {
                "thing": "FlagTop",
                "x": x + 1.5,
                "y": y + 84,
                "collectionName": collectionName,
                "collectionKey": "FlagTop"
            },
            {
                "thing": "FlagPole",
                "x": x + 3,
                "y": y + 80,
                "collectionName": collectionName,
                "collectionKey": "FlagPole"
            },
            // Bottom stone
            {
                "thing": "Stone",
                "x": x,
                "y": y + 8,
                "collectionName": collectionName,
                "collectionKey": "FlagPole"
            }
        ];

        if (reference.large) {
            output.push({
                "macro": "CastleLarge",
                "x": x + (reference.castleDistance || 24),
                "y": y,
                "transport": reference.transport,
                "walls": reference.walls || 8
            });
        } else {
            output.push({
                "macro": "CastleSmall",
                "x": x + (reference.castleDistance || 32),
                "y": y,
                "transport": reference.transport
            });
        }

        return output;
    },

    /**
     * Macro to place the typical ending Things for the inside of a castle area.
     *
     * @alias EndInsideCastle
     * @param reference   Settings for an EndInsideCastle macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns An ending zone for inside a castle.
     */
    macroEndInsideCastle(
        this: MarioGame,
        reference: IMacroEndInsideCastleSettings,
        prethings: IMacroPreThings,
        area: IArea,
        map: IMap,
        FSM: MarioGame
    ): IMacroOutput {
        var x: number = reference.x || 0,
            y: number = reference.y || 0,
            npc: string = reference.npc || "Toad",
            output: IMacroCommand[],
            texts: any[] | undefined,
            keys: string[] | undefined;

        if (npc === "Toad") {
            keys = ["1", "2"];
            texts = [
                {
                    "thing": "CustomText",
                    "x": x + 164,
                    "y": y + 64,
                    "texts": [
                        {
                            "text": "THANK YOU MARIO!"
                        }
                    ],
                    "textAttributes": {
                        "hidden": true
                    },
                    "collectionName": "endInsideCastleText",
                    "collectionKey": "1"
                },
                {
                    "thing": "CustomText",
                    "x": x + 152,
                    "y": y + 48,
                    "texts": [
                        {
                            "text": "BUT OUR PRINCESS IS IN"
                        },
                        {
                            "text": "ANOTHER CASTLE!"
                        }
                    ],
                    "textAttributes": {
                        "hidden": true
                    },
                    "collectionName": "endInsideCastleText",
                    "collectionKey": "2"
                }
            ];
        } else if (npc === "Peach") {
            keys = ["1", "2", "3"];
            texts = [
                {
                    "thing": "CustomText",
                    "x": x + 164,
                    "y": y + 64,
                    "texts": [
                        {
                            "text": "THANK YOU MARIO!"
                        }
                    ],
                    "textAttributes": {
                        "hidden": true
                    },
                    "collectionName": "endInsideCastleText",
                    "collectionKey": "1"
                },
                {
                    "thing": "CustomText",
                    "x": x + 152,
                    "y": y + 48,
                    "texts": [
                        {
                            "text": "YOUR QUEST IS OVER.",
                            "offset": 12
                        },
                        {
                            "text": "WE PRESENT YOU A NEW QUEST."
                        }
                    ],
                    "textAttributes": {
                        "hidden": true
                    },
                    "collectionName": "endInsideCastleText",
                    "collectionKey": "2"
                },
                {
                    "thing": "CustomText",
                    "x": x + 152,
                    "y": 32,
                    "texts": [
                        {
                            "text": "PRESS BUTTON B",
                            "offset": 8
                        },
                        {
                            "text": "TO SELECT A WORLD"
                        }
                    ],
                    "textAttributes": {
                        "hidden": true
                    },
                    "collectionName": "endInsideCastleText",
                    "collectionKey": "3"
                }
            ];
        }

        output = [
            { "thing": "Stone", "x": x, "y": y + 88, "width": 256 },
            { "macro": "Water", "x": x, "y": y, "width": 104 },
            // Bridge & Bowser area
            { "thing": "CastleBridge", "x": x, "y": y + 24, "width": 104 },
            {
                "thing": "Bowser",
                "x": x + 69,
                "y": y + 42,
                "hard": reference.hard,
                "spawnType": reference.spawnType || "Goomba",
                "throwing": reference.throwing
            },
            { "thing": "CastleChain", "x": x + 96, "y": y + 32 },
            // Axe area
            { "thing": "CastleAxe", "x": x + 104, "y": y + 40 },
            { "thing": "ScrollBlocker", "x": x + 112 },
            { "macro": "Floor", "x": x + 104, "y": y, "width": 152 },
            {
                "thing": "Stone",
                "x": x + 104,
                "y": y + 32,
                "width": 24,
                "height": 32
            },
            {
                "thing": "Stone",
                "x": x + 112,
                "y": y + 80,
                "width": 16,
                "height": 24
            },
            // Peach's Magical Happy Chamber of Fantastic Love
            {
                "thing": "DetectCollision",
                "x": x + 180,
                "activate": FSM.collideCastleNPC,
                "transport": reference.transport,
                "collectionName": "endInsideCastleText",
                "collectionKey": "npc",
                "collectionKeys": keys
            },
            { "thing": npc, "x": x + 200, "y": 13 },
            { "thing": "ScrollBlocker", "x": x + 256 }
        ];

        if (reference.topScrollEnabler) {
            output.push({
                "thing": "ScrollEnabler",
                "x": x + 96,
                "y": y + 140,
                "height": 52,
                "width": 16
            });
            output.push({
                "thing": "ScrollEnabler",
                "x": x + 240,
                "y": y + 140,
                "height": 52,
                "width": 16
            });
        }

        if (texts) {
            output.push.apply(output, texts);
        }

        return output;
    },

    /**
     * Macro to place a DetectSpawn that will call activateSectionBefore to
     * start a stretch section.
     *
     * @alias Section
     * @param reference   Settings for a Section macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns A section.
     */
    macroSection(
        this: MarioGame,
        reference: IMacroSectionSettings,
        prethings: IMacroPreThings,
        area: IArea,
        map: IMap,
        FSM: MarioGame
    ): IMacroOutput {
        return {
            "thing": "DetectSpawn",
            "x": reference.x || 0,
            "y": reference.y || 0,
            "activate": FSM.activateSectionBefore,
            "section": reference.section || 0
        };
    },

    /**
     * Macro to place a DetectCollision to mark the current section as passed.
     *
     * @alias SectionPass
     * @param reference   Settings for a SectionPass macro.
     * @returns A section pass detector.
     */
    macroSectionPass(this: MarioGame, reference: IMacroSectionPassSettings): IMacroOutput {
        return {
            "thing": "DetectCollision",
            "x": reference.x || 0,
            "y": reference.y || 0,
            "width": reference.width || 8,
            "height": reference.height || 8,
            "activate": function (thing: IThing): void {
                thing.FSM.AudioPlayer.play("Coin");
                thing.FSM.MapScreener.sectionPassed = true;
            }
        };
    },

    /**
     * Macro to place a DetectCollision to mark the current section as failed.
     *
     * @alias SectionFail
     * @param reference   Settings for a SectionFail macro.
     * @returns A section fail detector.
     */
    macroSectionFail(this: MarioGame, reference: IMacroSectionFailSettings): IMacroOutput {
        return [
            {
                "thing": "DetectCollision",
                "x": reference.x,
                "y": reference.y,
                "width": reference.width || 8,
                "height": reference.height || 8,
                "activate": function (thing: IThing): void {
                    thing.FSM.AudioPlayer.play("Fail");
                    thing.FSM.MapScreener.sectionPassed = false;
                }
            }
        ];
    },

    /**
     * Macro to place a DetectSpawn that will spawn a following section based on
     * whether the current one was marked as passed or failed.
     *
     * @alias SectionDecider
     * @param reference   Settings for a SectionDecider macro.
     * @param prethings   The container Area's creation commands.
     * @param area   The container Area.
     * @param map   The container Map.
     * @param FSM   The calling MarioGame.
     * @returns A section decider detector.
     */
    macroSectionDecider(this: MarioGame, reference: IMacroSectionDeciderSettings): IMacroOutput {
        return {
            "thing": "DetectSpawn",
            "x": reference.x || 0,
            "y": reference.y || 0,
            "activate": function (thing: ISectionDetector): void {
                if (thing.FSM.MapScreener.sectionPassed) {
                    thing.section = reference.pass || 0;
                } else {
                    thing.section = reference.fail || 0;
                }
                thing.FSM.activateSectionBefore(thing);
            }
        };
    }
};

export type CastleMacroMethods = typeof castleMacroMethods;
