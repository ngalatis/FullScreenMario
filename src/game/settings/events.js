import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.events = {
    "keyOnClassCycleStart": "onThingAdd",
    "keyDoClassCycleStart": "placed",
    "keyCycleCheckValidity": "alive",
    "timingDefault": 9
};
