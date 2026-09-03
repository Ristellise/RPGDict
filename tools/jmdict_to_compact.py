#!/usr/bin/env python3
"""
jmdict_to_compact.py — one-time converter: JMdict XML ("NG" format) -> compact
JSON for the JPDicPopup plugin.

Usage:
    python3 tools/jmdict_to_compact.py [JMdictXML] [OUTPUT.json]

Defaults:
    JMdictXML = JMdict_e_NG in the current directory, next to this script,
                or next to the script's parent (the distribution root)
    OUTPUT    = js/plugins/jmdict-compact.json   (beside the plugin)

Output format (what JPDicPopup's lookup hook consumes):

    {
      "e": [
        [ "犯す", "おかす",
          [ "(v5t,vt) to commit (a crime)", "to rape", ... ] ],
        ...
      ],
      "k": { "犯す": [0], "おかす": [0, 12], ... }
    }

    e[i][0]  term    — primary kanji headword (kana-only entries: the reading)
    e[i][1]  reading — first reading ("" when identical to the term)
    e[i][2]  glosses — one string per gloss. The first gloss of each sense
                       carries an inline "(pos,field,misc,dial)" tag prefix,
                       e.g. "(v5t,vt) to commit (a crime)". s_inf free text
                       becomes a parenthetical gloss line. Senses with no
                       glosses but xrefs become "→ see ...".
    k[w]     list of entry indices reachable under headword w (every kanji
                       form and every reading of the entry).

Entries under a key are ordered: common (ichi1/news1/spec1/gai1) first,
then ichi2/news2/spec2/gai2, then the rest — stable within each tier
(original JMdict order, which keeps more idiomatic senses early).
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

from lxml import etree
import orjson

GAME_ROOT = Path(__file__).resolve().parent.parent
_SCRIPT_DIR = Path(__file__).resolve().parent
_XML_CANDIDATES = [
    Path.cwd() / "JMdict_e_NG",
    _SCRIPT_DIR / "JMdict_e_NG",
    _SCRIPT_DIR.parent / "JMdict_e_NG",
]
DEFAULT_XML = next((p for p in _XML_CANDIDATES if p.exists()), None)
DEFAULT_OUT = GAME_ROOT / "js" / "plugins" / "jmdict-compact.json"

XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"

PRI_RE = re.compile(r"^(ichi|news|spec|gai)([12])$")


def parse_entities(xml_path):
    """Read the internal DTD subset and build entity tables.

    Returns (rev_map, value_list):
      rev_map     resolved entity value -> abbreviation name (e.g. "noun" -> "n")
      value_list  list of (value, name) sorted by value length, for greedy
                  splitting of elements that contain several concatenated
                  entities.
    """
    text = xml_path.read_text(encoding="utf-8", errors="replace")
    head = text[: text.index("]>") + 2] if "]>" in text else text[:100000]
    ent = dict(re.findall(r"<!ENTITY\s+(\S+)\s+\"([^\"]*)\"", head))
    rev = {v: k for k, v in ent.items()}
    values = sorted(ent.items(), key=lambda kv: -len(kv[1]))
    return rev, [(v, k) for k, v in values]


def abbrs(text, rev_map, value_list):
    """Resolve tag element text to abbreviation names.

    Entity references are already expanded by the XML parser (e.g. &v5t;
    -> "Godan verb with `tsu' ending"), so map the expanded value back to
    the abbreviation. Handles multiple concatenated entities per element.
    """
    if not text:
        return []
    t = text.strip()
    if not t:
        return []
    if t in rev_map:
        return [rev_map[t]]
    out = []
    i = 0
    while i < len(t):
        for val, name in value_list:
            if val and t.startswith(val, i):
                out.append(name)
                i += len(val)
                break
        else:
            out.append(t[i:])
            i += 1
    return out


def tag_list(elem, child, rev_map, value_list):
    out = []
    for e in elem.findall(child):
        out.extend(abbrs(e.text, rev_map, value_list))
    return out


def sense_strings(sense, rev_map, value_list):
    """Build the flat list of gloss strings for one <sense>."""
    tags = (
        tag_list(sense, "pos", rev_map, value_list)
        + tag_list(sense, "field", rev_map, value_list)
        + tag_list(sense, "misc", rev_map, value_list)
        + tag_list(sense, "dial", rev_map, value_list)
    )
    # dedupe, keep order
    seen = set()
    tags = [t for t in tags if not (t in seen or seen.add(t))]
    prefix = "(" + ",".join(tags) + ") " if tags else ""

    out = []
    glosses = [g for g in sense.findall("gloss")]
    first = True
    for g in glosses:
        lang = g.get(XML_LANG, "eng")
        if lang != "eng":
            continue
        text = (g.text or "").strip()
        if not text:
            continue
        gt = g.get("g_type")
        if gt:
            text += f" ({gt})"
        out.append((prefix if first else "") + text)
        first = False

    s_inf = sense.findtext("s_inf")
    if s_inf and s_inf.strip():
        out.append("(" + s_inf.strip() + ")")

    if not out:
        # sense with no glosses: keep "see also" xrefs so it is not lost
        xrefs = [(x.text or "").strip() for x in sense.findall("xref")]
        xrefs = [x for x in xrefs if x]
        if xrefs:
            return [prefix + "→ see " + ", ".join(xrefs)]

    return out


def pri_rank(pri_texts):
    """0 = very common, 1 = common, 2 = rest."""
    rank = 2
    for p in pri_texts:
        if not p:
            continue
        m = PRI_RE.match(p.strip())
        if m:
            rank = min(rank, int(m.group(2)) - 1)
    return rank


def convert(xml_path, out_path):
    rev_map, value_list = parse_entities(xml_path)

    entries = []   # [term, reading, [gloss, ...]]
    ranks = []     # parallel to entries
    keys = defaultdict(list)  # headword -> [entry index]

    context = etree.iterparse(
        str(xml_path), events=("end",), tag="entry", resolve_entities=True
    )

    n = 0
    for _, elem in context:
        kebs = []
        keb_pris = []
        for ke in elem.findall("k_ele"):
            keb = (ke.findtext("keb") or "").strip()
            if keb:
                kebs.append(keb)
                keb_pris.extend(ke.findall("ke_pri"))

        rebs = []
        restrs = []
        reb_pris = []
        for re_ in elem.findall("r_ele"):
            reb = (re_.findtext("reb") or "").strip()
            if not reb:
                continue
            rebs.append(reb)
            restrs.append(
                [(r.text or "").strip() for r in re_.findall("re_restr")]
            )
            reb_pris.extend(re_.findall("re_pri"))

        if not rebs:
            # DTD says r_ele+ — skip defensively anyway
            elem.clear()
            while elem.getprevious() is not None:
                del elem.getparent()[0]
            continue

        # headword: first kanji form; kana-only entries use the reading
        term = kebs[0] if kebs else rebs[0]
        # reading: first reb valid for the chosen headword (empty re_restr
        # = applies to all kebs)
        reading = ""
        for reb, restr in zip(rebs, restrs):
            if not kebs or not restr or term in restr:
                reading = reb
                break
        if not reading:
            reading = rebs[0]
        if reading == term:
            reading = ""

        glosses = []
        for sense in elem.findall("sense"):
            glosses.extend(sense_strings(sense, rev_map, value_list))
        if not glosses:
            glosses = ["(no gloss)"]

        idx = len(entries)
        entries.append([term, reading, glosses])
        ranks.append(
            pri_rank(
                [(p.text or "").strip() for p in keb_pris]
                + [(p.text or "").strip() for p in reb_pris]
            )
        )

        for w in kebs + rebs:
            lst = keys[w]
            if not lst or lst[-1] != idx:
                lst.append(idx)

        n += 1
        if n % 50000 == 0:
            print(f"  ... {n} entries")

        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]

    # order each key's entries: common first, stable within tiers
    k = {}
    for w, idxs in keys.items():
        k[w] = sorted(set(idxs), key=lambda i: (ranks[i], i))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(orjson.dumps({"e": entries, "k": k}))

    size = out_path.stat().st_size
    print(f"entries : {len(entries)}")
    print(f"keys    : {len(k)}")
    print(f"output  : {out_path}  ({size / 1024 / 1024:.1f} MB)")

    # verification samples
    print("\nsamples:")
    for w in ("触手", "犯す", "おかす", "魔法少女", "フタナティア"):
        idxs = k.get(w)
        if not idxs:
            print(f"  {w}: NOT FOUND")
            continue
        i = idxs[0]
        term, reading, glosses = entries[i]
        print(f"  {w}: [{i}] {term}（{reading}）: {glosses[0]}")


if __name__ == "__main__":
    xml = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XML
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    if xml is None:
        sys.exit(
            "no JMdict XML given. Pass the path as the first argument, e.g.\n"
            "  python3 tools/jmdict_to_compact.py /path/to/JMdict_e_NG\n"
            "(or place JMdict_e_NG next to this script)"
        )
    if not xml.exists():
        sys.exit(f"input not found: {xml}")
    print(f"converting {xml} -> {out}")
    convert(xml, out)
