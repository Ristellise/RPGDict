# RPGdict — Japanese dictionary popup for RPG Maker MV/MZ games

A right-click (or hold-key / long-press) Japanese → English dictionary popup
that works in **any** RPG Maker MV or MZ game. One plugin, one data file,
no setup beyond dropping them in.

Works on top of a text-capture layer that records every string drawn through
`Bitmap.prototype.drawText` (the chokepoint all MV/MZ text goes through), so it
covers message windows, name boxes, choices, help windows, status windows,
battle log, text pictures, and mahjong/plugin windows alike.

## What's in here

```
RPGdict/
├── js/plugins/
│   ├── JPDicPopup.js                  the whole plugin (capture, popup, gestures,
│   │                                  built-in JMdict dictionary, debug log)
│   └── jmdict-compact.json            compact JMdict (218k entries, ~30 MB)
└── tools/
    └── jmdict_to_compact.py           JMdict XML ("NG" format) -> compact JSON
```

Everything lives in `js/plugins/` — the dictionary is read from beside the
plugin file.

## Install

1. Copy both files into the game's `js/plugins/` folder — `www/js/plugins/`
   in MV games, `js/plugins/` in MZ games:

   - `JPDicPopup.js`
   - `jmdict-compact.json`

2. Open `js/plugins.js` and add one line to the `$plugins` array — **at the
   end** (the plugin must load after all other plugins so its aliases wrap
   last). Mind the comma after the previous entry:

   ```js
   {"name":"JPDicPopup","status":true,"description":"Japanese dictionary popup with built-in JMdict","parameters":{}},
   ```

That's it — all defaults apply, and the dictionary is picked up automatically
on the first lookup. To tweak settings, put any of these in `parameters`:

```js
"trigger":"auto", "popupWidth":"420", "popupFontSize":"13", "maxCandidates":"10",
"highlight":"true", "key":"KeyC", "consumeKey":"false", "holdDelay":"450",
"follow":"true", "debug":"0", "useJmdict":"true"
```

(You can also skip the manual edit: open the game in RPG Maker MZ, open
**Tools → Plugin Manager**, and add `JPDicPopup` there — it writes the
plugins.js entry for you. Just make sure it's at the bottom of the list.)

Upgrading: overwrite both files. Your plugins.js entry and its parameters
stay as they are.

## Using it

The trigger adapts to the device:

| Device | Gesture |
|--------|---------|
| Mouse | **Right-click** any text, or **hold C + left-click** |
| Touch | **Long-press** (~450 ms) any text |

- While holding the modifier (C) with the popup open, the popup **follows
  the cursor**, switching to whatever word is under it.
- Clicking a different word while the popup is open **refreshes** it.
- Candidate chips at the top of the popup switch the lookup to that exact
  term. With the built-in JMdict dictionary active, chips are pre-filtered to
  terms that actually resolve, so every chip leads somewhere; with a custom
  lookup handler the full raw candidate list is kept (it may resolve
  anything).
- `Esc` or clicking elsewhere closes the popup.
- Quick taps still advance text — the touch layer replays them into the
  engine; only long-presses are consumed.

Inflected words resolve through a heuristic deinflector (godan/ichidan
passive, causative, te/ta/nai/masu forms, suru/kuru, i-adjectives, chained),
so 犰される → 犰す, 勃起した → 勃起, イク → 行く, etc.

## Plugin parameters

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `trigger` | `auto` | `auto` / `right` / `key` / `hold` / `left` |
| `popupWidth` | `420` | popup width in px |
| `popupFontSize` | `13` | popup body font size |
| `maxCandidates` | `10` | candidate chips shown |
| `highlight` | `true` | highlight the clicked row |
| `key` | `KeyC` | modifier key (`C`, `Ctrl`, `Shift`, `F1`… comma-separated) |
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
  `popup-open`, `popup-close`.
- `JPDic.debug` / `JPDic.dumpLog()` / `JPDic.clearLog()` / `JPDic.log()` —
  debug logging.
- `JPDic.enabled` — master switch.

## Rebuilding the dictionary

`js/plugins/jmdict-compact.json` is generated from the JMdict XML file in the
"NG" format (gloss-only export, entities pre-resolved):

```sh
python3 tools/jmdict_to_compact.py /path/to/JMdict_e_NG [output.json]
```

Defaults: output goes to `js/plugins/jmdict-compact.json` beside the plugin.
Requires `lxml` and `orjson` (`pip install lxml orjson`). Takes ~5 seconds.

Output format:

```json
{
  "e": [ ["犯す", "おかす", ["(v5t,vt) to commit (a crime)", "to rape"]], ... ],
  "k": { "犯す": [0, 1, 2], "おかす": [0, 3], ... }
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
