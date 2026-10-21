// End-to-end test of stage 4 (requirements v2.0): photos in HEIC, PNG, WebP and RAW (RF007), the
// download of the accounts without watermark (RF030) and the administrator's new parameters (RF026),
// in a real browser against the real API, ExifTool and SeaweedFS.
//
//   node e2e/formats.e2e.mjs <cover.jpg> [screenshot-folder]
//
// The photos are the synthetic samples of backend/tests/fixtures/formats (colour blocks, no person,
// with a fake GPS position). The watermark of the visitor's download needs a face search and is
// covered by backend/tests (test_formats_and_downloads.py, test_public.py).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const WEB = 'http://localhost:8081';
const API = 'http://localhost:8000/api/v1';
const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
const OUTBOX = join(BACKEND, 'outbox');
const SAMPLES = join(BACKEND, 'tests/fixtures/formats');
const [COVER, SHOTS = 'e2e-screenshots/formatos'] = process.argv.slice(2);
if (!COVER) throw new Error('uso: node e2e/formats.e2e.mjs <capa.jpg> [pasta-capturas]');
mkdirSync(SHOTS, { recursive: true });

const stamp = Date.now();
const PASSWORD = 'Fotomac#2026';
let step = 0;
const check = (ok, msg) => { if (!ok) throw new Error(`FALHOU: ${msg}`); console.log(`  ok  ${msg}`); };
const sample = (ext) => join(SAMPLES, `sample.${ext}`);

function activationLink() {
  const files = readdirSync(OUTBOX).filter((f) => f.endsWith('.eml')).map((f) => join(OUTBOX, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return readFileSync(files[0], 'utf8').match(/http:\/\/localhost:8081\/primeiro-acesso\?token=[\w-]+/)[0];
}

const browser = await chromium.launch();
const problems = [];

async function signIn(name, role, signature) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[0-9]|non-boolean attribute|accessible/.test(m.text())) problems.push(m.text().slice(0, 200));
  });
  const args = ['scripts/create_account.py', '--name', name, '--email', `e2e.formatos.${role}.${stamp}@cesmac.edu.br`, '--role', role];
  execFileSync(join(BACKEND, '.venv/bin/python'), signature ? [...args, '--signature', signature] : args, { cwd: BACKEND });
  await page.goto(activationLink());
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar nova senha', { exact: true }).filter({ visible: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Salvar nova senha', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: /Continuar para o painel/ }).filter({ visible: true }).click();
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

let admin;
try {
  console.log('1. Fotógrafo e administrador ativados; evento criado');
  const page = await signIn('Moacir Barbosa Formatos', 'photographer', 'Moacir Barbosa');
  const { text, button, shot } = tools(page);
  await text('Olá, Moacir!').waitFor();
  const created = await page.request.post(`${API}/events`, { multipart: {
    name: `FORMATOS E2E ${stamp}`, theme_ids: '1', date_precision: 'day', date_start: '2026-09-18',
    location: 'Campus I', description: 'Evento do teste automatizado.',
    cover: { name: 'capa.jpg', mimeType: 'image/jpeg', buffer: readFileSync(COVER) } } });
  check(created.status() === 201, 'evento criado');
  const eventId = (await created.json()).id;
  admin = await signIn('Admin Formatos', 'admin');

  console.log('2. Envio: HEIC, PNG e WebP aceitos; RAW recusado enquanto desligado (RF007)');
  await page.goto(`${WEB}/eventos/${eventId}/enviar`);
  await text('Arraste suas fotos aqui').waitFor();
  check(await text('JPEG, PNG, HEIC, WebP').isVisible(), 'formatos aceitos informados na tela');
  await page.locator('input[type=file]').setInputFiles(['heic', 'png', 'webp', 'dng'].map(sample));
  await text('Arquivos selecionados · 4').waitFor();
  await button('Iniciar envio (3)').waitFor();
  check(await text(/Formatos brutos \(RAW\) não estão habilitados/).isVisible(), 'DNG recusado: RAW desligado de fábrica');
  check(await text('HEIC').isVisible(), 'HEIC sem prévia no navegador: aparece o marcador do formato');
  await shot('envio-formatos');
  await button('Iniciar envio (3)').click();
  await text('Envio concluído').waitFor({ timeout: 60000 });
  check(await text('3 de 3 imagens enviadas').isVisible(), '3 de 3 enviadas');

  console.log('3. A imagem HEIC no painel: original guardado, cópia JPEG nas telas');
  const listed = (await (await page.request.get(`${API}/events/${eventId}/images?filter=all`)).json()).items;
  check(listed.map((i) => i.source_format).sort().join(',') === 'heic,png,webp', 'os três originais guardados no formato enviado');
  const heic = listed.find((i) => i.source_format === 'heic');
  await page.goto(`${WEB}/eventos/${eventId}/imagens/${heic.id}`);
  await text(/HEIC \(original guardado\)/).waitFor();
  const preview = await page.request.get(`${API}/images/${heic.id}/preview`);
  check(preview.status() === 200 && preview.headers()['content-type'] === 'image/jpeg', 'a tela recebe a cópia JPEG');
  await shot('imagem-heic');

  console.log('4. Download pela conta: JPEG, sem GPS, com crédito e aviso de propriedade (RF019 nota 6, RF030)');
  const [download] = await Promise.all([page.waitForEvent('download'), button('Baixar imagem').click()]);
  check(!/8333|X-Amz/.test(download.url()), 'o download vem pela API, sem expor o armazenamento');
  const file = join(SHOTS, 'baixada.jpg');
  await download.saveAs(file);
  const info = JSON.parse(execFileSync(join(BACKEND, '.venv/bin/python'), ['-c', `
import json, piexif, sys
d = open(sys.argv[1], 'rb').read(); e = piexif.load(d)
print(json.dumps({"jpeg": d[:3] == b"\\xff\\xd8\\xff", "gps": bool(e["GPS"]), "artist": e["0th"].get(315, b"").decode(),
                  "notice": e["0th"].get(270, b"").decode()}))`, file]).toString());
  check(info.jpeg && !info.gps, 'arquivo JPEG e sem localização');
  check(info.artist === 'Moacir Barbosa' && info.notice.startsWith('Imagem do acervo do Centro Universitário CESMAC'),
        'autor e aviso de propriedade gravados no arquivo');

  console.log('5. Administrador: novos parâmetros (RF026)');
  const a = tools(admin);
  await admin.goto(`${WEB}/reconhecimento`);
  await a.text('Fotos e downloads').waitFor();
  check(await a.text('Posição da marca d\'água').isVisible(), 'parâmetro da posição da marca d\'água');
  check(await a.text('Canto inferior direito').isVisible(), 'mostrado como escolha, não como número');
  check(await a.text('Formatos brutos de câmera (RAW)').isVisible(), 'parâmetro dos formatos brutos');
  check(await a.text('Desabilitados').isVisible(), 'RAW vem desligado de fábrica');
  await a.text('Fotos e downloads').scrollIntoViewIfNeeded();
  await a.shot('parametros-fotos');
  const on = await admin.request.put(`${API}/admin/parameters`, { data: { values: { raw_formats_enabled: 1 }, threshold_warning_acknowledged: false } });
  check(on.status() === 200, 'RAW ligado pelo administrador');

  console.log('6. Com o RAW ligado, o DNG é aceito, com o aviso sobre o RAW');
  await page.goto(`${WEB}/eventos/${eventId}/enviar`);
  await text(/RAW até 100 MB/).waitFor();
  await page.locator('input[type=file]').setInputFiles([sample('dng')]);
  await text('1 arquivo RAW selecionado').waitFor();
  check(await text(/sem a sua edição/).isVisible(), 'aviso do RAW: tamanho, servidor, sem edição e recomendação');
  await shot('envio-raw-aviso');
  await button('Iniciar envio (1)').click();
  await text('1 de 1 imagens enviadas').waitFor({ timeout: 60000 });
  const all = (await (await page.request.get(`${API}/events/${eventId}/images?filter=all`)).json()).items;
  check(all.some((i) => i.source_format === 'dng'), 'DNG guardado como original, com cópia JPEG');

  check(problems.length === 0, `console sem erros${problems.length ? ': ' + problems.join(' | ') : ''}`);
  console.log('\nTUDO CERTO — formatos, download da conta e parâmetros.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  // The development database goes back to the factory value: RAW off.
  if (admin) {
    await admin.request.put(`${API}/admin/parameters`, { data: { values: { raw_formats_enabled: 0 }, threshold_warning_acknowledged: false } })
      .catch(() => undefined);
  }
  await browser.close();
}
