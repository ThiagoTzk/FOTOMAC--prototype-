// End-to-end test of part 2b-2 (upload → review → publish → facial indexing → images →
// download), in a real browser against the real API, YuNet + SFace and SeaweedFS.
//
//   node e2e/images.e2e.mjs <photos-folder> <cover.jpg> [screenshot-folder]
//
// photos-folder must contain: grupo.jpg (a group photo), grupo-copia.jpg (same bytes),
// sem-rosto-1.jpg, sem-rosto-2.jpg and png-disfarcado.jpg (a PNG with a .jpg name).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const [PHOTOS, COVER, SHOTS = 'e2e-screenshots'] = process.argv.slice(2);
if (!PHOTOS || !COVER) throw new Error('uso: node e2e/images.e2e.mjs <pasta-fotos> <capa.jpg> [pasta]');
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const email = `e2e.imagens.${stamp}@cesmac.edu.br`;
const PASSWORD = 'Fotomac#2026';
let step = 0;
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };

function activationLink() {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return readFileSync(files[0], 'utf8').match(/http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/)[0];
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/status of 40[0-9]|non-boolean attribute|accessible/.test(m.text())) problems.push(m.text().slice(0, 200));
});
const shot = async (name) => {
  step += 1;
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
};
const visible = (loc) => loc.filter({ visible: true });
const button = (name) => visible(page.getByRole('button', { name, exact: true }));
const text = (t) => visible(page.getByText(t)).first();

try {
  console.log('1. Fotógrafo ativado e evento criado');
  execFileSync(join(BACKEND, '.venv/bin/python'), ['scripts/create_account.py', '--name', 'Moacir Barbosa Teste',
    '--email', email, '--role', 'photographer', '--signature', 'Moacir Barbosa'], { cwd: BACKEND });
  await page.goto(activationLink());
  await visible(page.getByLabel('Nova senha', { exact: true })).fill(PASSWORD);
  await visible(page.getByLabel('Confirmar nova senha', { exact: true })).fill(PASSWORD);
  await button('Salvar nova senha').click();
  await visible(page.getByRole('button', { name: /Continuar para o painel/ })).click();
  await text('Olá, Moacir!').waitFor();
  // The event itself is created through the API (the screen was covered by panel.e2e.mjs).
  const created = await page.request.post(`${API}/events`, { multipart: {
    name: `FECIAL E2E ${stamp}`, theme_ids: '1', date_precision: 'day', date_start: '2026-09-18',
    location: 'Campus I', description: 'Evento do teste automatizado.',
    cover: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: readFileSync(COVER) } } });
  check(created.status() === 201, 'evento criado');
  const eventId = (await created.json()).id;

  console.log('2. Envio: validação antes de enviar (06)');
  await page.goto(`${WEB}/eventos/${eventId}/enviar`);
  await text('Arraste suas fotos aqui').waitFor();
  check(await text('Antes de enviar: pessoas menores de 18 anos').isVisible(), 'advertência de menores visível (RF007 nota 12)');
  await page.locator('input[type=file]').setInputFiles(['grupo.jpg', 'sem-rosto-1.jpg', 'sem-rosto-2.jpg', 'png-disfarcado.jpg']
    .map((f) => join(PHOTOS, f)));
  await text('Arquivos selecionados · 4').waitFor();
  await visible(page.getByRole('button', { name: 'Iniciar envio (3)' })).waitFor();
  check(await text('Inválido').isVisible(), 'PNG com nome .jpg recusado pela assinatura binária');
  await shot('envio-selecao');

  console.log('3. Acompanhamento do envio (07)');
  await visible(page.getByRole('button', { name: 'Iniciar envio (3)' })).click();
  await text('Envio concluído').waitFor({ timeout: 60000 });
  check(await text('3 de 3 imagens enviadas').isVisible(), '3 de 3 enviadas');
  await shot('envio-concluido');

  console.log('4. Duplicata detectada antes de enviar');
  await page.goto(`${WEB}/eventos/${eventId}/enviar`);
  await page.locator('input[type=file]').setInputFiles([join(PHOTOS, 'grupo-copia.jpg')]);
  await text('Arquivo duplicado').waitFor();
  check(true, 'cópia da foto já enviada marcada como duplicada (RF007 nota 10)');
  await shot('envio-duplicado');

  console.log('5. Conferência (08) e visualização individual (09)');
  await page.goto(`${WEB}/eventos/${eventId}/conferencia`);
  await text('Prontas para publicação').waitFor();
  // Discard one photo WITHOUT faces: the upload order varies, so the card is chosen by data
  // (the group photo is the biggest file), never by position alone.
  const listed = (await (await page.request.get(`${API}/events/${eventId}/images?filter=all`)).json()).items;
  const biggest = Math.max(...listed.map((i) => i.size_bytes));
  const target = listed.findIndex((i) => i.size_bytes !== biggest);
  await visible(page.getByRole('button', { name: 'Descartar', exact: true })).nth(target).click();
  await text('Descartadas · 1').waitFor();
  check(true, 'descarte pontual');
  await shot('conferencia');
  await visible(page.getByRole('button', { name: /Abrir imagem enviada por/ })).first().click();
  await text('Foto 1 de 3').waitFor();
  await page.keyboard.press('ArrowRight');
  await text('Foto 2 de 3').waitFor();
  check(true, 'navegação sequencial pelo teclado');
  await shot('visualizacao-individual');
  await visible(page.getByRole('button', { name: 'Fechar', exact: true })).click();

  console.log('6. Publicação (10) e indexação facial com o YuNet + SFace (11)');
  await visible(page.getByRole('button', { name: 'Publicar 2 imagens' })).first().click();
  await text('Publicar imagens?').waitFor();
  await shot('confirmar-publicacao');
  await visible(page.getByRole('button', { name: 'Publicar 2 imagens' })).last().click();
  await text('Processamento das imagens').waitFor();
  await text('Processamento concluído').waitFor({ timeout: 90000 });
  check(await text(/6 rostos indexados/).isVisible(), 'a foto de grupo gerou 6 vetores faciais');
  await shot('processamento-concluido');
  const ev = await (await page.request.get(`${API}/events/${eventId}`)).json();
  check(ev.status === 'published', 'evento passou para "Publicado" sozinho (RF006 nota 2)');

  console.log('7. Gerenciamento (12), imagem publicada (13) e confirmação de exclusão (14)');
  await page.goto(`${WEB}/eventos/${eventId}/imagens`);
  await text('Faces indexadas').waitFor();
  check(await text('Sem faces detectadas · 1').isVisible(), 'paisagem sem rosto classificada');
  await shot('imagens');
  await visible(page.getByRole('tab', { name: /Publicada/ })).click();
  const images = await (await page.request.get(`${API}/events/${eventId}/images?filter=published`)).json();
  const group = images.items.find((i) => i.faces_count === 6);
  await page.goto(`${WEB}/eventos/${eventId}/imagens/${group.id}`);
  await text('6 rostos detectados e indexados').waitFor();
  check(await text('Fotografia por: Moacir Barbosa — Centro Universitário CESMAC').isVisible(), 'crédito no formato da v1.6');
  await shot('imagem-publicada');
  await button('Excluir imagem').click();
  await text('Excluir imagem?').waitFor();
  await shot('confirmar-exclusao');
  await button('Cancelar').click();

  console.log('8. Download do acervo (15)');
  await page.goto(`${WEB}/eventos/${eventId}/download`);
  await button('Preparar arquivo').click();
  await text('Seu arquivo está pronto').waitFor({ timeout: 60000 });
  await shot('download-pronto');
  const [download] = await Promise.all([page.waitForEvent('download'), button('Baixar arquivo ZIP').click()]);
  check(!/8333|X-Amz/.test(download.url()), 'ZIP vem pela API: o endereço não expõe o armazenamento');
  check((await (await browser.newContext()).request.get(download.url())).status() === 401, 'o link não funciona fora da sessão');
  const zipPath = join(SHOTS, 'acervo.zip');
  await download.saveAs(zipPath);
  const inspect = execFileSync(join(BACKEND, '.venv/bin/python'), ['-c', `
import zipfile, piexif, sys
z = zipfile.ZipFile(sys.argv[1]); names = z.namelist()
artist = piexif.load(z.read(names[0]))['0th'].get(piexif.ImageIFD.Artist, b'').decode()
gps = any(piexif.load(z.read(n))['GPS'] for n in names)
print(len(names), len({n.split('/')[0] for n in names}), artist, gps)`, zipPath]).toString().trim().split(' ');
  check(inspect[0] === '2' && inspect[1] === '1', 'ZIP com as 2 fotos publicadas em uma única pasta (RF012 nota 3)');
  check(inspect.slice(2, -1).join(' ') === 'Moacir Barbosa' && inspect.at(-1) === 'False', 'crédito nos metadados e sem GPS');

  check(problems.length === 0, `console sem erros${problems.length ? ': ' + problems.join(' | ') : ''}`);
  console.log('\nTUDO CERTO — envio, conferência, publicação, indexação facial, imagens e download.');
} catch (err) {
  await shot('FALHA');
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
