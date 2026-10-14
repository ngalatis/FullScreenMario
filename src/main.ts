import "./styles.css";

import * as UserWrappr from "./engine/UserWrappr";
import { MarioGame } from "./game/MarioGame";

// The settings modules are side-effect scripts that fill in MarioGame.settings.*.
// They must be imported in this exact order (it is the order the original index.html
// loaded them in): maps.js is imported before the individual map files.
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

    setupPage(userWrapper);
}

/* Page-level behavior: everything about the page around the game that is not game logic */

/** Runs a listener whenever a media query starts or stops matching. */
function onMediaChange(query: MediaQueryList, listener: () => void): void {
    if (typeof query.addEventListener === "function") {
        query.addEventListener("change", listener);
    } else {
        // Safari before 14
        (<any>query).addListener(listener);
    }
}

function setupPage(userWrapper: UserWrappr.UserWrappr): void {
    blockPageZoom();
    setupFullscreenButton();
    setupMenuButton(userWrapper);
    setupRotateOverlay(userWrapper);
}

/**
 * Keeps pinches and double taps from zooming the page. CSS (touch-action) covers most
 * browsers; iOS Safari still announces pinch gestures, so those are cancelled here.
 */
function blockPageZoom(): void {
    const stage = document.getElementById("stage");

    document.addEventListener("gesturestart", (event: Event): void => event.preventDefault());
    document.addEventListener("gesturechange", (event: Event): void => event.preventDefault());

    if (stage) {
        stage.addEventListener(
            "touchmove",
            (event: TouchEvent): void => {
                if (event.touches.length > 1) {
                    event.preventDefault();
                }
            },
            { passive: false });
    }
}

function getFullscreenElement(): Element | null {
    return document.fullscreenElement || (<any>document).webkitFullscreenElement || null;
}

/** Asks for a landscape screen, which most phones only grant while in fullscreen. Failure is fine. */
function lockLandscape(): void {
    try {
        const orientation: any = screen.orientation;

        if (orientation && typeof orientation.lock === "function") {
            Promise.resolve(orientation.lock("landscape")).catch((): void => undefined);
        }
    } catch (error) {
        // Not supported here (desktops, iPhones): nothing to do
    }
}

function unlockOrientation(): void {
    try {
        if (screen.orientation && typeof screen.orientation.unlock === "function") {
            screen.orientation.unlock();
        }
    } catch (error) {
        // Not supported here: nothing to do
    }
}

/**
 * Wires the fullscreen button to the game container (#stage: the game plus its touch controls
 * and toolbar). Browsers without the Fullscreen API on elements, such as Safari on iPhone,
 * get no button.
 */
function setupFullscreenButton(): void {
    const stage = <any>document.getElementById("stage");
    const button = <HTMLButtonElement>document.getElementById("fullscreen-button");

    if (!stage || !button) {
        return;
    }

    // The methods are looked up when used, not kept, so the page always calls the browser's current ones
    const getRequest = (): (() => any) | undefined => stage.requestFullscreen || stage.webkitRequestFullscreen;
    const getExit = (): (() => any) | undefined => document.exitFullscreen || (<any>document).webkitExitFullscreen;
    const allowed = document.fullscreenEnabled ?? (<any>document).webkitFullscreenEnabled;

    if (!getRequest() || allowed === false) {
        button.hidden = true;
        return;
    }

    const sync = (): void => {
        const isFullscreen = !!getFullscreenElement();

        stage.classList.toggle("is-fullscreen", isFullscreen);
        button.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
        button.setAttribute("aria-pressed", String(isFullscreen));

        if (!isFullscreen) {
            unlockOrientation();
        }
    };

    button.hidden = false;
    button.addEventListener("click", (): void => {
        try {
            if (getFullscreenElement()) {
                const exit = getExit();
                Promise.resolve(exit && exit.call(document)).catch((): void => undefined);
            } else {
                Promise.resolve(getRequest()!.call(stage)).then(lockLandscape).catch((): void => undefined);
            }
        } catch (error) {
            // Refused (for example, not from a user gesture): the game just stays windowed
        }
    });

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
}

/** On touch devices the menus open as a sheet over the game, which is paused meanwhile. */
function setupMenuButton(userWrapper: UserWrappr.UserWrappr): void {
    const button = document.getElementById("menu-button");

    if (!button) {
        return;
    }

    button.addEventListener("click", (): void => {
        const open = !document.body.classList.contains("menu-open");

        document.body.classList.toggle("menu-open", open);
        button.textContent = open ? "Close" : "Menu";
        button.setAttribute("aria-expanded", String(open));
        userWrapper.setLayoutPaused("menu", open);
    });
}

/** The "Rotate your phone" overlay is pure CSS; this just holds the game paused behind it. */
function setupRotateOverlay(userWrapper: UserWrappr.UserWrappr): void {
    const portraitOnTouch = window.matchMedia("(pointer: coarse) and (orientation: portrait)");
    const sync = (): void => userWrapper.setLayoutPaused("rotate", portraitOnTouch.matches);

    onMediaChange(portraitOnTouch, sync);
    sync();
}

/**
 * Makes the game installable and playable offline (see the offlineSupport plugin in vite.config.ts, which
 * generates sw.js). Production builds only, and a failure here must never reach the player.
 */
function registerServiceWorker(): void {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
        return;
    }

    const register = (): void => {
        try {
            navigator.serviceWorker.register("./sw.js").catch((): void => undefined);
        } catch (error) {
            // Blocked here (private mode, odd embedding contexts): the game just needs the network
        }
    };

    // After the page has loaded, so the precache download does not compete with the game's startup
    if (document.readyState === "complete") {
        register();
    } else {
        window.addEventListener("load", register, { once: true });
    }
}

registerServiceWorker();

if (document.readyState === "complete") {
    start();
} else {
    document.addEventListener("readystatechange", (): void => {
        if (document.readyState === "complete") {
            start();
        }
    });
}
