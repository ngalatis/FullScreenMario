import * as MarioGame from "../MarioGame";

/**
 * On-screen controls for touch devices: a D-pad on the left, and jump (A) and
 * run/fireball (B) on the right, with a small Start (pause) button in the middle.
 *
 * Their size, position, and translucency live in styles.css, keyed by each
 * control's name (data-touch-control="..."), so they can use safe-area insets and
 * container-relative units. This file only says what they are and what they press.
 *
 * They are on by default on devices whose primary pointer is coarse (phones and
 * tablets). Everywhere else they are off until the user turns on the "Touch
 * Controls" option (see ui.ts), which also remembers an explicit choice.
 */
MarioGame.MarioGame.settings.touch = {
    "enabled":
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches,
    "styles": {},
    "controls": [
        {
            "name": "DPad",
            "control": "DPad",
            "position": {
                "vertical": "bottom",
                "horizontal": "left",
                "offset": {}
            },
            "directions": [
                {
                    "name": "Up"
                },
                {
                    "name": "Right",
                    "pipes": {
                        "activated": {
                            "onkeydown": ["right"]
                        },
                        "deactivated": {
                            "onkeyup": ["right"]
                        }
                    }
                },
                {
                    "name": "Down",
                    "pipes": {
                        "activated": {
                            "onkeydown": ["down"]
                        },
                        "deactivated": {
                            "onkeyup": ["down"]
                        }
                    }
                },
                {
                    "name": "Left",
                    "pipes": {
                        "activated": {
                            "onkeydown": ["left"]
                        },
                        "deactivated": {
                            "onkeyup": ["left"]
                        }
                    }
                }
            ]
        },
        {
            "name": "A",
            "control": "Button",
            "label": "A",
            "position": {
                "vertical": "bottom",
                "horizontal": "right",
                "offset": {}
            },
            "pipes": {
                "activated": {
                    "onkeydown": ["up"]
                },
                "deactivated": {
                    "onkeyup": ["up"]
                }
            }
        },
        {
            "name": "B",
            "control": "Button",
            "label": "B",
            "position": {
                "vertical": "bottom",
                "horizontal": "right",
                "offset": {}
            },
            "pipes": {
                "activated": {
                    "onkeydown": ["sprint"]
                },
                "deactivated": {
                    "onkeyup": ["sprint"]
                }
            }
        },
        {
            "name": "Start",
            "control": "Button",
            "label": "Start",
            "position": {
                "vertical": "bottom",
                "horizontal": "center",
                "offset": {}
            },
            "pipes": {
                "activated": {
                    "onmousedown": ["rightclick"]
                }
            }
        }
    ]
};
