// End-to-end test of the VISITOR area (RF013-RF023) in a real browser, against the real API,
// InsightFace and SeaweedFS. The photographer part is set up through the API.
//
//   node e2e/visitor.e2e.mjs <photos-folder> [screenshot-folder]
//
// photos-folder: grupo.jpg and grupo2.jpg (group photos with the same people), selfie.png (a
// crop of one person — PNG on purpose: the browser must convert it), estranho.jpg (someone
// else), paisagem.jpg (no face) and capa.jpg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const [PHOTOS, SHOTS = 'e2e-screenshots/visitante'] = process.argv.slice(2);
if (!PHOTOS) throw new Error('uso: node e2e/visitor.e2e.mjs <pasta-fotos> [pasta-capturas]');
mkdirSync(SHOTS, { recursive: true });
const photo = (f) => join(PHOTOS, f);

const stamp = Date.now();
const email = `e2e.visitante.${stamp}@cesmac.edu.br`;
const EVENT = `FeCiAL Edição E2E ${stamp}`;
const PASSWORD = 'Fotomac#2026';
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };

function newestMail(pattern) {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) { const m = readFileSync(f, 'utf8'); if (pattern.test(m)) return m; }
  return null;
}

// Fake camera: Chromium's own test pattern stands in for the webcam (no face in it).
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const problems = [];
let step = 0;

try {
  console.log('1. Fotógrafo publica um evento com 3 fotos (via API)');
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  execFileSync(join(BACKEND, '.venv/bin/python'), ['scripts/create_account.py', '--name', 'Moacir Barbosa Teste',
    '--email', email, '--role', 'photographer', '--signature', 'Moacir Barbosa'], { cwd: BACKEND });
  const activation = newestMail(new RegExp(email.replace(/\./g, '\\.'))).match(/http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/)[0];
  const token = new URL(activation).searchParams.get('token');
  check((await sp.request.post(`${API}/auth/first-access`, { data: { token, password: PASSWORD, password_confirmation: PASSWORD } })).ok(), 'conta ativada');
  check((await sp.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).ok(), 'login do fotógrafo');
  const themes = await (await sp.request.get(`${API}/themes`)).json();
  const created = await sp.request.post(`${API}/events`, { multipart: {
    name: EVENT, theme_ids: String(themes[0].id), date_precision: 'day', date_start: '2026-09-18', location: 'Centro Cultural',
    description: 'A FeCiAL — Feira de Ciências de Alagoas reúne estudantes e educadores para apresentar projetos e incentivar a ciência.',
    cover: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: readFileSync(photo('capa.jpg')) } } });
  check(created.status() === 201, 'evento criado');
  const eventId = (await created.json()).id;
  const ids = {};
  for (const f of ['grupo.jpg', 'grupo2.jpg', 'paisagem.jpg']) {
    const r = await sp.request.post(`${API}/events/${eventId}/images`, { multipart: {
      file: { name: f, mimeType: 'image/jpeg', buffer: readFileSync(photo(f)) } } });
    check(r.status() === 201, `foto ${f} enviada`);
    ids[f] = (await r.json()).id;
  }
  check((await sp.request.post(`${API}/events/${eventId}/publish`)).ok(), 'publicação solicitada');
  for (let i = 0; i < 90; i++) {
    if ((await (await sp.request.get(`${API}/events/${eventId}`)).json()).status === 'published') break;
    await sp.waitForTimeout(1000);
  }
  check((await (await sp.request.get(`${API}/events/${eventId}`)).json()).status === 'published', 'InsightFace indexou e o evento foi publicado');
  await staff.close();

  // ---------------------------------------------------------------- visitor: no account, phone width
  const visitor = await browser.newContext({ viewport: { width: 402, height: 900 }, acceptDownloads: true, permissions: ['camera'] });
  const page = await visitor.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4[0-9][0-9]|non-boolean attribute|accessible|shadow\*/.test(m.text())) problems.push(m.text().slice(0, 200));
  });
  const shot = async (name, full = true) => {
    step += 1;
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: full });
  };
  const visible = (loc) => loc.filter({ visible: true });
  const button = (name) => visible(page.getByRole('button', { name, exact: true })).first();
  const text = (t) => visible(page.getByText(t)).first();

  console.log('2. Início público e pesquisa de eventos (RF013)');
  await page.goto(WEB);
  await text('Encontre suas fotos nos eventos do CESMAC').waitFor();
  await text(EVENT).waitFor();
  await shot('inicio');
  await page.getByLabel('Buscar evento pelo nome').fill('fecial edicao');   // no accents
  await text('Resultado da busca').waitFor();
  await text(EVENT).waitFor();
  check(true, 'pesquisa sem acento encontra o evento');
  await page.getByLabel('Buscar evento pelo nome').fill(`fecil ${stamp}`);  // typo
  await text(EVENT).waitFor();
  check(true, 'pesquisa com erro de digitação encontra o evento');
  await button('Tema').click();
  await visible(page.getByRole('checkbox', { name: themes[0].name })).click();
  await text('Tema (1)').waitFor();
  await text(EVENT).waitFor();
  check(true, 'filtro por tema');
  await shot('inicio-busca', false);
  await page.mouse.click(200, 860);           // a click anywhere outside closes the popover
  check(!(await visible(page.getByRole('checkbox')).count()), 'clicar fora fecha o filtro');

  console.log('3. Galeria privada: nada sem busca (RF014, RNF20)');
  for (const v of ['thumb', 'preview', 'download']) {
    const r = await page.request.get(`${API}/public/images/${ids['grupo.jpg']}/${v}`, { maxRedirects: 0 });
    check(r.status() === 404, `/${v} de uma foto do evento sem busca → 404`);
  }
  await text(EVENT).click();
  await text('Procure suas fotos').waitFor();
  await text('3 fotos').waitFor();
  check(await text('Moacir Barbosa — CESMAC').isVisible(), 'crédito do evento (RF014 nota 3)');
  check(await page.locator('img[src*="/public/images/"]').count() === 0, 'nenhuma foto do evento na página antes da busca');
  check(await text(/destinam-se exclusivamente às pessoas nelas retratadas/).isVisible(), 'aviso de uso responsável (RF022)');
  await shot('evento');

  console.log('4. Permissão antes da câmera e da galeria (RF015)');
  await button('Buscar minhas fotos').click();
  await text('Permissão para uso de imagem').waitFor();
  check(await page.getByRole('checkbox').count() === 0, 'nenhuma caixa pré-marcada: só a ação "Estou ciente"');
  await text(/menores de 18 anos/).waitFor();
  check(true, 'advertência sobre menores (Art. 14)');
  await shot('permissao', false);
  await button('Agora não').click();
  check(!(await text('Realizar upload').isVisible().catch(() => false)), 'sem "Estou ciente", as opções não aparecem');
  const blocked = await page.request.post(`${API}/public/events/${eventId}/search`, { multipart: {
    selfie: { name: 's.jpg', mimeType: 'image/jpeg', buffer: readFileSync(photo('grupo.jpg')) } } });
  check(blocked.status() === 403, 'o servidor recusa a busca sem ciência (403)');
  await button('Buscar minhas fotos').click();
  await button('Estou ciente').click();
  await text('Realizar upload').waitFor();
  await shot('opcoes', false);

  console.log('5. Busca pela galeria — PNG convertido no navegador (RF016)');
  const upload = async (file) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),
      visible(page.getByRole('menuitem', { name: /Realizar upload/ })).click()]);
    await chooser.setFiles(photo(file));
  };
  await upload('selfie.png');
  await text('2 fotos encontradas').waitFor({ timeout: 30000 });
  check(true, 'a pessoa foi encontrada nas 2 fotos de grupo — e não na paisagem');
  check(await text(/semelhança visual, não identidade/).isVisible(), 'aviso de similaridade (RF016 nota 5)');
  await shot('resultado');
  const thumb = await page.request.get(`${API}/public/images/${ids['grupo.jpg']}/thumb`);
  check(thumb.status() === 200, 'agora a miniatura é servida (está no resultado desta sessão)');
  const other = await page.request.get(`${API}/public/images/${ids['paisagem.jpg']}/thumb`);
  check(other.status() === 404, 'a paisagem do mesmo evento continua inacessível');

  console.log('5b. Sair do evento e voltar: o resultado some (relato do Thiago)');
  await visible(page.getByRole('link', { name: 'Voltar' })).click();
  await text('Encontre suas fotos nos eventos do CESMAC').waitFor();
  await text(EVENT).click();
  await text('Procure suas fotos').waitFor();
  await page.waitForTimeout(800);
  // exact: "Suas fotos" would also match "Procure suas fotos".
  check(await page.getByText('Suas fotos', { exact: true }).count() === 0, 'ao voltar, o bloco "Suas fotos" não existe');
  check(await page.locator('img[src*="/public/images/"]').count() === 0, 'nenhuma imagem do resultado anterior na página (nem escondida)');
  check((await page.request.get(`${API}/public/images/${ids['grupo.jpg']}/thumb`)).status() === 404,
    'e o servidor também esqueceu o resultado (miniatura → 404)');
  await button('Buscar minhas fotos').click();
  await text('Permissão para uso de imagem').waitFor();
  check(true, 'a permissão é pedida de novo');
  await button('Estou ciente').click();
  await text('Realizar upload').waitFor();
  await upload('selfie.png');
  await text('2 fotos encontradas').waitFor({ timeout: 30000 });

  console.log('6. Foto ampliada, navegação e download (RF018, RF019)');
  await visible(page.getByRole('button', { name: 'Abrir foto 1 de 2' })).click();
  await text('Foto 1 de 2').waitFor();
  check(await text('Fotografia por: Moacir Barbosa — Centro Universitário CESMAC').isVisible(), 'crédito na tela');
  await shot('ampliada', false);
  await button('Próxima foto').click();
  await text('Foto 2 de 2').waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), button('Baixar').click()]);
  const bytes = readFileSync(await download.path());
  check(bytes[0] === 0xff && bytes[1] === 0xd8, `download é JPEG (${download.suggestedFilename()})`);
  check(!/8333|X-Amz/.test(download.url()), 'o endereço do download não expõe o armazenamento (vai para o "Onde obtido" do arquivo)');
  check((await page.request.get(download.url())).status() === 200, 'o link funciona nesta sessão');
  check((await (await browser.newContext()).request.get(download.url())).status() === 404, 'e não funciona fora dela');
  check(bytes.includes(Buffer.from('Moacir Barbosa')), 'créditos gravados nos metadados do arquivo');
  const downloadedPath = join(SHOTS, 'baixada.jpg');
  await download.saveAs(downloadedPath);

  console.log('7. Remoção a partir da foto (RF023)');
  // Removes photo 1 — photo 2 (downloaded above) is used in step 9 for the removal by file.
  await button('Foto anterior').click();
  await text('Foto 1 de 2').waitFor();
  await button('Solicitar remoção desta foto').click();
  await text('Foto selecionada para a solicitação da remoção').waitFor();
  await button('Enviar').click();
  await text('Informe um e-mail válido para receber a confirmação.').waitFor();
  await page.getByLabel('E-mail para contato').fill('pessoa.retratada@exemplo.com');
  await shot('remocao', false);
  await button('Enviar').click();
  await text('Solicitação recebida').waitFor();
  await shot('remocao-ok', false);
  await button('Entendi').click();
  await text('1 foto encontrada').waitFor();
  check(true, 'a foto saiu do resultado na hora (nota 4)');
  check(!!newestMail(/pessoa\.retratada@exemplo\.com/), 'confirmação enviada a quem pediu');
  check(!!newestMail(new RegExp(`To: ${email.replace(/\./g, '\\.')}[\\s\\S]*solicita`)), 'fotógrafo avisado (nota 5)');

  console.log('8. Resultado vazio, foto sem rosto e câmera');
  await button('Buscar minhas fotos').click();
  await upload('estranho.jpg');
  await text('Nenhuma foto encontrada').waitFor({ timeout: 30000 });
  check(true, 'outra pessoa não recebe nenhuma foto');
  await shot('sem-fotos');
  await button('Buscar minhas fotos').click();
  await upload('paisagem.jpg');
  await visible(page.getByRole('alert')).first().waitFor();
  check(/rosto/i.test(await visible(page.getByRole('alert')).first().innerText()), 'foto sem rosto: mensagem orienta nova captura (RF017 nota 4)');
  await button('Buscar minhas fotos').click();
  await visible(page.getByRole('menuitem', { name: /Tirar foto/ })).click();
  await text('Centralize o rosto no molde').waitFor();
  await button('Capturar').waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await shot('camera', false);
  await button('Capturar').click();
  await visible(page.getByRole('alert')).first().waitFor({ timeout: 30000 });
  check(true, 'foto da câmera enviada pelo mesmo caminho (a câmera falsa não tem rosto)');
  // What matters for privacy: the camera itself is OFF (every track ended), not just hidden.
  check(await page.evaluate(() => [...document.querySelectorAll('video')]
    .every((v) => !v.srcObject || v.srcObject.getTracks().every((t) => t.readyState === 'ended'))), 'câmera desligada após a captura');

  console.log('9. Remoção pelo arquivo, sem busca (RF022 nota 6)');
  const stranger = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const sp2 = await stranger.newPage();
  await sp2.goto(WEB);
  await sp2.getByRole('button', { name: 'Menu' }).click();
  await sp2.getByRole('menuitem', { name: 'Solicitar remoção de imagem' }).click();
  await sp2.getByText('Tem o arquivo da foto?').waitFor();
  const [chooser] = await Promise.all([sp2.waitForEvent('filechooser'), sp2.getByText('Selecionar arquivo da foto (JPEG)').click()]);
  await chooser.setFiles(downloadedPath);
  await sp2.getByLabel('E-mail para contato').fill('terceiro@exemplo.com');
  await sp2.getByRole('button', { name: 'Enviar', exact: true }).click();
  await sp2.getByText(/Solicitação recebida|Não encontramos|Já existe/).first().waitFor();
  const answer = await sp2.getByText(/Solicitação recebida|Não encontramos|Já existe/).first().innerText();
  check(answer === 'Solicitação recebida', `arquivo baixado identificou a foto (resposta: ${answer.slice(0, 80)})`);
  await sp2.screenshot({ path: join(SHOTS, `${String(++step).padStart(2, '0')}-remocao-por-arquivo.png`), fullPage: true });
  check(true, 'quem nunca buscou identificou a foto pelo arquivo baixado');
  await page.reload();
  await text('Procure suas fotos').waitFor();
  await page.waitForTimeout(800);
  check(!(await text('Nenhuma foto encontrada').isVisible().catch(() => false)), 'ao recarregar a aba, o resultado também some');

  console.log('10. Política de Privacidade e acesso da equipe');
  await sp2.goto(`${WEB}/privacidade`);
  await sp2.getByText('Por quanto tempo').waitFor();
  check(/\d+ meses|1 mês/.test(await sp2.getByText(/ficam disponíveis por/).innerText()), 'prazo de retenção vindo do servidor (RF022 nota 5)');
  await sp2.screenshot({ path: join(SHOTS, `${String(++step).padStart(2, '0')}-privacidade.png`), fullPage: true });
  await sp2.goto(`${WEB}/painel`);
  await sp2.getByText('Acesse sua conta').waitFor();
  check(true, 'sem sessão, /painel vai para o login da equipe');
  await sp2.goto(WEB);
  await sp2.getByText('Encontre suas fotos nos eventos do CESMAC').waitFor();
  await sp2.screenshot({ path: join(SHOTS, `${String(++step).padStart(2, '0')}-inicio-desktop.png`), fullPage: true });

  check(problems.length === 0, `sem erros no console${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  console.log('\nTUDO OK');
} finally {
  await browser.close();
}
