/**
 * Generates the FOTOMAC presentation (first committee, < 5 min of slides + video demo).
 *
 *   NODE_PATH=~/Agente/skills/apresentacoes/node_modules node docs/apresentacao/gerar.js
 *
 * Output: docs/entregaveis/FOTOMAC-apresentacao.pptx. Every number on the slides comes from
 * the code, the requirements or fotomac-lab's Test 1 — change it here, then regenerate.
 */
const path = require("path");
const pptxgen = require("pptxgenjs");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "docs", "entregaveis", "FOTOMAC-apresentacao.pptx");
const LOGO = path.join(__dirname, "fotomac-simbolo.png");
const LOGO_RATIO = 722 / 1071;
// Wordmark rendered with the real Montserrat by marca.py (the font is not installed everywhere).
const MARK = path.join(__dirname, "fotomac-marca.png"), MARK_WHITE = path.join(__dirname, "fotomac-marca-branca.png");
const MARK_RATIO = 300 / 2151;

// Brand colours from frontend/src/theme/tokens.ts and the logo.
const BLUE = "007DC5", NAVY = "072D44", YELLOW = "FFC506", SKY = "3EC3FF";
const INK = "1E2933", MUTED = "65727E", LINE = "DDE3E8", SOFT = "E8F5FC", PAGE = "F5F7F9";
const GREEN = "23855B", GREEN_SOFT = "E8F7F0", AMBER = "9A6500", AMBER_SOFT = "FFF4D6";
const FONT = "Arial";

const THEME = {
  name: "FOTOMAC", headFontFace: FONT, bodyFontFace: FONT,
  colors: { dk1: INK, lt1: "FFFFFF", dk2: NAVY, lt2: PAGE, accent1: BLUE, accent2: YELLOW, accent3: GREEN,
            accent4: SKY, accent5: AMBER, accent6: MUTED, hlink: BLUE, folHlink: NAVY },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.author = "Thiago Nunes";
pres.title = "FOTOMAC — acervo fotográfico com busca por reconhecimento facial";
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

const W = 13.333, M = 0.6;

pres.defineSlideMaster({
  title: "CONTEUDO",
  background: { color: "FFFFFF" },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontFace: FONT,
                                fontSize: 32, bold: true, color: NAVY, valign: "middle", margin: 0 }, text: "" } },
    { image: { path: LOGO, x: W - M - 0.62, y: 6.82, w: 0.62, h: 0.62 * LOGO_RATIO } },
  ],
  slideNumber: { x: M, y: 6.9, w: 0.6, h: 0.35, fontFace: FONT, fontSize: 11, color: MUTED },
});
pres.defineSlideMaster({ title: "CAPA", background: { color: "FFFFFF" } });
pres.defineSlideMaster({ title: "ESCURO", background: { color: NAVY } });

const tx = (slide, text, opts) => slide.addText(text, { fontFace: FONT, isTextBox: true, margin: 0, ...opts });
const content = (title, section) => {
  const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
};
function arrow(slide, x1, y1, x2, y2, color = MUTED) {
  slide.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 2, endArrowType: "triangle" } });
}
function circleNumber(slide, x, y, d, label, fill = BLUE) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  tx(slide, label, { x, y, w: d, h: d, fontSize: d * 22, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

// ---------------------------------------------------------------- 1. cover
pres.addSection({ title: "Abertura" });
{
  const s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Abertura" });
  s.addImage({ path: LOGO, x: 0.9, y: 1.45, w: 3.6, h: 3.6 * LOGO_RATIO });
  s.addImage({ path: MARK, x: 4.95, y: 1.7, w: 6.6, h: 6.6 * MARK_RATIO, altText: "FOTOMAC" });
  tx(s, "As suas histórias no CESMAC", { x: 4.95, y: 2.95, w: 7.6, h: 0.5, fontSize: 22, italic: true, color: MUTED });
  tx(s, "Acervo fotográfico com busca por reconhecimento facial", { x: 4.95, y: 3.6, w: 7.6, h: 0.5, fontSize: 20, color: INK });
  tx(s, [{ text: "Thiago Nunes", options: { bold: true, color: INK, breakLine: true } },
         { text: "Orientador: Prof. Wagner de Oliveira Lima Palmeira de Araujo", options: { breakLine: true } },
         { text: "Sistemas de Informação · CESMAC · 2026" }],
     { x: 0.9, y: 5.55, w: 9, h: 1.1, fontSize: 15, color: MUTED, paraSpaceAfter: 4 });
  s.addNotes("Apresentar o nome do projeto e o objetivo em uma frase: a pessoa encontra as próprias fotos dos eventos do CESMAC pelo rosto, sem ver as fotos dos outros.");
}

// ---------------------------------------------------------------- 2. problem
pres.addSection({ title: "Problema e solução" });
{
  const s = content("Achar as suas fotos hoje é folhear todas", "Problema e solução");
  tx(s, "até 1.000", { x: M, y: 2.2, w: 5.2, h: 1.2, fontSize: 66, bold: true, color: BLUE });
  tx(s, "fotos em um único evento", { x: M, y: 3.4, w: 5.2, h: 0.5, fontSize: 20, color: INK });
  tx(s, [{ text: "Lento para quem procura.", options: { breakLine: true } },
         { text: "E expõe o rosto de todo mundo." }],
     { x: M, y: 4.5, w: 5.4, h: 1.0, fontSize: 18, color: MUTED, paraSpaceAfter: 6 });
  // a wall of photos, one of them yours
  const cols = 7, rows = 5, cw = 0.78, ch = 0.58, gap = 0.12, gx = 6.4, gy = 1.75;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const mine = r === 3 && c === 4;
    s.addShape(pres.ShapeType.roundRect, { x: gx + c * (cw + gap), y: gy + r * (ch + gap), w: cw, h: ch, rectRadius: 0.06,
      fill: { color: mine ? BLUE : "E4E9ED" }, line: mine ? { color: YELLOW, width: 3 } : { color: "E4E9ED" } });
  }
  tx(s, "a sua", { x: gx + 4 * (cw + gap) - 0.1, y: gy + rows * (ch + gap) + 0.02, w: cw + 0.2, h: 0.35, fontSize: 13,
                   bold: true, color: BLUE, align: "center" });
  s.addNotes("Um evento pode ter até mil fotos. Hoje, para achar as suas, você olha todas — e quem procura também vê o rosto de todas as outras pessoas.");
}

// ---------------------------------------------------------------- 3. solution
{
  const s = content("Uma selfie, só as suas fotos", "Problema e solução");
  const steps = [["Estou ciente", "o aviso vem antes de tudo"], ["Tire uma selfie", "ou envie uma foto"],
                 ["Só as suas fotos", "baixe com o crédito do fotógrafo"]];
  const cx = [1.2, 5.25, 9.3], y = 2.35, d = 1.25;
  steps.forEach(([title, sub], i) => {
    circleNumber(s, cx[i] + 0.9, y, d, String(i + 1), i === 2 ? GREEN : BLUE);
    tx(s, title, { x: cx[i] - 0.2, y: y + 1.55, w: 3.45, h: 0.55, fontSize: 24, bold: true, color: NAVY, align: "center" });
    tx(s, sub, { x: cx[i] - 0.2, y: y + 2.15, w: 3.45, h: 0.45, fontSize: 16, color: MUTED, align: "center" });
    if (i < 2) arrow(s, cx[i] + 0.9 + d + 0.35, y + d / 2, cx[i + 1] + 0.9 - 0.35, y + d / 2);
  });
  s.addShape(pres.ShapeType.roundRect, { x: 3.9, y: 5.75, w: 5.5, h: 0.6, rectRadius: 0.3, fill: { color: SOFT }, line: { color: SOFT } });
  tx(s, "Ninguém vê a galeria inteira do evento", { x: 3.9, y: 5.75, w: 5.5, h: 0.6, fontSize: 16, bold: true, color: BLUE, align: "center", valign: "middle" });
  s.addNotes("O visitante não precisa de conta. Ele lê o aviso de uso de imagem, tira uma selfie e recebe só as fotos em que aparece. A galeria do evento é privada.");
}

// ---------------------------------------------------------------- 4. architecture
pres.addSection({ title: "Como funciona" });
{
  const s = content("Cinco peças, cada uma com um papel", "Como funciona");
  const box = (x, y, w, h, title, sub, fill, color, dashed = false) => {
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill },
      line: { color, width: 2, dashType: dashed ? "dash" : "solid" } });
    tx(s, [{ text: title, options: { bold: true, fontSize: 19, color, breakLine: true } },
           { text: sub, options: { fontSize: 14, color: INK } }],
       { x, y, w, h, align: "center", valign: "middle", paraSpaceAfter: 3 });
  };
  box(4.67, 1.6, 4.0, 0.95, "Site · Expo", "o que a pessoa vê no navegador", PAGE, "334155");
  box(2.4, 3.15, 8.53, 1.0, "API · Python + FastAPI", "recebe todo pedido, confere a permissão e decide", SOFT, BLUE);
  box(0.9, 4.95, 3.6, 1.2, "PostgreSQL + pgvector", "fichas e vetores de rosto", GREEN_SOFT, GREEN);
  box(4.87, 4.95, 3.6, 1.2, "InsightFace", "reconhece os rostos", "F1ECFD", "6D28D9", true);
  box(8.83, 4.95, 3.6, 1.2, "SeaweedFS", "guarda as fotos (S3)", AMBER_SOFT, AMBER);
  arrow(s, 6.67, 2.55, 6.67, 3.12);
  tx(s, "HTTP · JSON", { x: 6.85, y: 2.65, w: 2, h: 0.35, fontSize: 13, color: MUTED });
  arrow(s, 3.6, 4.15, 2.7, 4.92);
  arrow(s, 6.67, 4.15, 6.67, 4.92);
  arrow(s, 9.7, 4.15, 10.63, 4.92);
  tx(s, "adaptador: troca a IA sem mexer no resto", { x: 4.37, y: 6.25, w: 4.6, h: 0.35, fontSize: 13, italic: true, color: "6D28D9", align: "center" });
  s.addNotes("O site só conversa com a API. A API é quem fala com o banco, com o reconhecimento facial e com o armazenamento das fotos — e confere a permissão antes. O InsightFace fica atrás de um adaptador: trocar de IA é escrever um adaptador novo, como o professor pediu. O SeaweedFS é o que o servidor do CESMAC já usa.");
}

// ---------------------------------------------------------------- 5. face recognition
{
  const s = content("Cada rosto vira 512 números", "Como funciona");
  const steps = ["Detecta o rosto", "Alinha", "Gera o vetor", "Compara"];
  const subs = ["SCRFD", "olhos no lugar", "ArcFace · 512 números", "similaridade"];
  const w = 2.55, gap = 0.55, x0 = M + 0.15, y = 2.1;
  steps.forEach((t, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 1.25, rectRadius: 0.12, fill: { color: i === 3 ? SOFT : "F1ECFD" },
      line: { color: i === 3 ? BLUE : "6D28D9", width: 2 } });
    tx(s, [{ text: t, options: { bold: true, fontSize: 19, color: i === 3 ? BLUE : "6D28D9", breakLine: true } },
           { text: subs[i], options: { fontSize: 14, color: INK } }],
       { x, y, w, h: 1.25, align: "center", valign: "middle", paraSpaceAfter: 3 });
    if (i < 3) arrow(s, x + w + 0.08, y + 0.62, x + w + gap - 0.08, y + 0.62);
  });
  tx(s, "0,30", { x: M + 0.15, y: 4.25, w: 3.2, h: 1.3, fontSize: 80, bold: true, color: BLUE });
  tx(s, [{ text: "limiar de similaridade", options: { bold: true, color: INK, breakLine: true } },
         { text: "abaixo dele, a foto não aparece:", options: { breakLine: true } },
         { text: "melhor não mostrar do que mostrar a foto errada" }],
     { x: 3.9, y: 4.35, w: 5.6, h: 1.2, fontSize: 17, color: MUTED, paraSpaceAfter: 3 });
  s.addShape(pres.ShapeType.roundRect, { x: 9.75, y: 4.55, w: 2.95, h: 0.62, rectRadius: 0.31, fill: { color: "F1ECFD" }, line: { color: "F1ECFD" } });
  tx(s, "InsightFace buffalo_l", { x: 9.75, y: 4.55, w: 2.95, h: 0.62, fontSize: 15, bold: true, color: "6D28D9", align: "center", valign: "middle" });
  s.addNotes("O InsightFace acha o rosto, alinha e transforma em 512 números. Para comparar dois rostos, mede-se o quanto esses vetores apontam para o mesmo lado. Só aparece o que passa de 0,30 — no teste, a foto errada mais alta tirou 0,278.");
}

// ---------------------------------------------------------------- 6. Test 1
{
  const s = content("Escolhido por teste, não por tabela", "Como funciona");
  const rows = [["InsightFace", 97.6], ["YuNet + SFace", 89.5], ["ArcFace", 64.0], ["Facenet512", 60.3], ["VGG-Face", 57.1]];
  tx(s, "Nota no Teste 1 (0 a 100)", { x: M, y: 1.65, w: 7.6, h: 0.4, fontSize: 14, color: MUTED });
  const bx = M + 2.55, maxW = 4.4;
  rows.forEach(([name, v], i) => {
    const y = 2.25 + i * 0.82, top = i === 0;
    tx(s, name, { x: M, y, w: 2.35, h: 0.56, fontSize: 16, bold: top, color: INK, align: "right", valign: "middle" });
    s.addShape(pres.ShapeType.roundRect, { x: bx, y, w: maxW * v / 100, h: 0.56, rectRadius: 0.06,
      fill: { color: top ? BLUE : "C9D3DB" }, line: { color: top ? BLUE : "C9D3DB" }, objectName: `bar ${name}` });
    tx(s, String(v.toFixed(1)).replace(".", ","), { x: bx + maxW * v / 100 + 0.12, y, w: 0.9, h: 0.56, fontSize: 16,
       bold: true, color: top ? BLUE : INK, valign: "middle" });
  });
  const stat = (y, big, small) => {
    tx(s, big, { x: 8.9, y, w: 3.9, h: 0.85, fontSize: 44, bold: true, color: BLUE });
    tx(s, small, { x: 8.9, y: y + 0.85, w: 3.9, h: 0.45, fontSize: 16, color: MUTED });
  };
  stat(1.85, "388", "fotos reais conferidas à mão");
  stat(3.55, "7 × 203", "fotos erradas no topo: 1º × 2º");
  tx(s, "5 tecnologias · fotos de formatura · fotomac-lab", { x: 8.9, y: 5.55, w: 3.9, h: 0.6, fontSize: 13, italic: true, color: MUTED });
  s.addNotes("Antes do sistema, montei uma bancada e comparei 5 tecnologias em 388 fotos reais de formatura, conferindo cada uma à mão. O InsightFace venceu com folga: 7 fotos erradas no topo do ranking contra 203 do segundo. Isso contraria as tabelas publicadas — elas medem rostos recortados, não plateia.");
}

// ---------------------------------------------------------------- 7. why not a generative AI
{
  // InsightFace is AI too; the question the committee asks is "why not ChatGPT/Gemini?".
  const s = content("Por que não uma IA generativa?", "Como funciona");
  const LBL = M, LW = 2.55, AX = 3.35, CW = 4.6, BX = 8.13, HY = 1.6, HH = 0.75, RY = 2.5, RH = 0.92;
  const head = (x, title, sub, fill, color) => {
    s.addShape(pres.ShapeType.roundRect, { x, y: HY, w: CW, h: HH, rectRadius: 0.1, fill: { color: fill }, line: { color: fill } });
    tx(s, [{ text: title, options: { bold: true, fontSize: 18, color, breakLine: true } },
           { text: sub, options: { fontSize: 12, color } }],
       { x, y: HY, w: CW, h: HH, align: "center", valign: "middle", paraSpaceAfter: 2 });
  };
  head(AX, "IA generativa", "ChatGPT · Gemini · Llama Vision", AMBER_SOFT, AMBER);
  head(BX, "InsightFace", "IA especializada em rosto", BLUE, "FFFFFF");
  // Every InsightFace figure here was measured on this project's backend (CPU only, buffalo_l
  // detection + recognition); the LLM figure is a published estimate, cited in the footnote.
  const rows = [
    ["Máquina", "GPU com 11 a 22 GB de memória¹", "Só processador · ~1 GB de RAM"],
    ["Resposta", "Texto livre, que varia e pode errar", "512 números, sempre os mesmos"],
    ["Busca em 1.000 fotos", "Rever as fotos a cada busca", "Calcula uma vez, ao publicar"],
    ["Privacidade", "Na nuvem, o rosto vai para outra empresa, fora do país", "O rosto não sai do servidor"],
  ];
  rows.forEach(([label, a, b], i) => {
    const y = RY + i * (RH + 0.08);
    s.addShape(pres.ShapeType.line, { x: LBL, y: y + RH + 0.04, w: W - 2 * M, h: 0, line: { color: LINE, width: 1 } });
    tx(s, label, { x: LBL, y, w: LW, h: RH, fontSize: 16, bold: true, color: NAVY, valign: "middle" });
    tx(s, a, { x: AX + 0.2, y, w: CW - 0.4, h: RH, fontSize: 16, color: MUTED, valign: "middle", align: "center" });
    tx(s, b, { x: BX + 0.2, y, w: CW - 0.4, h: RH, fontSize: 16, bold: true, color: BLUE, valign: "middle", align: "center" });
  });
  tx(s, "¹ Llama 3.2 Vision 11B rodando local (estimativa willitrunai.com). InsightFace medido neste projeto: 0,13 s por foto, notebook sem GPU.",
     { x: M, y: 6.48, w: 10.6, h: 0.32, fontSize: 11, italic: true, color: MUTED });
  s.addNotes("O InsightFace também é IA — mas especializada: só faz rosto. Uma IA generativa, como o ChatGPT, foi feita para conversar. " +
    "Para rodar uma dessas aqui dentro, precisaria de placa de vídeo com 11 a 22 GB; o InsightFace roda no processador com cerca de 1 GB. " +
    "Ela responde em texto, que muda de uma vez para outra; o InsightFace devolve sempre os mesmos 512 números, calculados uma vez quando a foto é publicada — 0,13 s por foto aqui. Na busca, só se compara a selfie com vetores prontos. " +
    "E usar uma IA na nuvem seria mandar rosto, dado sensível, para outra empresa fora do Brasil — a LGPD só permite transferência internacional nos casos do Art. 33.");
}

// ---------------------------------------------------------------- 8. license (left open for Thiago)
{
  const s = content("A licença do InsightFace", "Como funciona");
  // Empty frame: Thiago drops the screenshot from insightface.ai here and writes the text in Canva.
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 1.65, w: 6.6, h: 4.6, rectRadius: 0.12, fill: { color: PAGE },
    line: { color: "B8C4CE", width: 2, dashType: "dash" } });
  tx(s, "Imagem do site do InsightFace", { x: M, y: 1.65, w: 6.6, h: 4.6, fontSize: 16, italic: true, color: MUTED,
     align: "center", valign: "middle" });
  tx(s, "Texto sobre a licença", { x: 7.6, y: 1.65, w: 5.1, h: 0.5, fontSize: 16, italic: true, color: MUTED });
  s.addNotes("Espaço do Thiago: imagem do site do InsightFace e explicação da licença. " +
    "Lembrete do README: os modelos pré-treinados (buffalo_l) são só para pesquisa não comercial; o TCC está coberto, e uma implantação no CESMAC exige licenciar ou trocar o modelo — por isso o adaptador.");
}

// ---------------------------------------------------------------- 9. LGPD
pres.addSection({ title: "LGPD e situação" });
{
  const s = content("Privacidade desde o desenho", "LGPD e situação");
  const cards = [["A selfie nunca é guardada", "compara e descarta"], ["Sem vetor antes de publicar", "a foto descartada nunca vira biometria"],
                 ["Busca só dentro do evento", "nunca no acervo inteiro"], ["Tudo tem prazo", "expira em 6 meses · remoção em 72 h"]];
  cards.forEach(([t, sub], i) => {
    const x = M + (i % 2) * 6.15, y = 1.65 + Math.floor(i / 2) * 2.05, w = 5.95, h = 1.8;
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.14, fill: { color: PAGE }, line: { color: LINE } });
    circleNumber(s, x + 0.35, y + 0.5, 0.8, "✓", GREEN);
    tx(s, t, { x: x + 1.45, y: y + 0.35, w: w - 1.7, h: 0.6, fontSize: 21, bold: true, color: NAVY, valign: "middle" });
    tx(s, sub, { x: x + 1.45, y: y + 0.95, w: w - 1.7, h: 0.5, fontSize: 16, color: MUTED, valign: "middle" });
  });
  tx(s, "Rosto é dado pessoal sensível — LGPD, Art. 5º, II", { x: M, y: 5.9, w: 9, h: 0.4, fontSize: 14, italic: true, color: MUTED });
  s.addNotes("O rosto é dado biométrico, sensível pela LGPD. Por isso: a selfie nunca é armazenada, nenhum vetor existe antes da publicação, a busca é sempre dentro de um evento, e tudo expira — com remoção a pedido em até 72 horas. Ao sair da página, o resultado também é apagado.");
}

// ---------------------------------------------------------------- 10. status
{
  const s = content("Onde estamos", "LGPD e situação");
  const phases = [["Fase 1", "Administração e acervo", "Pronta", GREEN, GREEN_SOFT],
                  ["Fase 2", "Acesso público", "Pronta", GREEN, GREEN_SOFT],
                  ["Fase 3", "Conformidade e apoio", "Em andamento", AMBER, AMBER_SOFT]];
  phases.forEach(([f, name, st, color, soft], i) => {
    const x = M + i * 4.1, y = 1.65, w = 3.85, h = 2.2;
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.14, fill: { color: soft }, line: { color } });
    tx(s, f, { x: x + 0.35, y: y + 0.3, w: w - 0.7, h: 0.45, fontSize: 16, bold: true, color });
    tx(s, name, { x: x + 0.35, y: y + 0.75, w: w - 0.7, h: 0.6, fontSize: 21, bold: true, color: NAVY });
    tx(s, (st === "Pronta" ? "✓ " : "◐ ") + st, { x: x + 0.35, y: y + 1.5, w: w - 0.7, h: 0.45, fontSize: 17, bold: true, color });
  });
  tx(s, "Próximos passos", { x: M, y: 4.3, w: 6, h: 0.45, fontSize: 18, bold: true, color: NAVY });
  ["Pessoas institucionais e registros de uso", "Calibrar o limiar com mais pessoas",
   "Aplicativo móvel e implantação no CESMAC"].forEach((t, i) => {
    const y = 4.9 + i * 0.5;
    s.addShape(pres.ShapeType.ellipse, { x: M + 0.02, y: y + 0.15, w: 0.13, h: 0.13, fill: { color: BLUE }, line: { color: BLUE } });
    tx(s, t, { x: M + 0.35, y, w: 7.2, h: 0.42, fontSize: 17, color: INK, valign: "middle" });
  });
  tx(s, "125", { x: 8.9, y: 4.3, w: 3.9, h: 1.0, fontSize: 60, bold: true, color: BLUE, align: "right" });
  tx(s, "testes automáticos", { x: 8.9, y: 5.3, w: 3.9, h: 0.45, fontSize: 17, color: MUTED, align: "right" });
  s.addNotes("As fases 1 e 2 do documento de requisitos estão prontas; a 3 está em andamento. Faltam pessoas institucionais, os registros de uso atípico e a calibragem do limiar com mais pessoas. Tudo é coberto por 125 testes automáticos. Em seguida, o vídeo.");
}

// ---------------------------------------------------------------- 11. demo
{
  const s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "LGPD e situação" });
  tx(s, "Vamos ver funcionando", { x: M + 0.3, y: 2.55, w: 11.5, h: 1.3, fontSize: 54, bold: true, color: "FFFFFF" });
  tx(s, "Demonstração do sistema", { x: M + 0.3, y: 3.85, w: 11.5, h: 0.6, fontSize: 22, color: YELLOW });
  s.addImage({ path: MARK_WHITE, x: M + 0.3, y: 6.45, w: 2.6, h: 2.6 * MARK_RATIO, altText: "FOTOMAC" });
  s.addNotes("Chamar o vídeo: o fotógrafo publicando um evento, e o visitante encontrando as próprias fotos pela selfie.");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  const pptxSkill = execSync("ls -d ~/.claude/skills/synced/*/pptx | head -1").toString().trim();
  await require(path.join(pptxSkill, "scripts", "apply_theme.js")).applyTheme(OUT, THEME);
  console.log(OUT);
})();
