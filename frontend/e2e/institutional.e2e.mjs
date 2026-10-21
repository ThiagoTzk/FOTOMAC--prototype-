// End-to-end test of the institutional people (RF020, RF021), in a real browser against the real API,
// YuNet + SFace and SeaweedFS: the administrator registers a person, the person signs ON THE SCREEN from
// the link, the whole collection is searched, a photographer consults and confirms, the administrator
// downloads the official PDF, and the person revokes.
//
//   node e2e/institutional.e2e.mjs <photos-folder> [screenshot-folder]
//
// photos-folder: grupo.jpg (a group photo), referencia.jpg (one face of that photo) and capa.jpg.
// E-mails are not really sent yet: the links come from backend/outbox (development mode).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const [PHOTOS, SHOTS = 'e2e-screenshots/institucionais'] = process.argv.slice(2);
if (!PHOTOS) throw new Error('uso: node e2e/institutional.e2e.mjs <pasta-fotos> [pasta-capturas]');
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const PASSWORD = 'Fotomac#2026';
const personEmail = `e2e.institucional.${stamp}@cesmac.edu.br`;
let step = 0;
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };
const problems = [];

function newestMail(to, pattern) {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (text.includes(`To: ${to}`) && pattern.test(text)) return text.match(pattern)[0];
  }
  throw new Error(`nenhum e-mail para ${to}`);
}

const browser = await chromium.launch();
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[0-9]|non-boolean attribute|accessible/.test(m.text())) problems.push(m.text().slice(0, 200));
  });
  return page;
}
const tools = (page) => ({
  text: (t) => page.getByText(t).filter({ visible: true }).first(),
  button: (name) => page.getByRole('button', { name, exact: true }).filter({ visible: true }),
  shot: async (name) => {
    step += 1;
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
  },
});

async function signIn(name, role, signature) {
  const page = await context();
  const email = `e2e.inst.${role}.${stamp}@cesmac.edu.br`;
  const args = ['scripts/create_account.py', '--name', name, '--email', email, '--role', role];
  execFileSync(join(BACKEND, '.venv/bin/python'), signature ? [...args, '--signature', signature] : args, { cwd: BACKEND });
  await page.goto(newestMail(email, /http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/));
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar nova senha', { exact: true }).filter({ visible: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Salvar nova senha', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: /Continuar para o painel/ }).filter({ visible: true }).click();
  return page;
}

try {
  console.log('1. Fotógrafo publica um evento; administrador ativado');
  const photographer = await signIn('Moacir Barbosa Institucional', 'photographer', 'Moacir Barbosa');
  const created = await photographer.request.post(`${API}/events`, { multipart: {
    name: `COLAÇÃO E2E ${stamp}`, theme_ids: '1', date_precision: 'day', date_start: '2026-09-18',
    location: 'Campus I', description: 'Evento do teste automatizado.',
    cover: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(PHOTOS, 'capa.jpg')) } } });
  const eventId = (await created.json()).id;
  const sent = await photographer.request.post(`${API}/events/${eventId}/images`, {
    multipart: { file: { name: 'grupo.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(PHOTOS, 'grupo.jpg')) } } });
  check(sent.status() === 201, 'foto de grupo enviada');
  check((await photographer.request.post(`${API}/events/${eventId}/publish`)).ok(), 'evento publicado');
  for (let i = 0; i < 60; i++) {
    if ((await (await photographer.request.get(`${API}/events/${eventId}`)).json()).status === 'published') break;
    await photographer.waitForTimeout(1000);
  }
  const admin = await signIn('Admin Institucional', 'admin');
  const a = tools(admin);

  console.log('2. Administrador cadastra a pessoa com a foto de referência (RF020)');
  await admin.goto(`${WEB}/pessoas-institucionais`);
  await a.text('Selecione uma pessoa institucional').waitFor();
  await a.button('Cadastro de pessoas').click();
  await a.button('Cadastrar pessoa').click();
  await admin.getByLabel('Nome completo').filter({ visible: true }).fill('Maria Silva');
  await admin.getByLabel('Cargo ou função').filter({ visible: true }).fill('Pró-reitora de Extensão');
  await admin.getByLabel('Unidade ou curso').filter({ visible: true }).fill('Reitoria / Campus I');
  await admin.getByLabel('E-mail institucional').filter({ visible: true }).fill(personEmail);
  const [chooser] = await Promise.all([admin.waitForEvent('filechooser'), admin.getByRole('button', { name: 'Adicionar fotografias' }).click()]);
  await chooser.setFiles(join(PHOTOS, 'referencia.jpg'));
  await a.text('Fotografias de referência (1 de 5)').waitFor();
  await a.shot('cadastro-nova');
  await a.button('Cadastrar e enviar o termo').click();
  await a.text('Aguardando a assinatura da pessoa').waitFor();
  check(await a.text(/as fotos não são processadas/).isVisible(), 'aguardando: nada processado antes da assinatura');
  await a.shot('cadastro-aguardando');

  console.log('3. A pessoa abre o link do e-mail, lê, vê a foto e assina na tela');
  const link = newestMail(personEmail, /http:\/\/localhost:8081\/autorizacao\?token=[\w-]+/);
  const holder = await context();
  const h = tools(holder);
  await holder.goto(link);
  await h.text('Fotografias que serão usadas para localizar você').waitFor();
  check(await h.text(/Art\. 11, I/).isVisible(), 'o termo cita a base legal (consentimento específico e destacado)');
  check(await h.button('Assinar e autorizar').isDisabled(), 'sem assinatura, o botão fica desligado');
  await holder.locator('canvas').scrollIntoViewIfNeeded();
  const box = await holder.locator('canvas').boundingBox();
  await holder.mouse.move(box.x + 40, box.y + box.height * 0.7);
  await holder.mouse.down();
  for (const [fx, fy] of [[0.2, 0.3], [0.35, 0.7], [0.5, 0.25], [0.65, 0.75], [0.85, 0.35]]) {
    await holder.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 12 });
  }
  await holder.mouse.up();
  await holder.locator('canvas').screenshot({ path: join(SHOTS, 'quadro-assinatura.png') });
  await h.shot('assinatura');
  await h.button('Assinar e autorizar').click();
  await h.text(/Autorização assinada/).waitFor();
  await h.shot('assinado');
  check((await holder.request.get(link.replace(WEB, `${API}/public/institutional`).replace('/autorizacao?', '/authorization?'))).status() === 404,
        'o link é de uso único');

  console.log('4. O sistema procura a pessoa no acervo; a assinatura aparece no site; PDF oficial');
  await admin.reload();
  await a.text('Assinatura eletrônica').waitFor();
  for (let i = 0; i < 40 && await a.text(/Procurando esta pessoa no acervo/).isVisible().catch(() => false); i++) await admin.waitForTimeout(1000);
  await admin.reload();
  await a.text(/1 confirmadas|0 confirmadas · 1 a confirmar/).waitFor({ timeout: 30000 });
  check(true, 'a pessoa foi localizada na foto de grupo do evento');
  await a.text('Assinatura eletrônica').scrollIntoViewIfNeeded();
  await admin.waitForFunction(() => [...document.images].some((i) => i.src.includes('/signature') && i.complete && i.naturalWidth > 0),
                              null, { timeout: 15000 });
  check(true, 'a assinatura aparece no cadastro (imagem carregada do servidor)');
  await a.shot('cadastro-assinado');
  const [pdf] = await Promise.all([admin.waitForEvent('download'), a.button('Baixar formulário (PDF)').click()]);
  const pdfPath = join(SHOTS, 'autorizacao.pdf');
  await pdf.saveAs(pdfPath);
  check(readFileSync(pdfPath).subarray(0, 4).toString() === '%PDF', 'formulário oficial em PDF baixado');

  console.log('5. Fotógrafo consulta a pessoa, abre o evento e confirma (RF021)');
  const p = tools(photographer);
  await photographer.goto(`${WEB}/pessoas-institucionais`);
  await photographer.getByRole('button', { name: 'Pessoa institucional' }).filter({ visible: true }).click();
  await photographer.getByRole('menuitem', { name: /Maria Silva/ }).click();
  await p.text('Eventos em que esta pessoa foi identificada').waitFor();
  check(await p.text('1 de 1 imagem').isVisible(), 'evento com "1 de 1 imagem"');
  await p.shot('consulta');
  await photographer.getByRole('link', { name: /Ver imagens de COLAÇÃO E2E/ }).click();
  await p.text('Confirmação humana necessária').waitFor();
  await p.shot('fotos-da-pessoa');
  await p.button('Selecionar as não confirmadas').click();
  await p.button('Confirmar seleção (1)').click();
  await p.text('1 imagem confirmada.').waitFor();
  check(await p.text('Confirmada').isVisible(), 'marcação confirmada por uma pessoa');

  console.log('6. A pessoa revoga pelo link do e-mail: tudo some, a prova fica');
  const revokeLink = newestMail(personEmail, /http:\/\/localhost:8081\/autorizacao\/revogar\?token=[\w-]+/);
  await holder.goto(revokeLink);
  await h.button('Revogar minha autorização').click();
  await h.text(/Autorização revogada/).waitFor();
  await h.shot('revogado');
  await admin.reload();
  await a.text(/Autorização revogada em/).waitFor();
  check(!(await admin.getByText('Fotografias de referência', { exact: true }).isVisible().catch(() => false))
        && !(await admin.evaluate(() => [...document.images].some((i) => i.src.includes('/photos/')))), 'fotos de referência eliminadas');
  check(await a.button('Baixar formulário (PDF)').isVisible(), 'o termo assinado continua disponível como prova');
  await photographer.goto(`${WEB}/pessoas-institucionais`);
  await photographer.getByRole('button', { name: 'Pessoa institucional' }).filter({ visible: true }).click();
  check(!(await photographer.getByRole('menuitem', { name: /Maria Silva/ }).isVisible().catch(() => false)), 'quem revogou não pode mais ser consultado');

  check(problems.length === 0, `console sem erros${problems.length ? ': ' + problems.join(' | ') : ''}`);
  console.log('\nTUDO CERTO — cadastro, assinatura na tela, busca no acervo, consulta, PDF e revogação.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
