import * as MarioGame from "../MarioGame";

MarioGame.MarioGame.settings.runner = {
    "games": [
        function () {
            this.DeviceLayer.checkNavigatorGamepads();
            this.DeviceLayer.activateAllGamepadTriggers();
        },
        function () {
            this.QuadsKeeper.determineAllQuadrants("Scenery", this.GroupHolder.getSceneryGroup());
            this.QuadsKeeper.determineAllQuadrants("Text", this.GroupHolder.getTextGroup());
        },
        function () {
            this.maintainSolids(this, this.GroupHolder.getSolidGroup());
        },
        function () {
            this.maintainCharacters(this, this.GroupHolder.getCharacterGroup());
        },
        function () {
            this.maintainPlayer(this, this.player);
        },
        function () {
            this.TimeHandler.handleEvents();
        }
    ],
    // Drawing only reads game state, so it runs once per displayed frame (after
    // however many of the logic updates above that frame was owed) instead of
    // once per update. See GamesRunnr.
    "renderers": [
        function () {
            this.PixelDrawer.refillGlobalCanvas(this.AreaSpawner.getArea().background);
        }
    ]
};
