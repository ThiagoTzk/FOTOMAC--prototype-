// Builds docs/design/simulado-home/index.html from template.html: inlines the lucide icons the
// system already uses (no internet needed to open the page) and expands the event cards.
//
//   node docs/design/gerar_simulado.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = join(HERE, '../../frontend/node_modules/lucide-react-native/dist/esm/icons');
const DIR = join(HERE, 'simulado-home');

function icon(name, size = 20, color = 'currentColor', stroke = 1.8) {
  const src = readFileSync(join(ICONS, `${name}.mjs`), 'utf8');
  // The icon file holds a plain object literal ("const __iconData = {...};"): evaluate just that
  // literal, from the package already installed in frontend/node_modules.
  const literal = src.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  const nodes = new Function(`return ${literal}`)().node;
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

const card = ({ title, date, place, photos, ic, tags, cover, from, to, isNew }) => `
      <article class="card">
        <div class="cover${cover ? '' : ' ph'}" ${cover ? '' : `style="background: linear-gradient(135deg, ${from}, ${to})"`}>
          ${cover ? `<img src="${cover}" alt="">` : icon(ic, 64, 'rgba(255,255,255,.85)', 1.3)}
          <span class="badge">${icon(ic, 18)}</span>
          ${isNew ? '<span class="new">Novo</span>' : ''}
          <span class="count">${icon('images', 14)} ${photos} fotos</span>
        </div>
        <div class="body">
          <h3>${title}</h3>
          <div class="meta">${icon('calendar', 16)} ${date}</div>
          <div class="meta">${icon('map-pin', 16)} ${place}</div>
          <div class="pills">${tags.filter(Boolean).map((t, i) => `<span class="pill${i % 2 ? ' y' : ''}">${t}</span>`).join('')}</div>
        </div>
      </article>`;

let html = readFileSync(join(DIR, 'template.html'), 'utf8');
html = html.replace('{{card:real}}', card({
  title: 'COLAÇÃO DE GRAU - SISTEMA DE INFORMAÇÃO - 2026', date: 'Julho/2026', place: 'CAMPUS 1 - CESMAC', photos: 184,
  ic: 'graduation-cap', tags: ['Tecnologia'], cover: 'assets/capa-colacao.jpg', isNew: true,
}));
html = html.replace(/\{\{card:([^}]+)\}\}/g, (_, s) => {
  const [title, date, place, photos, ic, t1, t2, from, to] = s.split('|');
  return card({ title, date, place, photos, ic, tags: [t1, t2], from, to });
});
html = html.replace(/\{\{icon:([\w-]+)(?::(\d+))?(?::([^:}]+))?(?::([\d.]+))?\}\}/g,
  (_, n, size, color, stroke) => icon(n, size ? +size : 20, color || 'currentColor', stroke ? +stroke : 1.8));
writeFileSync(join(DIR, 'index.html'), html);
console.log(join(DIR, 'index.html'));
