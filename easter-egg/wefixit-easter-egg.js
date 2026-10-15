// @ts-check
/**
 * WeFixIt easter egg for wefixit.gr: a pixel-art plumber fixes a leaky pipe in the footer and,
 * when clicked, asks a riddle about the Konami code. Entering the code anywhere on the site
 * (keys, swipes plus two taps, or his little controller) plays a pixel transition and opens the game.
 *
 * Dependency-free, no network requests, styles isolated in Shadow DOM. Optional configuration,
 * set before this script runs or as data-* attributes on its tag (see README.md):
 *   window.wefixitEasterEgg = { target, mount, lang, sound };
 */
(function () {
    "use strict";

    /** @type {any} */
    const win = window;
    if (win.__wefixitEasterEggLoaded) {
        return;
    }
    win.__wefixitEasterEggLoaded = true;

    // Only set while this script first runs, and lost when Drupal aggregates it with others.
    const script = document.currentScript;

    const DEFAULT_TARGET = "https://mario.wefixit.gr/";
    const DEFAULT_MOUNT = "footer, [role=contentinfo]";
    const CODE = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
    const HINT_CODE = "↑ ↑ ↓ ↓ ← → ← → B A";
    const IDLE_RESET_MS = 5000;
    const SCALE = 4; // CSS pixels per sprite pixel
    const ROWS = 22; // strip height in sprite pixels
    const MAX_STAGE = 720; // CSS pixels
    const CYCLE_MS = 9000; // work, "fixed it!", the leak comes back, a shrug
    const DISSOLVE_MS = 600;
    const INTRO_MS = 900;

    const STRINGS = {
        en: {
            label: "The WeFixIt plumber. Press for a riddle",
            riddle: "Psst! Are you old enough to remember the Konami code? Enter it anywhere on this site.",
            hint: "(you didn't hear it from me)",
            touch: "No keyboard? Use my controller:",
            hintButton: "Hint?",
            close: "Close",
            pad: ["Up", "Down", "Left", "Right"],
        },
        el: {
            label: "Ο υδραυλικός της WeFixIt. Πάτησε για έναν γρίφο",
            riddle: "Ψιτ! Είσαι από τους παλιούς που θυμούνται τον κωδικό Konami; Πληκτρολόγησέ τον οπουδήποτε σε αυτό το site.",
            hint: "(δεν το άκουσες από μένα)",
            touch: "Δεν έχεις πληκτρολόγιο; Πάρε το χειριστήριό μου:",
            hintButton: "Υπόδειξη;",
            close: "Κλείσιμο",
            pad: ["Πάνω", "Κάτω", "Αριστερά", "Δεξιά"],
        },
    };

    // ---- Sprites: one character per pixel, "." is transparent

    /** @type {Record<string, string>} */
    const PALETTE = {
        C: "#00BCD4", // cap and overalls (brand cyan)
        L: "#80DEEA", // cyan highlight
        K: "#00838F", // cyan shade
        W: "#F2F2F2", // shirt
        w: "#B8B8B8", // shirt shade
        S: "#F6C38F", // skin
        s: "#D48A5A", // skin shade
        H: "#5B3A1E", // hair and mustache
        E: "#1B1918", // eyes
        Y: "#FFCA28", // belt and toolbox (brand yellow)
        y: "#C99A0E", // toolbox shade
        B: "#8D5A34", // boots
        b: "#4E3020", // soles
        G: "#CFD8DC", // wrench
        g: "#8FA3AD", // wrench shade
        F: "#FFFCE8", // speech bubble
    };

    const SIDE_HEAD = [
        "......CCCCC.....",
        "....CCCCCCCCC...",
        "...CLLCCCCWWCC..",
        "...CCCCCCCCKKKKK",
        "...HHHSSSSES....",
        "..HSHSSSSSESSS..",
        "..HSHHSSSSSSSSS.",
        "..HHSSSSSHHHHHH.",
        "....SSSSSSHHHH..",
        ".....SSSSSSSS...",
    ];
    const WALK_A = [
        "......WWCCW.....",
        ".....WWWCCWWW...",
        "....WWWWCCCWWSS.",
        "....SWWCCCCC....",
        ".....YYYYYYY....",
        ".....CCCCCCC....",
        "....CCCK.CCCC...",
        "...CCCK...KCCC..",
        "..BBBB.....BBBB.",
        ".bbbbb.....bbbbb",
    ];
    const WALK_B = [
        "......WWCCW.....",
        ".....WWWCCWW....",
        ".....WWSCCCW....",
        ".....WSSCCCC....",
        ".....YYYYYYY....",
        ".....CCCCCCC....",
        "......CCKCC.....",
        "......CCCCC.....",
        ".....BBBBBB.....",
        ".....bbbbbbb....",
    ];
    const WORK_A = [
        "......WWCCW..G.G",
        ".....WWWCCWW.GGG",
        ".....WWWCCCWSSg.",
        ".....WWCCCCSSg..",
        ".....YYYYYYY....",
        ".....CCCCCCC....",
        ".....CCCK.CCC...",
        "....CCCK...CCC..",
        "...BBBB....BBBB.",
        "...bbbbb...bbbbb",
    ];
    const WORK_B = [
        "......WWCCW.....",
        ".....WWWCCWW....",
        ".....WWWCCCW..G.",
        ".....WWCCCCSSgGG",
        ".....YYYYYYSS.G.",
        ".....CCCCCCC....",
        ".....CCCK.CCC...",
        "....CCCK...CCC..",
        "...BBBB....BBBB.",
        "...bbbbb...bbbbb",
    ];
    const FRONT_HEAD = [
        ".....CCCCCC.....",
        "....CCCCCCCC....",
        "...CCLCWWCCCC...",
        "...KKKKKKKKKK...",
        "...HSSSSSSSSH...",
        "..sHSESSSSESHs..",
        "..sSSESSSSESSs..",
        "...SSSSssSSSS...",
        "...SHHHHHHHHS...",
        "....SsSSSSsS....",
    ];
    const FRONT_BODY = [
        "....WWCWWCWW....",
        "...WWWCCCCWWW...",
        "..WWwWCCCCWwWW..",
        "..SS.YYYYYY.SS..",
        ".....CCCCCC.....",
        ".....CCCCCC.....",
        ".....CCK.KCC....",
        ".....CCC.CCC....",
        "....BBBB.BBBB...",
        "....bbbb.bbbb...",
    ];
    const SHRUG_BODY = [
        "S...WWCWWCWW...S",
        "SW.WWWCCCCWWW.WS",
        ".WWWWwCCCCwWWWW.",
        ".....YYYYYY.....",
    ].concat(FRONT_BODY.slice(4));
    const TOOLBOX = ["...ggg...", "..g...g..", "yyyyyyyyy", "YYYYgYYYY", "YYYYYYYYY", "yyyyyyyyy"];
    const TAIL = ["CFFFFC", "CFFFC.", "CFFC..", "CFC...", "CC...."];

    // A 5x5 bitmap font with just the glyphs the level intro needs.
    /** @type {Record<string, string[]>} */
    const FONT = {
        W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
        O: [".###.", "#...#", "#...#", "#...#", ".###."],
        R: ["####.", "#...#", "####.", "#..#.", "#...#"],
        L: ["#....", "#....", "#....", "#....", "#####"],
        D: ["####.", "#...#", "#...#", "#...#", "####."],
        1: ["..#..", ".##..", "..#..", "..#..", ".###."],
        3: ["####.", "....#", ".###.", "....#", "####."],
        "-": [".....", ".....", ".###.", ".....", "....."],
        x: [".....", "#..#.", ".##..", ".##..", "#..#."],
    };

    const BORDER = (/** @type {number} */ size, /** @type {string} */ color) =>
        `box-shadow: 0 -${size}px ${color}, 0 ${size}px ${color}, -${size}px 0 ${color}, ${size}px 0 ${color};`;

    const STRIP_CSS = `
:host { all: initial; display: block; position: relative; z-index: 2; height: ${ROWS * SCALE}px;
    font-family: inherit; pointer-events: none; }
[hidden] { display: none !important; }
canvas { display: block; image-rendering: crisp-edges; image-rendering: pixelated; }
.stage { position: relative; height: 100%; margin: 0 auto; overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent);
    mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); }
.scene, .plumber canvas { width: 100%; height: 100%; }
button { margin: 0; padding: 0; border: 0; font-family: inherit; color: #1B1918; cursor: pointer;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.plumber { position: absolute; left: 0; top: ${SCALE}px; width: ${16 * SCALE}px; height: ${20 * SCALE}px;
    background: none; pointer-events: auto; }
.plumber:focus { outline: none; }
.plumber:focus-visible { outline: 3px dashed #4DD0E1; outline-offset: -3px; }
.bubble { position: absolute; left: 8px; bottom: ${ROWS * SCALE + 18}px; box-sizing: border-box;
    width: min(330px, calc(100% - 24px)); padding: 14px 40px 14px 16px; background: #FFFCE8; color: #1B1918;
    font-size: 15px; line-height: 1.45; text-align: left; pointer-events: auto; ${BORDER(4, "#00BCD4")} }
.bubble p { margin: 0 0 8px; }
.bubble strong { display: block; font-size: 18px; letter-spacing: 0.08em; color: #00838F; }
.bubble button:focus-visible { outline: 2px dashed #00838F; outline-offset: 3px; }
.tail { position: absolute; top: 100%; width: ${6 * SCALE}px; height: ${5 * SCALE}px; }
.close { position: absolute; top: 2px; right: 2px; width: 36px; height: 36px; background: none; font-size: 24px; }
.btn { margin: 2px 4px; padding: 5px 12px; background: #4DD0E1; font-size: 14px; font-weight: 700;
    ${BORDER(3, "#00838F")} }
.btn:hover { background: #80DEEA; }
.btn:active, .ab button:active { transform: translateY(2px); }
.caption { margin: 12px 0 8px; font-size: 14px; }
.pad { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px;
    padding: 10px 14px; background: #3A3633; ${BORDER(4, "#1B1918")} }
.dpad { display: grid; grid-template: repeat(3, 40px) / repeat(3, 40px); }
.dpad i, .dpad button { position: relative; background: #1B1918; }
.dpad i { grid-area: 2 / 2; }
.dpad button::before { content: ""; position: absolute; inset: 12px; background: #8A8580;
    clip-path: polygon(50% 10%, 95% 85%, 5% 85%); }
.dpad button:active::before { background: #4DD0E1; }
.up { grid-area: 1 / 2; } .left { grid-area: 2 / 1; } .right { grid-area: 2 / 3; } .down { grid-area: 3 / 2; }
.down::before { transform: rotate(180deg); } .left::before { transform: rotate(-90deg); }
.right::before { transform: rotate(90deg); }
.ab { display: flex; gap: 12px; padding-top: 18px; }
.ab button { width: 46px; height: 46px; border-radius: 50%; background: #00BCD4; font-size: 17px;
    font-weight: 700; box-shadow: 0 4px #00838F; }
.ab button:first-child { margin-top: -18px; }
.dots { display: flex; justify-content: center; gap: 4px; margin-top: 10px; }
.dots i { width: 8px; height: 8px; background: #D9D5CF; }
.dots .on { background: #00ACC1; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

    const OVERLAY_CSS = `
:host { all: initial; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647;
    overflow: hidden; cursor: wait; }
:host(.fade) { background: #000; animation: fade 250ms linear both; }
@keyframes fade { from { opacity: 0; } }
canvas { display: block; image-rendering: crisp-edges; image-rendering: pixelated; }
`;

    // ---- Helpers

    /**
     * Builds elements without innerHTML, so Trusted Types and strict CSPs have nothing to object to.
     * @param {string} tag
     * @param {Record<string, string>} [attrs]
     * @param {(Node | string)[]} [children]
     */
    function h(tag, attrs = {}, children = []) {
        const element = document.createElement(tag);
        for (const name in attrs) {
            element.setAttribute(name, attrs[name]);
        }
        element.append(...children);
        return element;
    }

    /** @param {string} query */
    function matches(query) {
        try {
            return window.matchMedia(query).matches;
        } catch (error) {
            return false;
        }
    }

    /**
     * Constructable stylesheets need no inline style element, which a strict CSP may block.
     * @param {ShadowRoot} root
     * @param {string} css
     */
    function adoptStyles(root, css) {
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
            root.adoptedStyleSheets = [sheet];
        } catch (error) {
            root.append(h("style", {}, [css]));
        }
    }

    /** @param {string[]} rows */
    function bake(rows) {
        const canvas = document.createElement("canvas");
        canvas.width = rows[0].length;
        canvas.height = rows.length;
        const context = canvas.getContext("2d");
        rows.forEach((row, y) => {
            Array.from(row).forEach((pixel, x) => {
                if (context && PALETTE[pixel]) {
                    fill(context, PALETTE[pixel], x, y, 1, 1);
                }
            });
        });
        return canvas;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {string} color
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    function fill(context, color, x, y, width, height) {
        context.fillStyle = color;
        context.fillRect(Math.round(x), Math.round(y), width, height);
    }

    // ---- State

    let config = readConfig();
    let text = STRINGS.en;
    let reduced = false;
    /** @type {Record<string, HTMLCanvasElement>} */
    let frames = {};

    /** @type {string[]} */
    let recent = [];
    let lastInputAt = 0;
    /** @type {{ x: number, y: number, time: number } | null} */
    let touchStart = null;

    // Bumped by every reset, which turns pending callbacks of an abandoned transition into no-ops.
    let transitionId = 0;
    let transitionRunning = false;
    /** @type {HTMLElement | null} */
    let overlayHost = null;
    /** @type {AudioContext | null} */
    let audio = null;

    /** @type {Record<string, any>} The strip's elements, filled in by buildStrip(). */
    const ui = {};
    let cols = 0;
    let riserX = 0;
    let workX = 0;
    let walkSpeed = 40; // sprite pixels per second
    let plumberX = -16;
    let stride = 0;
    let cycle = 0;
    let dripTimer = 0;
    let puddle = 0;
    /** @type {{ x: number, y: number, speed: number }[]} */
    let drips = [];
    let visible = false;
    let rafId = 0;
    let lastTime = 0;
    let drawnPose = "";
    let drawnX = NaN;
    let bubbleOpen = false;
    let hintShown = false;

    // ---- Configuration

    /** @returns {{ target: string, mount: string, lang: "en" | "el", sound: boolean }} */
    function readConfig() {
        /** @type {Record<string, unknown>} */
        let fromGlobal = {};
        try {
            if (win.wefixitEasterEgg && typeof win.wefixitEasterEgg === "object") {
                fromGlobal = win.wefixitEasterEgg;
            }
        } catch (error) {
            // An unreadable config object: use the defaults.
        }
        /** @type {Record<string, string | undefined>} */
        const fromData = script instanceof HTMLScriptElement ? script.dataset : {};
        /** @param {string} key */
        const pick = (key) => {
            const value = fromGlobal[key] !== undefined ? fromGlobal[key] : fromData[key];
            return value === null || value === "" ? undefined : value;
        };
        const lang = String(pick("lang") || document.documentElement.lang || "en").toLowerCase();
        return {
            target: safeTarget(pick("target")),
            mount: String(pick("mount") || DEFAULT_MOUNT),
            lang: lang.startsWith("el") ? "el" : "en",
            sound: !["false", "off", "0", "no"].includes(String(pick("sound"))),
        };
    }

    /**
     * Only http(s), so a mistyped or hostile config can never turn into a javascript: URL.
     * @param {unknown} value
     */
    function safeTarget(value) {
        try {
            const url = new URL(String(value || DEFAULT_TARGET), location.href);
            if (url.protocol === "https:" || url.protocol === "http:") {
                return url.href;
            }
        } catch (error) {
            // Fall back to the default.
        }
        return DEFAULT_TARGET;
    }

    // ---- The code: keys, swipes and taps, and the mini controller all feed this matcher

    /** @param {string} input A step of CODE, "tap", or "other". */
    function feed(input) {
        if (transitionRunning) {
            return;
        }
        const now = Date.now();
        if (now - lastInputAt > IDLE_RESET_MS) {
            recent = [];
        }
        lastInputAt = now;
        recent = recent.concat(input).slice(-CODE.length);
        const progress = matchedLength();
        showProgress(progress);
        if (progress === CODE.length) {
            recent = [];
            startTransition();
        }
    }

    /** The longest run of recent inputs that is also a start of the code, so ↑ ↑ ↑ ↓ ... still works. */
    function matchedLength() {
        for (let length = recent.length; length > 0; length--) {
            // On touch screens, the two closing taps stand in for B and A.
            if (recent.slice(-length).every((input, i) => input === CODE[i] || (input === "tap" && i >= 8))) {
                return length;
            }
        }
        return 0;
    }

    /** @param {Event} event */
    function isTyping(event) {
        const target = event.composedPath()[0];
        return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    }

    /** @param {Event} event */
    function isOwn(event) {
        const path = event.composedPath();
        return (!!ui.host && path.includes(ui.host)) || (!!overlayHost && path.includes(overlayHost));
    }

    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
        const key = String(event.key || "").toLowerCase();
        // Enter or Space on the controller's buttons click them, which already feeds the matcher.
        const pressesOwnButton = (key === "enter" || key === " ") && isOwn(event);
        if (key === "escape" && bubbleOpen) {
            closeBubble(true);
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !event.isComposing
            && !isTyping(event) && !pressesOwnButton && key !== "shift" && key !== "capslock") {
            feed(/^arrow/.test(key) ? key.slice(5) : key === "a" || key === "b" ? key : "other");
        }
    }

    /** @param {TouchEvent} event */
    function onTouchStart(event) {
        const touch = event.touches[0];
        touchStart = event.touches.length === 1 && !isOwn(event) ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
    }

    /** @param {TouchEvent} event */
    function onTouchEnd(event) {
        const start = touchStart;
        const touch = event.changedTouches[0];
        touchStart = null;
        if (!start || !touch || event.touches.length || Date.now() - start.time > 1000) {
            return;
        }
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (distance < 12) {
            feed("tap");
        } else if (distance >= 40) {
            feed(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        }
    }

    // ---- The footer strip

    function buildStrip() {
        let mount = null;
        try {
            mount = document.querySelector(config.mount);
        } catch (error) {
            // An invalid selector: no plumber, but the code still works.
        }
        if (!mount) {
            return;
        }
        const host = h("wefixit-easter-egg");
        const root = host.attachShadow({ mode: "open" });
        adoptStyles(root, STRIP_CSS);

        const scene = h("canvas", { class: "scene", "aria-hidden": "true" });
        const sprite = h("canvas", { width: "16", height: "20" });
        const plumber = h("button", { class: "plumber", type: "button", "aria-label": text.label, "aria-expanded": "false", "aria-controls": "bubble" }, [sprite]);
        const close = h("button", { class: "close", type: "button", "aria-label": text.close }, ["×"]);
        const hint = h("p", { hidden: "" }, [h("strong", {}, [HINT_CODE]), " " + text.hint]);
        const hintButton = h("button", { class: "btn", type: "button" }, [text.hintButton]);
        const dots = h("div", { class: "dots", "aria-hidden": "true" }, CODE.map(() => h("i")));
        const padButton = (/** @type {string} */ input, /** @type {string} */ label) => {
            const button = h("button", { class: input, type: "button", "aria-label": label }, input.length === 1 ? [label] : []);
            button.addEventListener("click", () => feed(input));
            return button;
        };
        const controller = h("div", {}, [
            h("p", { class: "caption" }, [text.touch]),
            h("div", { class: "pad" }, [
                h("div", { class: "dpad" }, ["up", "down", "left", "right"].map((input, i) => padButton(input, text.pad[i])).concat(h("i"))),
                h("div", { class: "ab" }, [padButton("b", "B"), padButton("a", "A")]),
            ]),
            dots,
        ]);
        const tail = bake(TAIL);
        tail.className = "tail";
        const bubble = h("div", { class: "bubble", id: "bubble", role: "dialog", "aria-label": text.label, hidden: "" },
            [h("p", {}, [text.riddle]), hint, hintButton, controller, close, tail]);
        const live = h("p", { class: "sr", "aria-live": "polite" });
        root.append(h("div", { class: "stage" }, [scene, plumber]), bubble, live);
        mount.append(host);
        Object.assign(ui, { host, root, stage: scene.parentNode, scene, sprite, plumber, bubble, hint, hintButton, controller, dots, tail, live });

        plumber.addEventListener("click", onPlumberClick);
        plumber.addEventListener("focus", () => {
            // Keyboard users skip the walk-in. Not on a click: he would step away from the pointer.
            let keyboard = false;
            try {
                keyboard = plumber.matches(":focus-visible");
            } catch (error) {
                // Older browsers: let him finish walking.
            }
            if (keyboard && plumberX < workX) {
                plumberX = workX;
                render();
            }
        });
        hintButton.addEventListener("click", () => {
            showHint();
            close.focus();
        });
        close.addEventListener("click", () => closeBubble(true));
        document.addEventListener("pointerdown", (event) => {
            if (bubbleOpen && !isOwn(event)) {
                closeBubble(false);
            }
        }, true);

        layout();
        if (typeof ResizeObserver === "function") {
            new ResizeObserver(layout).observe(host);
        } else {
            window.addEventListener("resize", layout);
        }
        if (typeof IntersectionObserver === "function") {
            new IntersectionObserver((entries) => {
                visible = entries[entries.length - 1].isIntersecting;
                updateLoop();
            }).observe(host);
        } else {
            visible = true;
        }
        document.addEventListener("visibilitychange", updateLoop);
        updateLoop();
    }

    function layout() {
        try {
            const width = Math.floor(Math.min(ui.host.clientWidth, MAX_STAGE) / SCALE);
            ui.stage.hidden = width < 48;
            if (width !== cols && width >= 48) {
                const working = reduced || (cols > 0 && plumberX >= workX);
                cols = width;
                ui.stage.style.width = cols * SCALE + "px";
                ui.scene.width = cols;
                ui.scene.height = ROWS;
                riserX = Math.round(cols * 0.6);
                workX = riserX - 15;
                walkSpeed = Math.max(30, (workX + 16) / 3);
                plumberX = working ? workX : Math.min(plumberX, workX);
                render();
            }
            positionBubble();
        } catch (error) {
            // Cosmetic only; never let it break the page.
        }
    }

    // Animates only while the strip is on screen and the tab is visible, and never with reduced motion.
    function updateLoop() {
        const run = visible && !document.hidden && !reduced;
        if (run && !rafId) {
            lastTime = 0;
            rafId = requestAnimationFrame(tick);
        } else if (!run && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /** @param {number} now */
    function tick(now) {
        rafId = 0;
        try {
            update(lastTime ? Math.min(100, now - lastTime) : 16);
            lastTime = now;
            render();
            rafId = requestAnimationFrame(tick);
        } catch (error) {
            // Stop animating rather than throw on every frame.
        }
    }

    /** @param {number} dt milliseconds since the last frame */
    function update(dt) {
        if (!bubbleOpen && plumberX < workX) {
            const step = (walkSpeed * dt) / 1000;
            plumberX = Math.min(workX, plumberX + step);
            stride += step;
        } else if (!bubbleOpen) {
            cycle = (cycle + dt) % CYCLE_MS;
        }
        dripTimer += dt;
        if (isLeaking() && dripTimer > 650) {
            dripTimer = 0;
            drips.push({ x: riserX + 5, y: 12, speed: 0 });
        }
        for (const drip of drips) {
            drip.speed += 0.00012 * dt;
            drip.y += drip.speed * dt;
            if (drip.y >= ROWS - 2) {
                puddle = Math.min(1, puddle + 0.12);
            }
        }
        drips = drips.filter((drip) => drip.y < ROWS - 2);
        if (!isLeaking()) {
            puddle = Math.max(0, puddle - 0.0004 * dt);
        }
    }

    function isLeaking() {
        return plumberX < workX || cycle < 5600 || cycle >= 6800;
    }

    function pose() {
        if (bubbleOpen) {
            return "front";
        }
        if (plumberX < workX) {
            return Math.floor(stride / 4) % 2 ? "walkA" : "walkB";
        }
        if (reduced || cycle < 5600) {
            return Math.floor(cycle / 280) % 2 ? "workB" : "workA";
        }
        return cycle >= 7000 && cycle < 8400 ? "shrug" : "workB";
    }

    function render() {
        const context = ui.scene.getContext("2d");
        const spriteContext = ui.sprite.getContext("2d");
        if (!context || !spriteContext || !cols) {
            return;
        }
        context.clearRect(0, 0, cols, ROWS);
        fill(context, "#3A3633", 0, ROWS - 1, cols, 1);
        context.drawImage(frames.toolbox, workX - 12, ROWS - 7);

        // A copper pipe runs in from the right and down into the floor; the joint leaks.
        const top = 5;
        fill(context, "#C8794A", riserX, top, cols - riserX, 4);
        fill(context, "#E8A87C", riserX + 1, top + 1, cols - riserX, 1);
        fill(context, "#8A4B2A", riserX + 4, top + 3, cols - riserX, 1);
        fill(context, "#C8794A", riserX, top, 4, ROWS - 1 - top);
        fill(context, "#E8A87C", riserX + 1, top + 1, 1, ROWS - 2 - top);
        fill(context, "#8A4B2A", riserX + 3, top + 4, 1, ROWS - 5 - top);
        for (let x = riserX + 14; x < cols; x += 22) {
            fill(context, "#8A4B2A", x, top - 1, 2, 6);
        }
        fill(context, "#8A4B2A", riserX - 1, ROWS - 3, 6, 2);
        fill(context, "#B0BEC5", riserX - 1, 10, 6, 3);
        fill(context, "#ECEFF1", riserX, 10, 4, 1);
        fill(context, "#78909C", riserX - 1, 12, 6, 1);

        const puddleWidth = reduced ? 6 : Math.round(puddle * 6) + 2;
        if (reduced || puddle > 0.05) {
            fill(context, "#00ACC1", riserX + 6 - puddleWidth / 2, ROWS - 2, puddleWidth, 1);
            fill(context, "#B2EBF2", riserX + 7 - puddleWidth / 2, ROWS - 2, 1, 1);
        }
        for (const drip of reduced ? [{ x: riserX + 5, y: 14 }, { x: riserX + 5, y: 18 }] : drips) {
            fill(context, "#B2EBF2", drip.x, drip.y, 1, 1);
            fill(context, "#4DD0E1", drip.x, drip.y + 1, 1, 1);
        }
        if (!reduced && !bubbleOpen && plumberX >= workX) {
            if (cycle >= 5600 && cycle < 6400) {
                // "Fixed it!" A twinkle on the joint, just before it starts dripping again.
                const size = Math.floor(cycle / 120) % 2;
                fill(context, "#FFFCE8", riserX + 6, 8 - size, 1, 3 + 2 * size);
                fill(context, "#FFFCE8", riserX + 5 - size, 9, 3 + 2 * size, 1);
            }
            if (cycle >= 1500 && cycle < 2700) {
                // A drop of sweat flies off the back of his head.
                const k = Math.floor((cycle - 1500) / 300);
                fill(context, "#B2EBF2", plumberX + 1 - k, 4 + k, 1, 1);
                fill(context, "#4DD0E1", plumberX + 1 - k, 5 + k, 1, 1);
            }
        }

        const current = pose();
        if (current !== drawnPose) {
            drawnPose = current;
            spriteContext.clearRect(0, 0, 16, 20);
            spriteContext.drawImage(frames[current], 0, 0);
        }
        if (Math.round(plumberX) !== drawnX) {
            drawnX = Math.round(plumberX);
            ui.plumber.style.transform = "translateX(" + drawnX * SCALE + "px)";
        }
    }

    // ---- Speech bubble

    function onPlumberClick() {
        if (!bubbleOpen) {
            openBubble();
        } else if (!hintShown) {
            showHint();
        } else {
            closeBubble(true);
        }
    }

    function openBubble() {
        bubbleOpen = true;
        hintShown = false;
        ui.hint.hidden = true;
        ui.hintButton.hidden = false;
        ui.controller.hidden = !matches("(pointer: coarse)");
        ui.bubble.hidden = false;
        ui.plumber.setAttribute("aria-expanded", "true");
        announce(text.riddle);
        positionBubble();
        render();
    }

    function showHint() {
        hintShown = true;
        ui.hint.hidden = false;
        ui.hintButton.hidden = true;
        announce(HINT_CODE + " " + text.hint);
    }

    /** @param {boolean} returnFocus */
    function closeBubble(returnFocus) {
        if (!bubbleOpen) {
            return;
        }
        const focusInBubble = ui.bubble.contains(ui.root.activeElement);
        bubbleOpen = false;
        ui.bubble.hidden = true;
        ui.plumber.setAttribute("aria-expanded", "false");
        if (returnFocus || focusInBubble) {
            ui.plumber.focus({ preventScroll: true });
        }
        render();
    }

    /** @param {string} message */
    function announce(message) {
        // Emptied first, so screen readers repeat the message when the bubble opens again.
        ui.live.textContent = "";
        setTimeout(() => (ui.live.textContent = message), 60);
    }

    function positionBubble() {
        if (!bubbleOpen) {
            return;
        }
        const center = ui.stage.offsetLeft + (Math.round(plumberX) + 8) * SCALE;
        const width = ui.bubble.offsetWidth;
        const left = Math.max(8, Math.min(ui.host.clientWidth - width - 8, center - width / 2));
        ui.bubble.style.left = left + "px";
        // The tail slants, with its tip in its left column: put the tip over his head.
        ui.tail.style.left = Math.max(8, Math.min(width - 32, center - left - 6)) + "px";
    }

    /** @param {number} progress */
    function showProgress(progress) {
        Array.from(ui.dots ? ui.dots.children : []).forEach((dot, i) => dot.classList.toggle("on", i < progress));
    }

    // ---- The transition to the game

    function startTransition() {
        transitionRunning = true;
        const id = ++transitionId;
        try {
            const link = h("link", { rel: "preconnect", href: new URL(config.target).origin });
            document.head.append(link);
        } catch (error) {
            // Only a speed-up.
        }
        playJingle();
        try {
            runOverlay(id);
        } catch (error) {
            go(id);
        }
    }

    /** @param {number} id */
    function go(id) {
        if (id === transitionId) {
            location.assign(config.target);
        }
    }

    /**
     * @param {number} id
     * @param {() => void} callback
     * @param {number} delay
     */
    function later(id, callback, delay) {
        setTimeout(() => {
            try {
                if (id === transitionId) {
                    callback();
                }
            } catch (error) {
                go(id);
            }
        }, delay);
    }

    function playJingle() {
        try {
            const AudioType = win.AudioContext || win.webkitAudioContext;
            if (!config.sound || !AudioType) {
                return;
            }
            const context = /** @type {AudioContext} */ (new AudioType());
            const output = context.createGain();
            output.gain.value = 0.08;
            output.connect(context.destination);
            const start = context.currentTime + 0.02;
            // An original little "job done" fanfare: frequency (Hz), start and length (s).
            const notes = [[392, 0, 0.08], [523.25, 0.09, 0.08], [659.25, 0.18, 0.08], [783.99, 0.27, 0.16],
                [659.25, 0.45, 0.08], [783.99, 0.54, 0.08], [1046.5, 0.63, 0.36]];
            for (const [frequency, at, length] of notes) {
                const oscillator = context.createOscillator();
                const envelope = context.createGain();
                oscillator.type = "square";
                oscillator.frequency.value = frequency;
                envelope.gain.setValueAtTime(1, start + at);
                envelope.gain.exponentialRampToValueAtTime(0.01, start + at + length);
                oscillator.connect(envelope).connect(output);
                oscillator.start(start + at);
                oscillator.stop(start + at + length + 0.02);
            }
            audio = context;
        } catch (error) {
            // Silence is fine.
        }
    }

    /** @param {number} id */
    function runOverlay(id) {
        const host = h("wefixit-easter-egg-overlay", { "aria-hidden": "true" });
        const root = host.attachShadow({ mode: "open" });
        const canvas = /** @type {HTMLCanvasElement} */ (h("canvas"));
        const context = canvas.getContext("2d");
        adoptStyles(root, OVERLAY_CSS);
        root.append(canvas);
        (document.body || document.documentElement).append(host);
        overlayHost = host;
        if (!context) {
            later(id, () => go(id), 300);
            return;
        }
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        if (matches("(prefers-reduced-motion: reduce)")) {
            host.className = "fade";
            later(id, () => showIntro(id, canvas, context, viewWidth, viewHeight), 300);
            return;
        }

        // Phase 1: chunky blocks turn cyan, then black, closing in like an iris on the plumber.
        const block = Math.max(16, Math.round(Math.min(viewWidth, viewHeight) / 18));
        const across = Math.ceil(viewWidth / block);
        const down = Math.ceil(viewHeight / block);
        sizeCanvas(canvas, across, down, block);
        let centerX = across / 2;
        let centerY = down / 2;
        const box = ui.plumber ? ui.plumber.getBoundingClientRect() : null;
        if (box && box.width && box.bottom > 0 && box.top < viewHeight) {
            centerX = (box.left + box.width / 2) / block;
            centerY = (box.top + box.height / 2) / block;
        }
        const farthest = Math.max(Math.hypot(centerX, centerY), Math.hypot(across - centerX, centerY),
            Math.hypot(centerX, down - centerY), Math.hypot(across - centerX, down - centerY));
        /** @type {number[]} */
        const thresholds = [];
        for (let y = 0; y < down; y++) {
            for (let x = 0; x < across; x++) {
                const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) / farthest;
                // A little ordered jitter makes the edge of the iris look dithered.
                thresholds.push((1 - Math.min(1, distance)) * 0.86 + (((x * 7 + y * 13) % 5) / 5) * 0.06);
            }
        }
        let started = 0;
        /** @param {number} now */
        const step = (now) => {
            if (id !== transitionId) {
                return;
            }
            started = started || now;
            const progress = (now - started) / DISSOLVE_MS;
            thresholds.forEach((threshold, i) => {
                const x = i % across;
                const y = (i - x) / across;
                if (progress >= threshold) {
                    fill(context, progress >= threshold + 0.08 ? "#000" : (x + y) % 2 ? "#00BCD4" : "#0097A7", x, y, 1, 1);
                }
            });
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                showIntro(id, canvas, context, viewWidth, viewHeight);
            }
        };
        requestAnimationFrame(step);
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {number} width
     * @param {number} height
     * @param {number} scale
     */
    function sizeCanvas(canvas, width, height, scale) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width * scale + "px";
        canvas.style.height = height * scale + "px";
    }

    /**
     * Phase 2: a classic level intro card, then off to the game.
     * @param {number} id
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     * @param {number} viewWidth
     * @param {number} viewHeight
     */
    function showIntro(id, canvas, context, viewWidth, viewHeight) {
        const scale = Math.max(3, Math.floor(viewWidth / 140));
        const width = Math.ceil(viewWidth / scale);
        const height = Math.ceil(viewHeight / scale);
        sizeCanvas(canvas, width, height, scale);
        fill(context, "#000", 0, 0, width, height);
        const middle = Math.floor(height / 2);
        const left = Math.floor((width - 39) / 2); // sprite, gap and "x 3"
        drawText(context, "WORLD 1-1", Math.floor((width - 53) / 2), middle - 18);
        context.drawImage(frames.front, left, middle - 6);
        drawText(context, "x 3", left + 22, middle + 2);
        later(id, () => go(id), INTRO_MS);
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {string} message
     * @param {number} left
     * @param {number} top
     */
    function drawText(context, message, left, top) {
        Array.from(message).forEach((character, index) => {
            (FONT[character] || []).forEach((row, y) => {
                Array.from(row).forEach((pixel, x) => {
                    if (pixel === "#") {
                        fill(context, "#FFFCE8", left + index * 6 + x, top + y, 1, 1);
                    }
                });
            });
        });
    }

    /** The back button can restore this page from the bfcache mid-transition: make it usable again. */
    function resetAfterReturn() {
        transitionId++;
        transitionRunning = false;
        recent = [];
        showProgress(0);
        if (overlayHost) {
            overlayHost.remove();
            overlayHost = null;
        }
        if (audio) {
            audio.close().catch(() => {});
            audio = null;
        }
        if (ui.host) {
            closeBubble(false);
        }
    }

    // ---- Start

    function init() {
        try {
            config = readConfig();
            text = STRINGS[config.lang];
            reduced = matches("(prefers-reduced-motion: reduce)");
            frames = {
                walkA: bake(SIDE_HEAD.concat(WALK_A)),
                walkB: bake(SIDE_HEAD.concat(WALK_B)),
                workA: bake(SIDE_HEAD.concat(WORK_A)),
                workB: bake(SIDE_HEAD.concat(WORK_B)),
                front: bake(FRONT_HEAD.concat(FRONT_BODY)),
                shrug: bake(FRONT_HEAD.concat(SHRUG_BODY)),
                toolbox: bake(TOOLBOX),
            };
            const passive = { passive: true, capture: true };
            window.addEventListener("keydown", onKeyDown, true);
            // Passive, and never preventDefault: swipes keep scrolling the page as usual.
            window.addEventListener("touchstart", onTouchStart, passive);
            window.addEventListener("touchend", onTouchEnd, passive);
            window.addEventListener("touchcancel", () => (touchStart = null), passive);
            window.addEventListener("pageshow", (event) => {
                if (event.persisted) {
                    resetAfterReturn();
                }
            });
            buildStrip();
        } catch (error) {
            // An easter egg must never break the site.
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
