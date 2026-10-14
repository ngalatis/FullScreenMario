import { MarioGame } from "../MarioGame";

MarioGame.settings.collisions = {
    "keyGroupName": "groupType",
    "keyTypeName": "title",
    "globalCheckGenerators": {
        "Character": MarioGame.prototype.generateCanThingCollide,
        "Solid": MarioGame.prototype.generateCanThingCollide
    },
    "hitCheckGenerators": {
        "Character": {
            "Character": MarioGame.prototype.generateIsCharacterTouchingCharacter,
            "Solid": MarioGame.prototype.generateIsCharacterTouchingSolid
        }
    },
    "hitCallbackGenerators": {
        "Character": {
            "Solid": MarioGame.prototype.generateHitCharacterSolid,
            "Character": MarioGame.prototype.generateHitCharacterCharacter
        }
    }
};
