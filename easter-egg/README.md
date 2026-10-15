# WeFixIt footer easter egg

A hidden way from wefixit.gr to the game at <https://mario.wefixit.gr/>.

- **The plumber.** An original 8-bit WeFixIt handyman (cyan cap and overalls, wrench, mustache)
  walks into a small strip at the bottom of the footer when it scrolls into view, and gets to work
  on a leaky copper pipe: wrench turns, drips, a sweat drop, a moment of "fixed it!", then a shrug
  when it starts dripping again.
- **The riddle.** He is a real button. Click or tap him and he turns around with a speech bubble:
  _"Psst! Are you old enough to remember the Konami code? Enter it anywhere on this site."_
  Clicking again (or "Hint?") gives away the code. On touch screens the bubble also has a little
  controller to enter it with. Escape, the close button or a click outside closes the bubble.
- **The code works on every page**, with or without the plumber: ↑ ↑ ↓ ↓ ← → ← → B A on a
  keyboard, always. B and A are also recognised by their position on the keyboard, so the code
  works with the Greek layout active too. Keys typed into form fields, and keys held with Ctrl, Alt
  or Cmd, never count.
- **Swipes only after the riddle.** On a touch screen the controller in the bubble is the way in.
  Swiping up, up, down, down, left, right, left, right and tapping twice anywhere on the page also
  works, but only once the visitor has opened the riddle, so ordinary scrolling and double-tap zoom
  can never take anyone to the game by accident. Opening the riddle arms the swipes for the rest of
  the browsing session (remembered in `sessionStorage`), on every page of the site; where storage
  is blocked, on the current page only.
- **The transition.** The page dissolves into chunky pixel blocks that close in on the plumber,
  a black "WORLD 1-1" card shows him with "x 3" (and a short, quiet chiptune plays), then the
  browser goes to the game. With "reduce motion" turned on, he stands still and the page simply
  fades. Escape during the transition cancels it. If the game does not open (the visitor stops
  the navigation, the game's host is slow or down), the page comes back by itself after about 5
  seconds, and coming back with the back button leaves the site usable again too.

Greek pages (`<html lang="el">`, the `/el` paths) get the Greek texts.

Everything is in one dependency-free file, `wefixit-easter-egg.js`: no frameworks, no images, no
fonts, no network requests. Sprites are drawn from small pixel matrices in the code, its markup and
styles live in Shadow DOM so the theme's CSS cannot leak in or out, and it only animates while the
footer is on screen and the tab is visible.

## Files

| File                          | What it is                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `wefixit-easter-egg.js`       | The script to add to the site. Plain JavaScript, type-checked through JSDoc. |
| `demo.html`                   | A page with the same footer structure as wefixit.gr, to try it locally.      |
| `../tests/easter-egg.spec.ts` | Playwright tests.                                                            |
| `../tsconfig.easter-egg.json` | Type checking for the script (part of `npm run typecheck`).                  |

The game build (`npm run build`) does not include any of this.

## Adding it to the Drupal site

### Option A: a theme library (recommended)

1. Copy `wefixit-easter-egg.js` to `themes/custom/wefixit/js/`.
2. Declare a library in `themes/custom/wefixit/wefixit.libraries.yml`:

    ```yaml
    easter-egg:
        version: 1.0.0
        js:
            js/wefixit-easter-egg.js: {}
    ```

3. Attach it to every page in `themes/custom/wefixit/wefixit.info.yml`:

    ```yaml
    libraries:
        # ...the libraries already listed stay as they are
        - wefixit/easter-egg
    ```

4. Clear the caches: `drush cr` (or Configuration > Performance > Clear all caches).

Drupal loads library scripts at the end of the page, and the script waits for the page anyway, so
nothing else is needed. Bump `version` whenever the file changes, so browsers and Cloudflare fetch
the new one.

### Option B: without touching the theme

With the [Asset Injector](https://www.drupal.org/project/asset_injector) module, add a JS injector,
paste the whole file into it and apply it to all pages. A custom block with a `<script>` tag also
works, but only in a text format that does not filter HTML (CKEditor strips script tags), so the
module is the simpler and safer route.

## Configuration

It works without any. To change something, either set a global object **before** the script
loads, or put `data-*` attributes on its script tag. When both are present, the object wins.

```html
<script>
    window.wefixitEasterEgg = { target: "https://mario.wefixit.gr/", sound: false };
</script>
<script src="/themes/custom/wefixit/js/wefixit-easter-egg.js" data-mount="#footer-final"></script>
```

| Option   | Attribute     | Default                      | Meaning                                                                                                         |
| -------- | ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `target` | `data-target` | `https://mario.wefixit.gr/`  | Where the code leads. Only http(s) URLs are accepted.                                                           |
| `mount`  | `data-mount`  | `footer, [role=contentinfo]` | CSS selector of the element the plumber's strip is appended to. No match: no plumber, but the code still works. |
| `lang`   | `data-lang`   | the page's `<html lang>`     | `el` for Greek, anything else for English.                                                                      |
| `sound`  | `data-sound`  | `true`                       | `false` turns off the jingle.                                                                                   |

When Drupal aggregates JavaScript, it merges files and drops attributes from script tags, so
prefer the global object there. In a library, a tiny file listed first works well:

```yaml
easter-egg:
    version: 1.0.0
    js:
        js/wefixit-easter-egg-config.js: {} # window.wefixitEasterEgg = { sound: false };
        js/wefixit-easter-egg.js: {}
```

## Changing it

- **Texts** are in `STRINGS` near the top of the script.
- **Sprites** are the string matrices under "Sprites": one character per pixel, colors in
  `PALETTE`, `.` for transparent. The plumber is a head (10 rows) plus a body (10 rows), 16 pixels
  wide; each pixel is drawn 4 CSS pixels wide.
- **Timing** of the transition is `DISSOLVE_MS` and `INTRO_MS`; the work routine is `CYCLE_MS`.

After editing, run `npm run typecheck` and the tests below.

## Trying and testing it

- Open `demo.html` straight from disk, or run `npx vite easter-egg` and open
  <http://localhost:5173/demo.html>.
- Tests: `npx playwright test tests/easter-egg.spec.ts` (add `PW_PORT=<port>` to run beside other
  suites). They serve the demo from a made-up origin and replace the game with a stub, so they
  need no network.

## Content Security Policy

The script is CSP-friendly, so a policy on wefixit.gr only needs to allow the file itself
(`script-src 'self'`):

- No inline scripts, no `eval`, no `innerHTML` (so it also works with Trusted Types).
- Styles go into the Shadow DOM as constructable stylesheets (`adoptedStyleSheets`), which
  browsers do not treat as inline styles, so `'unsafe-inline'` is not needed. Only browsers older than that (before Safari 16.4) fall back to a
  `<style>` element, which needs `style-src 'unsafe-inline'` to apply; there the plumber would look
  unstyled but the code still works. Positions are set through the CSSOM, which CSP allows.
- It makes no requests. When the code is entered, it adds a `<link rel="preconnect">` to the game's
  origin and then navigates there.
- If the global config object is set in an inline `<script>`, that one needs a nonce or hash;
  setting it from a small file (as above) avoids that.

Cloudflare's Rocket Loader, if enabled, may delay the script slightly; that is harmless.
