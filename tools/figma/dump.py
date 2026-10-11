"""Prints a Figma node (screen, component...) as an indented outline with the styles needed
to implement it: auto-layout, size, colours, borders, radius, shadow, fonts and texts.

    python3 dump.py 5143:3977            # whole subtree
    python3 dump.py 5143:3977 --depth 3  # limit depth
    python3 dump.py --find "Visão geral"  # find nodes by name
    python3 dump.py --texts 5143:2945    # only the texts, in reading order

Instances are expanded from their component, with text overrides applied.
Run `node decode.mjs` first.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

NODES = json.loads((Path(__file__).parent / ".cache" / "nodes.json").read_text())


def gid(g: dict) -> str:
    return f"{g['sessionID']}:{g['localID']}"


BY_ID = {gid(n["guid"]): n for n in NODES}
CHILDREN: dict[str, list[dict]] = {}
for n in NODES:
    p = n.get("parentIndex")
    if p:
        CHILDREN.setdefault(gid(p["guid"]), []).append(n)
for kids in CHILDREN.values():
    kids.sort(key=lambda k: k["parentIndex"]["position"])  # Figma orders siblings by this string


def hexcolor(c: dict, opacity: float = 1) -> str:
    r, g, b = (round(c[k] * 255) for k in "rgb")
    a = c.get("a", 1) * opacity
    return f"#{r:02X}{g:02X}{b:02X}" + (f"/{a:.2f}" if a < 0.999 else "")


def paints(ps) -> str | None:
    out = []
    for p in ps or []:
        if not p.get("visible", True):
            continue
        if p["type"] == "SOLID":
            out.append(hexcolor(p["color"], p.get("opacity", 1)))
        elif p["type"] == "IMAGE":
            out.append("IMAGE")
        else:
            out.append(p["type"])
    return ",".join(out) or None


def describe(n: dict, override: dict | None = None) -> str:
    o = override or {}
    t = n["type"]
    parts = [f"{t} {gid(n['guid'])} \"{n.get('name', '')}\""]
    if not n.get("visible", True):
        parts.append("HIDDEN")
    s = n.get("size")
    if s:
        parts.append(f"{round(s['x'])}x{round(s['y'])}")
    tr = n.get("transform")
    if tr:
        parts.append(f"@({round(tr['m02'])},{round(tr['m12'])})")
    if n.get("stackMode") and n["stackMode"] != "NONE":
        pad = [n.get(k, 0) for k in ("stackVerticalPadding", "stackPaddingRight", "stackPaddingBottom", "stackHorizontalPadding")]
        parts.append(f"auto:{n['stackMode']} gap={n.get('stackSpacing', 0)} pad(t,r,b,l)={pad} "
                     f"main={n.get('stackPrimaryAlignItems', 'MIN')} cross={n.get('stackCounterAlignItems', 'MIN')}")
    if n.get("stackChildPrimaryGrow"):
        parts.append("grow")
    if n.get("stackChildAlignSelf") == "STRETCH":
        parts.append("stretch")
    fill = paints(o.get("fillPaints", n.get("fillPaints")))
    if fill and t != "TEXT":
        parts.append(f"bg={fill}")
    for p in o.get("fillPaints", n.get("fillPaints")) or []:
        if p.get("type") == "IMAGE" and p.get("visible", True):
            tr = p.get("transform") or {}
            crop = ""
            if tr and (abs(tr.get("m00", 1) - 1) > 1e-3 or abs(tr.get("m11", 1) - 1) > 1e-3):
                # Image paint transform = the visible window of the image (0..1 coordinates).
                crop = (f" crop(x={tr['m02']:.3f}..{tr['m02'] + tr['m00']:.3f}, "
                        f"y={tr['m12']:.3f}..{tr['m12'] + tr['m11']:.3f})")
            parts.append(f"image={p.get('image', {}).get('hash', '?')} {p.get('imageScaleMode')}"
                         f" {p.get('originalImageWidth')}x{p.get('originalImageHeight')}{crop}")
    stroke = paints(n.get("strokePaints"))
    if stroke and t not in ("TEXT",):
        parts.append(f"border={stroke} {n.get('strokeWeight', 1)}px {n.get('strokeAlign', '')}".rstrip())
    if n.get("cornerRadius"):
        parts.append(f"radius={n['cornerRadius']}")
    for e in n.get("effects") or []:
        if e.get("visible", True) and e["type"] == "DROP_SHADOW":
            parts.append(f"shadow={e['offset']['x']},{e['offset']['y']} blur={e['radius']} "
                         f"spread={e.get('spread', 0)} {hexcolor(e['color'])}")
    if n.get("opacity", 1) < 1:
        parts.append(f"opacity={n['opacity']:.2f}")
    if t == "TEXT":
        f = n.get("fontName", {})
        lh = n.get("lineHeight", {})
        lh_s = f"{lh.get('value')}{'%' if lh.get('units') == 'PERCENT' else 'px'}" if lh else ""
        parts.append(f"font={f.get('family')} {f.get('style')} {n.get('fontSize')} lh={lh_s} "
                     f"color={paints(o.get('fillPaints', n.get('fillPaints')))} align={n.get('textAlignHorizontal', 'LEFT')}")
        td = o.get("textData") or n.get("textData") or {}
        chars = td.get("characters", "")
        parts.append(f"TEXT={json.dumps(chars, ensure_ascii=False)}")
        # Per-character styles: a single text layer can mix fonts/weights/colours
        # (e.g. "FOTO" regular + "MAC" extra bold). Without this they are invisible.
        ids, table = td.get("characterStyleIDs"), {st["styleID"]: st for st in td.get("styleOverrideTable") or []}
        if ids and table:
            runs, start = [], 0
            for i in range(1, len(ids) + 1):
                if i == len(ids) or ids[i] != ids[start]:
                    st = table.get(ids[start])
                    if st:
                        fn = st.get("fontName", {})
                        runs.append(f"{json.dumps(chars[start:i], ensure_ascii=False)}→{fn.get('family')} {fn.get('style')}"
                                    f" {st.get('fontSize', '')} {paints(st.get('fillPaints')) or ''}".rstrip())
                    start = i
            if runs:
                parts.append("RUNS[" + " | ".join(runs) + "]")
    if t == "INSTANCE":
        sym = n.get("symbolData", {}).get("symbolID")
        if sym:
            comp = BY_ID.get(gid(sym))
            parts.append(f"of={comp.get('name') if comp else gid(sym)}")
    return "  ".join(parts)


def overrides_of(n: dict) -> dict[str, dict]:
    out = {}
    for ov in n.get("symbolData", {}).get("symbolOverrides") or []:
        guids = ov.get("guidPath", {}).get("guids") or []
        if guids:
            out[gid(guids[-1])] = ov
    return out


def walk(n: dict, depth: int, max_depth: int, ovs: dict[str, dict], out: list[str]) -> None:
    out.append("  " * depth + describe(n, ovs.get(gid(n["guid"]))))
    if depth >= max_depth:
        return
    kids = CHILDREN.get(gid(n["guid"]), [])
    if n["type"] == "INSTANCE" and not kids:
        sym = n.get("symbolData", {}).get("symbolID")
        comp = BY_ID.get(gid(sym)) if sym else None
        if comp:
            merged = {**ovs, **overrides_of(n)}
            for k in CHILDREN.get(gid(comp["guid"]), []):
                walk(k, depth + 1, max_depth, merged, out)
        return
    for k in kids:
        walk(k, depth + 1, max_depth, ovs, out)


def texts(n: dict, ovs: dict[str, dict], out: list[str]) -> None:
    if not n.get("visible", True):
        return
    if n["type"] == "TEXT":
        o = ovs.get(gid(n["guid"]), {})
        chars = (o.get("textData") or n.get("textData") or {}).get("characters", "").strip()
        if chars:
            out.append(chars)
    kids = CHILDREN.get(gid(n["guid"]), [])
    if n["type"] == "INSTANCE" and not kids:
        sym = n.get("symbolData", {}).get("symbolID")
        comp = BY_ID.get(gid(sym)) if sym else None
        if comp:
            merged = {**ovs, **overrides_of(n)}
            for k in CHILDREN.get(gid(comp["guid"]), []):
                texts(k, merged, out)
        return
    for k in kids:
        texts(k, ovs, out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("node", nargs="?")
    ap.add_argument("--depth", type=int, default=99)
    ap.add_argument("--find")
    ap.add_argument("--texts", action="store_true")
    a = ap.parse_args()
    if a.find:
        for n in NODES:
            if a.find.lower() in n.get("name", "").lower():
                print(describe(n))
        return 0
    n = BY_ID.get(a.node.replace("-", ":"))
    if not n:
        print("nó não encontrado", file=sys.stderr)
        return 1
    out: list[str] = []
    if a.texts:
        texts(n, {}, out)
        print("\n".join(out))
    else:
        walk(n, 0, a.depth, {}, out)
        print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
