import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.scenes = {
    "cutscenes": {
        "Flagpole": {
            "firstRoutine": "StartSlidingDown",
            "routines": {
                "StartSlidingDown": MarioGame.MarioGame.prototype.cutsceneFlagpoleStartSlidingDown,
                "HitBottom": MarioGame.MarioGame.prototype.cutsceneFlagpoleHitBottom,
                "Countdown": MarioGame.MarioGame.prototype.cutsceneFlagpoleCountdown,
                "Fireworks": MarioGame.MarioGame.prototype.cutsceneFlagpoleFireworks
            }
        },
        "BowserVictory": {
            "firstRoutine": "CollideCastleAxe",
            "routines": {
                "CollideCastleAxe": MarioGame.MarioGame.prototype.cutsceneBowserVictoryCollideCastleAxe,
                "CastleBridgeOpen": MarioGame.MarioGame.prototype.cutsceneBowserVictoryCastleBridgeOpen,
                "BowserFalls": MarioGame.MarioGame.prototype.cutsceneBowserVictoryBowserFalls,
                "Dialog": MarioGame.MarioGame.prototype.cutsceneBowserVictoryDialog
            }
        }
    }
};
