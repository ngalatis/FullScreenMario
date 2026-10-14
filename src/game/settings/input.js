import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.input = {
    "InputWritrArgs": {
        "aliases": {
            // Keyboard aliases
            "left": [65, 37], // a,     left
            "right": [68, 39], // d,     right
            "up": [87, 38, 32], // w,     up,    space
            "down": [83, 40], // s,     down
            "sprint": [16, 17], // shift, ctrl
            "pause": [80], // p (pause)
            "mute": [77], // m (mute)
            // Mouse aliases
            "rightclick": [3]
        },
        "triggers": {
            "onkeydown": {
                "left": MarioGame.MarioGame.prototype.keyDownLeft,
                "right": MarioGame.MarioGame.prototype.keyDownRight,
                "up": MarioGame.MarioGame.prototype.keyDownUp,
                "down": MarioGame.MarioGame.prototype.keyDownDown,
                "sprint": MarioGame.MarioGame.prototype.keyDownSprint,
                "pause": MarioGame.MarioGame.prototype.keyDownPause,
                "mute": MarioGame.MarioGame.prototype.keyDownMute
            },
            "onkeyup": {
                "left": MarioGame.MarioGame.prototype.keyUpLeft,
                "right": MarioGame.MarioGame.prototype.keyUpRight,
                "up": MarioGame.MarioGame.prototype.keyUpUp,
                "down": MarioGame.MarioGame.prototype.keyUpDown,
                "sprint": MarioGame.MarioGame.prototype.keyUpSprint,
                "pause": MarioGame.MarioGame.prototype.keyUpPause
            },
            "onmousedown": {
                "rightclick": MarioGame.MarioGame.prototype.mouseDownRight
            },
            "oncontextmenu": {},
            "ondevicemotion": {
                "devicemotion": MarioGame.MarioGame.prototype.deviceMotion
            }
        }
    }
};
