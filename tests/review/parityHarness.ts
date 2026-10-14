import type { Page } from "@playwright/test";

import { bootGame } from "../helpers";

/**
 * Deterministic scripted-play harness used by the parity-*.spec.ts review tests.
 *
 * The runner's scheduler is neutralised, the random generator and TimeHandlr clock
 * are seeded, and game logic is stepped by hand (GamesRunner.runAllGames + render),
 * so a scenario produces the same trace on every run and on every machine. The same
 * driver was run against the original FullScreenMario 0.10.3 to record the golden
 * values asserted in the specs.
 */

export interface KeySegment {
    from: number;
    to: number;
    keys: ("left" | "right" | "up" | "down" | "sprint")[];
}

export interface Action {
    at: number;
    do: "teleport" | "add" | "addRel" | "big" | "fire" | "star" | "kill" | "eval";
    args?: any[];
}

export interface Scenario {
    map: string;
    location: string | number;
    steps: number;
    seed?: number;
    segments?: KeySegment[];
    actions?: Action[];
    /** Page-side code run with (FSM) after the scheduler is neutralised and before setMap. */
    pre?: string[];
}

export interface PlayerSnapshot {
    l: number;
    t: number;
    xv: number;
    yv: number;
    pw: number;
    al: boolean;
    dead: any;
    rest: boolean;
    map: string;
    items: any[];
    scr: number;
    cls: string;
}

export interface TraceEntry {
    i: number;
    p: PlayerSnapshot | null;
    c?: any[];
}

export interface ScenarioResult {
    trace: TraceEntry[];
    errors: string[];
    final: PlayerSnapshot | null;
    cutscene: string | undefined;
}

export const hold = (keys: KeySegment["keys"], from: number, to: number): KeySegment => ({ from, to, keys });
export const jumps = (starts: number[], len: number = 14): KeySegment[] =>
    starts.map((s) => ({ from: s, to: s + len, keys: ["up"] as KeySegment["keys"] }));

export async function runScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
    // The game sizes itself from the window; the golden values were recorded at this size
    // (MapScreener.width 1200), which decides what is on screen and so what gets spawned.
    await page.setViewportSize({ width: 1200, height: 800 });
    await bootGame(page);

    return page.evaluate((scenario: Scenario): ScenarioResult => {
        const FSM: any = (window as any).FSM;
        const GR: any = FSM.GamesRunner;
        const errors: string[] = [];

        window.addEventListener("error", (e: ErrorEvent) => errors.push(String(e.message)));

        GR.pause();
        GR.upkeepScheduler = (): number => 0;
        GR.upkeepCanceller = (): void => undefined;
        FSM.TimeHandler.cancelAllEvents();
        FSM.TimeHandler.time = 0;
        FSM.NumberMaker.resetFromSeed(scenario.seed || 1234);
        FSM.ItemsHolder.setItem("lives", 3);
        FSM.ItemsHolder.setItem("power", 1);
        for (const src of scenario.pre || []) {
            (new Function("FSM", src))(FSM);
        }
        FSM.setMap(scenario.map, scenario.location);
        if (GR.getPaused()) {
            GR.play();
        }

        const keyNames: Record<string, string> = { left: "Left", right: "Right", up: "Up", down: "Down", sprint: "Sprint" };
        const held: Set<string> = new Set();
        const step = (): void => { GR.runAllGames(); if (GR.render) { GR.render(); } };
        const r = (n: any): any => (typeof n === "number" ? Math.round(n * 1000) / 1000 : n);

        const helpers: Record<string, (...args: any[]) => void> = {
            teleport: (left: number, bottom: number): void => {
                const p = FSM.player;
                FSM.setLeft(p, left);
                FSM.setBottom(p, bottom);
                const shift = p.left - FSM.MapScreener.width * 0.25;
                if (shift > 0) {
                    FSM.scrollWindow(shift);
                }
            },
            add: (title: string, left: number, top: number): void => { FSM.addThing(title, left, top); },
            addRel: (title: string, dx: number, dy: number): void => {
                FSM.addThing(title, FSM.player.left + dx, FSM.player.top + dy);
            },
            big: (): void => FSM.playerGetsBig(FSM.player),
            fire: (): void => FSM.playerGetsFire(FSM.player),
            star: (): void => FSM.playerStarUp(FSM.player),
            kill: (): void => FSM.killPlayer(FSM.player),
            eval: (src: string): void => { (new Function("FSM", src))(FSM); },
        };

        const snapPlayer = (): PlayerSnapshot | null => {
            const p = FSM.player;
            if (!p) {
                return null;
            }
            return {
                l: r(p.left), t: r(p.top), xv: r(p.xvel), yv: r(p.yvel), pw: p.power,
                al: !!p.alive, dead: p.dead || 0, rest: !!p.resting, cls: p.className,
                map: FSM.AreaSpawner.getMapName(),
                items: ["score", "coins", "lives", "time", "world", "power"].map((k) => FSM.ItemsHolder.getItem(k)),
                scr: r(FSM.MapScreener.left),
            };
        };
        const snapChars = (): any[] => FSM.GroupHolder.getCharacterGroup()
            .filter((t: any) => !t.player)
            .map((t: any) => [t.title, r(t.left), r(t.top), r(t.xvel), r(t.yvel), t.alive ? 1 : 0, t.className]);

        const trace: TraceEntry[] = [];
        for (let i = 0; i < scenario.steps; i += 1) {
            const want: Set<string> = new Set();
            for (const seg of scenario.segments || []) {
                if (i >= seg.from && i < seg.to) {
                    for (const k of seg.keys) { want.add(k); }
                }
            }
            for (const k of held) {
                if (!want.has(k)) { held.delete(k); FSM["keyUp" + keyNames[k]](FSM); }
            }
            for (const k of want) {
                if (!held.has(k)) { held.add(k); FSM["keyDown" + keyNames[k]](FSM); }
            }
            for (const a of scenario.actions || []) {
                if (a.at === i) {
                    try { helpers[a.do](...(a.args || [])); } catch (e: any) { errors.push("action " + a.do + ": " + e.message); }
                }
            }
            try {
                step();
            } catch (e: any) {
                errors.push("step " + i + ": " + e.message);
                break;
            }
            const entry: TraceEntry = { i, p: snapPlayer() };
            if (i % 5 === 0) {
                entry.c = snapChars();
            }
            trace.push(entry);
        }

        return { trace, errors, final: snapPlayer(), cutscene: FSM.ScenePlayer.getCutsceneName() };
    }, scenario);
}
