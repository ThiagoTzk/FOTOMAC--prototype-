// End-to-end test of the photographer panel (part 2b-1), in a real browser.
// Needs API (8000), Expo web (8081), SeaweedFS and a cover JPEG:
//
//   node e2e/panel.e2e.mjs <capa.jpg> [screenshot-folder]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const COVER = process.argv[2];
const SHOTS = process.argv[3] ?? 'e2e-screenshots';
if (!COVER) throw new Error('uso: node e2e/panel.e2e.mjs <capa.jpg> [pasta]');
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const email = `e2e.painel.${stamp}@cesmac.edu.br`;
const PASSWORD = 'Fotomac#2026';
const EVENT = `Mostra de Ciência E2E ${stamp}`;
let step = 0;

const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };

function activationLink() {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return readFileSync(files[0], 'utf8').match(/http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/)[0];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/status of 40[134]|non-boolean attribute|accessible/.test(t)) problems.push(t.slice(0, 200));
});
const shot = async (name) => {
  step += 1;
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
};
const visible = (loc) => loc.filter({ visible: true });
const field = (label) => visible(page.getByLabel(label, { exact: true }));
const button = (name) => visible(page.getByRole('button', { name, exact: true }));
const menu = (name) => visible(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name, exact: true }));

try {
  console.log('1. Conta de fotógrafo ativada pelo link');
  execFileSync(join(BACKEND, '.venv/bin/python'), ['scripts/create_account.py', '--name', 'Moacir Barbosa Teste',
    '--email', email, '--role', 'photographer', '--signature', 'Moacir Barbosa'], { cwd: BACKEND });
  await page.goto(activationLink());
  await field('Nova senha').fill(PASSWORD);
  await field('Confirmar nova senha').fill(PASSWORD);
  await button('Salvar nova senha').click();
  await visible(page.getByRole('button', { name: /Continuar para o painel/ })).click();

  console.log('2. Visão geral');
  await visible(page.getByText('Olá, Moacir!')).waitFor();
  await visible(page.getByText('Nenhuma pendência')).waitFor();
  check(true, 'sem pendências inventadas');
  check(await visible(page.getByText('FOTOMAC', { exact: true })).first().isVisible(), 'marca na barra lateral');
  await shot('visao-geral-vazia');

  console.log('3. Criar evento');
  await button('+ Novo evento').click();
  await visible(page.getByText('Novo evento', { exact: true })).first().waitFor();
  await button('Criar evento').click();
  check(await visible(page.getByText('Informe o nome do evento.')).isVisible(), 'validação dos campos obrigatórios');
  await shot('criar-evento-validacao');
  await field('Nome do evento').fill(EVENT);
  await visible(page.getByRole('button', { name: 'Temas' })).click();
  await visible(page.getByRole('menuitem', { name: 'Ciência' })).click();
  await visible(page.getByRole('menuitem', { name: 'Educação' })).click();
  await visible(page.getByRole('button', { name: 'Concluir' })).click();
  await field('Data do evento').fill('18092026');
  check(await field('Data do evento').inputValue() === '18/09/2026', 'máscara de data dd/mm/aaaa');
  await field('Local').fill('Centro Cultural Reitor João Sampaio');
  await field('Descrição').fill('Feira de ciências com projetos de estudantes do CESMAC.');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'),
                                       visible(page.getByRole('button', { name: 'Selecionar capa JPEG' })).click()]);
  await chooser.setFiles(COVER);
  await visible(page.getByText('capa-teste.jpg')).waitFor();
  await shot('criar-evento-preenchido');
  await button('Criar evento').click();

  console.log('4. Detalhes do evento');
  await visible(page.getByRole('heading', { name: EVENT })).waitFor();
  await visible(page.getByText('18 de setembro de 2026')).waitFor();
  check(true, 'data por extenso');
  await visible(page.getByText('18/03/2027')).first().waitFor();
  check(true, 'expiração em 6 meses (RNF12)');
  await page.waitForTimeout(1500); // cover image
  await shot('detalhes-evento');
  await visible(page.getByRole('tab', { name: 'Colaboração' })).click();
  await visible(page.getByText('Colaboração não liberada')).waitFor();
  await visible(page.getByLabel('Liberar colaboração')).click();
  await visible(page.getByText('Colaboração liberada', { exact: true })).waitFor();
  check(true, 'colaboração liberada pelo responsável');
  await shot('detalhes-colaboracao');

  console.log('5. Editar: nova data mostra a nova expiração antes de salvar');
  await visible(page.getByRole('tab', { name: 'Visão geral' })).click();
  await button('Editar evento').click();
  await visible(page.getByText('Editar evento', { exact: true })).first().waitFor();
  await visible(page.getByRole('radio', { name: 'Mês' })).click();
  await field('Data do evento').fill('102026');
  await visible(page.getByText(/passará de 18\/03\/2027 para 31\/04\/2027|passará de 18\/03\/2027 para 30\/04\/2027/)).waitFor();
  check(true, 'aviso "Atenção à data" com a nova expiração (RF005 nota 3)');
  await shot('editar-evento');
  await button('Salvar alterações').click();
  await visible(page.getByText('Outubro/2026')).first().waitFor();
  check(true, 'evento salvo como mês único');

  console.log('6. Lista de eventos: busca sem acento e estado vazio');
  await menu('Eventos').click();
  await visible(page.getByPlaceholder('Buscar evento')).fill('mostra de ciencia e2e');
  await visible(page.getByText(EVENT)).waitFor();
  check(true, 'busca "ciencia" acha "Ciência"');
  await shot('lista-eventos');
  await visible(page.getByPlaceholder('Buscar evento')).fill('nao existe nenhum evento assim');
  await visible(page.getByText('Nenhum evento encontrado')).waitFor();
  await shot('lista-vazia');
  await button('Limpar filtros').click();

  console.log('7. Meu perfil: assinatura');
  await visible(page.getByRole('link', { name: 'Meu perfil' })).click();
  await field('Assinatura').fill('Moacir Barbosa Fotografia');
  check(await visible(page.getByText(/Fotografia por: Moacir Barbosa Fotografia — Centro Universitário CESMAC/)).isVisible(),
        'prévia do crédito no formato da v1.6');
  await button('Salvar alterações').click();
  await visible(page.getByText('Assinatura atualizada.')).waitFor();
  await shot('perfil');

  console.log('8. Celular (390 px): menu lateral vira gaveta');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600); // let the layout react to the new width
  await menu('Visão geral').count().then((n) => check(n === 0, 'barra lateral escondida'));
  await visible(page.getByRole('button', { name: 'Abrir menu' })).click();
  await menu('Eventos').click();
  await visible(page.getByText(EVENT)).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'sem rolagem horizontal');
  await shot('eventos-celular');

  check(problems.length === 0, `console sem erros${problems.length ? ': ' + problems.join(' | ') : ''}`);
  console.log('\nTUDO CERTO — painel do fotógrafo (parte 2b-1).');
} catch (err) {
  await shot('FALHA');
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
