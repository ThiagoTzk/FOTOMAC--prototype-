// End-to-end test of part 4a (administrator: accounts — RF001, RF002 note 7, RF003) in a real
// browser against the real API.
//
//   node e2e/admin.e2e.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const SHOTS = process.argv[2] ?? 'e2e-screenshots/admin';
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const adminEmail = `e2e.admin.${stamp}@cesmac.edu.br`;
const photoEmail = `e2e.fotografo.${stamp}@cesmac.edu.br`;
const PASSWORD = 'Fotomac#2026';
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };

function linkFor(email) {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const f of files) {
    const m = readFileSync(f, 'utf8');
    if (m.includes(`To: ${email}`)) return m.match(/http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/)?.[0];
  }
  return null;
}
const mailsTo = (email) => readdirSync(OUTBOX).filter((f) => f.endsWith('.eml'))
  .map((f) => readFileSync(join(OUTBOX, f), 'utf8')).filter((m) => m.includes(`To: ${email}`));

const browser = await chromium.launch();
const problems = [];
let step = 0;

try {
  console.log('1. Administrador ativado');
  execFileSync(join(BACKEND, '.venv/bin/python'), ['scripts/create_account.py', '--name', 'Ana Administradora Teste',
    '--email', adminEmail, '--role', 'admin'], { cwd: BACKEND });
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

  await page.goto(linkFor(adminEmail));
  await field('Nova senha').fill(PASSWORD);
  await field('Confirmar nova senha').fill(PASSWORD);
  await button('Salvar nova senha').click();
  await visible(page.getByRole('button', { name: /Continuar para o painel/ })).click();
  await text('ÁREA DO ADMINISTRADOR').waitFor();
  check(await visible(page.getByRole('link', { name: 'Contas' })).count() + await text('Contas').count() > 0, 'menu "Contas" para o administrador');

  console.log('2. Relação e cadastro (RF001)');
  await page.goto(`${WEB}/contas`);
  await text('Contas de operação do FOTOMAC. Não existe autocadastro: toda conta nasce aqui.').waitFor();
  await shot('relacao');
  await button('Nova conta').click();
  await text('A conta é criada sem senha').waitFor();
  await button('Criar conta e enviar link').click();
  await text('Informe o nome completo (nome e sobrenome).').waitFor();
  check(await text('A assinatura é obrigatória para o perfil Fotógrafo.').isVisible(), 'validação no formulário (notas 1, 2 e 4)');
  await field('Nome completo').fill('Moacir Barbosa Teste');
  await field('E-mail institucional').fill('moacir@gmail.com');
  await text(/não é do domínio @cesmac.edu.br/).waitFor();
  check(true, 'aviso de e-mail fora do domínio institucional (nota 2)');
  await field('E-mail institucional').fill(photoEmail);
  await field('Assinatura do fotógrafo').fill('Moacir Barbosa');
  await text('Crédito nas fotos: Fotografia por: Moacir Barbosa — Centro Universitário CESMAC').waitFor();
  await shot('nova-conta');
  await button('Criar conta e enviar link').click();
  await text('Conta criada. O link para definir a senha foi enviado ao e-mail do titular.').waitFor();
  await text('Aguardando o titular definir a senha').waitFor();
  check(!!linkFor(photoEmail), 'link de uso único enviado ao titular (nota 5)');
  check(!mailsTo(photoEmail).some((m) => m.includes(PASSWORD)), 'nenhuma senha no e-mail');
  await shot('conta-pendente');
  const accountUrl = page.url().split('?')[0];
  const accountId = accountUrl.split('/').pop();

  const first = linkFor(photoEmail);
  await text('Reenviar link').click();
  await text('Novo link enviado ao e-mail do titular.').waitFor();
  const second = linkFor(photoEmail);
  check(first !== second, 'reenviar gera um link novo (nota 7)');

  await page.goto(`${WEB}/contas`);
  await page.getByLabel('Buscar conta').fill(`e2e.fotografo.${stamp}`);
  await text('Moacir Barbosa Teste').waitFor();
  check(await text('Aguardando o titular definir a senha').isVisible(), 'pendente destacada na relação');

  console.log('3. Titular ativa a conta pelo link');
  const photo = await browser.newContext();
  const pp = await photo.newPage();
  await pp.goto(first);
  await pp.getByText(/link de ativação é inválido/).waitFor();
  check(true, 'o link anterior deixou de valer');
  await pp.goto(second);
  await pp.getByLabel('Nova senha', { exact: true }).fill(PASSWORD);
  await pp.getByLabel('Confirmar nova senha', { exact: true }).fill(PASSWORD);
  await pp.getByRole('button', { name: 'Salvar nova senha' }).click();
  await pp.getByRole('button', { name: /Continuar para o painel/ }).click();
  await pp.getByText('ÁREA DO FOTÓGRAFO').waitFor();
  check(await pp.getByText('Contas', { exact: true }).count() === 0, 'fotógrafo não vê o menu Contas');
  const denied = await pp.request.get(`${API}/admin/accounts`);
  check(denied.status() === 403, 'e o servidor recusa a rota de administrador (403)');

  console.log('4. Bloqueio e desbloqueio (RF002 nota 7)');
  const anon = await browser.newContext();
  for (let i = 0; i < 5; i++) await anon.request.post(`${API}/auth/login`, { data: { email: photoEmail, password: 'Errada#123' } });
  await page.goto(accountUrl);
  await text('Bloqueada após 5 tentativas de senha sem sucesso').waitFor();
  await shot('bloqueada');
  await text('Desbloquear').click();
  await text('Conta desbloqueada.').waitFor();
  check((await anon.request.post(`${API}/auth/login`, { data: { email: photoEmail, password: PASSWORD } })).ok(), 'desbloqueada, entra de novo');

  console.log('5. Suspensão com confirmação (RF003)');
  await button('Suspender').click();
  await text('Suspender conta?').waitFor();
  await text(/deixa de poder entrar no sistema agora mesmo/).waitFor();
  await shot('confirmar-suspensao');
  await button('Confirmar: suspender').click();
  await text('Situação alterada para “Suspensa”.').waitFor();
  check((await pp.request.get(`${API}/dashboard`)).status() === 401, 'sessão do fotógrafo cortada na hora');
  check(mailsTo(photoEmail).some((m) => /suspensa/.test(m)), 'titular avisado por e-mail (nota 3)');
  check(await text('Reativar').isVisible(), 'opção de reativar');
  await button('Reativar').click();
  await button('Confirmar: reativar').click();
  await text('Situação alterada para “Ativa”.').waitFor();
  check(await visible(page.getByRole('button', { name: 'Excluir' })).count() === 0, 'não existe "Excluir conta" (nota 4)');

  console.log('6. Mudança de perfil e a própria conta');
  await page.locator('[aria-label="Perfil de acesso"]').filter({ visible: true }).first().click();
  await visible(page.getByRole('menuitem', { name: 'Administrador' })).click();
  await button('Salvar alterações').click();
  await text('Alterações salvas.').waitFor();
  check((await (await page.request.get(`${API}/admin/accounts/${accountId}`)).json()).role === 'admin', 'perfil alterado (registrado em log)');
  const me = (await (await page.request.get(`${API}/auth/me`)).json()).id;
  await page.goto(`${WEB}/contas/${me}`);
  await text('Esta é a sua conta. A situação dela só pode ser alterada por outro administrador.').waitFor();
  check(await button('Suspender').count() === 0, 'sem botões de situação na própria conta');

  console.log('7. Celular (390 px)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/contas`);
  await text('Nova conta').waitFor();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');
  await shot('celular');

  check(problems.length === 0, `console sem erros${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  console.log('\nTUDO CERTO — contas do administrador (parte 4a).');
} finally {
  await browser.close();
}
