// End-to-end test of part 4b (administrator: themes RF027, parameters RF026, re-indexing RF028)
// in a real browser against the real API and YuNet + SFace. Leaves every parameter back at its
// value before the test.
//
//   node e2e/config.e2e.mjs <grupo.jpg> <capa.jpg> [screenshot-folder]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const [GROUP, COVER, SHOTS = 'e2e-screenshots/config'] = process.argv.slice(2);
if (!GROUP || !COVER) throw new Error('uso: node e2e/config.e2e.mjs <grupo.jpg> <capa.jpg> [pasta]');
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const adminEmail = `e2e.admin.${stamp}@cesmac.edu.br`;
const photoEmail = `e2e.fotografo.${stamp}@cesmac.edu.br`;
const PASSWORD = 'Fotomac#2026';
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };
const token = (email) => {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    const m = readFileSync(f, 'utf8');
    if (m.includes(`To: ${email}`)) return m.match(/primeiro-acesso\?token=([\w-]+)/)[1];
  }
  throw new Error(`sem link para ${email}`);
};
const create = (name, email, role, extra = []) => execFileSync(join(BACKEND, '.venv/bin/python'),
  ['scripts/create_account.py', '--name', name, '--email', email, '--role', role, ...extra], { cwd: BACKEND });

const browser = await chromium.launch();
const problems = [];
let step = 0;
let restore = null;

try {
  console.log('1. Preparação: fotógrafo publica um evento com uma foto de grupo; administrador ativado');
  create('Moacir Barbosa Teste', photoEmail, 'photographer', ['--signature', 'Moacir Barbosa']);
  create('Ana Administradora Teste', adminEmail, 'admin');
  const ph = await (await browser.newContext()).newPage();
  check((await ph.request.post(`${API}/auth/first-access`, { data: { token: token(photoEmail), password: PASSWORD, password_confirmation: PASSWORD } })).ok(), 'fotógrafo ativado');
  const themes = await (await ph.request.get(`${API}/themes`)).json();
  const ev = await (await ph.request.post(`${API}/events`, { multipart: {
    name: `Reindexação E2E ${stamp}`, theme_ids: String(themes[0].id), date_precision: 'day', date_start: '2026-09-18',
    location: 'Campus I', description: 'Evento do teste automatizado.',
    cover: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: readFileSync(COVER) } } })).json();
  await ph.request.post(`${API}/events/${ev.id}/images`, { multipart: { file: { name: 'g.jpg', mimeType: 'image/jpeg', buffer: readFileSync(GROUP) } } });
  await ph.request.post(`${API}/events/${ev.id}/publish`);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4[0-9][0-9]|non-boolean attribute|accessible|shadow\*/.test(m.text())) problems.push(m.text().slice(0, 200));
  });
  const shot = async (name) => { step += 1; await page.waitForTimeout(500); await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true }); };
  const visible = (loc) => loc.filter({ visible: true });
  const button = (name) => visible(page.getByRole('button', { name, exact: true })).first();
  const text = (t) => visible(page.getByText(t)).first();
  const field = (label) => visible(page.getByLabel(label, { exact: true })).first();
  check((await page.request.post(`${API}/auth/first-access`, { data: { token: token(adminEmail), password: PASSWORD, password_confirmation: PASSWORD } })).ok(), 'administrador ativado');
  restore = (await (await page.request.get(`${API}/admin/parameters`)).json()).items;

  console.log('2. Temas (RF027)');
  await page.goto(`${WEB}/temas`);
  await text('Temas oferecidos no cadastro de eventos e nos filtros da busca pública.').waitFor();
  const theme = `Robótica E2E ${stamp % 10000}`;
  await field('Novo tema').fill(theme);
  await button('Adicionar').click();
  await text(`Tema “${theme}” criado.`).waitFor();
  await field('Novo tema').fill(theme.toUpperCase());
  await button('Adicionar').click();
  await text('Já existe um tema com esse nome.').waitFor();
  check(true, 'nome único, sem diferenciar maiúsculas');
  await shot('temas');
  const row = visible(page.getByLabel(`Tema ${theme}`, { exact: true })).first();
  await row.getByRole('button', { name: 'Inativar' }).click();
  await text(`“${theme}” inativado: não aparece mais em eventos novos nem nos filtros.`).waitFor();
  check(!(await (await ph.request.get(`${API}/themes`)).json()).some((t) => t.name === theme), 'tema inativo não é oferecido ao fotógrafo');
  await row.getByRole('button', { name: 'Excluir' }).click();
  await visible(page.getByRole('dialog')).getByRole('button', { name: 'Excluir', exact: true }).click();
  await text('Tema excluído.').waitFor();
  check(true, 'tema sem uso excluído');
  const used = visible(page.getByLabel(`Tema ${themes[0].name}`, { exact: true })).first();
  check(await used.getByRole('button', { name: 'Excluir' }).count() === 0, 'tema em uso não tem "Excluir" (nota 1)');

  console.log('3. Parâmetros (RF026)');
  await page.goto(`${WEB}/reconhecimento`);
  await text('Modelo de reconhecimento').first().waitFor();
  check(await text(/yunet-2023mar\+sface-2021dec/).isVisible(), 'modelo em uso exibido (YuNet + SFace)');
  await shot('parametros');
  await field('Limiar de similaridade').fill('0,9');
  await text('Entre 0,20 e 0,80.').waitFor();
  check(true, 'valor fora da faixa recusado na tela');
  await field('Limiar de similaridade').fill('0,35');
  await visible(page.getByRole('button', { name: /^Salvar 1 alteração/ })).click();
  await text('Alterar o limiar de similaridade?').waitFor();
  await text(/aumenta o risco de falso positivo/).waitFor();
  await shot('advertencia-limiar');
  await button('Entendi, salvar').click();
  await text(/1 parâmetro\(s\) alterado\(s\)/).waitFor();
  await text(/Limiar de similaridade: [0-9,]+ → 0,35/).waitFor();
  check(true, 'mudança registrada no histórico com valor anterior e novo (nota 4)');
  await field('Prazo de retenção do acervo').fill('12');
  await visible(page.getByRole('button', { name: /^Salvar 1 alteração/ })).click();
  await text('Alterar o prazo de retenção?').waitFor();
  await text(/a data de expiração de \d+ evento\(s\) muda agora/).waitFor();
  await shot('impacto-retencao');
  await button('Confirmar').click();
  await text(/1 parâmetro\(s\) alterado\(s\)/).waitFor();
  check((await (await page.request.get(`${API}/public/privacy`)).json()).retention === '12 meses', 'prazo público atualizado na hora (RF022 nota 5)');

  console.log('4. Reindexação (RF028)');
  for (let i = 0; i < 60 && (await (await ph.request.get(`${API}/events/${ev.id}`)).json()).status !== 'published'; i++) await page.waitForTimeout(1000);
  await visible(page.getByRole('tab', { name: 'Reindexação' })).click();
  await text('Nova reindexação').waitFor();
  await page.getByLabel('Evento', { exact: true }).filter({ visible: true }).first().click();
  await visible(page.getByRole('menuitem', { name: `Reindexação E2E ${stamp}` })).click();
  await button('Reindexar').click();
  await text('Iniciar reindexação?').waitFor();
  await button('Iniciar').click();
  await text('1 imagem(ns) na fila de reindexação.').waitFor();
  await text(/Concluída · 1 de 1 reindexadas/).waitFor({ timeout: 60000 });
  check(true, 'fila própria processou e o progresso chegou a 100%');
  await shot('reindexacao');
  const faces = (await (await ph.request.get(`${API}/events/${ev.id}/images?filter=all`)).json()).items[0].faces_count;
  check(faces === 6, 'a foto continua com os 6 rostos (vetores substituídos)');

  console.log('5. Fotógrafo não acessa');
  check((await ph.request.get(`${API}/admin/parameters`)).status() === 403, 'parâmetros: 403 para fotógrafo');
  check((await ph.request.get(`${API}/admin/themes`)).status() === 403, 'temas: 403 para fotógrafo');

  check(problems.length === 0, `console sem erros${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  console.log('\nTUDO CERTO — temas, parâmetros e reindexação (parte 4b).');
} finally {
  if (restore) {  // the dev database goes back to the values it had before the test
    const page = (await browser.contexts()[1]?.pages())?.[0];
    if (page) {
      await page.request.put(`${API}/admin/parameters`, { data: {
        values: Object.fromEntries(restore.map((p) => [p.key, p.value])), threshold_warning_acknowledged: true } });
      console.log('  (parâmetros devolvidos aos valores anteriores ao teste)');
    }
  }
  await browser.close();
}
