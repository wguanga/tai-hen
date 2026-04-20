// Copy pdfjs-dist cmaps + standard_fonts into public/ so Vite serves them.
// pdf.js loads these at runtime to render CJK / non-embedded fonts correctly.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dst = join(root, 'public');

if (!existsSync(src)) {
  console.warn('[copy-pdfjs-assets] pdfjs-dist not installed yet; skipping.');
  process.exit(0);
}

mkdirSync(dst, { recursive: true });
for (const name of ['cmaps', 'standard_fonts']) {
  const from = join(src, name);
  const to = join(dst, name);
  if (!existsSync(from)) continue;
  cpSync(from, to, { recursive: true, force: true });
  console.log(`[copy-pdfjs-assets] copied ${name}/`);
}
