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
npm test           # Playwright tests (builds the game, then runs them in Chromium)
```

`npm run build` writes a fully static site to `dist/`. Upload that folder anywhere. Because Vite's `base` is `./`, it works from any folder or subdomain. The build also copies `THIRD_PARTY_NOTICES.md` to `dist/third-party-notices.txt`, which must be deployed with the game.

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

## Console cheats

The game is exposed as the global `FSM`. Open the browser console and run `FSM.UsageHelper.displayHelpOptions();` for the full list. Common ones:

```js
FSM.setMap("1-2");                     // jump to a level (also "Random")
FSM.addThing("Goomba", 256, 384);      // spawn a thing
FSM.playerShroom(FSM.player);          // grow Mario
FSM.playerStarUp(FSM.player);          // starman power
FSM.player.gravity = FSM.MapScreener.gravity / 2;  // half gravity
FSM.ItemsHolder.setItem("lives", 99);  // change a stored value
FSM.ItemsHolder.increase("coins", 10);
FSM.ModAttacher.enableMod("Low Gravity");
```

## Credits and license

This is proprietary software, see `LICENSE`. It is based on FullScreenMario by Josh Goldberg and contributors, which is released under the MIT License. The required notices are in `THIRD_PARTY_NOTICES.md`. Mario, Super Mario Bros. and all related characters, graphics and music belong to Nintendo.
