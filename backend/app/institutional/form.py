"""The signed authorization as a PDF the administrator downloads — the official copy (RF020).

One A4 page: the institution's symbol, the person's data and reference photo, the term exactly as
signed, the signature, and the record that proves it (date and time, IP, browser, term version and the
verification code). After a revocation the photos no longer exist: the copy says so, without them.

The CESMAC symbol is read from app/assets/brand/cesmac.png. Until the official file is placed there
(it must come from CESMAC's marketing, never redrawn), the FOTOMAC symbol is used with the name.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.db.models import InstitutionalPerson, InstitutionalStatus
from app.storage.port import ObjectStorage

BRAND = Path(__file__).resolve().parent.parent / "assets" / "brand"
BLUE = colors.HexColor("#0B5FA5")
MUTED = colors.HexColor("#5B6B78")
LINE = colors.HexColor("#DDE5EA")

_BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12, alignment=TA_JUSTIFY, spaceAfter=3)
_SMALL = ParagraphStyle("small", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=MUTED)
_LABEL = ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=MUTED)
_VALUE = ParagraphStyle("value", fontName="Helvetica", fontSize=10, leading=13)
_TITLE = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=BLUE, spaceAfter=2)
_INST = ParagraphStyle("inst", fontName="Helvetica-Bold", fontSize=11, leading=14)


def _local(moment: datetime) -> str:
    return moment.astimezone().strftime("%d/%m/%Y às %H:%M:%S")


def _image(data: bytes, max_w: float, max_h: float) -> PdfImage:
    reader = ImageReader(io.BytesIO(data))
    w, h = reader.getSize()
    scale = min(max_w / w, max_h / h)
    return PdfImage(io.BytesIO(data), width=w * scale, height=h * scale)


def _brand() -> tuple[PdfImage, str]:
    official = BRAND / "cesmac.png"
    if official.exists():
        return _image(official.read_bytes(), 46 * mm, 16 * mm), "Centro Universitário CESMAC"
    return _image((BRAND / "fotomac-symbol.png").read_bytes(), 16 * mm, 11 * mm), "Centro Universitário CESMAC · FOTOMAC"


def _field(label: str, value: str) -> list:
    return [Paragraph(escape(label), _LABEL), Paragraph(escape(value), _VALUE)]


def build(person: InstitutionalPerson, storage: ObjectStorage) -> bytes:
    if person.status == InstitutionalStatus.AWAITING or not person.signature_key:
        raise ValueError("only a signed authorization has a form")
    out = io.BytesIO()
    title, *paragraphs = person.signed_term   # exactly what was signed, whatever the current version says
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=12 * mm,
                            bottomMargin=16 * mm, title=title, author="FOTOMAC — Centro Universitário CESMAC")
    width = A4[0] - 36 * mm
    story: list = []

    logo, institution = _brand()
    header = Table([[logo, Paragraph(escape(institution), _INST)]], colWidths=[logo.drawWidth + 4 * mm, None])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [header, Spacer(0, 4 * mm), Paragraph(escape(title), _TITLE),
              Paragraph(f"Versão do termo: {escape(person.term_version or '')}", _SMALL), Spacer(0, 3 * mm)]

    data = [_field("Nome completo", person.full_name), _field("Cargo ou função", person.position),
            _field("Unidade ou curso", person.unit or "—"), _field("E-mail", person.email)]
    rows = [[cell for pair in data[i:i + 2] for cell in [pair]] for i in range(0, 4, 2)]
    info = Table([[Table([[a[0]], [a[1]]]), Table([[b[0]], [b[1]]])] for a, b in rows], colWidths=[None, None])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    if person.photos:
        photo = _image(storage.get(person.photos[0].object_key), 30 * mm, 36 * mm)
        extra = f"+ {len(person.photos) - 1} foto(s) de referência" if len(person.photos) > 1 else "Foto de referência"
        side = Table([[photo], [Paragraph(extra, _SMALL)]])
    else:
        side = Paragraph("Fotografias de referência eliminadas com a revogação.", _SMALL)
    top = Table([[side, info]], colWidths=[40 * mm, width - 40 * mm])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [top, Spacer(0, 4 * mm)]

    story += [Paragraph(escape(p), _BODY) for p in paragraphs]
    story.append(Spacer(0, 2 * mm))

    signature = _image(storage.get(person.signature_key), 60 * mm, 20 * mm)
    sign = Table([[signature], [Paragraph(escape(person.full_name), _VALUE)],
                  [Paragraph("Assinatura eletrônica feita na tela, pelo link de uso único enviado ao e-mail acima", _SMALL)]],
                 colWidths=[90 * mm])
    sign.setStyle(TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.6, colors.black), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [sign, Spacer(0, 3 * mm)]

    record = [["Assinado em", _local(person.authorized_at)], ["Endereço de rede (IP)", person.authorized_ip or "—"],
              ["Navegador", person.authorized_user_agent or "—"], ["Código de verificação (SHA-256)", person.document_sha256]]
    if person.status == InstitutionalStatus.REVOKED:
        who = "pela própria pessoa" if person.revoked_by == "holder" else "pela administração"
        record.append(["Situação", f"AUTORIZAÇÃO REVOGADA em {_local(person.revoked_at)}, {who}"])
    else:
        record.append(["Situação", "Autorização ativa"])
    table = Table([[Paragraph(escape(k), _LABEL), Paragraph(escape(v), _SMALL)] for k, v in record],
                  colWidths=[48 * mm, width - 48 * mm])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F5F7F9"))]))
    story.append(table)
    generated = (f"Documento gerado pelo FOTOMAC em {_local(datetime.now(timezone.utc))}.",
                 "O código de verificação muda se qualquer palavra do termo, foto de referência ou traço da assinatura for alterado.")

    def footer(canvas, _doc):   # in the bottom margin: it never pushes the content to a second page
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, generated[0])
        canvas.drawString(18 * mm, 6.5 * mm, generated[1])
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
