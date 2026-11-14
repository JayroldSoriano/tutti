import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...a) => resolve(root, ...a);
const fail = (msg) => { console.error('BUILD FAILED: ' + msg); process.exit(1); };

const entry = p('src/ui/app.js');
const tplPath = p('src/index.template.html');
const cssPath = p('src/styles.css');
for (const [f, label] of [[entry, 'src/ui/app.js'], [tplPath, 'src/index.template.html'], [cssPath, 'src/styles.css']]) {
  if (!existsSync(f)) fail(`missing ${label} (UI not written yet)`);
}

const result = await build({
  entryPoints: [entry], bundle: true, format: 'iife', target: 'es2020',
  minify: true, sourcemap: false, write: false, legalComments: 'none',
}).catch((e) => fail('esbuild error: ' + (e.message || e)));

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
let html = readFileSync(tplPath, 'utf8');
if (!html.includes('<!--CSS-->') || !html.includes('<!--JS-->')) fail('template lacks <!--CSS--> or <!--JS--> marker');
html = html.replace('<!--CSS-->', () => `<style>${css}</style>`).replace('<!--JS-->', () => `<script>${js}</script>`);

if (!html.startsWith('<!DOCTYPE html>')) fail('output does not start with <!DOCTYPE html>');
if (!/<title>/i.test(html)) fail('output lacks <title>');
for (const bad of ['alert(', 'confirm(', 'prompt(', 'window.open', 'serviceWorker', '<img src="http']) {
  if (html.includes(bad)) fail(`output contains forbidden "${bad}"`);
}
const allowed = ['fonts.googleapis.com', 'fonts.gstatic.com'];
for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']?(https?:)?\/\/([^\/"'\s>]+)/gi)) {
  if (!allowed.includes(m[2])) fail(`external host in src/href: ${m[2]}`);
}

mkdirSync(p('dist'), { recursive: true });
writeFileSync(p('dist/index.html'), html);
console.log(`dist/index.html written: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
