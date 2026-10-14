import "./styles.css";

import * as UserWrappr from "./engine/UserWrappr";
import { MarioGame } from "./game/MarioGame";

// The settings modules are side-effect scripts that fill in MarioGame.settings.*.
// They must be imported in this exact order (it is the order the original index.html
// loaded them in): maps.ts is imported before the individual map files.
import "./game/settings/audio";
import "./game/settings/collisions";
import "./game/settings/devices";
import "./game/settings/editor";
import "./game/settings/generator";
import "./game/settings/groups";
import "./game/settings/events";
import "./game/settings/help";
import "./game/settings/input";
import "./game/settings/items";
import "./game/settings/maps";
import "./game/settings/maps/1-1";
import "./game/settings/maps/1-2";
import "./game/settings/maps/1-3";
import "./game/settings/maps/1-4";
import "./game/settings/maps/2-1";
import "./game/settings/maps/2-2";
import "./game/settings/maps/2-3";
import "./game/settings/maps/2-4";
import "./game/settings/maps/3-1";
import "./game/settings/maps/3-2";
import "./game/settings/maps/3-3";
import "./game/settings/maps/3-4";
import "./game/settings/maps/4-1";
import "./game/settings/maps/4-2";
import "./game/settings/maps/4-3";
import "./game/settings/maps/4-4";
import "./game/settings/maps/5-1";
import "./game/settings/maps/5-2";
import "./game/settings/maps/5-3";
import "./game/settings/maps/5-4";
import "./game/settings/maps/6-1";
import "./game/settings/maps/6-2";
import "./game/settings/maps/6-3";
import "./game/settings/maps/6-4";
import "./game/settings/maps/7-1";
import "./game/settings/maps/7-2";
import "./game/settings/maps/7-3";
import "./game/settings/maps/7-4";
import "./game/settings/maps/8-1";
import "./game/settings/maps/8-2";
import "./game/settings/maps/8-3";
import "./game/settings/maps/8-4";
import "./game/settings/maps/Random";
import "./game/settings/math";
import "./game/settings/mods";
import "./game/settings/objects";
import "./game/settings/quadrants";
import "./game/settings/renderer";
import "./game/settings/runner";
import "./game/settings/scenes";
import "./game/settings/sprites";
import "./game/settings/touch";
import "./game/settings/ui";

function start(): void {
    const userWrapper = new UserWrappr.UserWrappr(
        MarioGame.prototype.proliferate(
            {
                "GameStartrConstructor": MarioGame
            },
            MarioGame.settings.ui,
            true));

    // UserWrappr exposes the game as a global named by settings.ui.globalName ("FSM"),
    // which is what the console cheats documented in the help menu rely on.
    (<any>userWrapper.getGameStarter()).UsageHelper.displayHelpMenu();
}

if (document.readyState === "complete") {
    start();
} else {
    document.addEventListener("readystatechange", (): void => {
        if (document.readyState === "complete") {
            start();
        }
    });
}
