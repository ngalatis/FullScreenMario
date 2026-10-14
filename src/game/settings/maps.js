import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.maps = {
    "mapDefault": "1-1",
    "locationDefault": "0",
    "groupTypes": ["Character", "Solid", "Scenery", "Text"],
    "requireEntrance": true,
    "screenAttributes": [
        "gravity",
        "setting",
        "time",
        "underwater",
        "floor",
        "jumpmod",
        "maxyvel",
        "maxyvelinv",
        "notime",
        "nokeys",
        "canscroll"
    ],
    "screenVariables": {
        "bottomDeathDifference": function (GameStarter) {
            return GameStarter.unitsize * 12;
        },
        "bottomPlatformMax": function (GameStarter) {
            var area = GameStarter.AreaSpawner.getArea(),
                diff = GameStarter.MapScreener.bottomDeathDifference;
                
            if (!area) {
                return -1;
            }
                
            return (area.floor + diff) * GameStarter.unitsize;
        },
        "gravity": function (GameStarter) {
            var area = GameStarter.AreaSpawner.getArea();
            
            if (area && area.underwater) {
                return GameStarter.gravity / 2.8;
            }
            
            return GameStarter.gravity;
        }
    },
    "onSpawn": MarioGame.MarioGame.prototype.addPreThing,
    "macros": {
        "Example": MarioGame.MarioGame.prototype.macroExample,
        "Fill": MarioGame.MarioGame.prototype.macroFillPreThings,
        "Pattern": MarioGame.MarioGame.prototype.macroFillPrePattern,
        "Floor": MarioGame.MarioGame.prototype.macroFloor,
        "Pipe": MarioGame.MarioGame.prototype.macroPipe,
        "PipeCorner": MarioGame.MarioGame.prototype.macroPipeCorner,
        "Tree": MarioGame.MarioGame.prototype.macroTree,
        "Shroom": MarioGame.MarioGame.prototype.macroShroom,
        "Water": MarioGame.MarioGame.prototype.macroWater,
        "CastleSmall": MarioGame.MarioGame.prototype.macroCastleSmall,
        "CastleLarge": MarioGame.MarioGame.prototype.macroCastleLarge,
        "Ceiling": MarioGame.MarioGame.prototype.macroCeiling,
        "Bridge": MarioGame.MarioGame.prototype.macroBridge,
        "Scale": MarioGame.MarioGame.prototype.macroScale,
        "PlatformGenerator": MarioGame.MarioGame.prototype.macroPlatformGenerator,
        "WarpWorld": MarioGame.MarioGame.prototype.macroWarpWorld,
        "CheepsStart": MarioGame.MarioGame.prototype.macroCheepsStart,
        "CheepsStop": MarioGame.MarioGame.prototype.macroCheepsStop,
        "BulletBillsStart": MarioGame.MarioGame.prototype.macroBulletBillsStart,
        "BulletBillsStop": MarioGame.MarioGame.prototype.macroBulletBillsStop,
        "LakituStop": MarioGame.MarioGame.prototype.macroLakituStop,
        "StartInsideCastle": MarioGame.MarioGame.prototype.macroStartInsideCastle,
        "EndOutsideCastle": MarioGame.MarioGame.prototype.macroEndOutsideCastle,
        "EndInsideCastle": MarioGame.MarioGame.prototype.macroEndInsideCastle,
        "Section": MarioGame.MarioGame.prototype.macroSection,
        "SectionPass": MarioGame.MarioGame.prototype.macroSectionPass,
        "SectionFail": MarioGame.MarioGame.prototype.macroSectionFail,
        "SectionDecider": MarioGame.MarioGame.prototype.macroSectionDecider
    },
    "entrances": {
        "Normal": MarioGame.MarioGame.prototype.mapEntranceNormal,
        "Plain": MarioGame.MarioGame.prototype.mapEntrancePlain,
        "Castle": MarioGame.MarioGame.prototype.mapEntranceCastle,
        "Walking": MarioGame.MarioGame.prototype.mapEntranceWalking,
        "Vine": MarioGame.MarioGame.prototype.mapEntranceVine,
        "PipeVertical": MarioGame.MarioGame.prototype.mapEntrancePipeVertical,
        "PipeHorizontal": MarioGame.MarioGame.prototype.mapEntrancePipeHorizontal,
    },
    "patterns": (function (patterns) {
        var pattern,
            i;
        for (i in patterns) {
            if (patterns.hasOwnProperty(i)) {
                pattern = patterns[i];
                if (!pattern.length) {
                    continue;
                }
                
                // Pattern's last array should previously be ["blank", width]
                pattern.width = pattern[pattern.length - 1][1];
                pattern.pop();
            }
        }
        return patterns;
    })({
        "BackRegular": [
            ["HillLarge", 0, 0],
            ["Cloud1", 68, 68],
            ["Bush3", 92, 0],
            ["HillSmall", 128, 0],
            ["Cloud1", 156, 76],
            ["Bush1", 188, 0],
            ["Cloud3", 220, 68],
            ["Cloud2", 292, 76],
            ["Bush2", 332, 0],
            ["Blank", 384]
        ],
        "BackCloud": [
            ["Cloud2", 28, 64],
            ["Cloud1", 76, 32],
            ["Cloud2", 148, 72],
            ["Cloud1", 228, 0],
            ["Cloud1", 284, 32],
            ["Cloud1", 308, 40],
            ["Cloud1", 372, 0],
            ["Blank", 384]
        ],
        "BackFence": [
            ["PlantSmall", 88, 0],
            ["PlantLarge", 104, 0],
            ["Fence", 112, 0, 32],
            ["Cloud1", 148, 68],
            ["PlantLarge", 168, 0],
            ["PlantSmall", 184, 0],
            ["PlantSmall", 192, 0],
            ["Cloud1", 220, 76],
            ["Cloud2", 244, 68],
            ["Fence", 304, 0, 16],
            ["PlantSmall", 320, 0],
            ["Fence", 328, 0],
            ["PlantLarge", 344, 0],
            ["Cloud1", 364, 76],
            ["Cloud2", 388, 68],
            ["Blank", 384]
        ],
        "BackFenceMin": [
            ["PlantLarge", 104, 0],
            ["Fence", 112, 0, 32],
            ["Cloud1", 148, 68],
            ["PlantLarge", 168, 0],
            ["PlantSmall", 184, 0],
            ["PlantSmall", 192, 0],
            ["Cloud1", 220, 76],
            ["Cloud2", 244, 68],
            ["Fence", 304, 0, 16],
            ["PlantSmall", 320, 0],
            ["Fence", 328, 0],
            ["Cloud1", 364, 76],
            ["Cloud2", 388, 68],
            ["Blank", 384]
        ],
        "BackFenceMin2": [
            ["Cloud2", 4, 68],
            ["PlantSmall", 88, 0],
            ["PlantLarge", 104, 0],
            ["Fence", 112, 0],
            ["Fence", 128, 0, 16],
            ["Cloud1", 148, 68],
            // ["PlantLarge", 168, 0],
            ["PlantSmall", 184, 0],
            ["PlantSmall", 192, 0],
            ["Cloud1", 220, 76],
            ["Cloud2", 244, 68],
            ["Fence", 304, 0, 16],
            ["PlantSmall", 320, 0],
            ["Fence", 328, 0],
            ["PlantLarge", 344, 0],
            ["Cloud1", 364, 76],
            ["Cloud2", 388, 68],
            ["Blank", 384]
        ],
        "BackFenceMin3": [
            ["Cloud2", 4, 68],
            ["PlantSmall", 88, 0],
            ["PlantLarge", 104, 0],
            ["Fence", 112, 0, 4],
            ["Cloud1", 148, 68],
            ["PlantSmall", 184, 0],
            ["PlantSmall", 192, 0],
            ["Cloud1", 220, 76],
            ["Cloud2", 244, 68],
            ["Cloud1", 364, 76],
            ["Cloud2", 388, 68],
            ["Blank", 384]
        ]
    }),
    "library": {}
};
