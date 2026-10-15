import type * as ThingHittr from "../../engine/ThingHittr";
import { MarioGame } from "../MarioGame";

/**
 * ThingHittr only knows about its own base Thing type, while the game's
 * generated checks and callbacks are written against the game's narrower
 * Thing types (ICharacter, ISolid, etc.). ThingHittr only ever passes them
 * Things of the groups they were registered for below.
 *
 * @param generator   A generator that takes the game's Thing types.
 * @returns The generator, typed the way ThingHittr expects.
 */
function toGenerator<T extends ThingHittr.IThingFunction>(
    generator: (this: MarioGame) => (...args: any[]) => unknown
): ThingHittr.IThingFunctionGenerator<T> {
    return <ThingHittr.IThingFunctionGenerator<T>>(<unknown>generator);
}

MarioGame.settings.collisions = {
    "keyGroupName": "groupType",
    "keyTypeName": "title",
    "globalCheckGenerators": {
        "Character": toGenerator(MarioGame.prototype.generateCanThingCollide),
        "Solid": toGenerator(MarioGame.prototype.generateCanThingCollide)
    },
    "hitCheckGenerators": {
        "Character": {
            "Character": toGenerator(MarioGame.prototype.generateIsCharacterTouchingCharacter),
            "Solid": toGenerator(MarioGame.prototype.generateIsCharacterTouchingSolid)
        }
    },
    "hitCallbackGenerators": {
        "Character": {
            "Solid": toGenerator(MarioGame.prototype.generateHitCharacterSolid),
            "Character": toGenerator(MarioGame.prototype.generateHitCharacterCharacter)
        }
    }
};
