/**
 * Saved progress: the best score reached on this device and the last level the
 * player started. These helpers only decide what a stored value is worth and
 * how it is written on the title card; reading and writing the values (through
 * the ItemsHoldr) is done by the methods in ./methods/progress.ts.
 *
 * localStorage may hold anything (text left by an older version, values edited
 * by hand), so every value is checked on its way in and ignored if it is not
 * what the game would have written.
 */

/** The level the game starts at, and whose title card carries the continue offer. */
export const firstLevel: string = "1-1";

/** Every level of the original game: worlds 1 to 8 with four levels each. "Random" is not one of them. */
export const standardLevels: readonly string[] = Array.from({ length: 8 }, (_, world: number): string[] =>
    [1, 2, 3, 4].map((level: number): string => `${world + 1}-${level}`)
).flat();

/** The highest top score the title card has the digits for. */
export const maxTopScore: number = 999999;

/**
 * @param value   Anything read from storage.
 * @returns The value if it is a whole, non-negative score the title card can show, otherwise 0.
 */
export function sanitizeTopScore(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maxTopScore ? value : 0;
}

/**
 * @param value   Anything read from storage, or a map name.
 * @returns The value if it names a standard level (1-1 to 8-4), otherwise undefined.
 */
export function sanitizeLevel(value: unknown): string | undefined {
    return typeof value === "string" && standardLevels.includes(value) ? value : undefined;
}

/**
 * @param score   A top score.
 * @returns The line shown on the title card, as in "TOP- 012345".
 */
export function formatTopScore(score: number): string {
    return "TOP- " + String(sanitizeTopScore(score)).padStart(6, "0");
}

/**
 * @param level   A standard level.
 * @param touch   Whether the player has an on-screen D-pad rather than a keyboard.
 * @returns The line that offers to continue at that level, as in "CONTINUE 4-2: PRESS DOWN".
 */
export function formatContinue(level: string, touch: boolean): string {
    return `CONTINUE ${level}: ${touch ? "TAP" : "PRESS"} DOWN`;
}

/**
 * @returns Whether the primary pointer is coarse, as on a phone or tablet.
 */
export function hasCoarsePointer(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}
