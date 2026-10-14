import type { Page } from "@playwright/test";

/** The game exposes itself as a global named "FSM" (see settings/ui.ts). */
declare global {
    // eslint-disable-next-line no-var
    var FSM: any;
}

export interface ErrorCollector {
    errors: string[];
}

/**
 * Records uncaught page errors. Autoplay rejections from the audio player (whose
 * messages contain "play()" or "pause()") are ignored until audio is reworked.
 */
export function collectPageErrors(page: Page): ErrorCollector {
    const collector: ErrorCollector = { errors: [] };

    page.on("pageerror", (error) => {
        const message = String(error && error.message ? error.message : error);

        if (/play\(\)|pause\(\)/.test(message)) {
            return;
        }

        collector.errors.push(message);
    });

    return collector;
}

/** Opens the game and waits until it has been constructed and has a player. */
export async function bootGame(page: Page): Promise<void> {
    await page.goto("/");
    await page.waitForFunction(() => !!(window as any).FSM && !!(window as any).FSM.player);
}

/** Every map name in the game: worlds 1-8 with four levels each, plus the random map. */
export const mapNames: string[] = [
    ...Array.from({ length: 8 }, (_, w) => Array.from({ length: 4 }, (_, l) => `${w + 1}-${l + 1}`)).flat(),
    "Random",
];
