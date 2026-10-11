// End-to-end test of the authentication flow, in a real browser (Playwright/Chromium).
// Needs the API (port 8000), Expo web (port 8081) and SeaweedFS running.
//
//   node e2e/auth.e2e.mjs [screenshot-folder]
//
// Creates a throwaway account through the backend CLI, reads the e-mails the "outbox"
// adapter writes, and walks every screen like a person would.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
// fileURLToPath, not .pathname: the project folder has spaces ("FOTOMAC (prototype)").
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const SHOTS = process.argv[2] ?? 'e2e-screenshots';
mkdirSync(SHOTS, { recursive: true });

const email = `e2e.${Date.now()}@cesmac.edu.br`;
const FIRST_PASSWORD = 'Fotomac#2026';
const NEW_PASSWORD = 'Outra#Senha77';
let step = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`  ok  ${message}`);
}

function latestLink(path) {
  // Decoded MIME body may wrap long lines ("=\n"); join them before searching.
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml'))
    .map((f) => join(OUTBOX, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const body = readFileSync(files[0], 'utf8').replace(/=\r?\n/g, '');
  const match = body.match(new RegExp(`${WEB}${path}\\?token=([\\w-]+)`));
  if (!match) throw new Error(`link ${path} não encontrado no e-mail ${files[0]}`);
  return `${WEB}${path}?token=${match[1]}`;
}

// Only what a person can see: on the web the navigator keeps the previous screen in the
// page, hidden with display:none + aria-hidden, so name-based queries must skip it.
const field = (label, exact = false) => page.getByLabel(label, { exact }).filter({ visible: true });
const button = (name) => page.getByRole('button', { name }).filter({ visible: true });

async function shot(page, name) {
  step += 1;
  await page.waitForTimeout(300); // let fonts and layout settle
  await page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`) });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const consoleProblems = [];
page.on('pageerror', (err) => consoleProblems.push(`erro: ${err.message}`));
// Known and NOT ours, so ignored on purpose:
// - the browser logs every 401 response (wrong password on purpose, "/auth/me" before login);
// - "Received false for a non-boolean attribute accessible": emitted by Expo Router's web
//   navigator itself — it still appears with a screen that renders only one <Text>
//   (checked on 2026-10-03, expo-router 57.0.24);
// - '"shadow*" style props are deprecated': same navigator, same one-<Text> check.
page.on('console', async (msg) => {
  if (msg.type() !== 'error' && msg.type() !== 'warning') return;
  const args = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => '')));
  const text = `${msg.text()} ${args.join(' ')}`;
  const knownFramework = /non-boolean attribute/.test(text) && args.includes('accessible');
  const knownShadow = /"shadow\*" style props are deprecated/.test(text);
  if (/status of 401/.test(text) || knownFramework || knownShadow) return;
  consoleProblems.push(`${msg.type()}: ${text.slice(0, 200)}`);
});

try {
  console.log('1. Conta criada pelo administrador (sem senha)');
  execFileSync(join(BACKEND, '.venv/bin/python'), ['scripts/create_account.py', '--name', 'Teste Automatizado',
    '--email', email, '--role', 'photographer', '--signature', 'Teste Automatizado'], { cwd: BACKEND });
  const activation = latestLink('/primeiro-acesso');
  check(activation.includes('token='), 'e-mail de ativação com link de uso único');

  console.log('2. Login padrão e validação');
  await page.goto(`${WEB}/login`);
  await page.getByText('Acesse sua conta').waitFor();
  await shot(page, 'login-padrao');
  await button('Entrar').click();
  await page.getByText('Informe seu e-mail institucional.').waitFor();
  check(await page.getByText('Informe sua senha.').isVisible(), 'campos vazios mostram os erros do Figma');
  await shot(page, 'login-validacao-campos');

  console.log('3. Conta pendente não entra');
  await field('E-mail institucional').fill(email);
  await field('Senha', true).fill(FIRST_PASSWORD);
  await button('Entrar').click();
  await page.getByText('Não foi possível entrar').waitFor();
  check(true, 'mensagem genérica para conta sem senha');

  console.log('4. Primeiro acesso pelo link do e-mail');
  await page.goto(activation);
  await page.getByText('Crie sua senha').waitFor();
  await field('Nova senha', true).waitFor();
  await shot(page, 'primeiro-acesso');
  await field('Nova senha', true).fill('fraca');
  await field('Confirmar nova senha').fill('diferente');
  await button('Salvar nova senha').click();
  await page.getByText('As senhas não coincidem.').waitFor();
  check(await page.getByText('Revise os campos destacados antes de continuar.').isVisible(), 'validação de senha fraca e diferente');
  await shot(page, 'primeiro-acesso-validacao');
  await field('Nova senha', true).fill(FIRST_PASSWORD);
  await field('Confirmar nova senha').fill(FIRST_PASSWORD);
  await button('Salvar nova senha').click();
  await page.getByText('Nova senha criada').waitFor();
  await shot(page, 'primeiro-acesso-sucesso');
  await button(/Continuar para o painel/).click();
  await page.getByText('Olá, Teste!').waitFor();
  check(true, 'conta ativada e já dentro do painel');

  console.log('5. Link de ativação é de uso único');
  await page.goto(activation);
  await page.getByText(/link de ativação é inválido/).waitFor();
  check(true, 'reabrir o mesmo link é recusado');

  console.log('6. Sair, errar a senha, entrar');
  await page.goto(`${WEB}/painel`);
  await button('Sair').click();
  await page.getByText('Acesse sua conta').waitFor();
  await page.goto(`${WEB}/painel`);
  await page.getByText('Acesse sua conta').waitFor();
  check(true, 'sem sessão, /painel volta para o login');
  await field('E-mail institucional').fill(email);
  await field('Senha', true).fill('Errada#123');
  await button('Entrar').click();
  await page.getByText('Não foi possível entrar. Verifique suas credenciais e tente novamente.').waitFor();
  await shot(page, 'login-erro-credenciais');
  await field('Senha', true).fill(FIRST_PASSWORD);
  await button('Entrar').click();
  await page.getByText('Olá, Teste!').waitFor();
  check(true, 'login com a senha certa');
  await button('Sair').click();
  await page.getByText('Acesse sua conta').waitFor();

  console.log('7. Recuperação de senha');
  await page.getByText('Esqueci minha senha').click();
  await page.getByText('Recuperar senha').waitFor();
  await shot(page, 'recuperacao');
  await field('E-mail institucional').fill(email);
  await button('Enviar link de recuperação').click();
  await page.getByText('Verifique seu e-mail').waitFor();
  await shot(page, 'recuperacao-sucesso');
  const reset = latestLink('/redefinir-senha');

  await page.goto(reset);
  await page.getByText('Definir nova senha').waitFor();
  await field('Nova senha', true).waitFor();
  await shot(page, 'redefinicao');
  await field('Nova senha', true).fill(NEW_PASSWORD);
  await field('Confirmar nova senha').fill(NEW_PASSWORD);
  await button('Redefinir senha').click();
  await page.getByText('Senha alterada com sucesso').waitFor();
  await shot(page, 'redefinicao-sucesso');
  await button('Ir para o login').click();

  await field('E-mail institucional').fill(email);
  await field('Senha', true).fill(FIRST_PASSWORD);
  await button('Entrar').click();
  await page.getByText('Não foi possível entrar').waitFor();
  check(true, 'a senha antiga deixou de funcionar');
  await field('Senha', true).fill(NEW_PASSWORD);
  await button('Entrar').click();
  await page.getByText('Olá, Teste!').waitFor();
  check(true, 'a nova senha funciona');

  check(await page.evaluate(() => document.documentElement.lang) === 'pt-BR', 'página declarada em português (pt-BR)');

  console.log('7b. Aviso de bloqueio visível a partir da 3ª tentativa');
  await button('Sair').click();
  await page.getByText('Acesse sua conta').waitFor();
  // E-mail inexistente de propósito: o aviso não pode depender de a conta existir (RF002 nota 1).
  await field('E-mail institucional').fill('ninguem.existe@cesmac.edu.br');
  for (let i = 1; i <= 3; i++) {
    await field('Senha', true).fill(`Errada#${i}`);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST'),
      button('Entrar').click(),
    ]);
    await page.waitForTimeout(300);
    const shown = await page.getByText(/bloqueado por 15 minutos/).isVisible();
    check(shown === (i >= 3), `tentativa ${i}: aviso de bloqueio ${i >= 3 ? 'visível' : 'ainda oculto'}`);
  }
  await shot(page, 'login-aviso-bloqueio');

  console.log('8. Celular (390 px)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Acesse sua conta').waitFor();
  await shot(page, 'login-celular');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'sem rolagem horizontal no celular');

  check(consoleProblems.length === 0, `console do navegador sem erros nem avisos${consoleProblems.length ? ':\n    ' + consoleProblems.join('\n    ') : ''}`);

  console.log('\nTUDO CERTO — fluxo de autenticação completo no navegador.');
} catch (err) {
  await shot(page, 'FALHA');
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
