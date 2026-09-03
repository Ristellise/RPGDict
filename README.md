# RPGdict

RPGdict is a *Japanese* dictionary popup for **any** RPG Maker MV & MZ game. It works by hooking at the `Bitmap.prototype.drawText` layer and basically is able to peek into all messages windows, name boxes, choices and most windows\*.

\*Images are not supported for obvious reasons. OCR would be needed at that point.

## Plugin Structure

```
RPGdict/
├── js/plugins/
│   ├── JPDicPopup.js                  the whole plugin (capture, popup, gestures,
│   │                                  built-in JMdict dictionary, debug log)
│   └── jmdict-compact.json            compact JMdict (218k entries, ~30 MB)
└── tools/
    └── jmdict_to_compact.py           JMdict XML ("NG" format) -> compact JSON
```

All you need is the `js/plugins` folder. Instructions on installation is below in [Install](#install) section.

## Install

1. Download the entire git repo. [Download Link](https://github.com/Ristellise/RPGDict/archive/refs/heads/main.zip)

2. Copy the following files into the game's `js/plugins/` folder (MZ) or `www/js/plugins/` for MV Games:

   - `js/plugins/JPDicPopup.js`
   - `js/plugins/jmdict-compact.json`

3. Open `js/plugins.js` and add one line to the `$plugins` array — **at the
   end** (the plugin must load after all other plugins so its aliases wrap
   last). Mind the comma after the previous entry:

   ```js
   {"name":"JPDicPopup","status":true,"description":"Japanese dictionary popup with built-in JMdict","parameters":{}},
   ```

That's it! To tweak settings, put any of these in `parameters`:

```js
"trigger":"auto", "popupWidth":"420", "popupFontSize":"13", "maxCandidates":"10",
"highlight":"true", "key":"KeyC", "consumeKey":"false", "holdDelay":"450",
"follow":"true", "debug":"0", "useJmdict":"true"
```

If you want to include it into your game, open it up in RPG Maker engine and enter `Tools -> Plugin Manager` and add `JPDicPopup`.

## Using it

The default interaction is a **toggle**: press `` ` `` (tilde) to turn the
dictionary ON, then click any text to look it up. Press it again to turn it
OFF — with the dictionary off, the game behaves as if the plugin wasn't
there.

| Device | Dictionary ON |
--------|---------------|
| Mouse | Left-click (or right-click) any text |
| Touch | Tap any text |

| Device | Toggle how? |
|--------|--------------|
| Mouse | **`** (tilde) key |
| Touch | Floating **辞** button (bottom-right) |

- A toast (**辞書 ON / 辞書 OFF**) confirms each toggle; a small badge
  stays on screen while the dictionary is ON.
- While ON, clicks on text are consumed (text doesn't advance); clicks not
  on text pass through, so the game keeps working normally.
- Clicking a different word while the popup is open **refreshes** it.
- Candidate chips at the top of the popup switch the lookup to that exact
  term. With the built-in JMdict dictionary active, chips are pre-filtered to
  terms that actually resolve, so every chip leads somewhere; with a custom
  lookup handler the full raw candidate list is kept (it may resolve
  anything).
- `Esc` or clicking elsewhere closes the popup.

Inflected words resolve through a heuristic deinflector (godan/ichidan
passive, causative, te/ta/nai/masu forms, suru/kuru, i-adjectives, chained),
so 食べた → 食べる, 走った → 走る, 読まれる → 読む, etc.

Alternative trigger modes (for games that bind `` ` ``): `right` (right-click
anywhere, anytime), `auto` (right-click + hold-key on mouse, long-press on
touch), `key` (hold key + click), `hold` (long-press), `left` (click when the
message is idle).

## Plugin parameters

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `trigger` | `toggle` | `toggle` / `auto` / `right` / `key` / `hold` / `left` |
| `popupWidth` | `420` | popup width in px |
| `popupFontSize` | `13` | popup body font size |
| `maxCandidates` | `10` | candidate chips shown |
| `highlight` | `true` | highlight the clicked row |
| `key` | `` ` `` | toggle / modifier key — event.code names, single letters, digits, ctrl/shift/alt, `~` for tilde (comma-separate alternates) |
| `consumeKey` | `false` | swallow the modifier key from the game |
| `holdDelay` | `450` | long-press delay in ms |
| `follow` | `true` | popup follows cursor/finger while held |
| `debug` | `0` | debug log level (see below) |
| `useJmdict` | `true` | use the built-in JMdict dictionary |

The dictionary file is resolved (first found wins): `<game>/js/plugins/`
jmdict-compact.json → `<game>/save/` (legacy) → cwd / executable-directory
variants of both. `save/jmdict-compact.json` from older installs still works.

## Public API (`JPDic`)

- `JPDic.setLookup(fn)` — replace the built-in JMdict lookup with your own.
- `JPDic.closeLookup()` — remove the custom handler (built-in dictionary or
  fallback body returns).
- `JPDic.current` / `JPDic.currentFragments()` — current message + all
  visible text fragments with world coordinates.
- `JPDic.hitTest(x, y)` / `JPDic.openAt(x, y, ctx)` — programmatic lookup.
- `JPDic.candidates(line, i)` / `JPDic.deinflect(term)` — the term machinery.
- `JPDic.on(event, fn)` / `off` — events: `message-start`, `message-end`,
  `popup-open`, `popup-close`, `toggle`.
- `JPDic.armed` / `JPDic.setArmed(bool)` — in toggle mode: whether the
  dictionary is currently ON (readable / settable programmatically).
- `JPDic.debug` / `JPDic.dumpLog()` / `JPDic.clearLog()` / `JPDic.log()` —
  debug logging.
- `JPDic.enabled` — master switch.

## Rebuilding the dictionary

`js/plugins/jmdict-compact.json` is generated from the JMdict XML file in the
"NG" format (gloss-only export, entities pre-resolved):

```sh
uv run tools/jmdict_to_compact.py /path/to/JMdict_e_NG [output.json]
# If you don't have uv venv setup, the following also works
python3 tools/jmdict_to_compact.py /path/to/JMdict_e_NG [output.json]
```

`lxml` and `orjson` (`pip install lxml orjson`) are required as extenal dependencies.

If your `JMdict_e_NG` is compressed as a `.gz` file, decompress it first before running the tool. By default, output goes to `js/plugins/jmdict-compact.json` beside the plugin.

Output format:

```json
{
  "e": [ ["寿司", "すし", ["(n,food) sushi", "range of dishes made with vinegared rice combined with fish, vegetables, egg, etc. (expl)"]], ... ],
  "k": { "寿司": [55915], "すし": [55915], ... }
}
```

Common words are ordered first (ichi1/news1/spec1/gai1 priority), so the
popup shows the usual reading first.

## Debugging

Set the `debug` parameter (or `JPDic.debug = 2` from the devtools console)
and reproduce the problem. Every popup open/close appends the buffered log to
`save/jpdic-debug.log` — send that file when reporting issues. Level 1
(gestures, hit tests, lookups, dictionary loading) prints to the console
live; level 2 also buffers every recorded text draw.

`JPDic.dumpLog()` prints and returns the whole buffer.

## Compatibility notes

- RPG Maker MZ 1.x and MV 1.6.1+ on NW.js (written against the ES2015
  feature set so it runs on MV's older Chromium). On MV there is no built-in
  name box, so `ctx.speaker` is always `""` — speaker names drawn by
  name-box plugins are still captured as text and clickable. Browser/mobile
  play works for capture and gestures, but the built-in dictionary can't
  read files via `fs` there — serve the JSON over HTTP and register a lookup
  handler instead.
- The plugin must load **after** any plugin that also aliases
  `Bitmap.prototype.drawText` / `Window_Message.startMessage`.
- Some games use mouse-right / mouse-down to advance text; the hold-key and
  long-press triggers exist for those.

## Credits & disclaimer

This plugin was mostly developed with GLM-5.3 as well as [pi coding agent](https://github.com/earendil-works/pi). Most of the readme is from GLM 5.3 as well.

JMdict `jmdict-compact.json` is the work of the [Electronic Dictionary Research and Development Group (EDRDG)](https://www.edrdg.org).

I made this plugin because I don't want to setup a entire anki setup and just want to be able to read what is on screen without taking screenshots and sending over to google translate on my phone.

Is that weird? Probably.

## Loicense

MIT. Yes, I'm not putting a entire LICENSE file, the whole thing is just MIT. except the `jmdict-compact.json` dictionary. That's under CC-BY-SA.