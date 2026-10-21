"""Generates the SVG figures of docs/ESTRUTURA-DO-SISTEMA.md (standard library only).

    python3 docs/figuras/gerar.py

Every figure is 16 cm wide: the text width of the A4 page with 2.5 cm margins.
"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent
FONT = "Helvetica, Arial, sans-serif"

INK, MUTED, LINE = "#1E293B", "#64748B", "#94A3B8"
LIMIAR = 0.3741  # similarity threshold calibrated for YuNet + SFace (fotomac-lab, Test 1)
C = {  # one colour per part of the system, the same in every figure
    "site": ("#334155", "#F1F5F9"),
    "api": ("#1D4ED8", "#DBEAFE"),
    "db": ("#047857", "#D1FAE5"),
    "s3": ("#B45309", "#FEF3C7"),
    "ai": ("#6D28D9", "#EDE9FE"),
    "ok": ("#047857", "#D1FAE5"),
    "half": ("#B45309", "#FEF3C7"),
    "todo": ("#64748B", "#F8FAFC"),
    "bad": ("#B91C1C", "#FEE2E2"),
}


def svg(name: str, w: int, h: int, body: list[str]) -> None:
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="16cm" height="{16 * h / w:.2f}cm" '
            f'viewBox="0 0 {w} {h}">'
            '<defs>'
            f'<marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{MUTED}"/></marker>'
            '</defs>'
            f'<rect width="{w}" height="{h}" fill="white"/>')
    (OUT / name).write_text(head + "".join(body) + "</svg>", encoding="utf-8")


def text(x, y, s, size=15, weight="normal", anchor="middle", color=INK, italic=False) -> str:
    style = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
            f'text-anchor="{anchor}" fill="{color}"{style}>{escape(s)}</text>')


def label(x, y, s, size=12.5, anchor="middle", color=INK, weight="normal") -> str:
    w = len(s) * size * 0.53 + 8
    left = {"middle": x - w / 2, "start": x - 4, "end": x - w + 4}[anchor]
    return (f'<rect x="{left:.1f}" y="{y - size}" width="{w:.1f}" height="{size + 5}" fill="white"/>'
            + text(x, y, s, size, weight, anchor, color))


def box(x, y, w, h, kind, title, lines=(), rx=12, dashed=False, title_size=17, line_size=13.5) -> str:
    stroke, fill = C[kind]
    dash = ' stroke-dasharray="7 5"' if dashed else ""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="2"{dash}/>']
    total = title_size + len(lines) * (line_size + 6)
    ty = y + (h - total) / 2 + title_size - 2
    out.append(text(x + w / 2, ty, title, title_size, "bold", color=stroke))
    for i, line in enumerate(lines):
        out.append(text(x + w / 2, ty + (i + 1) * (line_size + 6) + 2, line, line_size, color=INK))
    return "".join(out)


def arrow(points, label=None, lx=None, ly=None, both=False, dashed=False, color=MUTED, size=13, anchor="middle") -> str:
    d = "M" + " L".join(f"{x} {y}" for x, y in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    start = ' marker-start="url(#seta)"' if both else ""
    out = f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2"{dash} marker-end="url(#seta)"{start}/>'
    if label:
        out += text(lx, ly, label, size, color=INK, anchor=anchor)
    return out


def pill(x, y, s, kind, size=12.5) -> str:
    stroke, fill = C[kind]
    w = len(s) * size * 0.56 + 18
    return (f'<rect x="{x}" y="{y}" width="{w:.0f}" height="{size + 10}" rx="{(size + 10) / 2}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>'
            + text(x + w / 2, y + size + 2, s, size, "bold", color=stroke))


# ---------------------------------------------------------------- 1. architecture

def arquitetura():
    b = []
    b.append(box(290, 20, 320, 92, "site", "Site FOTOMAC", ["Expo · React Native Web · TypeScript", "roda no navegador · porta 8081"]))
    b.append(arrow([(450, 112), (450, 178)], both=True))
    b.append(text(462, 140, "HTTP + JSON em /api/v1", 13.5, anchor="start"))
    b.append(text(462, 158, "cookie de sessão HttpOnly", 13.5, anchor="start", color=MUTED))
    # API
    b.append(f'<rect x="60" y="180" width="780" height="200" rx="14" fill="{C["api"][1]}" stroke="{C["api"][0]}" stroke-width="2.5"/>')
    b.append(text(450, 208, "API em Python (FastAPI) · porta 8000 — o “cérebro”", 18, "bold", color=C["api"][0]))
    inner = [("Rotas", ["app/api/", "recebe pedidos"]), ("Regras de negócio", ["events, images,", "public, accounts…"]),
             ("Trabalhador", ["fila em 2º plano", "app/indexing/"])]
    for i, (t, ls) in enumerate(inner):
        b.append(box(90 + i * 245, 228, 225, 66, "api", t, ls, title_size=14.5, line_size=12.5))
    for i, (t, ls) in enumerate([("Porta facial", ["app/face/port.py"]), ("Porta de arquivos", ["app/storage/port.py"])]):
        x = [300, 560][i]
        b.append(f'<rect x="{x}" y="312" width="200" height="50" rx="8" fill="white" stroke="{C["api"][0]}" stroke-width="1.5" stroke-dasharray="5 4"/>')
        b.append(text(x + 100, 333, t, 14, "bold", color=C["api"][0]))
        b.append(text(x + 100, 352, ls[0], 12, color=MUTED))
    b.append(f'<rect x="90" y="312" width="190" height="50" rx="8" fill="white" stroke="{C["api"][0]}" stroke-width="1.5" stroke-dasharray="5 4"/>')
    b.append(text(185, 333, "SQLAlchemy", 14, "bold", color=C["api"][0]))
    b.append(text(185, 352, "app/db/", 12, color=MUTED))
    # dependencies
    b.append(box(40, 470, 250, 110, "db", "PostgreSQL 17 + pgvector", ["o “fichário”: contas, eventos,", "situações e vetores de rosto", "porta 5432"], title_size=15.5, line_size=12.5))
    b.append(box(325, 470, 250, 110, "ai", "YuNet + SFace (OpenCV)", ["o “olho”: acha rostos e", "gera os vetores", "biblioteca DENTRO da API"], title_size=15.5, line_size=12.5, dashed=True))
    b.append(box(610, 470, 250, 110, "s3", "SeaweedFS", ["o “almoxarifado”: fotos,", "miniaturas, capas, ZIPs", "protocolo S3 · porta 8333"], title_size=15.5, line_size=12.5))
    b.append(arrow([(185, 362), (165, 468)], "SQL", 152, 420, anchor="end"))
    b.append(arrow([(400, 362), (450, 468)], "chamada de função", 436, 420, anchor="end"))
    b.append(arrow([(660, 362), (735, 468)], "S3 (boto3)", 712, 420, anchor="start"))
    svg("01-arquitetura.svg", 900, 600, b)


# ---------------------------------------------------------------- 2. timeline

def linha_do_tempo():
    items = [
        ("22–25/09", "fotomac-lab", "Teste 1: 5 tecnologias comparadas em 388 fotos; InsightFace vence (97,6).", "ai"),
        ("01/10", "Etapa 1 — a base", "Banco, adaptador facial, SeaweedFS e o padrão de portas e adaptadores.", "api"),
        ("03/10", "Etapa 2a — login", "Contas por convite, primeiro acesso, recuperação de senha, bloqueio.", "api"),
        ("03/10", "Etapa 2b — fotógrafo", "Eventos, envio em lote, conferência, publicação, fila facial, ZIP.", "api"),
        ("03/10", "Etapa 3 — visitante", "Página pública, “Estou ciente”, busca pelo rosto, download, remoção.", "api"),
        ("04/10", "Correções suas", "Resultado some ao sair; download e ZIP presos à sessão.", "half"),
        ("04/10", "Etapa 4a — contas", "Administrador cria, edita, suspende e desbloqueia contas.", "api"),
        ("04/10", "Etapa 4b — configuração", "Temas, parâmetros do reconhecimento, reindexação, expiração.", "api"),
        ("15–16/10", "Pós 1ª banca", "CESMAC escolhe YuNet + SFace (licença sem custo); troca pelo painel.", "ai"),
        ("16–17/10", "Requisitos 2.0", "Teste de precisão, temas do fotógrafo, borrão de criança, novos perfis.", "half"),
        ("17/10", "Produção v2.0", "Captura guiada com prova de vida, marketing, contratado, exclusão, sino.", "api"),
        ("próximo", "Fases 9 a 13", "Pessoas institucionais, vídeo, marca d'água, aplicativo, implantação.", "todo"),
    ]
    b, y0, gap = [], 30, 62
    b.append(f'<line x1="150" y1="{y0}" x2="150" y2="{y0 + gap * (len(items) - 1)}" stroke="{LINE}" stroke-width="3"/>')
    for i, (when, title, desc, kind) in enumerate(items):
        y = y0 + i * gap
        stroke, fill = C[kind]
        dash = ' stroke-dasharray="4 3"' if kind == "todo" else ""
        b.append(text(130, y + 5, when, 14, "bold", anchor="end", color=MUTED))
        b.append(f'<circle cx="150" cy="{y}" r="9" fill="{fill}" stroke="{stroke}" stroke-width="2.5"{dash}/>')
        b.append(text(175, y - 2, title, 15.5, "bold", anchor="start", color=stroke))
        b.append(text(175, y + 18, desc, 13.5, anchor="start"))
    svg("02-linha-do-tempo.svg", 900, y0 + gap * len(items) - 20, b)


# ---------------------------------------------------------------- 3. status per phase

def situacao():
    phases = [  # requirements v2.0, section 9 (17/10/2026)
        ("Fases 1 a 4 — acervo, acesso público, visual e novo reconhecimento", [
            ("Contas e perfis", "ok"), ("Eventos e envio", "ok"), ("Conferência e publicação", "ok"),
            ("Busca pelo rosto", "ok"), ("Leiaute de computador", "ok"), ("YuNet + SFace", "ok"), ("Troca de modelo", "ok")]),
        ("Fases 5 a 8 — calibração, temas, contas e prova de vida", [
            ("Teste de precisão", "ok"), ("Temas com ícone", "ok"), ("Crianças: aguarda resposta", "todo"),
            ("Marketing", "ok"), ("Fotógrafo contratado", "ok"), ("Excluir evento", "ok"), ("Captura guiada", "ok")]),
        ("Fases 9 a 13 — conformidade, vídeo, aplicativo, formatos e fechamento", [
            ("Remoção em 72 h", "ok"), ("Pessoas institucionais", "ok"), ("Uso atípico e relatório", "half"),
            ("Vídeo", "todo"), ("Aplicativo móvel", "todo"), ("Formatos e marca d'água", "ok"), ("Tutorial", "todo")]),
    ]
    b, y = [], 20
    for title, chips in phases:
        b.append(text(20, y + 18, title, 17, "bold", anchor="start"))
        y += 34
        x = 20
        for label, kind in chips:
            w = len(label) * 7.6 + 34
            if x + w > 880:
                x, y = 20, y + 42
            stroke, fill = C[kind]
            dash = ' stroke-dasharray="5 4"' if kind == "todo" else ""
            b.append(f'<rect x="{x}" y="{y}" width="{w:.0f}" height="32" rx="16" fill="{fill}" stroke="{stroke}" stroke-width="1.6"{dash}/>')
            mark = {"ok": "✓", "half": "◐", "todo": "○"}[kind]
            b.append(text(x + 16, y + 21, mark, 14, "bold", color=stroke))
            b.append(text(x + 28, y + 21, label, 13.5, anchor="start"))
            x += w + 10
        y += 62
    lx = 20
    for kind, label in [("ok", "✓ pronto e testado"), ("half", "◐ parte pronta"), ("todo", "○ falta fazer")]:
        b.append(text(lx, y + 4, label, 13.5, "bold", anchor="start", color=C[kind][0]))
        lx += 200
    svg("03-situacao.svg", 900, y + 20, b)


# ---------------------------------------------------------------- 4. ports & adapters

def adaptadores():
    b = []
    for col, (x, kind_port, port, port_line, adapters, cfg) in enumerate([
        (20, "api", "FaceEngine", "detect(imagem) → rostos + vetores",
         [("SFaceEngine", "em uso hoje · YuNet + SFace", "ai", False), ("OutroModeloEngine", "um arquivo novo, no futuro", "todo", True)],
         ("quem escolhe o modelo:", "o administrador, no painel")),
        (470, "api", "ObjectStorage", "put · get · stream · delete",
         [("S3ObjectStorage", "SeaweedFS (protocolo S3)", "s3", False), ("Outro armazenamento", "se o CESMAC trocar", "todo", True)],
         ("escolhido no backend/.env:", "FOTOMAC_S3_ENDPOINT=…")),
    ]):
        b.append(box(x + 60, 20, 290, 66, "site", "Regras do sistema", ["busca, indexação, envio…"], title_size=15, line_size=13))
        b.append(arrow([(x + 205, 86), (x + 205, 122)], "só conhece a porta", x + 215, 110, size=12.5, anchor="start"))
        b.append(f'<rect x="{x + 40}" y="124" width="330" height="70" rx="10" fill="white" stroke="{C["api"][0]}" stroke-width="2.5" stroke-dasharray="8 5"/>')
        b.append(text(x + 205, 152, f"PORTA: {port}", 16, "bold", color=C["api"][0]))
        b.append(text(x + 205, 176, port_line, 13.5))
        for i, (name, line, kind, dashed) in enumerate(adapters):
            ax = x + 20 + i * 190
            b.append(arrow([(x + 205, 194), (ax + 85, 250)], dashed=dashed))
            b.append(box(ax, 252, 172, 74, kind, name, [line], title_size=13.5, line_size=12, dashed=dashed))
        b.append(text(x + 205, 360, cfg[0], 13, color=MUTED))
        b.append(text(x + 205, 380, cfg[1], 13.5, "bold", color=INK))
    b.append(f'<line x1="450" y1="20" x2="450" y2="385" stroke="{LINE}" stroke-dasharray="3 5"/>')
    svg("04-adaptadores.svg", 900, 400, b)


# ---------------------------------------------------------------- 5. recognition pipeline

def reconhecimento():
    steps = [
        ("site", "1. Imagem", ["foto do evento", "ou quadro da captura"]),
        ("ai", "2. Detecção", ["YuNet", "foto ≤ 1920 px", "caixa + confiança"]),
        ("ai", "3. Alinhamento", ["recorte 112×112", "olhos no lugar", "(5 pontos)"]),
        ("ai", "4. Reconhecimento", ["SFace", "(OpenCV)"]),
        ("db", "5. Vetor", ["128 números", "normalizado"]),
    ]
    b, w, gap = [], 152, 25
    for i, (kind, title, lines) in enumerate(steps):
        x = 10 + i * (w + gap)
        b.append(box(x, 20, w, 120, kind, title, lines, title_size=15, line_size=12.5))
        if i < len(steps) - 1:
            b.append(arrow([(x + w, 80), (x + w + gap - 1, 80)]))
    # two paths
    b.append(box(110, 200, 330, 96, "db", "Foto publicada do evento", ["vetor GUARDADO no PostgreSQL", "(tabela face_embeddings)", "uma linha por rosto da foto"], title_size=15, line_size=12.5))
    b.append(box(480, 200, 330, 96, "bad", "Captura do visitante", ["vetores só na MEMÓRIA, comparados", "e descartados no fim da busca", "nunca vão para disco ou banco"], title_size=15, line_size=12.5))
    cx = 10 + 4 * (w + gap) + w / 2  # centre of "5. Vetor"
    b.append(arrow([(cx, 140), (cx, 165), (275, 165), (275, 198)]))
    b.append(arrow([(cx, 165), (645, 165), (645, 198)]))
    svg("05-reconhecimento.svg", 900, 310, b)


# ---------------------------------------------------------------- 6. similarity

def similaridade():
    b = []
    # intuition: arrows
    import math

    def vec(cx, cy, angle, length, color):
        x2 = cx + length * math.cos(math.radians(angle))
        y2 = cy - length * math.sin(math.radians(angle))
        return f'<line x1="{cx}" y1="{cy}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="3" marker-end="url(#seta)"/>'
    for i, (title, a1, a2, sim) in enumerate([("Mesma pessoa", 40, 52, "ângulo pequeno → similaridade alta (≈ 0,6)"),
                                               ("Pessoas diferentes", 20, 95, "ângulo grande → similaridade baixa (≈ 0,1)")]):
        cx = 120 + i * 440
        b.append(text(cx + 110, 30, title, 15.5, "bold"))
        b.append(vec(cx, 150, a1, 120, C["api"][0]))
        b.append(vec(cx, 150, a2, 120, C["ai"][0] if i == 0 else C["bad"][0]))
        b.append(f'<circle cx="{cx}" cy="150" r="4" fill="{INK}"/>')
        b.append(text(cx + 110, 182, sim, 13, color=MUTED))
    # scale
    x0, x1, y = 60, 840, 270
    sx = lambda v: x0 + (x1 - x0) * v
    b.append(f'<rect x="{x0}" y="{y - 14}" width="{sx(LIMIAR) - x0}" height="28" fill="{C["bad"][1]}" stroke="{C["bad"][0]}"/>')
    b.append(f'<rect x="{sx(LIMIAR)}" y="{y - 14}" width="{x1 - sx(LIMIAR)}" height="28" fill="{C["ok"][1]}" stroke="{C["ok"][0]}"/>')
    b.append(text((x0 + sx(LIMIAR)) / 2, y + 5, "não mostra", 13.5, "bold", color=C["bad"][0]))
    b.append(text((sx(LIMIAR) + x1) / 2, y + 5, "mostra ao visitante", 13.5, "bold", color=C["ok"][0]))
    for v in [0, 0.2, 0.4, 0.6, 0.8]:
        b.append(f'<line x1="{sx(v)}" y1="{y + 14}" x2="{sx(v)}" y2="{y + 22}" stroke="{INK}"/>')
        b.append(text(sx(v), y + 38, f"{v:.1f}".replace(".", ","), 12.5, color=MUTED))
    marks = [(0.3985, "0,3985: a foto ERRADA com nota mais", "alta no Teste 1 (o 1 erro: precisão de 98%)", C["bad"][0], -1),
             (LIMIAR, "0,3741: limiar", "(calibrado no Teste 1)", C["api"][0], 1),
             (0.53, "0,53: mesma pessoa,", "foto desfocada (teste)", C["ok"][0], 1),
             (0.98, "0,98: mesma foto", "recortada", C["ok"][0], 1)]
    for v, l1, l2, color, side in marks:
        x = sx(v)
        if side < 0:
            b.append(f'<line x1="{x}" y1="{y - 14}" x2="{x}" y2="{y - 44}" stroke="{color}" stroke-width="2"/>')
            b.append(text(x - 6, y - 64, l1, 12.5, "bold", anchor="end", color=color))
            b.append(text(x - 6, y - 48, l2, 12.5, anchor="end", color=color))
        else:
            ty = y + 62
            anchor = "end" if v > 0.9 else "start" if v > 0.4 else "middle"
            b.append(f'<line x1="{x}" y1="{y + 14}" x2="{x}" y2="{ty - 14}" stroke="{color}" stroke-width="2"/>')
            b.append(text(x, ty, l1, 12.5, "bold", anchor=anchor, color=color))
            b.append(text(x, ty + 16, l2, 12.5, anchor=anchor, color=color))
    b.append(f'<line x1="{sx(LIMIAR)}" y1="{y - 24}" x2="{sx(LIMIAR)}" y2="{y + 24}" stroke="{C["api"][0]}" stroke-width="4"/>')
    svg("06-similaridade.svg", 900, 370, b)


# ---------------------------------------------------------------- 7. Test 1 ranking

def ranking():
    rows = [("InsightFace buffalo_l", 97.6, 7), ("YuNet + SFace", 89.5, 203), ("ArcFace + RetinaFace", 64.0, 311),
            ("Facenet512 + RetinaFace", 60.3, 314), ("VGG-Face + RetinaFace", 57.1, 261)]
    b, x0, maxw = [], 230, 480
    b.append(text(x0, 22, "Nota (0–100)", 13, "bold", anchor="start", color=MUTED))
    b.append(text(800, 22, "Intrusos*", 13, "bold", color=MUTED))
    for i, (name, score, intr) in enumerate(rows):
        y = 40 + i * 50
        kind = "ai" if i == 0 else "todo"
        stroke, fill = C[kind]
        b.append(text(x0 - 12, y + 23, name, 14.5, "bold" if i == 0 else "normal", anchor="end"))
        b.append(f'<rect x="{x0}" y="{y}" width="{maxw * score / 100:.0f}" height="32" rx="4" fill="{stroke if i == 0 else "#CBD5E1"}"/>')
        b.append(text(x0 + maxw * score / 100 + 8, y + 22, f"{score:.1f}".replace(".", ","), 14.5, "bold", anchor="start",
                      color=stroke if i == 0 else INK))
        b.append(text(800, y + 22, str(intr), 14.5, "bold" if i == 0 else "normal", color=stroke if i == 0 else INK))
    b.append(text(20, 310, "* fotos SEM a pessoa que pontuaram acima da pior foto COM ela (quanto menos, melhor).", 12.5,
                  anchor="start", color=MUTED, italic=True))
    svg("07-ranking.svg", 900, 325, b)


# ---------------------------------------------------------------- 8. state machines

def estados():
    b = []
    b.append(text(20, 26, "Evento", 17, "bold", anchor="start"))
    ev = [("Em Edição", "api"), ("Em Processamento", "half"), ("Publicado", "ok"), ("Expirado", "todo")]
    labels = ["fotógrafo publica", "fila facial termina", "fim do prazo (6 meses)"]
    for i, (name, kind) in enumerate(ev):
        x = 20 + i * 225
        b.append(box(x, 44, 175, 52, kind, name, title_size=15))
        if i < 3:
            b.append(arrow([(x + 175, 70), (x + 223, 70)]))
            b.append(text(x + 199, 120, labels[i], 12.5, color=MUTED))
    b.append(text(20, 172, "Imagem — conferência", 17, "bold", anchor="start"))
    b.append(box(20, 190, 175, 52, "api", "Em Conferência", title_size=15))
    b.append(box(20, 290, 175, 52, "todo", "Descartada", title_size=15))
    b.append(box(300, 190, 175, 52, "ok", "Publicada", title_size=15))
    b.append(arrow([(90, 242), (90, 288)], both=True))
    b.append(text(100, 272, "descartar / restaurar", 12.5, anchor="start", color=MUTED))
    b.append(arrow([(195, 216), (298, 216)], "publicação", 247, 208, size=12.5))
    b.append(text(20, 372, "As descartadas são apagadas de vez quando o conjunto é publicado.", 12.5, anchor="start", color=MUTED, italic=True))
    b.append(text(540, 172, "Imagem — indexação facial", 17, "bold", anchor="start"))
    b.append(box(540, 190, 150, 52, "half", "Pendente", title_size=15))
    for i, (name, kind) in enumerate([("Processada", "ok"), ("Sem faces", "todo"), ("Falha (3 tentativas)", "bad")]):
        y = 190 + i * 64
        b.append(box(735, y, 150, 50, kind, name, title_size=13.5))
        b.append(arrow([(690, 216), (712, 216), (712, y + 25), (733, y + 25)]))
    b.append(arrow([(475, 216), (538, 216)], dashed=True))
    b.append(text(540, 300, "Só imagem PUBLICADA", 12.5, "bold", anchor="start", color=C["bad"][0]))
    b.append(text(540, 318, "entra na fila (RNF13)", 12.5, anchor="start", color=C["bad"][0]))
    svg("08-estados.svg", 900, 385, b)


# ---------------------------------------------------------------- 9. visitor search sequence

def sequencia_busca():
    lanes = [("Navegador", "site"), ("API Python", "api"), ("YuNet + SFace", "ai"), ("PostgreSQL", "db"), ("SeaweedFS", "s3")]
    xs = [80, 340, 520, 680, 830]
    b = []
    for (name, kind), x in zip(lanes, xs):
        b.append(box(x - 65, 10, 130, 40, kind, name, title_size=14))
        b.append(f'<line x1="{x}" y1="50" x2="{x}" y2="850" stroke="{LINE}" stroke-dasharray="4 4"/>')
    msgs = [  # (from, to, y, label, dashed) — guided capture with liveness (v2.0, RF036)
        (0, 1, 90, "1. “Estou ciente” (POST /consent)", False),
        (1, 3, 118, "registra a ciência + sessão anônima", False),
        (1, 0, 146, "cookie da sessão (HttpOnly)", True),
        (0, 1, 190, "2. pede a ordem (POST /capture)", False),
        (1, 1, 216, "sorteia a ordem dos 4 movimentos", False),
        (1, 0, 244, "ordem sorteada (vale 1 vez, 2 min)", True),
        (0, 1, 290, "3. quadros da captura (POST /search)", False),
        (1, 2, 320, "4. detect(cada quadro)", False),
        (2, 1, 348, "rostos, pontos e vetores", True),
        (1, 1, 380, "5. prova de vida: giros na ordem?", False),
        (1, 1, 410, "mesma pessoa em todas as poses?", False),
        (1, 3, 450, "6. vetores do evento ≥ 0,3741 (melhor pose)", False),
        (3, 1, 478, "ids das fotos, da mais parecida à menos", True),
        (1, 1, 510, "7. apaga quadros e vetores da memória", False),
        (1, 3, 538, "guarda só os ids na sessão", False),
        (1, 0, 566, "lista de resultados", True),
        (0, 1, 612, "8. miniatura (GET /images/{id}/thumb)", False),
        (1, 1, 640, "confere: o id está NESTA sessão?", False),
        (1, 4, 670, "busca o arquivo", False),
        (4, 1, 698, "bytes da miniatura", True),
        (1, 0, 726, "imagem (sem cache)", True),
        (0, 1, 770, "9. Baixar → link assinado, 15 min", False),
        (1, 4, 800, "arquivo original com créditos", False),
        (1, 0, 830, "download", True),
    ]
    for a, c, y, label, dashed in msgs:
        if a == c:  # self call
            x = xs[a]
            b.append(f'<path d="M{x} {y - 10} h30 v18 h-28" fill="none" stroke="{MUTED}" stroke-width="2" marker-end="url(#seta)"/>')
            b.append(globals()["label"](x + 38, y + 4, label, anchor="start"))
            continue
        x1, x2 = xs[a], xs[c]
        b.append(arrow([(x1, y), (x2 + (-4 if x2 > x1 else 4), y)], dashed=dashed))
        mid = (x1 + x2) / 2
        b.append(globals()["label"](mid, y - 7, label))
    svg("09-sequencia-busca.svg", 900, 860, b)


# ---------------------------------------------------------------- 10. database

def banco():
    b = []

    def table(x, y, name, cols, kind="db", w=200):
        stroke, fill = C[kind]
        h = 34 + 20 * len(cols)
        b.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="white" stroke="{stroke}" stroke-width="2"/>')
        b.append(f'<rect x="{x}" y="{y}" width="{w}" height="30" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        b.append(text(x + w / 2, y + 21, name, 14.5, "bold", color=stroke))
        for i, col in enumerate(cols):
            b.append(text(x + 12, y + 50 + i * 20, col, 12.5, anchor="start"))
        return h
    w = 180
    table(20, 20, "themes", ["nome", "ativo / inativo", "(Esporte, Saúde…)"], w=w)
    table(250, 20, "events", ["nome, datas, local", "situação", "data de expiração", "exclusão agendada"], w=w)
    table(480, 20, "images", ["chaves no SeaweedFS", "situações", "crédito, SHA-256", "quem enviou / aprovou"], w=w)
    table(710, 20, "face_embeddings", ["vetor (128 números)", "versão do modelo", "caixa do rosto"], kind="ai", w=w)
    table(20, 170, "accounts", ["e-mail, nome", "perfil, situação", "hash da senha", "CPF cifrado (contratado)"], w=w)
    table(250, 170, "visitor_sessions", ["sem nome, sem e-mail", "ids do resultado"], w=w)
    table(480, 170, "removal_requests", ["foto, motivo", "contato (apagado ao fim)"], w=w)
    table(710, 170, "system_parameters", ["limiar, retenção…", "quem mudou e quando"], w=w)
    table(20, 320, "sessions", ["hash do token", "expira em 8 h"], w=w)
    table(250, 320, "consent_records", ["“Estou ciente”", "sem vínculo à pessoa"], w=w)
    b.append(arrow([(202, 60), (248, 60)], both=True))
    b.append(label(225, 52, "N:N", 12, color=MUTED))
    b.append(arrow([(430, 60), (478, 60)]))
    b.append(label(454, 52, "tem", 12))
    b.append(arrow([(660, 60), (708, 60)]))
    b.append(label(684, 52, "rostos", 12))
    b.append(arrow([(200, 210), (225, 210), (225, 95), (248, 95)]))
    b.append(label(225, 150, "dono", 12))
    b.append(arrow([(340, 170), (340, 116)], dashed=True))
    b.append(label(348, 148, "de um evento", 12, anchor="start", color=MUTED))
    b.append(arrow([(570, 170), (570, 116)], dashed=True))
    b.append(label(578, 148, "pede remover", 12, anchor="start", color=MUTED))
    b.append(arrow([(110, 266), (110, 318)]))
    b.append(label(118, 298, "logins", 12, anchor="start", color=MUTED))
    b.append(arrow([(340, 246), (340, 318)], dashed=True))
    b.append(label(348, 288, "ciência", 12, anchor="start", color=MUTED))
    b.append(f'<rect x="20" y="420" width="860" height="48" rx="8" fill="{C["bad"][1]}" stroke="{C["bad"][0]}" stroke-width="2"/>')
    b.append(text(450, 442, "audit_log — o registro de tudo o que aconteceu, INALTERÁVEL", 14.5, "bold", color=C["bad"][0]))
    b.append(text(450, 460, "um gatilho no próprio banco recusa qualquer UPDATE ou DELETE nesta tabela", 12.5))
    b.append(text(20, 494, "Outras tabelas de apoio: password_tokens (links de ativação e recuperação), package_jobs (ZIPs), "
                  "reindex_jobs e reindex_items, recognition_tests (teste de precisão).", 12.5, anchor="start", color=MUTED, italic=True))
    svg("10-banco.svg", 900, 505, b)


# ---------------------------------------------------------------- 11. worker loop

def trabalhador():
    b = []
    steps = [("1. Indexar", ["a próxima foto", "publicada pendente"]), ("2. Montar ZIP", ["o próximo pacote", "pedido pelo fotógrafo"]),
             ("3. Reindexar", ["só se 1 e 2", "estão ociosos"])]
    for i, (t, ls) in enumerate(steps):
        x = 30 + i * 230
        b.append(box(x, 40, 190, 80, "api", t, ls, title_size=15, line_size=12.5))
        if i < 2:
            b.append(arrow([(x + 190, 80), (x + 228, 80)]))
    b.append(box(720, 40, 160, 80, "todo", "Ocioso?", ["espera 1 s", "e recomeça"], title_size=15, line_size=12.5))
    b.append(arrow([(680, 80), (718, 80)]))
    b.append(arrow([(800, 40), (800, 16), (125, 16), (125, 38)]))
    b.append(text(460, 12, "repete para sempre, enquanto a API estiver ligada", 12.5, color=MUTED))
    b.append(box(30, 165, 850, 112, "half", "A cada 60 segundos, faxina", [
        "apaga pacotes ZIP vencidos (60 min)  ·  exclui fotos com pedido de remoção há 72 h",
        "avisa por e-mail os eventos que expiram em 30 dias  ·  elimina os eventos vencidos",
        "(fotos, cópias, capa, pacotes e vetores — arquivos primeiro, registros depois)"], title_size=15, line_size=13))
    b.append(text(450, 305, "A fila é o próprio banco: SELECT … FOR UPDATE SKIP LOCKED — dois trabalhadores nunca pegam a mesma foto.",
                  12.5, color=MUTED, italic=True))
    svg("11-trabalhador.svg", 900, 320, b)


if __name__ == "__main__":
    for f in (arquitetura, linha_do_tempo, situacao, adaptadores, reconhecimento, similaridade, ranking, estados,
              sequencia_busca, banco, trabalhador):
        f()
    print("figuras geradas em", OUT)
