// One-off: moves the templates from raw palette classes onto the design tokens, and folds the common class strings
// into the component classes of src/styles.css. Safe to run again (it finds nothing the second time).
// Usage: node scripts/restyle.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/app', import.meta.url));

/** Raw utility -> token utility. A "hover:" (or other) prefix is kept. */
const TOKENS = {
  'text-slate-900': 'text-ink', 'text-slate-800': 'text-ink', 'text-slate-700': 'text-ink',
  'text-slate-600': 'text-muted', 'text-slate-500': 'text-muted', 'text-slate-400': 'text-muted',
  'border-slate-900': 'border-accent', 'border-slate-700': 'border-line-strong', 'border-slate-400': 'border-line-strong',
  'border-slate-300': 'border-line-strong', 'border-slate-200': 'border-line', 'border-slate-100': 'border-line',
  'divide-slate-100': 'divide-line', 'divide-slate-200': 'divide-line',
  'bg-white': 'bg-surface', 'bg-slate-50': 'bg-field', 'bg-slate-100': 'bg-field', 'bg-slate-200': 'bg-field',
  'bg-slate-900': 'bg-accent', 'bg-slate-800': 'bg-accent', 'bg-slate-700': 'bg-accent', 'bg-slate-500': 'bg-muted',
  'text-white': 'text-on-solid', 'border-white': 'border-surface',
  'text-red-900': 'text-danger-text', 'text-red-800': 'text-danger-text', 'text-red-700': 'text-danger-text', 'text-red-600': 'text-danger-text',
  'bg-red-50': 'bg-danger-soft', 'bg-red-100': 'bg-danger-soft', 'bg-red-600': 'bg-danger',
  'border-red-200': 'border-danger-soft', 'border-red-300': 'border-danger', 'ring-red-500': 'ring-danger',
  'text-amber-900': 'text-warn-text', 'text-amber-800': 'text-warn-text',
  'bg-amber-50': 'bg-warn-soft', 'bg-amber-100': 'bg-warn-soft', 'border-amber-200': 'border-warn-soft', 'border-amber-500': 'border-warn',
  'text-emerald-800': 'text-ok-text', 'bg-emerald-50': 'bg-ok-soft', 'bg-emerald-100': 'bg-ok-soft', 'bg-emerald-500': 'bg-ok',
  'border-emerald-200': 'border-ok-soft', 'border-emerald-500': 'border-ok',
  'bg-sky-50': 'bg-accent-soft', 'bg-sky-100': 'bg-accent-soft', 'text-sky-800': 'text-accent-text', 'border-sky-500': 'border-accent',
  'text-indigo-700': 'text-accent-text', 'ring-blue-500': 'ring-accent',
};

const RAW = /(?<![\w-])((?:[a-z-]+:)*)((?:bg|text|border|divide|ring)-(?:(?:slate|red|amber|emerald|sky|indigo|blue)-\d{2,3}|white))(?![\w-])/g;

function toTokens(text, file) {
  return text.replace(RAW, (whole, prefix, utility) => {
    // The darker shade of the old black button was its hover state.
    if (utility === 'bg-slate-700' && prefix.includes('hover:')) {
      return `${prefix}bg-accent-hover`;
    }
    const token = TOKENS[utility];
    if (!token) {
      throw new Error(`${file}: no token for "${whole}". Add it to TOKENS.`);
    }
    return prefix + token;
  });
}

const has = (classes, ...wanted) => wanted.every((name) => classes.includes(name));
const without = (classes, ...gone) => classes.filter((name) => !gone.includes(name));

/** The common class strings become component classes; what is particular to the element (spacing, size) stays. */
function toComponents(value) {
  if (value.includes('{{')) {
    return value; // an interpolated class list is left alone
  }
  let classes = value.split(/\s+/).filter(Boolean);
  if (has(classes, 'bg-accent', 'text-on-solid', 'hover:bg-accent-hover')) {
    classes = ['btn', 'btn-primary', ...without(classes, 'bg-accent', 'text-on-solid', 'hover:bg-accent-hover', 'font-medium', 'rounded-md', 'disabled:opacity-50')];
  } else if (has(classes, 'border', 'border-line-strong', 'hover:bg-field')) {
    classes = ['btn', 'btn-secondary', ...without(classes, 'border', 'border-line-strong', 'hover:bg-field', 'rounded-md', 'rounded', 'disabled:opacity-50')];
  } else if (has(classes, 'border', 'border-danger-soft', 'bg-danger-soft', 'text-danger-text')) {
    classes = ['alert-error', ...without(classes, 'rounded-lg', 'rounded-md', 'border', 'border-danger-soft', 'bg-danger-soft', 'text-danger-text')];
  } else if (has(classes, 'rounded-lg', 'border', 'border-line', 'bg-surface')) {
    classes = ['card', ...without(classes, 'rounded-lg', 'border', 'border-line', 'bg-surface')];
  }
  if (classes.includes('underline') && !classes.includes('btn')) {
    classes = classes.map((name) => (name === 'underline' ? 'link' : name));
  }
  return classes.join(' ');
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return files(path);
    }
    return /\.html$|(?<!\.spec)\.ts$/.test(name) ? [path] : [];
  });
}

let changed = 0;
for (const file of files(ROOT)) {
  const before = readFileSync(file, 'utf8');
  const name = relative(ROOT, file);
  const after = toTokens(before, name).replace(/\bclass="([^"]*)"/g, (whole, value) => `class="${toComponents(value)}"`);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log(`restyled ${name}`);
  }
}
console.log(`${changed} file(s) changed`);
