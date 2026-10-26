// Fails when a template still names a raw colour instead of a design token. Raw colours do not follow the theme, so
// one of them is a white panel or unreadable text in dark mode. Usage: npm run check:tokens
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/app', import.meta.url));
const RAW = /(?<![\w-])(?:[a-z-]+-)?(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])|(?<![\w-])(?:bg|text|border|ring|divide)-(?:white|black)(?![\w-])/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return files(path);
    }
    return /\.html$|(?<!\.spec)\.ts$/.test(name) ? [path] : [];
  });
}

let found = 0;
for (const file of files(ROOT)) {
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(RAW)) {
      found++;
      console.log(`${relative(ROOT, file)}:${index + 1}: ${match[0]}`);
    }
  });
}
if (found > 0) {
  console.error(`\n${found} raw colour class(es). Use the tokens in src/styles.css instead.`);
  process.exit(1);
}
console.log('No raw colour classes: every template uses the design tokens.');
