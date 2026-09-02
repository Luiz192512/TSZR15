/*
 * Injeta o tema "Catalogo de Pecas" nos artefatos do Graphify Ontology Studio.
 *
 * O studio e gerado por `graphify studio export`, que sobrescreve os HTMLs.
 * Rode este script depois de cada export para reaplicar o tema:
 *
 *   graphify studio export .graphify/studio
 *   node scripts/graphify-theme/apply.mjs
 *
 * A injecao e idempotente: um bloco anterior marcado pelo sentinela e
 * removido antes de escrever o novo.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const studioDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(repoRoot, '.graphify', 'studio');

const TARGETS = ['index.html', 'studio.html', 'studio-template.html'];
const OPEN = '<!-- tsz-graphify-theme:start -->';
const CLOSE = '<!-- tsz-graphify-theme:end -->';

function stripPrevious(html) {
  const start = html.indexOf(OPEN);
  if (start === -1) return html;
  const end = html.indexOf(CLOSE, start);
  if (end === -1) return html;
  return html.slice(0, start) + html.slice(end + CLOSE.length);
}

function buildBlock(css, js) {
  return [
    OPEN,
    '<style data-tsz-theme="catalogo-de-pecas">',
    css.trim(),
    '</style>',
    '<script data-tsz-theme="catalogo-de-pecas">',
    js.trim(),
    '</script>',
    CLOSE,
  ].join('\n');
}

const [css, js] = await Promise.all([
  readFile(path.join(here, 'theme.css'), 'utf8'),
  readFile(path.join(here, 'signature.js'), 'utf8'),
]);
const block = buildBlock(css, js);

if (!existsSync(studioDir)) {
  console.error(`studio nao encontrado em ${studioDir}`);
  console.error('rode `graphify studio export .graphify/studio` antes.');
  process.exit(1);
}

let touched = 0;
for (const name of TARGETS) {
  const file = path.join(studioDir, name);
  if (!existsSync(file)) continue;

  const original = await readFile(file, 'utf8');
  const cleaned = stripPrevious(original);
  const marker = '</body>';
  const at = cleaned.lastIndexOf(marker);
  if (at === -1) {
    console.warn(`${name}: sem </body>, ignorado`);
    continue;
  }

  const next = cleaned.slice(0, at) + block + '\n' + cleaned.slice(at);
  if (next === original) {
    console.log(`${name}: ja atualizado`);
    continue;
  }
  await writeFile(file, next, 'utf8');
  console.log(`${name}: tema aplicado`);
  touched += 1;
}

console.log(`\n${touched} arquivo(s) escrito(s) em ${path.relative(repoRoot, studioDir)}`);
