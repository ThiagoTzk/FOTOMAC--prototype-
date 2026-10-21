#!/usr/bin/env python3
"""Generates the FOTOMAC requirements document (.docx) in the layout of version 1.6.

    python3 docs/gerar_requisitos_docx.py [source.md] [model.docx] [output.docx]

Why this exists: every requirements document of FOTOMAC must look exactly like
"Requisitos FotoMac - v1.6.docx" (Arial, grey table headers, one big RF table with
superscript note numbers, landscape traceability matrix). pandoc cannot reproduce that,
so this script copies the model package (styles, settings, fonts) and rebuilds only
word/document.xml and word/numbering.xml from the Markdown source, emitting the same XML
patterns the model uses. Standard library only.

The Markdown source keeps the structure of the document:
  # / ## / ###          headings (section 3 subsections are dropped: the model has one RF table)
  ### [RFnnn] Title — *[Novo na v2.0]*   one functional requirement, followed by its
                         description, a field table (Campo | Especificação | Obs.),
                         "**Regras e observações**" and the numbered notes
  | a | b |              tables, laid out by their header (see TABLES)
  - item / 1. item       bullet / numbered lists ("    - " nests a bullet)
"""
from __future__ import annotations

import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "REQUISITOS-FOTOMAC-v2.0.md"
MODEL = ROOT / "entregaveis" / "Requisitos FotoMac - v1.6.docx"
OUTPUT = ROOT / "entregaveis" / "Requisitos FOTOMAC - v2.0.docx"

GREY = "D9D9D9"
PORTRAIT = ('<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1440" '
            'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:pgNumType/>'
            '<w:docGrid w:linePitch="360"/></w:sectPr>')
LANDSCAPE = PORTRAIT.replace('w:w="11906" w:h="16838" w:orient="portrait"', 'w:w="16838" w:h="11906" w:orient="landscape"')

# Column widths (dxa) of each table, chosen by its header — the same widths the model uses.
TABLES = {
    "Versão|Data|Responsável|Alterações": [900, 1300, 2200, 4626],
    "Tema|O que mudou|Requisitos": [1900, 5326, 1800],
    "Parte interessada|Papel": [3000, 6026],
    "Perfil|Descrição|Plataforma|Permissões": [1750, 2976, 1500, 2800],
    "Dependência|Papel no sistema": [3000, 6026],
    "ID|Requisito|Descrição|Prioridade": [1150, 2100, 4376, 1400],
    "ID|Perigo|Soluções": [1150, 3938, 3938],
    "Fase|Escopo": [2600, 6426],
    "Métrica|Descrição": [2600, 6426],
}


# ------------------------------------------------------------------ runs and paragraphs

def rpr(b=False, i=False, sz=20, sup=False, plain_link=False) -> str:
    bold = "<w:b/><w:bCs/>" if b else '<w:b w:val="false"/><w:bCs w:val="false"/>'
    ital = "<w:i/><w:iCs/>" if i else '<w:i w:val="false"/><w:iCs w:val="false"/>'
    # Table-of-contents entries are links, but must read as plain black text, not blue underlined.
    link = '<w:color w:val="000000"/>' if plain_link else ""
    va = '<w:vertAlign w:val="superscript"/>' if sup else ""
    under = '<w:u w:val="none"/>' if plain_link else ""
    return (f'<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>{bold}{ital}{link}'
            f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>{under}{va}</w:rPr>')


def run(text: str, **fmt) -> str:
    return f'<w:r>{rpr(**fmt)}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ""


def inline(text: str, b=False, i=False, sz=20) -> str:
    """Markdown emphasis (**bold**, *italic*, ***both***) to runs, on top of a base format."""
    out, bold, ital = [], False, False
    for tok in re.split(r"(\*\*\*|\*\*|\*)", text):
        if tok == "***":
            bold, ital = not bold, not ital
        elif tok == "**":
            bold = not bold
        elif tok == "*":
            ital = not ital
        else:
            out.append(run(tok, b=b or bold, i=i or ital, sz=sz))
    return "".join(out)


def para(content: str, after=100, before=0, jc=None, style=None, num=None, ind=None, line=276) -> str:
    ppr = f'<w:pStyle w:val="{style}"/>' if style else ""
    if num:
        ppr += f'<w:numPr><w:ilvl w:val="{num[1]}"/><w:numId w:val="{num[0]}"/></w:numPr>'
    ppr += f'<w:spacing w:after="{after}" w:before="{before}" w:line="{line}"/>'
    if ind:
        ppr += f'<w:ind w:left="{ind[0]}" w:hanging="{ind[1]}"/>'
    if jc:
        ppr += f'<w:jc w:val="{jc}"/>'
    return f"<w:p><w:pPr>{ppr}</w:pPr>{content}</w:p>"


PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def section_end(sect: str) -> str:
    return f"<w:p><w:pPr>{sect}</w:pPr></w:p>"


# ------------------------------------------------------------------ tables

BORDERS = ('<w:tblBorders><w:top w:val="single" w:color="auto" w:sz="4"/><w:left w:val="single" w:color="auto" w:sz="4"/>'
           '<w:bottom w:val="single" w:color="auto" w:sz="4"/><w:right w:val="single" w:color="auto" w:sz="4"/>'
           '<w:insideH w:val="single" w:color="auto" w:sz="4"/><w:insideV w:val="single" w:color="auto" w:sz="4"/></w:tblBorders>')


def cell(paragraphs: str, width: int, shade=False, valign="top", span=1, margin=100) -> str:
    tcpr = f'<w:tcW w:type="dxa" w:w="{width}"/>'
    if span > 1:
        tcpr += f'<w:gridSpan w:val="{span}"/>'
    if shade:
        tcpr += f'<w:shd w:fill="{GREY}" w:color="auto" w:val="clear"/>'
    tcpr += (f'<w:tcMar><w:top w:type="dxa" w:w="80"/><w:left w:type="dxa" w:w="{margin}"/>'
             f'<w:bottom w:type="dxa" w:w="80"/><w:right w:type="dxa" w:w="{margin}"/></w:tcMar><w:vAlign w:val="{valign}"/>')
    return f"<w:tc><w:tcPr>{tcpr}</w:tcPr>{paragraphs}</w:tc>"


def table(widths: list[int], rows: list[str]) -> str:
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    return (f'<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="{sum(widths)}"/>{BORDERS}</w:tblPr>'
            f'<w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>')


def header_row(labels: list[str], widths: list[int], sz=20, margin=100) -> str:
    cells = "".join(cell(para(run(t, b=True, sz=sz), after=20, jc="center"), w, shade=True, valign="center", margin=margin)
                    for t, w in zip(labels, widths))
    return f"<w:tr><w:trPr><w:tblHeader/></w:trPr>{cells}</w:tr>"


def generic_table(header: list[str], rows: list[list[str]]) -> str:
    key = "|".join(header)
    widths = TABLES.get(key) or [9026 // len(header)] * len(header)
    centre_last = key == "ID|Requisito|Descrição|Prioridade"
    out = [header_row(header, widths)]
    for r in rows:
        cells = []
        for n, (text, w) in enumerate(zip(r, widths)):
            last = centre_last and n == len(r) - 1
            cells.append(cell(para(inline(text), jc="center" if last else None), w, valign="center" if last else "top"))
        out.append(f"<w:tr>{''.join(cells)}</w:tr>")
    return table(widths, out)


def risk_table(header: list[str], rows: list[list[str]]) -> str:
    """Probability × severity matrix: label cells split in two lines, like the model."""
    widths = [1826, 1800, 1800, 1800, 1800]

    def label(text: str, shade: bool, centre: bool) -> str:
        text = text.replace("**", "")
        parts = re.match(r"(.+?)\s*(\([A-F0-9]\))$", text)
        lines = [parts[1], parts[2]] if parts else [text]
        return cell("".join(para(run(t, b=True, sz=18), after=20, jc="center" if centre else None) for t in lines),
                    widths[0] if not centre else 1800, shade=True, valign="center")

    out = ["<w:tr><w:trPr><w:tblHeader/></w:trPr>" + cell(para(run(header[0], b=True, sz=18), after=20), widths[0], shade=True, valign="center")
           + "".join(label(h, True, True) for h in header[1:]) + "</w:tr>"]
    for r in rows:
        body = "".join(cell(para(run(t.strip(), sz=18), jc="center"), w, valign="center") for t, w in zip(r[1:], widths[1:]))
        out.append("<w:tr>" + label(r[0], True, False) + body + "</w:tr>")
    return table(widths, out)


def fp_table(rows: list[list[str]]) -> str:
    widths = [1426, 1600] + [1000] * 6
    labels = ["REQUISITO FUNCIONAL", "COMPLEXIDADE", "ALI", "AIE", "SE", "EE", "CE", "TOTAL"]
    out = [header_row(labels, widths, sz=18)]
    for r in rows:
        if r[0].startswith("**Total"):
            total = r[-1].replace("*", "")
            out.append("<w:tr>" + cell(para(run("TOTAL DE PONTOS DE FUNÇÃO NÃO AJUSTADOS", b=True, sz=16), jc="center"),
                                       sum(widths[:7]), shade=True, valign="center", span=7)
                       + cell(para(run(total, b=True, sz=18), jc="center"), widths[7], shade=True, valign="center") + "</w:tr>")
            continue
        out.append("<w:tr>" + "".join(cell(para(run(t, b=(n == 0), sz=18), jc="center"), w, valign="center")
                                      for n, (t, w) in enumerate(zip(r, widths))) + "</w:tr>")
    return table(widths, out)


def trace_table(rows: list[list[str]]) -> str:
    """Grid matrix in landscape: R marks the requirement itself, D what it depends on."""
    ids = [r[0] for r in rows]
    deps = {r[0]: {d.strip() for d in r[1].split(",") if d.strip().startswith("RF")} for r in rows}
    col = (13958 - 1400) // len(ids)
    widths = [1400] + [col] * len(ids)
    out = [header_row(["ID de requisitos"] + ids, widths, sz=10, margin=20)]
    for rid in ids:
        cells = [cell(para(run(rid, b=True, sz=10), jc="center"), widths[0], shade=True, valign="center", margin=20)]
        for other in ids:
            mark = "R" if other == rid else ("D" if other in deps[rid] else "")
            cells.append(cell(para(run(mark, b=(mark == "R"), sz=10), jc="center"), col, valign="center", margin=20))
        out.append("<w:tr>" + "".join(cells) + "</w:tr>")
    return table(widths, out)


# ------------------------------------------------------------------ the RF table

def rf_row(block: dict) -> str:
    p = [para(run(block["title"] + ".", b=True) + (run(f" [{block['marker']}]", i=True) if block["marker"] else ""), after=60)]
    for n, d in enumerate(block["desc"]):
        p.append(para(inline(d), after=160 if n == len(block["desc"]) - 1 else 100))
    if block["fields"]:
        p.append(para(run(block["title"] + ":", b=True), after=80))
        for label, spec, obs in block["fields"]:
            p.append(para(run(label + ":", b=True) + inline(" " + spec) + run(" " + obs if obs else "", sup=True), after=80))
    if block["notes"]:
        p.append(para(run("Regras e observações:", b=True), after=80))
        for num, label, text, extras in block["notes"]:
            p.append(para(run(num, sup=True) + run(" " + label, b=True) + inline(" " + text if text else ""), after=80))
            for kind, t in extras:
                if kind == "bullet":
                    p.append(para(inline("– " + t), after=60, ind=(454, 170)))
                else:
                    p.append(para(inline(t), after=80, ind=(284, 0)))
    first = cell(para(run(block["id"], b=True)), 1300)
    return f"<w:tr>{first}{cell(''.join(p), 7726)}</w:tr>"


def parse_rf(lines: list[str]) -> dict:
    head = re.match(r"### \[(RF\d+)\] (.+?)(?: — \*\[(.+?)\]\*)?$", lines[0])
    block = {"id": head[1], "title": head[2].rstrip("."), "marker": head[3], "desc": [], "fields": [], "notes": []}
    stage = "desc"
    for line in lines[1:]:
        if not line.strip():
            continue
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if set("".join(cells)) <= set(":- ") or cells[0].startswith("Campo") or cells[0].startswith("Situação ou"):
                continue
            block["fields"].append((cells[0], cells[1], cells[2] if len(cells) > 2 else ""))
            stage = "fields"
        elif line.startswith("**Regras e observações**"):
            stage = "notes"
        elif stage == "notes" and (m := re.match(r"^(\d+)\. \*\*(.+?)\*\*:?\s*(.*)$", line)):
            block["notes"].append((m[1], m[2].rstrip(":"), m[3], []))
        elif stage == "notes" and line.startswith("    "):
            text = line.strip()
            kind = "bullet" if text.startswith("- ") else "para"
            block["notes"][-1][3].append((kind, text[2:] if kind == "bullet" else text))
        elif stage == "desc":
            block["desc"].append(line.strip())
        else:
            raise ValueError(f"unexpected line in {block['id']}: {line[:60]}")
    return block


# ------------------------------------------------------------------ the document

class Builder:
    def __init__(self):
        self.body: list[str] = []
        self.toc: list[tuple[int, str, int]] = []
        self.numbered = 0          # one numbering instance per numbered list, so each restarts at 1
        self.bookmark = 0

    def heading(self, level: int, text: str) -> None:
        self.bookmark += 1
        b = self.bookmark
        self.toc.append((level, text, b))
        size = {1: 28, 2: 24, 3: 22}[level]
        self.body.append(f'<w:p><w:pPr><w:pStyle w:val="Heading{level}"/><w:spacing w:after="200" w:before="320"/></w:pPr>'
                         f'<w:bookmarkStart w:id="{b}" w:name="_Toc{b:05d}"/>{run(text, b=True, sz=size)}'
                         f'<w:bookmarkEnd w:id="{b}"/></w:p>')

    def toc_xml(self) -> str:
        entries = []
        for n, (level, text, b) in enumerate(self.toc):
            field = ('<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve">'
                     ' TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>') if n == 0 else ""
            link = f'<w:hyperlink w:anchor="_Toc{b:05d}" w:history="1">{run(text, b=(level == 1), sz=20, plain_link=True)}</w:hyperlink>'
            entries.append(f'<w:p><w:pPr><w:spacing w:after="60" w:before="0" w:line="276"/><w:ind w:left="{(level - 1) * 360}"/></w:pPr>'
                           f"{field}{link}</w:p>")
        entries.append('<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>')
        return ('<w:sdt><w:sdtPr><w:alias w:val="Sumário"/><w:docPartObj><w:docPartGallery w:val="Table of Contents"/>'
                f'<w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>{"".join(entries)}</w:sdtContent></w:sdt>')


def table_rows(lines: list[str]) -> tuple[list[str], list[list[str]]]:
    rows = [[c.strip() for c in l.strip().strip("|").split(" | ")] for l in lines]
    return [h.replace("**", "") for h in rows[0]], [r for r in rows[2:]]


def build(md: str, model_cover: list[str]) -> tuple[str, int]:
    lines = md.split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("# 1."))
    lines = lines[start:]
    doc = Builder()
    in_section3 = False
    rf_blocks: list[dict] = []
    i = 0
    list_kind = None   # current list: ("num", numId) or ("bullet", 1)

    def flush_rf():
        if rf_blocks:
            doc.body.append(table([1300, 7726], [header_row(["ID", "Descrição"], [1300, 7726])] + [rf_row(b) for b in rf_blocks]))
            rf_blocks.clear()

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            if i < len(lines) and not re.match(r"^(\d+\. |- |    - )", lines[i]):
                list_kind = None
            continue
        if line.startswith("### [RF"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("#"):
                j += 1
            rf_blocks.append(parse_rf(lines[i:j]))
            i = j
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            text = line[level:].strip()
            if in_section3 and level == 2:      # the model has no subsections in section 3
                i += 1
                continue
            flush_rf()
            in_section3 = text.startswith("3.")
            if text.startswith("7."):            # the traceability matrix goes on a landscape page
                doc.body.append(section_end(PORTRAIT))
            doc.heading(level, text)
            list_kind = None
            i += 1
            continue
        if line.startswith("|"):
            j = i
            while j < len(lines) and lines[j].startswith("|"):
                j += 1
            header, rows = table_rows(lines[i:j])
            key = "|".join(header)
            if key == "Requisito|Depende de":
                doc.body.append(trace_table(rows))
                doc.body.append(section_end(LANDSCAPE))
            elif key.startswith("Requisito|Complexidade"):
                doc.body.append(para(run("PONTO DE FUNÇÃO – SISTEMA FOTOMAC", b=True)))
                doc.body.append(fp_table(rows))
            elif key.startswith("Segurança/probabilidade"):
                doc.body.append(risk_table(header, rows))
            else:
                doc.body.append(generic_table(header, rows))
                if key.startswith("Versão|Data"):
                    doc.body.append(PAGE_BREAK)
            i = j
            continue
        if in_section3:                          # the intro sentence of section 3 is not in the model
            i += 1
            continue
        if m := re.match(r"^(\d+)\. (.*)$", line):
            if not list_kind or list_kind[0] != "num":
                doc.numbered += 1
                list_kind = ("num", 100 + doc.numbered)
            doc.body.append(para(inline(m[2]), style="ListParagraph", num=(list_kind[1], 0)))
        elif line.startswith("    - "):
            doc.body.append(para(inline(line[6:]), style="ListParagraph", num=(1, 1)))
        elif line.startswith("- "):
            if not list_kind or list_kind[0] != "bullet":
                list_kind = ("bullet", 1)
            doc.body.append(para(inline(line[2:]), style="ListParagraph", num=(1, 0)))
        elif line.startswith("    "):
            doc.body.append(para(inline(line.strip()), ind=(720, 0)))
        else:
            list_kind = None
            doc.body.append(para(inline(line)))
        i += 1
    flush_rf()

    front = "".join(model_cover) + PAGE_BREAK
    front += para(run("Sumário", b=True, sz=32), after=300, line=240).replace('w:before="0" w:line="240"', 'w:before="0"')
    front += doc.toc_xml() + PAGE_BREAK
    return front + "".join(doc.body) + PORTRAIT, doc.numbered


# ------------------------------------------------------------------ package

def cover_from_model(document_xml: str, version: str, date: str, subtitle: str) -> list[str]:
    """The model's cover paragraphs, with the new version, date and subtitle, and without
    "(denominação provisória)" — the name FOTOMAC is final."""
    body = document_xml[document_xml.index("<w:body>") + len("<w:body>"):]
    paras = re.findall(r"<w:p>.*?</w:p>|<w:p .*?</w:p>", body)[:13]
    out = []
    for p in paras:
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
        if "denominação provisória" in text:
            continue
        if text.startswith("PLATAFORMA DE ACERVO"):
            p = re.sub(r"(<w:t[^>]*>)[^<]*(</w:t>)", lambda m: m[1] + escape(subtitle) + m[2], p, count=1)
        if text.startswith("Versão "):
            p = re.sub(r"(<w:t[^>]*>)[^<]*(</w:t>)", lambda m: m[1] + escape(f"Versão {version} — {date}") + m[2], p, count=1)
        if text:
            out.append(p)
    return out


def numbering_xml(model_numbering: str, lists: int) -> str:
    root = re.match(r"(.*?<w:numbering[^>]*>)", model_numbering, re.S)[1]
    bullets = re.search(r'<w:abstractNum w:abstractNumId="1".*?</w:abstractNum>', model_numbering, re.S)[0]
    decimal = re.search(r'<w:abstractNum w:abstractNumId="2".*?</w:abstractNum>', model_numbering, re.S)[0]
    abstracts = [bullets] + [decimal.replace('w:abstractNumId="2"', f'w:abstractNumId="{100 + n}"') for n in range(1, lists + 1)]
    nums = ['<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>'] + [
        f'<w:num w:numId="{100 + n}"><w:abstractNumId w:val="{100 + n}"/></w:num>' for n in range(1, lists + 1)]
    return root + "".join(abstracts) + "".join(nums) + "</w:numbering>"


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    model = Path(sys.argv[2]) if len(sys.argv) > 2 else MODEL
    output = Path(sys.argv[3]) if len(sys.argv) > 3 else OUTPUT
    md = source.read_text(encoding="utf-8")
    front = dict(re.findall(r'^(\w+): "(.*)"$', md.split("---")[1], re.M))
    version = re.search(r"Versão (\d+\.\d+)", front["subtitle"])[1]
    date = re.search(r"\| \*\*Versão\*\* \| [\d.]+ — ([\d/]+) \|", md)[1]
    subtitle = front["subtitle"].split(" — ")[0].upper()

    with zipfile.ZipFile(model) as src:
        document = src.read("word/document.xml").decode("utf-8")
        body_xml, lists = build(md, cover_from_model(document, version, date, subtitle))
        head = document[: document.index("<w:body>") + len("<w:body>")]
        new_document = head + body_xml + "</w:body></w:document>"
        new_numbering = numbering_xml(src.read("word/numbering.xml").decode("utf-8"), lists)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as dst:
            for item in src.infolist():
                data = src.read(item.filename)
                if item.filename == "word/document.xml":
                    data = new_document.encode("utf-8")
                elif item.filename == "word/numbering.xml":
                    data = new_numbering.encode("utf-8")
                elif item.filename == "docProps/core.xml":
                    text = data.decode("utf-8").replace("Un-named", "Thiago José Camêlo Nunes")
                    text = re.sub(r"(<dcterms:(?:created|modified)[^>]*>)[^<]*", lambda m: m[1] + now, text)
                    data = text.encode("utf-8")
                dst.writestr(item, data)
    print(f"{output}  ({lists} numbered lists)")


if __name__ == "__main__":
    main()
