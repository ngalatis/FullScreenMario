import { MarioGame } from "../MarioGame";
import type { IMarioGame } from "../types";
import * as ModAttachr from "../../engine/ModAttachr";
import * as UserWrappr from "../../engine/UserWrappr";

/**
 * @returns Whether the primary pointer is coarse, as on a phone or tablet.
 */
function hasCoarsePointer(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

MarioGame.settings.ui = {
    "globalName": "FSM",
    // Touch devices play at the game's native height and have the canvas scaled to fit the screen.
    "coarseHeight": 464,
    "styleSheet": {
        ".MarioGame": {
            "color": "white"
        },
        "@font-face": {
            "font-family": "'Press Start'",
            "src": [
                "url('Fonts/pressstart2p-webfont.eot')",
                "url('Fonts/pressstart2p-webfont.eot?#iefix') format('embedded-opentype')",
                "url('Fonts/pressstart2p-webfont.woff') format('woff')",
                "url('Fonts/pressstart2p-webfont.ttf') format('truetype')",
                "url('Fonts/pressstart2p-webfont.svg') format('svg')"
            ].join(", "),
            "font-weight": "normal",
            "font-style": "normal"
        }
    },
    "sizeDefault": "Wide",
    "sizes": {
        "NES": {
            "width": 512,
            "height": 464,
            "full": false
        },
        "Wide": {
            "width": Infinity,
            "height": 464,
            "full": false
        },
        "Large": {
            "width": Infinity,
            "height": Infinity,
            "full": false
        }
    },
    "schemas": [
        {
            "title": "Options",
            "generator": "OptionsTable",
            "options": [
                {
                    "title": "Volume",
                    "type": "Number",
                    "minimum": 0,
                    "maximum": 100,
                    "source": (FSM: IMarioGame): number => {
                        return Math.round(FSM.AudioPlayer.getVolume() * 100);
                    },
                    "update": (FSM: IMarioGame, value: number): void => {
                        FSM.AudioPlayer.setVolume(value / 100);
                    }
                },
                {
                    "title": "Mute",
                    "type": "Boolean",
                    "source": (FSM: IMarioGame): boolean => {
                        return FSM.AudioPlayer.getMuted();
                    },
                    "enable": (FSM: IMarioGame): void => {
                        FSM.AudioPlayer.setMutedOn();
                    },
                    "disable": (FSM: IMarioGame): void => {
                        FSM.AudioPlayer.setMutedOff();
                    }
                },
                {
                    "title": "Speed",
                    "type": "Select",
                    "options": (FSM: IMarioGame): string[] => {
                        return [".25x", ".5x", "1x", "2x", "5x"];
                    },
                    "source": (FSM: IMarioGame): string => {
                        return "1x";
                    },
                    "update": (FSM: IMarioGame, value: string): void => {
                        FSM.GamesRunner.setSpeed(Number(value.replace("x", "")));
                    },
                    "storeLocally": true
                },
                {
                    "title": "View Mode",
                    "type": "ScreenSize"
                },
                {
                    "title": "Framerate",
                    "type": "Select",
                    "options": (FSM: IMarioGame): string[] => {
                        return ["60fps", "30fps"];
                    },
                    "source": (FSM: IMarioGame): string => {
                        return (1 / FSM.PixelDrawer.getFramerateSkip()) * 60 + "fps";
                    },
                    "update": (FSM: IMarioGame, value: string): void => {
                        FSM.PixelDrawer.setFramerateSkip((1 / Number(value.replace("fps", ""))) * 60);
                    },
                    "storeLocally": true
                },
                {
                    "title": "Touch Controls",
                    "type": "Boolean",
                    "storeLocally": true,
                    // On by default on touch devices, off elsewhere; a choice the player
                    // has made (stored locally) always wins over this default.
                    "source": (FSM: IMarioGame): boolean => hasCoarsePointer(),
                    "enable": (FSM: IMarioGame): void => {
                        setTimeout((): void => FSM.TouchPasser.enable());
                    },
                    "disable": (FSM: IMarioGame): void => {
                        setTimeout((): void => FSM.TouchPasser.disable());
                    }
                },
                {
                    "title": "Tilt Controls",
                    "type": "Boolean",
                    "storeLocally": true,
                    "source": (FSM: IMarioGame): boolean => false,
                    "enable": (FSM: IMarioGame): void => {
                        window.ondevicemotion = <any>FSM.InputWriter.makePipe("ondevicemotion", "type");
                    },
                    "disable": (FSM: IMarioGame): void => {
                        window.ondevicemotion = null;
                    }
                }
            ],
            "actions": [
                {
                    "title": "Screenshot",
                    "action": (FSM: IMarioGame): void => {
                        FSM.takeScreenshot("Super Mario Bros " + new Date().getTime());
                    }
                }
            ]
        },
        {
            "title": "Controls",
            "generator": "OptionsTable",
            "options": ((controls: string[]): UserWrappr.UISchemas.IOptionsButtonSchema[] => {
                return controls.map((title: string): UserWrappr.UISchemas.IOptionsButtonSchema => {
                    return {
                        "title": title[0].toUpperCase() + title.substr(1),
                        "type": "Keys",
                        "storeLocally": true,
                        "source": (FSM: UserWrappr.IGameStartr): string[] => {
                            return FSM.InputWriter.getAliasAsKeyStrings(title).map((string: string) =>
                                string.toLowerCase()
                            );
                        },
                        "callback": (FSM: UserWrappr.IGameStartr, valueOld: any, valueNew: any): void => {
                            FSM.InputWriter.switchAliasValues(
                                title,
                                [FSM.InputWriter.convertKeyStringToAlias(valueOld)],
                                [FSM.InputWriter.convertKeyStringToAlias(valueNew)]
                            );
                        }
                    };
                });
            })(["left", "right", "up", "down", "sprint", "pause"])
        },
        {
            "title": "Mods!",
            "generator": "OptionsButtons",
            "keyActive": "enabled",
            "assumeInactive": true,
            "options": (FSM: IMarioGame): UserWrappr.UISchemas.IOptionsButtonSchema[] => {
                var mods: ModAttachr.IModAttachrMods = FSM.ModAttacher.getMods(),
                    output: UserWrappr.UISchemas.IOptionsButtonSchema[] = [],
                    mod: ModAttachr.IModAttachrMod,
                    i: string;

                for (i in mods) {
                    if (!mods.hasOwnProperty(i)) {
                        continue;
                    }

                    mod = mods[i];

                    output.push({
                        "title": mod.name,
                        "source": (): boolean | undefined => mod.enabled,
                        "storeLocally": true,
                        "type": "text"
                    });
                }

                return output;
            },
            "callback": (FSM: IMarioGame, schema: UserWrappr.UISchemas.ISchema, button: HTMLElement): void => {
                var name: string = button.textContent,
                    key: string | null = button.getAttribute("localStorageKey"),
                    mod: ModAttachr.IModAttachrMod = FSM.ModAttacher.getMod(name);

                FSM.ModAttacher.toggleMod(name);

                if (key !== null) {
                    FSM.ItemsHolder.setItem(key, mod.enabled);
                    FSM.ItemsHolder.saveItem(key);
                }
            }
        },
        {
            "title": "Editor",
            "generator": "LevelEditor",
            "maps": {
                "rangeX": [1, 4],
                "rangeY": [1, 8],
                "callback": (FSM: IMarioGame, schema: UserWrappr.UISchemas.ISchema, button: HTMLElement): void => {
                    FSM.LevelEditor.enable();
                    FSM.LevelEditor.setCurrentJSON(JSON.stringify(FSM.MapsCreator.getMapRaw(button.textContent)));
                    FSM.LevelEditor.startBuilding();
                }
            }
        },
        {
            "title": "Maps",
            "generator": "MapsGrid",
            "rangeX": [1, 4],
            "rangeY": [1, 8],
            "extras": [
                ((): UserWrappr.UISchemas.IOptionsMapGridExtra => {
                    function getNewSeed(): string {
                        return (
                            new Date()
                                .getTime()
                                .toString()
                                .split("")
                                // Same function used in browserchoice.eu :)
                                .sort((): number => 0.5 - Math.random())
                                .reverse()
                                .join("")
                        );
                    }

                    return {
                        "title": "Map Generator!",
                        "callback": (
                            GameStarter: UserWrappr.IGameStartr,
                            schema: UserWrappr.UISchemas.ISchema,
                            button: HTMLElement,
                            event: Event
                        ): void => {
                            var FSM: IMarioGame = <IMarioGame>GameStarter,
                                parent: HTMLElement | null = (<HTMLElement>event.target).parentElement;

                            if (parent === null) {
                                return;
                            }

                            var randomizer: HTMLInputElement = <HTMLInputElement>parent.querySelector(".randomInput");

                            randomizer.value = randomizer.value.replace(/[^\d]/g, "");
                            if (!randomizer.value) {
                                randomizer.value = getNewSeed();
                            }

                            FSM.LevelEditor.disable();
                            FSM.NumberMaker.resetFromSeed(Number(randomizer.value));
                            FSM.setMap("Random");

                            if (!randomizer.getAttribute("custom")) {
                                randomizer.value = getNewSeed();
                            }
                        },
                        "extraElements": [
                            {
                                "tag": "input",
                                "options": {
                                    "className": "randomInput maps-grid-input",
                                    "type": "text",
                                    "value": getNewSeed(),
                                    "onchange": (event: UserWrappr.IEvent): void => {
                                        event.target.setAttribute("custom", "true");
                                    }
                                }
                            }
                        ]
                    };
                })()
            ],
            "callback": (FSM: IMarioGame, schema: UserWrappr.UISchemas.ISchema, button: HTMLElement): void => {
                FSM.LevelEditor.disable();
                FSM.setMap(button.getAttribute("value") || button.textContent);
            }
        }
    ]
};
