# WeFixIt Mario

A private Super Mario Bros. remake, hosted as a hidden easter egg at mario.wefixit.gr. It includes the original 32 levels, a random map generator, a level editor and a set of mods. The page is marked noindex and robots.txt disallows everything, so it stays out of search engines.

## Requirements

Node 22.

## Commands

```
npm install        # install dependencies
npm run dev        # start the dev server with hot reload
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript checks for the game and the tooling
npm run check      # typecheck, lint and format check (see Lint and format)
npm test           # Playwright tests (builds the game, then runs them in Chromium)
```

`npm run build` writes a fully static site to `dist/`. Upload that folder anywhere. Because Vite's `base` is `./`, it works from any folder or subdomain. The build also copies `THIRD_PARTY_NOTICES.md` to `dist/third-party-notices.txt`, which must be deployed with the game.

## Lint and format

```
npm run lint          # Oxlint, no warnings allowed
npm run format        # rewrite all files with Prettier
npm run format:check  # fail if a file is not formatted
npm run check         # typecheck + lint + format:check
```

`npm run check` is what to run before committing. It runs the two TypeScript checks (`npm run typecheck`), then Oxlint with `--deny-warnings`, then `prettier --check .`.

**Why Oxlint and Prettier.** The TypeScript plugin for ESLint (typescript-eslint 8.71) requires `typescript <6.1`, and the TypeScript 7 package has no JavaScript compiler API, so ESLint would need a second TypeScript install next to the one that `npm run typecheck` uses. Oxlint parses TypeScript natively (it is the same Oxc toolchain that Vite 8 uses) and Prettier bundles its own parser, so neither needs one. Both are pinned to exact versions.

**Type-aware rules.** `oxlint-tsgolint` is installed and switched on in `.oxlintrc.json` (`options.typeAware`). It checks the whole project in about a second. Only three type-aware rules are enabled on purpose: `no-floating-promises`, `no-misused-promises` and `await-thenable`.

**Formatting.** `.prettierrc.json` uses 4 spaces, double quotes, semicolons, a print width of 120, no trailing commas and unchanged quoting of object keys (the level files keep their quoted keys). These values were picked by measuring how many existing lines each variant would change. Prettier skips `dist`, `node_modules`, `public` (binary assets), test output, `package-lock.json` and `THIRD_PARTY_NOTICES.md` (legal text that is copied verbatim into the build).

**Rules.** `.oxlintrc.json` turns on the `correctness` and `suspicious` categories, plus `no-loop-func`. These rules are off because they only flag the old engine's idioms and hide no bugs:

- `no-unused-vars` ignores function arguments and caught errors: engine callbacks (event handlers, macros, mod hooks) have fixed signatures that the code documents by naming every argument.
- `typescript/no-this-alias` and `no-shadow`: the engine uses `var self = this` and reuses names such as `thing` in nested callbacks.
- `no-underscore-dangle`, `unicorn/prefer-add-event-listener`, `unicorn/no-new-array`, `unicorn/no-instanceof-builtins` and `unicorn/consistent-function-scoping`: style only.
- `unicorn/no-array-sort` and `unicorn/no-array-reverse`: the target is ES2022, which has no `toSorted`, and the code sorts its own copies on purpose.
- The type-aware cast rules (`no-unsafe-type-assertion`, `no-unnecessary-type-assertion` and similar) would report every `<IThing>x` and `as any` cast, over 800 findings, and are better handled by the `any` clean-up.
- A few noisy type-aware defaults are off: `unbound-method`, `no-redundant-type-constituents`, `no-base-to-string`, `restrict-template-expressions`, `no-useless-default-assignment`, `no-for-in-array` and `no-implied-eval` (the parity tests load the original game with `new Function` on purpose).

A finding that is a real quirk of the original game, where fixing it could change gameplay, is left in place with an inline `oxlint-disable-next-line` comment that says why.

## Project layout

- `index.html`: the page. It only holds the `#game` and `#controls` sections that the game fills in.
- `src/main.ts`: entry point. Loads the settings modules and starts the game.
- `src/styles.css`: page and menu styles.
- `src/engine/`: the general purpose engine modules (rendering, physics, audio, input, maps, UI).
- `src/game/MarioGame.ts`: the game class with all Mario specific behavior.
- `src/game/types.ts`: shared TypeScript interfaces.
- `src/game/settings/`: configuration for each engine module, plus the object, sprite and mod definitions.
- `src/game/settings/maps/`: the 32 level files and the random map.
- `public/`: static files copied as is into `dist/` (sounds, fonts, favicon, robots.txt).
- `tests/`: Playwright tests, including a branding check on the page and the build output.

## Controllers

Game controllers work through the browser's Gamepad API (which needs HTTPS or `localhost`). Plug one in or pair it, then press any button once: browsers keep a controller hidden from a page until then. Any controller can play, several can play at once, and they can be plugged in and out at any time. A controller the browser does not recognise is read as a standard one.

| Control                                               | Does                                  |
| ----------------------------------------------------- | ------------------------------------- |
| D-pad, left stick                                     | Move (down crouches and enters pipes) |
| Bottom and right face buttons (A, B), D-pad up        | Jump, swim and climb                  |
| Left and top face buttons (X, Y), shoulders, triggers | Run and throw fireballs               |
| Start                                                 | Pause and unpause                     |
| Select                                                | Mute                                  |

The stick has a dead zone, so a stick that drifts does not walk by itself. Stick up is deliberately not a control, because a stick is pushed up by accident whenever it swings through a diagonal while running, and that would make Mario jump. Stick down only counts when the stick points nearly straight down, so running down and to the right never crouches.

`src/engine/DeviceLayr.ts` reads the controllers once per game update (from `src/game/settings/runner.js`) and sends the same key events as the keyboard, once per press and once per release. While the game is paused it reads them once per animation frame instead, so Start can unpause. With no controller connected it makes one cheap check every few updates. Letting go of everything happens by itself when a controller is unplugged. The mapping lives in `src/game/settings/devices.ts`. On a touch screen the on-screen buttons hide on the first press of a controller and come back when the screen is touched. `tests/gamepad.spec.ts` plays the game with fake controllers.

## Console cheats

The game is exposed as the global `FSM`. Open the browser console and run `FSM.UsageHelper.displayHelpOptions();` for the full list. Common ones:

```js
FSM.setMap("1-2"); // jump to a level (also "Random")
FSM.addThing("Goomba", 256, 384); // spawn a thing
FSM.playerShroom(FSM.player); // grow Mario
FSM.playerStarUp(FSM.player); // starman power
FSM.player.gravity = FSM.MapScreener.gravity / 2; // half gravity
FSM.ItemsHolder.setItem("lives", 99); // change a stored value
FSM.ItemsHolder.increase("coins", 10);
FSM.ModAttacher.enableMod("Low Gravity");
```

The level editor and the random map generator are not part of the main bundle: each is a separate chunk, downloaded the first time it is used (and precached for offline play like everything else). So `FSM.setMap("Random")` starts the map a moment later the first time, and `FSM.LevelEditor` and `FSM.WorldSeeder` stay undefined until then. To use them from the console right away, load them first: `await FSM.loadLevelEditor()` or `await FSM.loadWorldSeeder()`.

## Saved progress

The game remembers two things on the device, in `localStorage` under the prefix `WeFixItMario`:

- `WeFixItMariotopScore`: the best score ever reached (shown on the 1-1 title card as `TOP- 012345`, and saved the moment the score passes it).
- `WeFixItMariolastLevel`: the last level from 1-2 to 8-4 that was started (1-1, where every game starts, and the random map are not saved).

When the game starts, or starts again after a game over, and the saved level is not 1-1, the title card also reads `CONTINUE 4-2: PRESS DOWN` (`TAP DOWN` on touch devices). Pressing down starts that level as a fresh game with 3 lives and no score. The offer ends as soon as the player moves or jumps, or leaves 1-1, but the saved level is kept, so it is offered again next time. Everywhere else, down works as before.

To start over, press `Reset Progress` in the Options menu, or run `FSM.resetProgress();` in the console. Values that are missing, invalid or unreadable are ignored, and the game plays normally when `localStorage` is blocked or full (progress then lasts until the page is closed).

## Sound memory

Sounds play through the Web Audio API, which keeps them decoded as raw samples: about 0.34 MB per second of stereo, 86 MB for the whole library. To stay well clear of the limits of phone browsers (iOS closes heavy tabs), only the sounds that must start instantly are decoded at boot and kept: the sound effects, the hurry and death jingles and the Star theme, about 10 MB (`preload` in `src/game/settings/audio.js`). The level themes and the long jingles are decoded when played and then kept only while they fit in a budget of about 14 MB (`cacheSeconds`), least recently played first out. Their downloaded files are kept, so decoding one again needs no network. At most about 24 MB is decoded at any time. A new level's theme can start a fraction of a second late on a slow phone while it is decoded.

## Install and offline

The game is a small installable web app. In Chrome, Edge or Android, use the browser's "Install app" option (or "Add to Home screen"); on iPhone use Share, then "Add to Home Screen". It opens fullscreen in landscape with its own icon.

After the first visit the whole game, sounds included, is saved on the device by a service worker (`sw.js`, generated at build time by `vite.config.ts`), so it also plays with no connection. Every deploy gets a new cache name: the next visit loads the saved copy, picks up the new version in the background, and uses it from the visit after that. Nothing needs to be done by hand. The icons in `public/icons/` are drawn from the game's own sprites.

## Deployment

The site is plain static files, so any static host works. For mario.wefixit.gr, upload the contents of `dist/` and check the following.

- **HTTPS is required.** Browsers only run service workers, and only offer to install the app, on secure origins (`localhost` is the one exception). Without HTTPS the game still plays online, but there is no offline copy and no install.
- **Cache headers.** Send `Cache-Control: no-cache` for `sw.js`, `index.html` and `manifest.webmanifest`, so a new deploy is seen on the next visit. Send `Cache-Control: public, max-age=31536000, immutable` for everything under `assets/`, because those file names contain a content hash and never change. Do not add `Vary: Origin` to `assets/`: the level editor and map generator chunks are fetched once to check the download and then imported, and `Vary: Origin` makes the browser download them twice (it still works, just slower).
- **MIME types.** Serve `.webmanifest` as `application/manifest+json` and `.mp3` as `audio/mpeg`. The sounds must also support HTTP Range requests (`Accept-Ranges: bytes`), which Safari needs for audio. Most hosts do both by default. The service worker answers Range requests itself once the game is cached.
- **Content-Security-Policy.** None is required. If the host sets one, use the policy from `tests/review/quality-csp.spec.ts`, which the game is tested under: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'`. It needs no `'unsafe-eval'`. The `style-src 'unsafe-inline'` part is required, because the game injects its own `<style>` element at startup.
- **Subfolders.** Every URL in the build is relative and the service worker works out its scope from where it is served, so the site also works from a subfolder, not only from the root of a domain.

## Credits and license

This is proprietary software, see `LICENSE`. It is based on FullScreenMario by Josh Goldberg and contributors, which is released under the MIT License. The required notices are in `THIRD_PARTY_NOTICES.md`. Mario, Super Mario Bros. and all related characters, graphics and music belong to Nintendo.
