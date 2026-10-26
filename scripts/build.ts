// Bundles the extension into dist/, ready to load unpacked or zip for a release.
// Run `npm run lists` first so rules/ exists.
//
//   --watch       rebuild on every change
//   --out=DIR     write somewhere other than dist/
//   --e2e         add the test-only snippet rule the browser tests rely on
//   --debug-snippets  let pages skip packaged snippet rules via localStorage

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const e2e = process.argv.includes('--e2e');
const debugSnippets = process.argv.includes('--debug-snippets');
const OUT = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) ?? 'dist';

// A packaged snippet rule for the browser tests' local site (see test/e2e).
const E2E_SNIPPET = {
  d: ['localhost'],
  c: [
    ['json-prune', 'ad'],
    ['hide-if-contains', 'Sponsored', '.post'],
  ],
};

try {
  await access('rules/index.json');
} catch {
  throw new Error('rules/ is missing. Run `npm run lists` first.');
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('src/manifest.json', 'utf8'));
manifest.version = pkg.version;
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

await Promise.all([
  cp('icons', `${OUT}/icons`, { recursive: true }),
  cp('rules', `${OUT}/rules`, { recursive: true }),
  cp('filters', `${OUT}/filters`, { recursive: true }),
  cp('src/popup/popup.html', `${OUT}/popup/popup.html`),
  cp('src/popup/popup.css', `${OUT}/popup/popup.css`),
  cp('src/offscreen/offscreen.html', `${OUT}/offscreen/offscreen.html`),
  cp('LICENSE', `${OUT}/LICENSE`),
  cp('THIRD_PARTY_NOTICES.md', `${OUT}/THIRD_PARTY_NOTICES.md`),
]);

const snippetsMain = JSON.parse(await readFile('rules/snippets-main.json', 'utf8'));
if (e2e) {
  const snippets = JSON.parse(await readFile(`${OUT}/rules/snippets.json`, 'utf8'));
  snippets.push(E2E_SNIPPET);
  snippetsMain.push({ ...E2E_SNIPPET, c: [E2E_SNIPPET.c[0]] });
  await writeFile(`${OUT}/rules/snippets.json`, JSON.stringify(snippets));
  await writeFile(`${OUT}/rules/snippets-main.json`, JSON.stringify(snippetsMain));
}

const common: esbuild.BuildOptions = {
  bundle: true,
  target: 'chrome121',
  logLevel: 'info',
  // Readable output is easier to audit and costs little in size.
  minify: false,
  sourcemap: watch ? 'inline' : false,
};

const builds: esbuild.BuildOptions[] = [
  { ...common, entryPoints: { background: 'src/background/index.ts' }, outdir: OUT, format: 'esm' },
  { ...common, entryPoints: { content: 'src/content/content.ts' }, outdir: OUT, format: 'iife' },
  { ...common, entryPoints: { 'popup/popup': 'src/popup/popup.ts' }, outdir: OUT, format: 'esm' },
  { ...common, entryPoints: { 'offscreen/offscreen': 'src/offscreen/offscreen.ts' }, outdir: OUT, format: 'esm' },
  { ...common, entryPoints: { 'offscreen/worker': 'src/offscreen/worker.ts' }, outdir: OUT, format: 'iife' },
  { ...common, entryPoints: { 'sites/youtube': 'src/sites/youtube.ts' }, outdir: OUT, format: 'iife' },
  {
    ...common,
    entryPoints: { 'sites/snippets-main': 'src/sites/snippets-main.ts' },
    outdir: OUT,
    format: 'iife',
    define: { PACKAGED_SNIPPETS: JSON.stringify(snippetsMain), DEBUG_SNIPPETS: String(debugSnippets) },
    // Drops the debug branch entirely when DEBUG_SNIPPETS is false.
    minifySyntax: true,
  },
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
