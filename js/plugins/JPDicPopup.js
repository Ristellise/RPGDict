//=============================================================================
// JPDicPopup.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v1.3.2 Capture all text drawn to the screen with exact pixel
 * positions, then right-click any text to fire a hookable Japanese dictionary
 * popup. Exposes a global `JPDic` API.
 * @author pi
 *
 * @param trigger
 * @text Lookup trigger
 * @desc auto detects the device; see help for details
 * @type select
 * @option Auto (recommended)
 * @value auto
 * @option Right click only
 * @value right
 * @option Left click when idle (message window only)
 * @value left
 * @option Hold-key + click only
 * @value key
 * @option Long-press only (touch)
 * @value longpress
 * @option All gestures
 * @value all
 * @default auto
 *
 * @param key
 * @text Modifier key
 * @desc Key(s) held to arm the lookup click. Accepts event.code names
 * ("KeyC", "F1"), single letters ("C"), digits, ctrl/shift/alt.
 * Comma-separate alternates: "KeyC,KeyV"
 * @type string
 * @default KeyC
 *
 * @param consumeKey
 * @text Hide modifier key from game
 * @desc Swallow the modifier keypress so the game never sees it (use if the
 * game binds the same key to skip/etc.)
 * @type boolean
 * @on Swallow
 * @off Pass through
 * @default false
 *
 * @param holdDelay
 * @text Long-press delay (ms)
 * @type number
 * @min 150
 * @max 1500
 * @default 450
 *
 * @param follow
 * @text Popup follows pointer
 * @desc While the finger (touch) or the modifier key (desktop) is held after
 * opening, the popup tracks the word under the pointer
 * @type boolean
 * @on Follow
 * @off Static
 * @default true
 *
 * @param popupWidth
 * @text Popup width (px)
 * @type number
 * @min 200
 * @max 900
 * @default 420
 *
 * @param popupFontSize
 * @text Popup font size (px)
 * @type number
 * @min 10
 * @max 24
 * @default 13
 *
 * @param maxCandidates
 * @text Max candidate terms
 * @type number
 * @min 1
 * @max 32
 * @default 10
 *
 * @param highlight
 * @text Highlight clicked line
 * @type boolean
 * @on Highlight
 * @off No highlight
 * @default true
 *
 * @param debug
 * @text Debug log level
 * @type select
 * @option 0 Off
 * @value 0
 * @option 1 Gestures + hit tests
 * @value 1
 * @option 2 + every text draw
 * @value 2
 * @default 0
 *
 * @param useJmdict
 * @text Use built-in JMdict dictionary
 * @type boolean
 * @on Enabled
 * @off Disabled
 * @default true
 *
 * @help
 * ============================================================================
 * JPDicPopup — Japanese dictionary popup hook
 * ============================================================================
 *
 * HOW IT WORKS
 *
 * This plugin wraps `Bitmap.prototype.drawText`, which every piece of text in
 * RPG Maker MZ (and MV 1.6+) passes through (message windows, choices, help
 * windows, status windows, text pictures — everything). Before each draw
 * call happens, the text plus its exact rect (x, y, width, lineHeight) and
 * font settings are recorded, so a full map of "what text is where on
 * screen" always exists. It also captures the full current message text at
 * `Window_Message.startMessage`.
 *
 * When you right-click (default), the plugin hit-tests every recorded text
 * fragment against the click position (through the current PIXI world
 * transforms, so scaled/moved windows work too), reconstructs the visible
 * line the click landed on, works out which character was clicked, extracts
 * candidate dictionary terms around the click, and opens a popup. The popup
 * content is produced by a lookup function that YOU provide.
 *
 * TRIGGERS / GESTURES
 *
 * trigger=auto (default) detects the device once at boot:
 *  - Mouse-style device (hover: hover)      -> right-click AND hold-key+click
 *  - Touch screen (hover: none, touch points) -> long-press a word
 *  - Both (e.g. touch laptop)               -> all of the above
 *
 * Gesture details:
 *  - right-click: consumed, so the game never sees it (no cancel side
 *    effects). Works anywhere, any time.
 *  - hold-key+click: while the modifier key is held, ALL left clicks are
 *    consumed (so "click advances text" games stay put); a click on text
 *    opens the popup. While the key stays held, the popup follows the
 *    cursor over other words (if follow=true).
 *  - long-press (touch): touchstart is always consumed while the gesture is
 *    pending; a quick tap is REPLAYED to the engine so tap-to-advance and
 *    map-touch movement keep working. Only after the hold delay does the
 *    popup open, then it follows the finger; release keeps it open.
 *  - left-click-when-idle: only on the message window / name box while the
 *    message is fully typed out; the click is consumed. Opt-in only, since
 *    it changes how click-to-advance behaves when idle.
 *
 * While a popup is open, any click/tap outside it closes it and is consumed,
 * and Esc closes it.
 *
 * ============================================================================
 * HOOKING IN YOUR DICTIONARY
 * ============================================================================
 *
 * Set a lookup handler (anywhere, e.g. from the console, another plugin, or a
 * `<script>` in index.html):
 *
 *     JPDic.setLookup(async (ctx) => {
 *         // ctx.term        -> best-guess clicked term (string)
 *         // ctx.candidates  -> ordered candidate terms, longest first
 *         // ctx.deinflected -> deinflected variants of all candidates
 *         // ctx.line        -> the full visible line text that was clicked
 *         // ctx.charIndex   -> code-point index into ctx.line of the click
 *         // ctx.fullText    -> full current message text, or null
 *         // ctx.speaker     -> current speaker name, or null
 *         // ctx.source      -> e.g. "Window_Message", "Window_ChoiceList"
 *         // ctx.rect        -> {x, y, w, h} world rect of the clicked row
 *         // ctx.clientX / clientY -> DOM coordinates for your own overlays
 *
 *         // return one of:
 *         //   undefined/null  -> "not found" is displayed
 *         //   string          -> treated as HTML
 *         //   HTMLElement      -> appended directly
 *         //   { html: string } -> treated as HTML
 *         //   { entries: [{term, reading, glosses:[], tags:[]}] } -> list
 *
 *         const entry = myDictionary.find(ctx.candidates);
 *         return entry ? { entries: [entry] } : null;
 *     });
 *
 * Example: JMdict in NW.js (the game runs on Node, so you can use require):
 *
 *     // 1. Put a JSON file { "word": [{reading, glosses}] } somewhere.
 *     // 2. Hook it up:
 *     const fs = require("fs");
 *     const dict = JSON.parse(
 *         fs.readFileSync("save/jmdict-compact.json", "utf8"));
 *     JPDic.setLookup((ctx) => {
 *         for (const term of ctx.candidates) {
 *             for (const d of [term, ...JPDic.deinflect(term)]) {
 *                 if (dict[d]) return { entries: [dict[d] ] };
 *             }
 *         }
 *         return null;
 *     });
 *
 * BUILT-IN JMdict DICTIONARY
 *
 * No handler is needed for the common case: place a compact JMdict dump
 * (jmdict-compact.json, built by tools/jmdict_to_compact.py) beside this
 * plugin (js/plugins/) and lookups work out of the box. The dump is loaded
 * lazily on the first lookup (~0.3-1s hitch, then cached); save/ is also
 * searched as a fallback location. A handler registered with setLookup()
 * takes priority; the "useJmdict" parameter disables the built-in lookup.
 *
 * If no handler is set and the dump is missing, the popup shows the clicked
 * line, the clicked term and the candidate list (useful for testing).
 *
 * ============================================================================
 * FULL API (global `JPDic`)
 * ============================================================================
 *
 *   JPDic.setLookup(fn)   Register a custom lookup handler; overrides the
 *                        built-in JMdict dictionary (see above).
 *   JPDic.closeLookup()   Remove the custom handler (built-in JMdict or the
 *                        fallback popup returns).
 *   JPDic.on(ev, fn)      Subscribe. Events:
 *                           "message-start"  {raw, lines, speaker, face}
 *                           "message-end"    {}
 *                           "popup-open"     {ctx}
 *                           "popup-close"    {}
 *   JPDic.off(ev, fn)     Unsubscribe.
 *   JPDic.current         {raw, lines, speaker, face} of the current message.
 *   JPDic.currentFragments() -> all visible text fragments as
 *                           {text, rect:{x,y,w,h}, source} (world coords).
 *   JPDic.hitTest(clientX, clientY) -> same context object the popup gets,
 *                           or null. Programmatic lookup.
 *   JPDic.candidates(line, i) -> candidate terms around code-point i.
 *   JPDic.deinflect(term) -> heuristic deinflection variants of a term
 *                           (te/ta/nai/masu/potential/passive/causative/
 *                            adjective/suru/kuru endings, chained).
 *   JPDic.openAt(x, y, ctx) -> open the popup programmatically (DOM coords).
 *   JPDic.close()        Close the popup.
 *   JPDic.isOpen()       Popup state.
 *   JPDic.capabilities   Detected device: {hover, touch}.
 *   JPDic.gestures       Resolved gesture set: {right, left, key, hold}.
 *   JPDic.enabled        Master switch (default true). Set false to disable
 *                        all capturing and input handling.
 *   JPDic.debug          Debug log level (also plugin param "debug"):
 *                          0 = off
 *                          1 = gestures, hit tests, lookups, dictionary
 *                          2 = also every recorded text draw
 *   JPDic.dumpLog()      Append the buffered log to save/jpdic-debug.log
 *                        (NW.js), print it to the console and return it.
 *   JPDic.clearLog()     Empty the log buffer.
 *   JPDic.log(l, c, m)   Write a line into the debug log (for companion
 *                        scripts / console use).
 *
 * DEBUG LOGGING
 *
 * Set the "debug" plugin parameter (or JPDic.debug from the console) and
 * reproduce the problem. While debug is on, every popup open/close appends
 * the buffered log to save/jpdic-debug.log (NW.js only) — after reproducing,
 * send that file. JPDic.dumpLog() also works. Level-1 lines print to the
 * devtools console live; level-2 per-draw lines only go to the buffer/file.
 *
 * This plugin does not modify save data.
 *
 * ============================================================================
 * TERMS
 * ============================================================================
 * MIT. Do whatever.
 *
 * COMPATIBILITY
 * ============================================================================
 * RPG Maker MZ 1.x and MV 1.6.1+ on NW.js. Written against the ES2015
 * feature set so it also parses on MV's older NW.js (Chromium 66). On MV
 * there is no built-in name box, so ctx.speaker is always "" — speaker
 * names drawn by name-box plugins are still captured as text and clickable.
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "JPDicPopup";
    const P = PluginManager.parameters(PLUGIN_NAME);

    const OPT = {
        trigger: String(P.trigger || "auto"),
        popupWidth: Math.max(200, Math.min(900, parseInt(P.popupWidth, 10) || 420)),
        fontSize: Math.max(10, Math.min(24, parseInt(P.popupFontSize, 10) || 13)),
        maxCandidates: Math.max(1, Math.min(32, parseInt(P.maxCandidates, 10) || 10)),
        highlight: String(P.highlight) !== "false",
        key: P.key === undefined ? "KeyC" : String(P.key),
        consumeKey: String(P.consumeKey) === "true",
        holdDelay: Math.max(150, Math.min(1500, parseInt(P.holdDelay, 10) || 450)),
        follow: String(P.follow) !== "false",
        debug: Math.max(0, Math.min(2, parseInt(P.debug, 10) || 0)),
        useJmdict: String(P.useJmdict) !== "false"
    };

    //=========================================================================
    // Device capabilities / gesture resolution
    //=========================================================================

    const CAP = (function detectCapabilities() {
        let hover = true;
        let touch = false;
        try {
            touch = (navigator.maxTouchPoints || 0) > 0;
            hover = !window.matchMedia || window.matchMedia("(hover: hover)").matches;
        } catch (e) {
            // stay with mouse defaults
        }
        return { hover: hover, touch: touch };
    })();

    function resolveGestures() {
        switch (OPT.trigger) {
            case "right":
                return { right: true, left: false, key: false, hold: false };
            case "left":
                return { right: false, left: true, key: false, hold: false };
            case "key":
                return { right: false, left: false, key: true, hold: false };
            case "longpress":
                return { right: false, left: false, key: false, hold: true };
            case "all":
                return { right: true, left: true, key: true, hold: true };
            default:
                // auto: mouse device -> right click + hold-key click,
                //       touch device -> long-press, hybrid -> everything
                return {
                    right: CAP.hover,
                    left: false,
                    key: CAP.hover,
                    hold: CAP.touch
                };
        }
    }

    const GESTURES = resolveGestures();

    //=========================================================================
    // Debug logging (JPDic.debug / JPDic.dumpLog / save/jpdic-debug.log)
    //=========================================================================

    const LOG = [];
    const LOG_CAP = 8000;
    let dbgSeq = 0;
    let bmpSeq = 0;
    let lastFlushedId = 0;
    const bootTime = Date.now();

    function bmpTag(bitmap) {
        if (!bitmap.__jpdicTag) {
            bitmap.__jpdicTag = "b" + (++bmpSeq);
        }
        return bitmap.__jpdicTag;
    }

    function dbg(lvl, cat, msg) {
        if (OPT.debug < lvl) return;
        try {
            const t = Date.now() - bootTime;
            const stamp = Math.floor(t / 1000) + "." +
                String(t % 1000).padStart(3, "0");
            const line = "#" + (++dbgSeq) + " [" + stamp + "] [" + cat + "] " + msg;
            LOG.push(line);
            if (LOG.length > LOG_CAP) LOG.splice(0, LOG.length - LOG_CAP);
            if (lvl <= 1) {
                console.log(
                    "%c[JPDic]%c " + line,
                    "color:#7ec4ff;font-weight:bold",
                    "color:inherit"
                );
            }
        } catch (e) {
            // logging must never break the game
        }
    }

    let logPathCache;
    function debugLogPath() {
        try {
            if (typeof require !== "function") return null;
            if (typeof process === "undefined" || !process.versions ||
                !process.versions.nw) {
                return null;
            }
            const path = require("path");
            const fs = require("fs");
            const cands = [
                path.join(process.cwd(), "save", "jpdic-debug.log"),
                path.join(__dirname, "..", "..", "save", "jpdic-debug.log")
            ];
            for (const p of cands) {
                try {
                    fs.mkdirSync(path.dirname(p), { recursive: true });
                    return p;
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    function flushLog() {
        if (OPT.debug < 1) return;
        try {
            if (logPathCache === undefined) logPathCache = debugLogPath();
            if (!logPathCache) return;
            const out = [];
            for (const line of LOG) {
                const m = /^#(\d+)\b/.exec(line);
                if (m && parseInt(m[1], 10) <= lastFlushedId) continue;
                out.push(line);
            }
            if (!out.length) return;
            const last = /^#(\d+)\b/.exec(LOG[LOG.length - 1]);
            if (last) lastFlushedId = parseInt(last[1], 10);
            const fs = require("fs");
            fs.appendFileSync(logPathCache, out.join("\n") + "\n\n");
        } catch (e) {
            // never break the game over logging
        }
    }

    //=========================================================================
    // 0. Event emitter + public API object
    //=========================================================================

    const listeners = {};
    function fire(ev, data) {
        const arr = listeners[ev];
        if (!arr) return;
        for (const fn of arr.slice()) {
            try {
                fn(data);
            } catch (e) {
                console.error(`[JPDicPopup] listener error on "${ev}"`, e);
            }
        }
    }

    let lookupHandler = null;
    let popupEl = null;
    let highlightEl = null;

    const JPDic = {
        version: "1.3.2",
        enabled: true,
        current: null,
        capabilities: CAP,
        gestures: GESTURES,

        setLookup(fn) {
            if (fn === null || fn === undefined) {
                lookupHandler = null;
            } else if (typeof fn === "function") {
                lookupHandler = fn;
            } else {
                throw new Error("JPDic.setLookup expects a function or null");
            }
        },

        closeLookup() {
            lookupHandler = null;
        },

        on(ev, fn) {
            (listeners[ev] = listeners[ev] || []).push(fn);
        },

        off(ev, fn) {
            const arr = listeners[ev];
            if (!arr) return;
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        },

        close() {
            closePopup();
        },

        isOpen() {
            return !!popupEl;
        },

        hitTest(clientX, clientY) {
            return hitTest(clientX, clientY);
        },

        candidates(line, i, cap) {
            return buildCandidates(String(line), i, cap || OPT.maxCandidates);
        },

        deinflect(term) {
            return deinflect(String(term));
        },

        currentFragments() {
            return snapshotFragments();
        },

        openAt(x, y, ctx) {
            openPopup(Object.assign({ term: "" }, ctx), x, y);
        },

        get debug() {
            return OPT.debug;
        },
        set debug(v) {
            const lvl = Math.max(0, Math.min(2, parseInt(v, 10) || 0));
            OPT.debug = lvl;
            dbg(1, "debug", "level set to " + lvl);
        },

        clearLog() {
            LOG.length = 0;
            lastFlushedId = dbgSeq;
        },

        dumpLog() {
            flushLog();
            const out = LOG.join("\n");
            try {
                console.log(out);
            } catch (e) {}
            return out;
        },

        log(lvl, cat, msg) {
            // hook for companion plugins (e.g. JPDicJMdict) to write into
            // the debug log
            dbg(Math.max(0, Math.min(2, parseInt(lvl, 10) || 0)),
                String(cat), String(msg));
        }
    };

    window.JPDic = JPDic;

    dbg(1, "boot", "v" + JPDic.version + " debug=" + OPT.debug +
        " device=" + (CAP.hover ? (CAP.touch ? "mouse+touch" : "mouse") : "touch") +
        " gestures=" + JSON.stringify(GESTURES));

    //=========================================================================
    // 1. Text fragment capture (before every drawText)
    //=========================================================================

    const MAX_FRAGMENTS = 512;

    const _Bitmap_drawText = Bitmap.prototype.drawText;
    Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
        try {
            if (JPDic.enabled && text !== "" && text !== null && text !== undefined) {
                let frags = this.__jpdicFragments;
                if (!frags) {
                    frags = this.__jpdicFragments = [];
                }
                const rec = {
                    text: String(text),
                    x: x,
                    y: y,
                    maxWidth: maxWidth === undefined ? 0xffffffff : maxWidth,
                    lineHeight: lineHeight || 0,
                    align: align || "left",
                    font: `${this.fontItalic ? "italic " : ""}` +
                          `${this.fontBold ? "bold " : ""}` +
                          `${this.fontSize}px ${this.fontFace}`,
                    // cached lazily at hit time:
                    _w: -1
                };
                const last = frags[frags.length - 1];
                if (
                    last &&
                    last.text === rec.text &&
                    last.x === rec.x &&
                    last.y === rec.y &&
                    last.lineHeight === rec.lineHeight &&
                    last.align === rec.align &&
                    last.font === rec.font
                ) {
                    // identical redraw (e.g. a HUD that repaints every frame
                    // without clearing): replace instead of accumulating
                    frags[frags.length - 1] = rec;
                } else {
                    if (frags.length >= MAX_FRAGMENTS) {
                        // rolling buffer: drop the oldest half so new draws
                        // are ALWAYS recorded — a dirty-redrawing window must
                        // never freeze on its first recorded value
                        frags.splice(0, frags.length - (MAX_FRAGMENTS >> 1));
                    }
                    frags.push(rec);
                    if (OPT.debug >= 2) {
                        dbg(2, "draw", bmpTag(this) + " ← " + JSON.stringify(rec.text) +
                            " @" + x + "," + y + " w=" + rec.maxWidth + " h=" + rec.lineHeight +
                            " align=" + rec.align + " [" + rec.font + "]");
                    }
                }
            }
        } catch (e) {
            // never break the game over bookkeeping
        }
        _Bitmap_drawText.apply(this, arguments);
    };

    const _Bitmap_clear = Bitmap.prototype.clear;
    Bitmap.prototype.clear = function() {
        if (OPT.debug >= 2 && this.__jpdicFragments && this.__jpdicFragments.length) {
            dbg(2, "clear", bmpTag(this) + " clear (drops " +
                this.__jpdicFragments.length + " frags)");
        }
        this.__jpdicFragments = null;
        _Bitmap_clear.apply(this, arguments);
    };

    const _Bitmap_clearRect = Bitmap.prototype.clearRect;
    Bitmap.prototype.clearRect = function(x, y, width, height) {
        const frags = this.__jpdicFragments;
        if (frags) {
            this.__jpdicFragments = frags.filter(f =>
                f.y + f.lineHeight <= y || f.y >= y + height
            );
            if (OPT.debug >= 2 && this.__jpdicFragments.length !== frags.length) {
                dbg(2, "clear", bmpTag(this) + " clearRect(" + x + "," + y + "," +
                    width + "," + height + ") drops " +
                    (frags.length - this.__jpdicFragments.length) + " frags");
            }
        }
        _Bitmap_clearRect.apply(this, arguments);
    };

    // Opaque rect fills are the other common way plugins "clear" text
    // before redrawing (status gauges, HUD overlays, etc.)
    const _Bitmap_fillRect = Bitmap.prototype.fillRect;
    Bitmap.prototype.fillRect = function(x, y, width, height, color) {
        const frags = this.__jpdicFragments;
        if (frags) {
            this.__jpdicFragments = frags.filter(f =>
                f.y + f.lineHeight <= y || f.y >= y + height
            );
            if (OPT.debug >= 2 && this.__jpdicFragments.length !== frags.length) {
                dbg(2, "clear", bmpTag(this) + " fillRect(" + x + "," + y + "," +
                    width + "," + height + ") drops " +
                    (frags.length - this.__jpdicFragments.length) + " frags");
            }
        }
        _Bitmap_fillRect.apply(this, arguments);
    };

    //=========================================================================
    // 2. Message text capture
    //=========================================================================

    // Strip \x1b-style control codes from escape-resolved text.
    function plainLine(text) {
        return String(text)
            .replace(/\x1b\x1b/g, "\u0001")     // literal backslash, protect
            .replace(/\x1b[A-Za-z]+\[[^\]]*\]/g, "")
            .replace(/\x1b[$.|^!><{}]/g, "")
            .replace(/\u0001/g, "\\")
            .replace(/\f/g, "");
    }

    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        _Window_Message_startMessage.apply(this, arguments);
        try {
            if (!JPDic.enabled) return;
            const raw = this._textState ? this._textState.text : $gameMessage.allText();
            JPDic.current = {
                raw: String(raw),
                lines: String(raw).split("\n").map(plainLine),
                speaker: $gameMessage.speakerName ? $gameMessage.speakerName() : "",
                face: $gameMessage.faceName(),
                startedAt: Date.now()
            };
            dbg(1, "msg", "startMessage speaker=" + JSON.stringify(JPDic.current.speaker) +
                " lines=" + JPDic.current.lines.length);
            closePopup(); // fresh page: stale popups out
            fire("message-start", Object.assign({}, JPDic.current));
        } catch (e) {
            console.error("[JPDicPopup] startMessage capture failed", e);
        }
    };

    const _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function() {
        _Window_Message_terminateMessage.apply(this, arguments);
        try {
            JPDic.current = null;
            closePopup();
            fire("message-end", {});
        } catch (e) {
            // ignore
        }
    };

    //=========================================================================
    // 3. Character classification / candidate terms
    //=========================================================================

    const CP_HIRAGANA = 1;
    const CP_KATAKANA = 2;
    const CP_KANJI = 3;

    function cpClass(c) {
        const cp = typeof c === "number" ? c : c.codePointAt(0);
        if (cp >= 0x3041 && cp <= 0x309f) return CP_HIRAGANA;       // hiragana
        if (cp >= 0x30a1 && cp <= 0x30fa) return CP_KATAKANA;      // katakana
        if (cp === 0x30fc) return CP_KATAKANA;                     // ー
        if (cp >= 0xff66 && cp <= 0xff9d) return CP_KATAKANA;      // hw katakana
        if (cp >= 0x4e00 && cp <= 0x9faf) return CP_KANJI;         // CJK unified
        if (cp >= 0x3400 && cp <= 0x4dbf) return CP_KANJI;         // ext A
        if (cp >= 0xf900 && cp <= 0xfaff) return CP_KANJI;         // compat
        return 0;
    }

    // Maximal Japanese connected run around code-point index i.
    function connectedRun(cps, i) {
        if (i < 0 || i >= cps.length) return null;
        if (!cpClass(cps[i])) {
            // clicked a non-Japanese char: no run
            return null;
        }
        let start = i;
        while (start > 0 && cpClass(cps[start - 1])) start--;
        let end = i + 1;
        while (end < cps.length && cpClass(cps[end])) end++;
        return { start, end };
    }

    // Best single-guess term for the popup header: kanji block + trailing
    // hiragana, maximal katakana run, or hiragana extended left over kanji.
    function guessTerm(cps, i) {
        const cls = cpClass(cps[i]);
        if (cls === CP_KATAKANA) {
            let s = i;
            while (s > 0 && cpClass(cps[s - 1]) === CP_KATAKANA) s--;
            let e = i + 1;
            while (e < cps.length && cpClass(cps[e]) === CP_KATAKANA) e++;
            return cps.slice(s, e).join("");
        }
        if (cls === CP_KANJI) {
            let s = i;
            while (s > 0 && cpClass(cps[s - 1]) === CP_KANJI) s--;
            let e = i + 1;
            while (e < cps.length && cpClass(cps[e]) === CP_KANJI) e++;
            // trailing hiragana (dictionary forms like 食べる / 犯されて).
            // Exception: a single trailing kana directly followed by another
            // Japanese character is almost certainly a particle
            // (触手に犯す -> 触手, 麻雀でロン -> 麻雀), so drop it there.
            let j = e;
            while (
                j < cps.length &&
                cpClass(cps[j]) === CP_HIRAGANA &&
                j - e < 4
            ) j++;
            if (j > e) {
                const followedByWordChar =
                    j < cps.length && cpClass(cps[j]) !== 0;
                // a SINGLE trailing kana followed by another word char is
                // almost always a particle (触手に犯す -> 触手, 麻雀でロン
                // -> 麻雀) — but only actual particle kana (は を が に で
                // と も へ か や …); never i-adjective endings like い
                // (素早い) or okurigana clusters, which are part of the word
                const singleParticle =
                    j - e === 1 &&
                    followedByWordChar &&
                    "はをがにでともへかやの".indexOf(cps[e]) >= 0;
                if (!singleParticle) e = j;
            }
            return cps.slice(s, e).join("");
        }
        // hiragana
        let s = i;
        while (s > 0 && cpClass(cps[s - 1]) === CP_HIRAGANA) s--;
        while (s > 0 && cpClass(cps[s - 1]) === CP_KANJI) s--;
        let e = i + 1;
        while (e < cps.length && cpClass(cps[e]) === CP_HIRAGANA) e++;
        return cps.slice(s, e).join("");
    }

    // All substrings of the connected run that contain the clicked
    // code point, longest first. Ordered for "longest dictionary match
    // wins" lookup semantics. `guessTerm` is returned separately so it can
    // be used for display only.
    function buildCandidates(line, cpIndex, cap) {
        const cps = Array.from(String(line));
        if (cpIndex < 0 || cpIndex >= cps.length) return [];
        const run = connectedRun(cps, cpIndex);
        if (!run) return [];
        const out = [];
        for (let len = run.end - run.start; len >= 1; len--) {
            for (let s = run.start; s + len <= run.end; s++) {
                const e = s + len;
                if (cpIndex < s || cpIndex >= e) continue;
                out.push(cps.slice(s, e).join(""));
            }
        }
        const seen = new Set();
        return out.filter(t => {
            if (seen.has(t) || t.length === 0) return false;
            seen.add(t);
            return true;
        }).slice(0, cap);
    }

    //=========================================================================
    // 4. Heuristic deinflection
    //=========================================================================

    // [surface suffix, base suffix] — all matches are emitted; the
    // dictionary lookup sorts out which candidate actually exists.
    const DEINFLECT_RULES = [
        // suru / kuru (before generic polite rules)
        ["しませんでした", "する"], ["しまいませんでした", "する"],
        ["しません", "する"], ["しない", "する"], ["します", "する"],
        ["した", "する"], ["して", "する"], ["すれば", "する"],
        ["させる", "する"], ["せられる", "する"], ["される", "する"],
        ["された", "する"], ["せて", "する"], ["させる", "する"],
        // suru-verbs are stored under the noun form in JMdict (勃起する
        // is headword 勃起), so also try the bare stem: 勃起する -> 勃起
        ["する", ""],
        ["こなかった", "くる"], ["きませんでした", "くる"],
        ["きません", "くる"], ["こない", "くる"], ["きます", "くる"],
        ["きた", "くる"], ["きて", "くる"], ["くれば", "くる"],
        ["こさせる", "くる"], ["こられる", "くる"],
        // polite (with godan column restoration)
        ["いませんでした", "う"], ["きませんでした", "く"], ["ぎませんでした", "ぐ"],
        ["しませんでした", "す"], ["ちませんでした", "つ"], ["にませんでした", "ぬ"],
        ["びませんでした", "ぶ"], ["みませんでした", "む"], ["りませんでした", "る"],
        ["ませんでした", "る"], ["ませんでした", "い"],
        ["いません", "う"], ["きません", "く"], ["ぎません", "ぐ"], ["しません", "す"],
        ["ちません", "つ"], ["にません", "ぬ"], ["びません", "ぶ"],
        ["みません", "む"], ["りません", "る"], ["ません", "る"], ["ません", "い"],
        ["いません", "い"], ["きません", "い"],
        ["いました", "う"], ["きました", "く"], ["ぎました", "ぐ"], ["しました", "す"],
        ["ちました", "つ"], ["にました", "ぬ"], ["びました", "ぶ"],
        ["みました", "む"], ["りました", "る"], ["ました", "る"], ["ました", "い"],
        ["ました", "う"], ["まして", "る"], ["ましょう", "る"], ["ましょう", "う"],
        ["ます", "る"],
        // polite, plain ます column
        ["います", "う"], ["きます", "く"], ["ぎます", "ぐ"], ["します", "す"],
        ["ちます", "つ"], ["にます", "ぬ"], ["びます", "ぶ"], ["みます", "む"],
        ["ります", "る"], ["えます", "える"], ["けます", "ける"], ["げます", "げる"],
        ["せます", "せる"], ["てます", "てる"], ["ねます", "ねる"], ["べます", "べる"],
        ["めます", "める"], ["れます", "れる"], ["います", "いる"], ["きます", "きる"], ["きます", "くる"],
        // passive / potential た・て forms
        ["された", "す"], ["された", "る"], ["されて", "す"], ["されて", "る"],
        ["られた", "る"], ["られた", "す"], ["られた", "い"], ["られ", "る"],
        ["れて", "る"], ["れて", "す"], ["れて", "い"], ["れた", "る"], ["れた", "す"],
        ["せて", "す"], ["せて", "る"], ["せた", "す"], ["せた", "る"],
        // masu-stem + そう (looks like)
        ["しそう", "する"], ["そう", "る"], ["そう", "い"],
        // te-form
        ["いで", "ぐ"], ["いて", "く"], ["いで", "く"], ["いて", "る"],
        ["んで", "む"], ["んで", "ぶ"], ["んで", "ぬ"],
        ["って", "う"], ["って", "る"], ["って", "つ"], ["って", "く"],
        ["して", "す"],
        ["て", "る"], ["て", "い"], ["て", "う"],
        // te-form + くれ (do it for me: 付き合ってくれ)
        ["てくれ", "て"], ["でくれ", "で"],
        // ta-form
        ["いだ", "ぐ"], ["いた", "く"], ["いだ", "く"], ["いた", "る"],
        ["んだ", "む"], ["んだ", "ぶ"], ["んだ", "ぬ"],
        ["った", "う"], ["った", "る"], ["った", "つ"], ["った", "く"],
        ["した", "す"],
        ["た", "る"], ["た", "い"], ["た", "う"],
        // negative
        ["なかった", "る"], ["なかった", "う"], ["なかった", "い"],
        ["くない", "い"], ["ない", "る"], ["ない", "う"], ["ない", "い"],
        // i-adjectives
        ["くなかった", "い"], ["くなければ", "い"], ["ければ", "い"],
        ["かった", "い"], ["くて", "い"],
        // potential / passive / causative
        ["られる", "る"], ["られる", "す"], ["れる", "る"], ["れる", "う"],
        ["させる", "る"], ["せる", "る"],
        // godan passive / causative (u-stem + れる/せる restores the
        // dictionary form: 犯される -> 犯す, 話させる -> 話す)
        ["される", "す"], ["かれる", "く"], ["がれる", "ぐ"], ["たれる", "つ"],
        ["なれる", "ぬ"], ["ばれる", "ぶ"], ["まれる", "む"], ["われる", "う"],
        ["させる", "す"], ["かせる", "く"], ["がせる", "ぐ"], ["たせる", "つ"],
        ["なせる", "ぬ"], ["ばせる", "ぶ"], ["ませる", "む"], ["わせる", "う"],
        // desiderative
        ["たくなかった", "る"], ["たかった", "る"], ["たくない", "る"],
        ["たい", "る"],
        // copula
        ["でした", ""], ["じゃない", ""], ["ではない", ""],
        ["です", ""], ["だ", ""], ["だった", ""],
        // volitional
        ["おう", "う"], ["よう", "る"], ["こう", "く"], ["そう", "す"],
        ["とう", "つ"], ["のう", "ぬ"], ["ぼう", "ぶ"], ["もう", "む"],
        ["ろう", "る"], ["ろう", "う"],
        // conditional
        ["えば", "う"], ["えば", "る"], ["けば", "く"], ["げば", "ぐ"],
        ["せば", "す"], ["てば", "つ"], ["ねば", "ぬ"], ["べば", "ぶ"],
        ["めば", "む"], ["れば", "る"], ["れれば", "る"],
        // causative / passive te & ta
        ["させて", "る"], ["させた", "る"], ["させない", "る"],
        ["られて", "る"], ["られない", "る"]
    ];

    // Longest (most specific) rules first so their candidates surface at
    // the head of the result list.
    DEINFLECT_RULES.sort((a, b) => b[0].length - a[0].length);

    // Characters that indicate the text before a generic short suffix is
    // itself already an inflection (られ/させ/ませ...). Used to suppress
    // garbage chains like 混ぜられた -> 混ぜられい.
    const INFLECTED_TAILS = "られさせまいな";

    function deinflect(term) {
        const results = new Set();
        if (!term || term.length < 2) return [];
        const queue = [{ t: term, depth: 0 }];
        const seen = new Set([term]);
        while (queue.length > 0) {
            const { t, depth } = queue.shift();
            if (depth >= 3 || t.length < 2) continue;
            for (const [from, to] of DEINFLECT_RULES) {
                if (!t.endsWith(from)) continue;
                if (from.length === 1 && t.length >= 2 &&
                    INFLECTED_TAILS.includes(t[t.length - 2])) {
                    continue;
                }
                // allow whole-word replacements (します -> する);
                // garbage outputs shorter than 2 chars are filtered below
                if (t.length < from.length) continue;
                const next = t.slice(0, t.length - from.length) + to;
                if (next.length >= 2 && !seen.has(next)) {
                    seen.add(next);
                    results.add(next);
                    queue.push({ t: next, depth: depth + 1 });
                }
            }
        }
        return Array.from(results);
    }

    //=========================================================================
    // 5. Measuring + hit testing
    //=========================================================================

    const measureCtx = (() => {
        try {
            return document.createElement("canvas").getContext("2d");
        } catch (e) {
            return null;
        }
    })();

    function measureWidth(font, text) {
        if (!measureCtx) return text.length * 14; // rough fallback
        measureCtx.font = font;
        return measureCtx.measureText(text).width;
    }

    // Glyph origin x of a fragment (accounts for left/center/right align).
    // Note: canvas centers/right-aligns around the anchor point regardless
    // of overflow, so maxWidth is used directly for those cases.
    function fragGlyphX(frag) {
        if (frag._w < 0) {
            frag._w = measureWidth(frag.font, frag.text);
        }
        switch (frag.align) {
            case "center":
                return frag.x + frag.maxWidth / 2 - frag._w / 2;
            case "right":
                return frag.x + frag.maxWidth - frag._w;
            default:
                return frag.x;
        }
    }

    function fragGlyphW(frag) {
        if (frag._w < 0) {
            frag._w = measureWidth(frag.font, frag.text);
        }
        return frag._w;
    }

    // Walk the scene tree in render order (parent, then children in order)
    // collecting nodes that own a bitmap with recorded text fragments.
    // The nearest Window ancestor (if any) is tracked for openness checks.
    function collectOwners(node, windowAncestor, out) {
        if (!node || node.visible === false) return;
        let win = windowAncestor;
        if (typeof Window !== "undefined" && node instanceof Window) {
            win = node;
        }
        if (
            node.bitmap &&
            node.bitmap instanceof Bitmap &&
            node.bitmap.__jpdicFragments &&
            node.bitmap.__jpdicFragments.length > 0
        ) {
            let ok = true;
            if (win) ok = win._openness >= 200;
            if (ok) out.push({ sprite: node, window: win });
        }
        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                collectOwners(node.children[i], win, out);
            }
        }
    }

    // Reconstruct the visible row segment containing the hit fragment.
    // Fragments are recorded in draw order, so a NEWER fragment paints over
    // an older one at the same position. Windows that redraw without
    // clearing (some HUD/name-box plugins do) accumulate stale fragments,
    // so sweep newest-first and drop anything a newer fragment fully covers.
    // Dropped fragments are also removed from the bitmap's list (self-heal).
    function buildRow(frags, hitFrag) {
        const row = frags
            .filter(f => Math.abs(f.y - hitFrag.y) < 1)
            .sort((a, b) => fragGlyphX(a) - fragGlyphX(b));
        const kept = [];
        for (let i = row.length - 1; i >= 0; i--) {
            const f = row[i];
            const fx = fragGlyphX(f);
            let covered = false;
            for (const k of kept) {
                const kx = fragGlyphX(k);
                const kw = fragGlyphW(k);
                // a newer fragment starting inside an older one's glyph
                // range paints over the older text's start — treat the older
                // one as stale (dirty-redraw pattern)
                if (fx >= kx && fx < kx + kw) {
                    covered = true;
                    break;
                }
            }
            if (!covered) kept.push(f);
        }
        if (kept.length !== row.length) {
            // self-heal: permanently drop covered fragments
            const drop = new Set();
            for (const f of row) if (!kept.includes(f)) drop.add(f);
            for (let i = frags.length - 1; i >= 0; i--) {
                if (drop.has(frags[i])) frags.splice(i, 1);
            }
        }
        const seg = kept.sort((a, b) => fragGlyphX(a) - fragGlyphX(b));
        const out = [];
        for (const f of seg) {
            if (out.length === 0) {
                out.push(f);
            } else {
                const prev = out[out.length - 1];
                const gap = fragGlyphX(f) - (fragGlyphX(prev) + fragGlyphW(prev));
                if (gap <= 18) out.push(f);
                else break;
            }
        }
        return out;
    }

    // Code-point index of the character at pixel offset within a fragment.
    function charIndexAtPixel(frag, offset) {
        const cps = Array.from(frag.text);
        let acc = 0;
        for (let i = 0; i < cps.length; i++) {
            const w = measureWidth(frag.font, cps[i]);
            if (offset < acc + w / 2) return i;
            acc += w;
        }
        return cps.length - 1;
    }

    function worldTransformOf(sprite) {
        try {
            if (sprite.worldTransform) return sprite.worldTransform;
        } catch (e) {
            // ignore
        }
        return null;
    }

    function hitTest(clientX, clientY) {
        if (!JPDic.enabled) return null;
        const scene = SceneManager._scene;
        if (!scene || !scene.children) return null;
        const px = Graphics.pageToCanvasX(clientX);
        const py = Graphics.pageToCanvasY(clientY);
        if (!Graphics.isInsideCanvas(px, py)) return null;

        const owners = [];
        collectOwners(scene, null, owners);
        dbg(1, "hit", "pt=(" + px + "," + py + ") owners=" + owners.length);

        for (let i = owners.length - 1; i >= 0; i--) {
            const { sprite, window } = owners[i];
            const t = worldTransformOf(sprite);
            if (!t) continue;
            const local = t.applyInverse({ x: px, y: py }, { x: 0, y: 0 });
            const frags = sprite.bitmap.__jpdicFragments;
            if (OPT.debug >= 1) {
                dbg(1, "hit", "  owner[" + i + "] win=" +
                    (window ? (window.constructor && window.constructor.name) || "Window" : "-") +
                    " open=" + (window ? window._openness : "-") +
                    " bmp=" + bmpTag(sprite.bitmap) + " frags=" + frags.length +
                    " local=(" + local.x.toFixed(1) + "," + local.y.toFixed(1) + ")");
            }
            let hitFrag = null;
            // newest drawn fragment wins (dirty redraws paint over old text)
            for (let i = frags.length - 1; i >= 0; i--) {
                const f = frags[i];
                const fx = fragGlyphX(f);
                const fw = fragGlyphW(f);
                if (
                    local.x >= fx - 1 &&
                    local.x <= fx + fw + 1 &&
                    local.y >= f.y &&
                    local.y <= f.y + f.lineHeight
                ) {
                    hitFrag = f;
                    break;
                }
            }
            if (!hitFrag) {
                dbg(1, "hit", "    (no fragment hit)");
                continue;
            }
            if (OPT.debug >= 1) {
                dbg(1, "hit", "    frag " + JSON.stringify(hitFrag.text) +
                    " @" + hitFrag.x + "," + hitFrag.y +
                    " w=" + fragGlyphW(hitFrag).toFixed(1) +
                    " [#" + frags.indexOf(hitFrag) + "/" + frags.length + "]");
            }
            if (OPT.debug >= 2) {
                for (let d = 0; d < frags.length; d++) {
                    const f = frags[d];
                    dbg(2, "hit", "      frag[" + d + "] " + JSON.stringify(f.text) +
                        " @x=" + fragGlyphX(f).toFixed(1) + " y=" + f.y +
                        " w=" + fragGlyphW(f).toFixed(1) + " h=" + f.lineHeight);
                }
            }

            const seg = buildRow(frags, hitFrag);
            // find the hit fragment's position in the segment FIRST, then
            // count the characters that precede it (a one-pass loop that
            // sets hitSegIndex while accumulating gets the offset wrong:
            // fragments before the hit never see the final index)
            let hitSegIndex = -1;
            for (let s = 0; s < seg.length; s++) {
                if (seg[s] === hitFrag) {
                    hitSegIndex = s;
                    break;
                }
            }
            if (hitSegIndex < 0) hitSegIndex = 0; // paranoia: always in seg
            let line = "";
            let lineOffset = 0;
            for (let s = 0; s < seg.length; s++) {
                if (s < hitSegIndex) {
                    lineOffset += Array.from(seg[s].text).length;
                }
                line += seg[s].text;
            }
            const offsetX = local.x - fragGlyphX(hitFrag);
            const localIdx = charIndexAtPixel(hitFrag, offsetX);
            const charIndex = lineOffset + localIdx;
            dbg(1, "hit", "    line=" + JSON.stringify(line) +
                " lineOffset=" + lineOffset + " localIdx=" + localIdx +
                " charIndex=" + charIndex);

            const p = t.apply(
                { x: fragGlyphX(hitFrag), y: hitFrag.y },
                { x: 0, y: 0 }
            );
            const p2 = t.apply(
                { x: fragGlyphX(hitFrag) + fragGlyphW(hitFrag), y: hitFrag.y + hitFrag.lineHeight },
                { x: 0, y: 0 }
            );

            const source = window
                ? (window.constructor && window.constructor.name) || "Window"
                : (sprite.constructor && sprite.constructor.name) || "Sprite";

            return {
                line: line,
                charIndex: charIndex,
                text: hitFrag.text,
                source: source,
                window: window,
                fragment: hitFrag,
                rect: {
                    x: Math.min(p.x, p2.x),
                    y: Math.min(p.y, p2.y),
                    w: Math.abs(p2.x - p.x),
                    h: Math.abs(p2.y - p.y)
                },
                clientX: clientX,
                clientY: clientY
            };
        }
        dbg(1, "hit", "no hit anywhere");
        return null;
    }

    function snapshotFragments() {
        const scene = SceneManager._scene;
        if (!scene || !scene.children) return [];
        const owners = [];
        collectOwners(scene, null, owners);
        const out = [];
        for (const { sprite, window } of owners) {
            const t = worldTransformOf(sprite);
            if (!t) continue;
            for (const f of sprite.bitmap.__jpdicFragments) {
                const p = t.apply({ x: fragGlyphX(f), y: f.y }, { x: 0, y: 0 });
                const p2 = t.apply(
                    { x: fragGlyphX(f) + fragGlyphW(f), y: f.y + f.lineHeight },
                    { x: 0, y: 0 }
                );
                out.push({
                    text: f.text,
                    rect: {
                        x: Math.min(p.x, p2.x),
                        y: Math.min(p.y, p2.y),
                        w: Math.abs(p2.x - p.x),
                        h: Math.abs(p2.y - p.y)
                    },
                    source: window
                        ? (window.constructor && window.constructor.name) || "Window"
                        : (sprite.constructor && sprite.constructor.name) || "Sprite"
                });
            }
        }
        return out;
    }

    //=========================================================================
    // 6. Popup DOM
    //=========================================================================

    const CSS = `
#jpdic-popup {
    position: fixed;
    z-index: 9999;
    background: #17181c;
    color: #e8e8ec;
    border: 1px solid #3a3d46;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.55);
    font-family: "Segoe UI", Meiryo, system-ui, sans-serif;
    overflow: hidden;
    pointer-events: auto;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
}
#jpdic-popup .jpdic-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #1f2127;
    border-bottom: 1px solid #2c2f38;
}
#jpdic-popup .jpdic-term {
    font-size: 1.25em;
    font-weight: 700;
    color: #7ec4ff;
    word-break: break-all;
    flex: 1 1 auto;
}
#jpdic-popup .jpdic-sub {
    font-size: 0.85em;
    color: #8b8f9c;
    flex: 2 1 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#jpdic-popup .jpdic-x {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: #8b8f9c;
    font-size: 15px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
}
#jpdic-popup .jpdic-x:hover { background: #2c2f38; color: #fff; }
#jpdic-popup .jpdic-cands {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid #2c2f38;
    background: #191b20;
}
#jpdic-popup .jpdic-cands:empty { display: none; }
#jpdic-popup .jpdic-chip {
    background: #23252c;
    border: 1px solid #31343e;
    color: #b9c2d4;
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 0.85em;
    cursor: pointer;
    user-select: none;
}
#jpdic-popup .jpdic-chip:hover { border-color: #7ec4ff; color: #7ec4ff; }
#jpdic-popup .jpdic-chip.jpdic-sel {
    border-color: #7ec4ff;
    color: #7ec4ff;
    background: #1d2836;
}
#jpdic-popup .jpdic-body {
    padding: 8px 10px;
    overflow-y: auto;
    font-size: 0.95em;
    line-height: 1.45;
    word-break: break-word;
}
#jpdic-popup .jpdic-body a { color: #7ec4ff; }
#jpdic-popup .jpdic-entry { margin-bottom: 8px; }
#jpdic-popup .jpdic-entry:last-child { margin-bottom: 0; }
#jpdic-popup .jpdic-entry .jpdic-e-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
#jpdic-popup .jpdic-entry .jpdic-e-term { font-weight: 700; color: #ffd479; }
#jpdic-popup .jpdic-entry .jpdic-e-read { color: #9aa3b8; font-size: 0.9em; }
#jpdic-popup .jpdic-entry .jpdic-e-gloss { color: #cdd3e0; }
#jpdic-popup .jpdic-entry .jpdic-e-gloss ol { margin: 2px 0 0 18px; padding: 0; }
#jpdic-popup .jpdic-note { color: #8b8f9c; }
#jpdic-popup .jpdic-warn { color: #e0a05f; }
#jpdic-popup .jpdic-src {
    padding: 4px 10px;
    font-size: 0.75em;
    color: #6c7080;
    background: #141519;
    border-top: 1px solid #23252c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
`;

    let styleEl = null;

    function ensureStyle() {
        if (styleEl) return;
        styleEl = document.createElement("style");
        styleEl.id = "jpdic-style";
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
    }

    function el(tag, cls, parent) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (parent) parent.appendChild(e);
        return e;
    }

    function buildContext(hit) {
        const cps = Array.from(hit.line);
        const cands = buildCandidates(hit.line, hit.charIndex, 256);
        const guessed = guessTerm(cps, hit.charIndex);
        const term = guessed || hit.text;
        dbg(1, "ctx", "charIndex=" + hit.charIndex +
            " guess=" + JSON.stringify(guessed) +
            (guessed ? "" : " (FALLBACK: fragment text used as term)") +
            " term=" + JSON.stringify(term) + " cands=" + cands.length);
        return {
            term: term,
            candidates: cands,
            deinflected: cands.reduce((a, c) => a.concat(deinflect(c)), []),
            line: hit.line,
            charIndex: hit.charIndex,
            fullText: JPDic.current ? JPDic.current.lines.join("\n") : null,
            speaker: JPDic.current ? JPDic.current.speaker : null,
            source: hit.source,
            rect: hit.rect,
            clientX: hit.clientX,
            clientY: hit.clientY
        };
    }

    function closePopup() {
        if (popupEl) {
            dbg(1, "popup", "close");
            flushLog();
            popupEl.remove();
            popupEl = null;
            popupRefs = null;
            lookupSeq++;
        }
        followState = null;
        removeHighlight();
        fire("popup-close", {});
    }

    function renderEntries(body, entries) {
        for (const e of entries) {
            const box = el("div", "jpdic-entry", body);
            const head = el("div", "jpdic-e-head", box);
            el("span", "jpdic-e-term", head).textContent = e.term || e.word || "";
            if (e.reading) el("span", "jpdic-e-read", head).textContent = e.reading;
            if (e.tags) {
                const t = el("span", "jpdic-e-read", head);
                t.textContent = Array.isArray(e.tags)
                    ? e.tags.join(" ・ ")
                    : String(e.tags);
            }
            const gl = el("div", "jpdic-e-gloss", box);
            const glosses = e.glosses || e.glossary || [];
            if (glosses.length > 0) {
                const ol = el("ol", null, gl);
                for (const g of glosses) el("li", null, ol).textContent = String(g);
            } else if (e.gloss) {
                gl.textContent = String(e.gloss);
            }
        }
    }

    function renderDefaultBody(body, ctx) {
        const warn = el("div", "jpdic-note", body);
        warn.textContent =
            "No dictionary hooked up. Call JPDic.setLookup(async ctx => …) " +
            "to render results here.";
        if (ctx.line) {
            const lineBox = el("div", null, body);
            lineBox.style.marginTop = "8px";
            const cps = Array.from(ctx.line);
            lineBox.textContent =
                cps.slice(0, ctx.charIndex).join("") +
                "【" + cps[ctx.charIndex] + "】" +
                cps.slice(ctx.charIndex + 1).join("");
        }
        if (ctx.deinflected && ctx.deinflected.length > 0) {
            const d = el("div", "jpdic-note", body);
            d.style.marginTop = "6px";
            d.textContent = "Deinflected: " + ctx.deinflected.slice(0, 12).join(" / ");
        }
    }

    //=========================================================================
    // 6. Built-in JMdict dictionary (optional)
    //=========================================================================

    // If a compact JMdict dump (see tools/jmdict_to_compact.py) is present,
    // lookups use it automatically — no second plugin needed. A custom
    // handler registered via JPDic.setLookup() always takes priority; the
    // parameter "useJmdict" can disable the built-in dictionary entirely.

    let jmdictDb = null;
    let jmdictTried = false;

    function jmdictCandidates() {
        // Where the dump may live. The primary path is beside this plugin
        // (js/plugins/jmdict-compact.json), mirroring how MZ itself locates
        // files via process.mainModule; save/ is a legacy fallback.
        const paths = [];
        try {
            const path = require("path");
            try {
                if (process.mainModule && process.mainModule.filename) {
                    const root = path.dirname(process.mainModule.filename);
                    paths.push(path.join(root, "js", "plugins", "jmdict-compact.json"));
                    paths.push(path.join(root, "save", "jmdict-compact.json"));
                }
            } catch (e) {
                // mainModule unavailable
            }
            try {
                paths.push(path.join(process.cwd(), "js", "plugins", "jmdict-compact.json"));
                paths.push(path.join(process.cwd(), "save", "jmdict-compact.json"));
            } catch (e) {
                // cwd unavailable
            }
            if (typeof __dirname !== "undefined") {
                // beside this script (js/plugins/)
                paths.push(path.join(__dirname, "jmdict-compact.json"));
            }
            try {
                const exe = path.dirname(process.execPath);
                paths.push(path.join(exe, "js", "plugins", "jmdict-compact.json"));
                paths.push(path.join(exe, "save", "jmdict-compact.json"));
            } catch (e) {
                // execPath unavailable
            }
        } catch (e) {
            // not on node — no built-in dictionary outside NW.js
        }
        return paths;
    }

    function jmdictData() {
        if (jmdictTried) return jmdictDb;
        jmdictTried = true;
        try {
            const fs = require("fs");
            const cands = jmdictCandidates();
            for (const p of cands) {
                dbg(2, "jmdict", "trying " + p);
                try {
                    const text = fs.readFileSync(p, "utf8");
                    jmdictDb = JSON.parse(text);
                    const msg = "loaded " + jmdictDb.e.length + " entries, " +
                        Object.keys(jmdictDb.k).length + " headwords from " + p;
                    console.log("[JPDicPopup] " + msg);
                    dbg(1, "jmdict", msg);
                    return jmdictDb;
                } catch (e) {
                    dbg(2, "jmdict", "miss: " + (e && e.message ? e.message : e));
                }
            }
            console.warn(
                "[JPDicPopup] jmdict-compact.json not found — the built-in " +
                "dictionary is disabled. Place it beside JPDicPopup.js " +
                "(js/plugins/). Tried:\n  " + cands.join("\n  ")
            );
            dbg(1, "jmdict", "jmdict-compact.json not found — built-in dictionary disabled");
        } catch (e) {
            console.warn("[JPDicPopup] JMdict load failed:", e);
            dbg(1, "jmdict", "JMdict load failed: " + e);
        }
        return jmdictDb;
    }

    // Term-first, picked-aware lookup over the compact dump:
    //   1. the header term (guessed word or an explicitly picked chip),
    //      direct then deinflected,
    //   2. if it missed, the candidate walk around the click (longest
    //      first, also deinflected) — never for an explicit pick: the user
    //      chose that term, so "Not found." is the honest answer,
    //   3. first headword with entries wins; up to 4 entries are shown
    //      (common words are ordered first by the converter).
    function jmdictLookup(ctx) {
        const data = jmdictDb;
        if (!data) return null;
        const shown = [];
        const seenIdx = new Set();
        const tryTerm = term => {
            const idxs = data.k[term];
            if (!idxs) return false;
            let any = false;
            for (const i of idxs) {
                if (seenIdx.has(i)) continue;
                seenIdx.add(i);
                const e = data.e[i];
                shown.push({ term: e[0], reading: e[1], glosses: e[2] });
                any = true;
                if (shown.length >= 4) break;
            }
            return any;
        };
        if (ctx.term) {
            if (!tryTerm(ctx.term)) {
                for (const d of deinflect(ctx.term)) {
                    if (tryTerm(d)) break;
                }
            }
        }
        if (!ctx.picked && shown.length === 0) {
            for (const cand of ctx.candidates || []) {
                if (cand === ctx.term) continue;
                if (tryTerm(cand)) break;
                let found = false;
                for (const d of deinflect(cand)) {
                    if (tryTerm(d)) {
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }
        if (shown.length === 0) {
            dbg(1, "jmdict", "miss: term=" + JSON.stringify(ctx.term) +
                " picked=" + !!ctx.picked + " cands=" +
                (ctx.candidates || []).slice(0, 6).join(" / "));
            return null;
        }
        dbg(1, "jmdict", "hit: " + shown.length + " entries (term=" +
            JSON.stringify(ctx.term) + " -> " + shown[0].term + ")");
        return { entries: shown };
    }

    // Would the built-in dictionary resolve this term? (direct hit or any
    // deinflected variant). Used to filter candidate chips down to terms
    // that are guaranteed to produce a result when clicked.
    function jmdictResolves(term) {
        const data = jmdictDb;
        if (!data || !term) return false;
        if (data.k[term]) return true;
        const vars = deinflect(term);
        for (let i = 0; i < vars.length; i++) {
            if (data.k[vars[i]]) return true;
        }
        return false;
    }

    async function runLookup(body, ctx, seq) {
        const useBuiltin = !lookupHandler && OPT.useJmdict && !!jmdictData();
        dbg(1, "lookup", "term=" + JSON.stringify(ctx.term) +
            " picked=" + !!ctx.picked + " seq=" + seq +
            (lookupHandler ? " handler=custom" : useBuiltin ? " handler=jmdict" : " handler=none"));
        if (lookupHandler || useBuiltin) {
            body.innerHTML = "";
            body.textContent = "…";
        }
        try {
            const result = lookupHandler
                ? await lookupHandler(ctx)
                : useBuiltin ? jmdictLookup(ctx) : null;
            if (seq !== lookupSeq || body.isConnected !== true) {
                dbg(1, "lookup", "stale result discarded (seq=" + seq +
                    " current=" + lookupSeq + ")");
                return; // stale
            }
            body.innerHTML = "";
            if (!lookupHandler && !useBuiltin) {
                renderDefaultBody(body, ctx);
                return;
            }
            if (result === null || result === undefined || result === false) {
                dbg(1, "lookup", "→ Not found");
                body.textContent = "Not found.";
                return;
            }
            if (typeof result === "string") {
                dbg(1, "lookup", "→ string (" + result.length + " chars)");
                body.innerHTML = result;
            } else if (
                typeof HTMLElement !== "undefined" &&
                result instanceof HTMLElement
            ) {
                body.appendChild(result);
            } else if (typeof result === "object" && result.html) {
                body.innerHTML = String(result.html);
            } else if (
                typeof result === "object" &&
                (Array.isArray(result) || result.entries)
            ) {
                dbg(1, "lookup", "→ " +
                    (Array.isArray(result) ? result.length : result.entries.length) +
                    " entries");
                renderEntries(body, Array.isArray(result) ? result : result.entries);
            } else {
                body.textContent = String(result);
            }
        } catch (e) {
            if (seq !== lookupSeq) return;
            body.innerHTML = "";
            const err = el("div", "jpdic-warn", body);
            err.textContent = "Lookup error: " + e;
            console.error("[JPDicPopup] lookup handler threw", e);
        }
    }

    let popupRefs = null; // {term, sub, cands, body, src}
    let lookupSeq = 0;

    function buildShell() {
        ensureStyle();
        const root = el("div", null, null);
        root.id = "jpdic-popup";
        root.style.width = OPT.popupWidth + "px";
        root.style.fontSize = OPT.fontSize + "px";
        document.body.appendChild(root);
        popupEl = root;

        const head = el("div", "jpdic-head", root);
        const term = el("span", "jpdic-term", head);
        const sub = el("span", "jpdic-sub", head);
        const x = el("button", "jpdic-x", head);
        x.textContent = "×";
        x.addEventListener("click", e => {
            e.stopPropagation();
            closePopup();
        });

        const cands = el("div", "jpdic-cands", root);
        const body = el("div", "jpdic-body", root);
        const src = el("div", "jpdic-src", root);

        popupRefs = { term, sub, cands, body, src };
    }

    function renderPopup(ctx) {
        const r = popupRefs;
        if (!r) return;
        const seq = ++lookupSeq;

        r.term.textContent = ctx.term || "?";
        r.sub.textContent = ctx.speaker || "";
        r.src.textContent = ctx.source || "";

        // candidate chips (best guess first, then longest-first candidates).
        // When the built-in JMdict is the active dictionary, filter chips down
        // to terms that actually resolve — every chip then leads somewhere.
        // (custom handlers / the fallback body keep the raw, unfiltered list:
        // a custom dictionary may resolve anything)
        const builtin = !lookupHandler && OPT.useJmdict && !!jmdictData();
        const chipOk = builtin ? jmdictResolves : () => true;
        r.cands.innerHTML = "";
        const chipTerms = [];
        if (ctx.term && !(ctx.candidates || []).includes(ctx.term) &&
            chipOk(ctx.term)) {
            chipTerms.push(ctx.term);
        }
        for (const c of ctx.candidates || []) {
            if (chipTerms.includes(c)) continue;
            if (!chipOk(c)) continue;
            chipTerms.push(c);
        }
        chipTerms.slice(0, 10).forEach((c, i) => {
            const chip = el(
                "span",
                "jpdic-chip" + (i === 0 ? " jpdic-sel" : ""),
                r.cands
            );
            chip.textContent = c;
            chip.addEventListener("click", e => {
                e.stopPropagation();
                for (const other of r.cands.children) {
                    other.classList.remove("jpdic-sel");
                }
                chip.classList.add("jpdic-sel");
                // picked: explicit term choice — the lookup must target THIS
                // chip's term, not re-walk the original candidate list
                const newCtx = Object.assign({}, ctx, {
                    term: c,
                    picked: true
                });
                r.term.textContent = c;
                runLookup(r.body, newCtx, ++lookupSeq);
            });
        });

        runLookup(r.body, ctx, seq);
    }

    function positionPopup(x, y) {
        const root = popupEl;
        if (!root) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        root.style.left = "0px";
        root.style.top = "0px";
        const w = root.offsetWidth;
        const h = root.offsetHeight;
        let lx = x + 14;
        let ly = y + 14;
        if (lx + w > vw) lx = x - w - 14;
        if (ly + h > vh) ly = y - h - 14;
        root.style.left = Math.max(4, lx) + "px";
        root.style.top = Math.max(4, ly) + "px";
    }

    function openPopup(hit, clientX, clientY) {
        closePopup();

        const ctx = hit.term !== undefined
            ? hit // already a context (programmatic open)
            : buildContext(hit);

        buildShell();
        renderPopup(ctx);
        positionPopup(clientX, clientY);

        if (OPT.highlight && ctx.rect) {
            showHighlight(ctx.rect);
        }

        dbg(1, "popup", "open term=" + JSON.stringify(ctx.term) +
            " source=" + ctx.source + " @" + clientX + "," + clientY);
        flushLog();
        fire("popup-open", ctx);
    }

    //=========================================================================
    // 7. Highlight overlay (PIXI)
    //=========================================================================

    function showHighlight(rect) {
        try {
            removeHighlight();
            const scene = SceneManager._scene;
            if (!scene) return;
            const g = new PIXI.Graphics();
            g.beginFill(0x2196f3, 0.22);
            g.lineStyle(1, 0x2196f3, 0.9);
            g.drawRect(rect.x - 2, rect.y - 1, rect.w + 4, rect.h + 2);
            g.endFill();
            g.zIndex = 9000;
            scene.addChild(g);
            highlightEl = g;
        } catch (e) {
            highlightEl = null;
        }
    }

    function removeHighlight() {
        if (highlightEl) {
            try {
                if (highlightEl.parent) highlightEl.parent.removeChild(highlightEl);
                highlightEl.destroy();
            } catch (e) {
                // scene may already be gone
            }
            highlightEl = null;
        }
    }

    //=========================================================================
    // 8. Input handling / gestures
    //=========================================================================

    // ---- modifier key -----------------------------------------------------

    function normalizeKeyNames(str) {
        return String(str || "")
            .split(/[,\u3000\s]+/)
            .map(k => {
                k = k.trim();
                if (!k) return null;
                const lower = k.toLowerCase();
                if (/^[a-z]$/i.test(k)) return "Key" + k.toUpperCase();
                if (/^[0-9]$/.test(k)) return "Digit" + k;
                if (lower === "ctrl" || lower === "control") return "ControlLeft";
                if (lower === "shift") return "ShiftLeft";
                if (lower === "alt") return "AltLeft";
                if (/^f([1-9]|1[0-2])$/i.test(k)) return "F" + k.slice(1);
                return k; // event.code names are case-sensitive (KeyX, DigitN, Comma ...)
            })
            .filter(Boolean);
    }

    const MOD_KEYS = normalizeKeyNames(OPT.key);
    let keyHeld = false;

    function onKeyDown(e) {
        if (MOD_KEYS.includes(e.code)) {
            keyHeld = true;
            if (JPDic.enabled && OPT.consumeKey) {
                consume(e);
                return;
            }
        }
        if (JPDic.enabled && e.key === "Escape" && popupEl) {
            consume(e);
            closePopup();
        }
    }

    function onKeyUp(e) {
        if (MOD_KEYS.includes(e.code)) {
            keyHeld = false;
            if (followState && followState.source === "key") followState = null;
        }
    }

    // ---- helpers ----------------------------------------------------------

    function messageWindowIdle() {
        const scene = SceneManager._scene;
        const mw = scene && scene._messageWindow;
        if (!mw) return false;
        if (!mw.isOpen()) return false;
        if (mw._textState) return false; // still typing
        return true;
    }

    function consume(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function inPopup(target) {
        return !!(target && target.closest && target.closest("#jpdic-popup"));
    }

    // ---- popup follow ("follow the cursor/finger") -------------------------

    let followState = null; // {source: "touch" | "key", last: signature}

    function startFollow(source) {
        if (OPT.follow) followState = { source: source, last: null };
    }

    function followUpdate(hit, x, y) {
        if (!followState || !popupEl) return;
        const sig = hit.line + "@" + hit.charIndex;
        positionPopup(x, y);
        if (sig === followState.last) return;
        followState.last = sig;
        const ctx = buildContext(hit);
        renderPopup(ctx);
        if (ctx.rect) showHighlight(ctx.rect);
    }

    // ---- mouse ------------------------------------------------------------

    let pendingLeft = null; // {x, y, hit, via}

    function onMouseDown(e) {
        if (!JPDic.enabled) return;
        if (e.button !== 0) return;

        if (popupEl) {
            // popup handles its own events; the game must not see these clicks
            if (inPopup(e.target)) {
                consume(e);
                return;
            }
            // modifier held: REFRESH the popup to the word under the cursor
            // instead of just closing it
            if (GESTURES.key && keyHeld) {
                consume(e);
                const hit = hitTest(e.clientX, e.clientY);
                if (hit) {
                    pendingLeft = {
                        x: e.clientX,
                        y: e.clientY,
                        hit: hit,
                        via: "key"
                    };
                } else {
                    closePopup();
                }
                return;
            }
            closePopup();
            consume(e);
            return;
        }

        // hold-key + click: any left click while the modifier is held is
        // consumed, so "click advances text" games stay put
        if (GESTURES.key && keyHeld) {
            consume(e);
            const hit = hitTest(e.clientX, e.clientY);
            if (hit) {
                pendingLeft = { x: e.clientX, y: e.clientY, hit: hit, via: "key" };
            }
            return;
        }

        // opt-in: left click when the message is idle
        if (GESTURES.left && messageWindowIdle()) {
            const hit = hitTest(e.clientX, e.clientY);
            if (hit && (hit.window instanceof Window_Message ||
                        (typeof Window_NameBox !== "undefined" &&
                         hit.window instanceof Window_NameBox))) {
                consume(e);
                pendingLeft = { x: e.clientX, y: e.clientY, hit: hit, via: "left" };
            }
        }
    }

    function onMouseMove(e) {
        // key-follow: popup tracks the word under the cursor while held
        if (
            followState &&
            followState.source === "key" &&
            keyHeld &&
            popupEl
        ) {
            const hit = hitTest(e.clientX, e.clientY);
            if (hit) followUpdate(hit, e.clientX, e.clientY);
            return;
        }

        if (!pendingLeft) return;
        const dx = e.clientX - pendingLeft.x;
        const dy = e.clientY - pendingLeft.y;
        if (dx * dx + dy * dy > 36) pendingLeft = null; // drag: cancel
    }

    function onMouseUp(e) {
        if (e.button !== 0) return;
        if (JPDic.enabled && keyHeld) consume(e);
        const p = pendingLeft;
        if (!p) return;
        pendingLeft = null;
        if (!JPDic.enabled) return;
        consume(e);
        // openPopup replaces any popup already on screen — a pending
        // lookup always refreshes it
        openPopup(buildContext(p.hit), p.x, p.y);
        if (p.via === "key") startFollow("key");
    }

    // ---- mouse: right click ------------------------------------------------

    let pendingRight = null;

    function onMouseDownRight(e) {
        if (!JPDic.enabled || e.button !== 2) return;
        if (popupEl) return; // handled by contextmenu
        if (!GESTURES.right) return;
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
            dbg(1, "mouse", "right mousedown on " + JSON.stringify(hit.text) + " → pending");
            consume(e);
            pendingRight = hit;
        }
    }

    function onContextMenu(e) {
        if (!JPDic.enabled) return;
        dbg(1, "mouse", "contextmenu @(" + e.clientX + "," + e.clientY + ")");
        if (inPopup(e.target)) {
            dbg(1, "mouse", "  inside popup → consume");
            consume(e);
            return;
        }
        // a touch long-press also fires contextmenu in Chromium — don't let
        // it close the popup the long-press just opened
        if (followState && followState.source === "touch") {
            consume(e);
            return;
        }
        if (popupEl) {
            // popup already open: refresh it to the word under the cursor
            // (openPopup closes the old one) instead of just dismissing
            const hit = hitTest(e.clientX, e.clientY);
            pendingRight = null;
            if (hit) {
                dbg(1, "mouse", "  popup open → refresh");
                consume(e);
                openPopup(buildContext(hit), e.clientX, e.clientY);
            } else {
                dbg(1, "mouse", "  popup open, no text → close");
                closePopup();
                consume(e);
            }
            return;
        }
        const hit = pendingRight || hitTest(e.clientX, e.clientY);
        pendingRight = null;
        if (hit) {
            dbg(1, "mouse", "  open (right)");
            consume(e);
            openPopup(buildContext(hit), e.clientX, e.clientY);
        } else {
            dbg(1, "mouse", "  no text → ignore");
        }
        // else: not on text — do nothing; engine already suppresses the
        // browser context menu.
    }

    // ---- touch: long-press + follow ---------------------------------------

    let pendingHold = null; // {x, y, timer, fired, done, event}

    // Re-deliver a consumed touchstart to the engine so quick taps and
    // drags keep working (tap-to-advance, map touch movement).
    function replayTouchStart(event) {
        try {
            TouchInput._onTouchStart.call(TouchInput, event);
        } catch (e) {
            // if the engine internals change, silently give up
        }
    }

    function onTouchStart(e) {
        if (!JPDic.enabled) return;
        if (!GESTURES.hold) return;

        let swallowed = false;
        if (popupEl) {
            if (inPopup(e.target)) {
                // touch on the popup itself: swallow it (engine must not
                // see taps meant for the popup)
                consume(e);
                return;
            }
            closePopup();
            consume(e);
            // the tap that dismissed the popup must not fall through to
            // the game, but an immediate long-press on a new word should
            // still refresh it
            swallowed = true;
        }

        // consume every touchstart while the hold gesture is armed; decide
        // on release / hold-delay whether the game should see it
        consume(e);
        // a pending hold that already fired or was handed back is stale
        // bookkeeping — replace it; only an ACTIVE hold (timer running,
        // not yet decided) blocks a second finger
        if (pendingHold && !pendingHold.fired && !pendingHold.done) {
            return; // extra finger during a pending hold
        }
        const t = e.changedTouches ? e.changedTouches[0] : null;
        if (!t) return;
        pendingHold = {
            x: t.clientX,
            y: t.clientY,
            timer: null,
            fired: false,
            done: false,
            swallowed: swallowed,
            event: e
        };
        pendingHold.timer = setTimeout(() => {
            const ph = pendingHold;
            if (!ph || ph.done || ph.fired) return;
            ph.fired = true;
            const hit = hitTest(ph.x, ph.y);
            dbg(1, "touch", "long-press fired → " +
                (hit ? "open" : "no text, swallow"));
            if (hit) {
                openPopup(buildContext(hit), ph.x, ph.y);
                startFollow("touch");
            } else {
                // held on nothing: treat as intent, don't replay the tap
                ph.done = true;
            }
        }, OPT.holdDelay);
    }

    function onTouchMove(e) {
        // follow: popup tracks the word under the finger
        if (followState && followState.source === "touch" && popupEl) {
            const t = e.changedTouches ? e.changedTouches[0] : null;
            if (t) {
                const hit = hitTest(t.clientX, t.clientY);
                if (hit) followUpdate(hit, t.clientX, t.clientY);
            }
            consume(e);
            return;
        }

        const ph = pendingHold;
        if (!ph) return;
        const t = e.changedTouches ? e.changedTouches[0] : null;
        if (!t) return;
        const dx = t.clientX - ph.x;
        const dy = t.clientY - ph.y;
        const moved = dx * dx + dy * dy > 144;

        if (ph.fired) {
            // drag with popup open — keep following, game stays blind
            consume(e);
            return;
        }
        if (moved && !ph.done) {
            // moved before the hold fired: this is a drag/scroll — hand the
            // touch back to the engine
            ph.done = true;
            clearTimeout(ph.timer);
            pendingHold = null;
            replayTouchStart(ph.event);
        }
    }

    function onTouchEnd(e) {
        if (followState && followState.source === "touch") {
            // finger released after a lookup: popup stays put
            followState = null;
            pendingHold = null; // its hold already fired — drop the record
            consume(e);
            return;
        }

        const ph = pendingHold;
        if (!ph) return;
        pendingHold = null;
        clearTimeout(ph.timer);
        if (ph.done || ph.fired || ph.swallowed) {
            consume(e);
            return;
        }
        // quick tap: replay the touchstart (the engine's own touchend
        // listener still receives this event and finishes the tap)
        dbg(1, "touch", "quick tap → replay to engine");
        replayTouchStart(ph.event);
    }

    function onTouchCancel(e) {
        const ph = pendingHold;
        pendingHold = null;
        if (ph) {
            clearTimeout(ph.timer);
            if (!ph.done && !ph.fired && !ph.swallowed) {
                // restore engine state, then let its touchcancel handler run
                replayTouchStart(ph.event);
                return;
            }
            consume(e);
        }
        if (followState && followState.source === "touch") followState = null;
        if (popupEl) {
            closePopup();
            consume(e);
        }
    }

    function onBlur() {
        keyHeld = false;
        if (pendingHold) {
            clearTimeout(pendingHold.timer);
            pendingHold = null;
        }
        followState = null;
    }

    // Capture phase on window beats all of the engine's document-level
    // listeners (TouchInput / Input / WebAudio), letting us consume events.
    window.addEventListener("mousedown", e => {
        onMouseDown(e);
        onMouseDownRight(e);
    }, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur, true);
    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    window.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: false });

    //=========================================================================
    // 9. Boot banner
    //=========================================================================

    const _SceneManager_onSceneStart = SceneManager.onSceneStart;
    SceneManager.onSceneStart = function() {
        _SceneManager_onSceneStart.apply(this, arguments);
        if (!SceneManager.__jpdicBanner) {
            SceneManager.__jpdicBanner = true;
            const gs = GESTURES;
            const names = [];
            if (gs.right) names.push("right-click");
            if (gs.key) names.push("hold-" + (MOD_KEYS[0] || "?") + "+click");
            if (gs.left) names.push("click-when-idle");
            if (gs.hold) names.push("long-press");
            console.log(
                "%c[JPDicPopup]%c ready — device: %s | gestures: %s",
                "color:#7ec4ff;font-weight:bold",
                "color:inherit",
                CAP.hover ? (CAP.touch ? "mouse+touch" : "mouse") : "touch",
                names.join(", ")
            );
        }
    };

    // expose the plugin for other scripts
    window.JPDicPopup = JPDic;
})();
