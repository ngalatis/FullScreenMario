/**
 * Cutscenes that may be played, keyed by name.
 */
export interface ICutscenes {
    [i: string]: ICutscene;
}

/**
 * A cutscene, which is a collection of routines.
 */
export interface ICutscene {
    /**
     * The routines available to the cutscene, keyed by name.
     */
    routines: IRoutines;

    /**
     * An optional routine name to play immediately upon starting the cutscene.
     */
    firstRoutine?: string;
}

/**
 * Routines available to a cutscene, keyed by name.
 */
export interface IRoutines {
    [i: string]: IRoutine;
}

/**
 * A routine that may be played within a cutscene.
 *
 * @param settings   Persistent settings from the parent cutscene.
 * @param args   Any other arguments passed via through playRoutine or bindRoutine.
 */
export interface IRoutine {
    (settings: ICutsceneSettings, ...args: any[]): void;
}

/**
 * Persistent settings kept throughout a cutscene.
 */
export interface ICutsceneSettings {
    /**
     * A reference to the parent cutscene.
     */
    cutscene: ICutscene;

    /**
     * The name of the parent cutscene.
     */
    cutsceneName: string;

    /**
     * The currently playing routine.
     */
    routine: IRoutine;

    /**
     * THe name of the current playing routine.
     */
    routineName: string;

    /**
     * Arguments passed to the currents playing routines.
     */
    routineArguments: any[];

    /**
     * Any other settings the cutscene was started with.
     */
    [i: string]: any;
}

/**
 * Settings to initialize a new IScenePlayr.
 */
export interface IScenePlayrSettings {
    /**
     * Cutscenes that may be played, keyed by names.
     */
    cutscenes?: ICutscenes;

    /**
     * Arguments to pass to each routine within the cutscenes.
     */
    cutsceneArguments?: any[];
}

/**
 * A cutscene runner for jumping between scenes and their routines.
 */
export interface IScenePlayr {
    /**
     * @returns The complete listing of cutscenes that may be played.
     */
    getCutscenes(): ICutscenes;

    /**
     * @returns The currently playing cutscene.
     */
    getCutscene(): ICutscene | undefined;

    /**
     * @returns The cutscene referred to by the given name.
     */
    getOtherCutscene(name: string): ICutscene;

    /**
     * @returns The currently playing routine.
     */
    getRoutine(): IRoutine | undefined;

    /**
     * @param name   The name of a routine to return.
     * @returns The routine within the current cutscene referred to
     *          by the given name.
     */
    getOtherRoutine(name: string): IRoutine;

    /**
     * @returns The name of the currently playing cutscene.
     */
    getCutsceneName(): string | undefined;

    /**
     * @returns The settings used by the current cutscene.
     */
    getCutsceneSettings(): any;

    /**
     * Adds a setting to the internal cutscene settings.
     *
     * @param key   The key for the new setting.
     * @param value   The value for the new setting.
     */
    addCutsceneSetting(key: string, value: any): void;

    /**
     * Starts the cutscene of the given name, keeping the settings Object (if
     * given one). The cutsceneArguments unshift the settings, and if the
     * cutscene specifies a firstRoutine, it's started.
     *
     * @param name   The name of the cutscene to play.
     * @param [settings]   Additional settings to be kept persistently
     *                     throughout the cutscene.
     */
    startCutscene(name: string, settings?: any): void;

    /**
     * Returns this.startCutscene bound to the given name and settings.
     *
     * @param name   The name of the cutscene to play.
     * @param args   Additional settings to be kept as a persistent
     *               Array throughout the cutscene.
     */
    bindCutscene(name: string, settings?: any): () => void;

    /**
     * Stops the currently playing cutscene and clears the internal data.
     */
    stopCutscene(): void;

    /**
     * Plays a particular routine within the current cutscene, passing
     * the given args as cutsceneSettings.routineArguments.
     *
     * @param name   The name of the routine to play.
     * @param args   Any additional arguments to pass to the routine.
     */
    playRoutine(name: string, ...args: any[]): void;

    /**
     * Returns this.startCutscene bound to the given name and arguments.
     *
     * @param name   The name of the cutscene to play.
     * @param args   Any additional arguments to pass to the routine.
     */
    bindRoutine(name: string, ...args: any[]): () => void;
}

/**
 * A cutscene runner for jumping between scenes and their routines.
 */
export class ScenePlayr implements IScenePlayr {
    /**
     * The complete listing of cutscenes that may be played, keyed by name.
     */
    private cutscenes: ICutscenes;

    /**
     * The currently playing cutscene.
     */
    private cutscene: ICutscene | undefined;

    /**
     * The currently playing routine within the current cutscene.
     */
    private routine: IRoutine | undefined;

    /**
     * The name of the current cutscene.
     */
    private cutsceneName: string | undefined;

    /**
     * Persistent settings for the current cutscene, passed to each routine.
     */
    private cutsceneSettings: ICutsceneSettings | undefined;

    /**
     * Any additional arguments to pass to routines.
     */
    private cutsceneArguments: any[];

    /**
     * Initializes a new instance of the ScenePlayr class.
     *
     * @param [settings]   Settings to be used for initialization.
     */
    constructor(settings: IScenePlayrSettings = {}) {
        this.cutscenes = settings.cutscenes || {};
        this.cutsceneArguments = settings.cutsceneArguments || [];
    }

    /* Simple gets
     */

    /**
     * @returns The complete listing of cutscenes that may be played.
     */
    getCutscenes(): ICutscenes {
        return this.cutscenes;
    }

    /**
     * @returns The currently playing cutscene.
     */
    getCutscene(): ICutscene | undefined {
        return this.cutscene;
    }

    /**
     * @returns The cutscene referred to by the given name.
     */
    getOtherCutscene(name: string): ICutscene {
        return this.cutscenes[name];
    }

    /**
     * @returns The currently playing routine.
     */
    getRoutine(): IRoutine | undefined {
        return this.routine;
    }

    /**
     * @param name   The name of a routine to return.
     * @returns The routine within the current cutscene referred to
     *          by the given name.
     */
    getOtherRoutine(name: string): IRoutine {
        if (!this.cutscene) {
            throw new Error("No cutscene is currently playing.");
        }

        return this.cutscene.routines[name];
    }

    /**
     * @returns The name of the currently playing cutscene.
     */
    getCutsceneName(): string | undefined {
        return this.cutsceneName;
    }

    /**
     * @returns The settings used by the current cutscene.
     */
    getCutsceneSettings(): ICutsceneSettings | undefined {
        return this.cutsceneSettings;
    }

    /**
     * Adds a setting to the internal cutscene settings.
     *
     * @param key   The key for the new setting.
     * @param value   The value for the new setting.
     */
    addCutsceneSetting(key: string, value: any): void {
        if (!this.cutsceneSettings) {
            throw new Error("No cutscene is currently playing.");
        }

        this.cutsceneSettings[key] = value;
    }

    /* Playback
     */

    /**
     * Starts the cutscene of the given name, keeping the settings Object (if
     * given one). The cutsceneArguments unshift the settings, and if the
     * cutscene specifies a firstRoutine, it's started.
     *
     * @param name   The name of the cutscene to play.
     * @param [settings]   Additional settings to be kept persistently
     *                     throughout the cutscene.
     */
    startCutscene(name: string, settings: any = {}, args?: any): void {
        if (!name) {
            throw new Error("No name given to ScenePlayr.playScene.");
        }

        if (this.cutsceneName) {
            this.stopCutscene();
        }

        this.cutscene = this.cutscenes[name];
        this.cutsceneName = name;

        const cutsceneSettings: ICutsceneSettings = settings || {};
        this.cutsceneSettings = cutsceneSettings;

        cutsceneSettings.cutscene = this.cutscene;
        cutsceneSettings.cutsceneName = name;

        this.cutsceneArguments.push(cutsceneSettings);

        if (this.cutscene.firstRoutine) {
            this.playRoutine(this.cutscene.firstRoutine, ...(args === undefined ? [] : ([] as any[]).concat(args)));
        }
    }

    /**
     * Returns this.startCutscene bound to the given name and settings.
     *
     * @param name   The name of the cutscene to play.
     * @param settings   Additional settings to be kept as a persistent Object
     *                   throughout the cutscene.
     * @param args   Arguments for the firstRoutine, if it exists.
     */
    bindCutscene(name: string, settings: any = {}, args?: any): () => void {
        return this.startCutscene.bind(this, name, args);
    }

    /**
     * Stops the currently playing cutscene and clears the internal data.
     */
    stopCutscene(): void {
        this.routine = undefined;
        this.cutscene = undefined;
        this.cutsceneName = undefined;
        this.cutsceneSettings = undefined;
        this.cutsceneArguments.pop();
    }

    /**
     * Plays a particular routine within the current cutscene, passing
     * the given args as cutsceneSettings.routineArguments.
     *
     * @param name   The name of the routine to play.
     * @param args   Any additional arguments to pass to the routine.
     */
    playRoutine(name: string, ...args: any[]): void {
        if (!this.cutscene) {
            throw new Error("No cutscene is currently playing.");
        }

        if (!this.cutscene.routines[name]) {
            throw new Error("The " + this.cutsceneName + " cutscene does not contain a " + name + " routine.");
        }

        // Copy the given ...args to a new Array from this.cutsceneArguments
        // This is better than args.unshift to not modify args, if they're given directly
        var routineArgs: any[] = this.cutsceneArguments.slice();
        routineArgs.push(...args);

        this.routine = this.cutscene.routines[name];

        const cutsceneSettings: ICutsceneSettings = <ICutsceneSettings>this.cutsceneSettings;
        cutsceneSettings.routine = this.routine;
        cutsceneSettings.routineName = name;
        cutsceneSettings.routineArguments = args;

        (<(...routineArguments: any[]) => void>this.routine).apply(this, routineArgs);
    }

    /**
     * Returns this.startCutscene bound to the given name and arguments.
     *
     * @param name   The name of the cutscene to play.
     * @param args   Any additional arguments to pass to the routine.
     */
    bindRoutine(name: string, ...args: any[]): () => void {
        return this.playRoutine.bind(this, name, ...args);
    }
}
