/**
 * Collision detection: the generators and predicates used to decide whether
 * Things may collide and whether Characters/Solids are touching, resting on,
 * bumping or overlapping each other.
 *
 * These methods are installed onto MarioGame.prototype by MarioGame.ts and are
 * declared on the MarioGame class through interface merging, so callers such as
 * thing.FSM.generateCanThingCollide(...) keep working unchanged.
 */
import type { ICharacter, IEnemy, ISolid, IThing } from "../types";
import type { MarioGame } from "../MarioGame";

export const collisionDetectionMethods = {
    /* Collision detectors
     */

    /**
     * Function generator for the generic canThingCollide checker. This is used
     * repeatedly by ThingHittr to generate separately optimized Functions for
     * different Thing types.
     *
     * @returns A Function that generates a canThingCollide checker.
     */
    generateCanThingCollide(this: MarioGame): (thing: IThing) => boolean {
        /**
         * Generic checker for canCollide, used for both Solids and Characters.
         * This just returns if the Thing is alive and doesn't have the
         * nocollide flag.
         *
         * @param thing
         * @returns Whether the thing can collide.
         */
        return function canThingCollide(thing: IThing): boolean {
            return thing.alive && !thing.nocollide;
        };
    },

    /**
     * @param thing
     * @returns Whether the Thing is alive, meaning it has a true alive flag
     *          and a false dead flag.
     */
    isThingAlive(this: MarioGame, thing: IThing): boolean {
        return thing && thing.alive && !thing.dead;
    },

    /**
     * Generic base function to check if one Thing is touching another. This
     * will be called by the more specific Thing touching functions.
     *
     * @param thing
     * @param other
     * @returns Whether the two Things are touching.
     * @remarks The horizontal checks use allow a unitsize of flexibility.
     */
    isThingTouchingThing(this: MarioGame, thing: IThing, other: IThing): boolean {
        return (
            !thing.nocollide &&
            !other.nocollide &&
            thing.right - thing.FSM.unitsize > other.left &&
            thing.left + thing.FSM.unitsize < other.right &&
            thing.bottom >= other.top &&
            thing.top <= other.bottom
        );
    },

    /**
     * General top collision detection Function for two Things to determine if
     * one Thing is on top of another. This takes into consideration factors
     * such as which are solid or an enemy, and y-velocity.
     *
     * @param thing
     * @param other
     * @returns Whether thing is on top of other.
     * @remarks This is a more specific form of isThingTouchingThing.
     */
    isThingOnThing(this: MarioGame, thing: IThing, other: IThing): boolean {
        // If thing is a solid and other is falling, thing can't be above other
        if (thing.groupType === "Solid" && other.yvel > 0) {
            return false;
        }

        // If other is falling faster than thing, and isn't a solid,
        // thing can't be on top (if anything, the opposite is true)
        if (thing.yvel < other.yvel && other.groupType !== "Solid") {
            return false;
        }

        // If thing is a Player, and it's on top of an enemy, that's true
        if ((<ICharacter>thing).player && thing.bottom < other.bottom && (<IEnemy>other).enemy) {
            return true;
        }

        // If thing is too far to the right, it can't be touching other
        if (thing.left + thing.FSM.unitsize >= other.right) {
            return false;
        }

        // If thing is too far to the left, it can't be touching other
        if (thing.right - thing.FSM.unitsize <= other.left) {
            return false;
        }

        // If thing's bottom is below other's top, factoring tolerance and
        // other's vertical velocity, they're touching
        if (thing.bottom <= other.top + other.toly + other.yvel) {
            return true;
        }

        // Same as before, but with velocity as the absolute difference
        // between their two velocities
        if (thing.bottom <= other.top + other.toly + Math.abs(thing.yvel - other.yvel)) {
            return true;
        }

        // None of the above checks passed for true, so this is false (thing's
        // bottom is above other's top)
        return false;
    },

    /**
     * Top collision Function to determine if a Thing is on top of a Solid.
     *
     * @param thing
     * @param other
     * @returns Whether thing is on top of other.
     * @remarks Similar to isThingOnThing, but more specifically used for
     *          isCharacterOnSolid and isCharacterOnResting
     */
    isThingOnSolid(this: MarioGame, thing: IThing, other: ISolid): boolean {
        // If thing is too far to the right, they're not touching
        if (thing.left + thing.FSM.unitsize >= other.right) {
            return false;
        }

        // If thing is too far to the left, they're not touching
        if (thing.right - thing.FSM.unitsize <= other.left) {
            return false;
        }

        // If thing's bottom is below other's top, factoring thing's velocity
        // and other's tolerance, they're touching
        if (thing.bottom - thing.yvel <= other.top + other.toly + thing.yvel) {
            return true;
        }

        // Same as before, but with velocity as the absolute difference between
        // their two velocities
        if (thing.bottom <= other.top + other.toly + Math.abs(thing.yvel - other.yvel)) {
            return true;
        }

        // None of the above checks passed for true, so this is false (thing's
        // bottom is above other's top
        return false;
    },

    /**
     * Top collision Function to determine if a character is on top of a solid.
     * This is always true for resting (since resting checks happen before when
     * this should be called).
     *
     * @param thing
     * @param other
     * @returns Whether thing is on top of other.
     */
    isCharacterOnSolid(this: MarioGame, thing: ICharacter, other: ISolid): boolean {
        // If character is resting on solid, this is automatically true
        if (thing.resting === other) {
            return true;
        }

        // If the character is jumping upwards, it's not on a solid
        // (removing this check would cause Mario to have "sticky" behavior when
        // jumping at the corners of solids)
        if (thing.yvel < 0) {
            return false;
        }

        // The character and solid must be touching appropriately
        if (!thing.FSM.isThingOnSolid(thing, other)) {
            return false;
        }

        // Corner case: when character is exactly falling off the right (false)
        if (thing.left + thing.xvel + thing.FSM.unitsize === other.right) {
            return false;
        }

        // Corner case: when character is exactly falling off the left (false)
        if (thing.right - thing.xvel - thing.FSM.unitsize === other.left) {
            return false;
        }

        // None of the above checks caught a falsity, so this must be true
        return true;
    },

    /**
     * Top collision Function to determine if a character should be considered
     * resting on a solid. This mostly uses isThingOnSolid, but also checks for
     * the corner cases of the character being exactly at the edge of the solid
     * (such as when jumping while next to it).
     *
     * @param thing
     * @param other
     * @returns Whether thing is on top of other.
     */
    isCharacterOnResting(this: MarioGame, thing: ICharacter, other: ISolid): boolean {
        if (!thing.FSM.isThingOnSolid(thing, other)) {
            return false;
        }

        // Corner case: when character is exactly falling off the right (false)
        if (thing.left + thing.xvel + thing.FSM.unitsize === other.right) {
            return false;
        }

        // Corner case: when character is exactly falling off the left (false)
        if (thing.right - thing.xvel - thing.FSM.unitsize === other.left) {
            return false;
        }

        // None of the above checks caught a falsity, so this must be true
        return true;
    },

    /**
     * Function generator for the generic isCharacterTouchingCharacter checker.
     * This is used repeatedly by ThingHittr to generate separately optimized
     * Functions for different Thing types.
     *
     * @returns A Function that generates isCharacterTouchingCharacter.
     */
    generateIsCharacterTouchingCharacter(this: MarioGame): (thing: ICharacter, other: ICharacter) => boolean {
        /**
         * Generic checker for whether two characters are touching each other.
         * This mostly checks to see if either has the nocollidechar flag, and
         * if the other is a player. isThingTouchingThing is used after.
         *
         * @param thing
         * @param other
         * @returns Whether thing is touching other.
         */
        return function isCharacterTouchingCharacter(thing: ICharacter, other: ICharacter): boolean {
            if (thing.nocollidechar && (!other.player || thing.nocollideplayer)) {
                return false;
            }

            if (other.nocollidechar && (!thing.player || other.nocollideplayer)) {
                return false;
            }

            return thing.FSM.isThingTouchingThing(thing, other);
        };
    },

    /**
     * Function generator for the generic isCharacterTouchingSolid checker. This
     * is used repeatedly by ThingHittr to generate separately optimized
     * Functions for different Thing types.
     *
     * @returns A Function that generates isCharacterTouchingSolid.
     */
    generateIsCharacterTouchingSolid(this: MarioGame): (thing: ICharacter, other: ISolid) => boolean {
        /**
         * Generic checker for whether a character is touching a solid. The
         * hidden, collideHidden, and nocollidesolid flags are most relevant.
         *
         * @param thing
         * @param other
         * @returns Whether thing is touching other.
         */
        return function isCharacterTouchingSolid(thing: ICharacter, other: ISolid): boolean {
            // Hidden solids can only be touched by a Player bottom-bumping
            // them, or by specifying collideHidden
            if (other.hidden && !other.collideHidden) {
                if (!thing.player || !thing.FSM.isSolidOnCharacter(other, thing)) {
                    return false;
                }
            }

            if (thing.nocollidesolid && !(thing.allowUpSolids && other.up)) {
                return false;
            }

            return thing.FSM.isThingTouchingThing(thing, other);
        };
    },

    /**
     * @param thing
     * @param other
     * @returns Whether thing's bottom is above other's top, allowing for
     *          other's toly.
     */
    isCharacterAboveEnemy(this: MarioGame, thing: ICharacter, other: ICharacter): boolean {
        return thing.bottom < other.top + other.toly;
    },

    /**
     * @param thing
     * @param other
     * @returns Whether thing's top is above other's bottom, allowing for
     *          the Thing's toly and yvel.
     */
    isCharacterBumpingSolid(this: MarioGame, thing: ICharacter, other: ISolid): boolean {
        return thing.top + thing.toly + Math.abs(thing.yvel) > other.bottom;
    },

    /**
     * @param thing
     * @param other
     * @returns Whether thing is "overlapping" other.
     */
    isCharacterOverlappingSolid(this: MarioGame, thing: ICharacter, other: ISolid): boolean {
        return thing.top <= other.top && thing.bottom > other.bottom;
    },

    /**
     * @param thing
     * @param other
     * @returns Whether thing, typically a solid, is on top of other.
     * @remarks This is similar to isThingOnThing, but more specifically
     *          used for characterTouchedSolid.
     */
    isSolidOnCharacter(this: MarioGame, thing: ISolid, other: ICharacter): boolean {
        // This can never be true if other is falling
        if (other.yvel >= 0) {
            return false;
        }

        // Horizontally, all that's required is for the other's midpoint to
        // be within the thing's left and right
        var midx: number = thing.FSM.getMidX(other);
        if (midx <= thing.left || midx >= thing.right) {
            return false;
        }

        // If the thing's bottom is below the other's top, factoring
        // tolerance and velocity, that's false (this function assumes they're
        // already touching)
        if (thing.bottom - thing.yvel > other.top + other.toly - other.yvel) {
            return false;
        }

        // The above checks never caught falsities, so this must be true
        return true;
    }
};

export type CollisionDetectionMethods = typeof collisionDetectionMethods;
