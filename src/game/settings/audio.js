import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.audio = {
    "directory": "Sounds",
    "fileTypes": ["mp3"],
    "library": {
        "Sounds": [
            "Bowser Falls",
            "Bowser Fires",
            "Break Block",
            "Bump",
            "Coin",
            "Ending",
            "Fail",
            "Fireball",
            "Firework",
            "Flagpole",
            "Gain Life",
            "Game Over 2",
            "Game Over",
            "Hurry",
            "Jump Small",
            "Jump Super",
            "Kick",
            "Level Complete",
            "Player Dies",
            "Pause",
            "Pipe",
            "Power Down",
            "Powerup Appears",
            "Powerup",
            "Stage Clear",
            "Vine Emerging",
            "World Clear",
            "You Dead"
        ],
        "Themes": [
            "Castle",
            "Overworld",
            "Underwater",
            "Underworld",
            "Star",
            "Sky",
            "Hurry Castle",
            "Hurry Overworld",
            "Hurry Underwater",
            "Hurry Underworld",
            "Hurry Star",
            "Hurry Sky"
        ]
    },
    // Decoded audio is big (a second of stereo takes about 0.34 MB), and keeping all of it took
    // about 86 MB, too much for phones. So only what must start the moment it is played is decoded
    // at boot and kept: the sound effects, the hurry and death jingles, and the Star theme (it starts
    // as soon as Mario grabs a star). That is about 10 MB.
    "preload": [
        "Jump Small",
        "Jump Super",
        "Coin",
        "Bump",
        "Kick",
        "Break Block",
        "Powerup Appears",
        "Powerup",
        "Power Down",
        "Fireball",
        "Pipe",
        "Player Dies",
        "Gain Life",
        "Vine Emerging",
        "Flagpole",
        "Hurry",
        "Pause",
        "Bowser Fires",
        "Bowser Falls",
        "Fail",
        "Firework",
        "Star"
    ],
    // The level themes and the long jingles are decoded when played. This much of them (in seconds
    // of stereo, about 14 MB) stays decoded: the longest theme fits, so the level theme is still
    // there after a star or a death, while the previous one makes room for the next level's.
    "cacheSeconds": 42
};
