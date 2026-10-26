// Bundles the extension into dist/, ready to load unpacked or zip for the store.
// Run `npm run lists` first so rules/ exists.

import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const OUT = 'dist';

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
  cp('src/popup/popup.html', `${OUT}/popup/popup.html`),
  cp('src/popup/popup.css', `${OUT}/popup/popup.css`),
  cp('src/offscreen/offscreen.html', `${OUT}/offscreen/offscreen.html`),
  cp('LICENSE', `${OUT}/LICENSE`),
  cp('THIRD_PARTY_NOTICES.md', `${OUT}/THIRD_PARTY_NOTICES.md`),
]);

const common: esbuild.BuildOptions = {
  bundle: true,
  target: 'chrome121',
  logLevel: 'info',
  // Readable output makes store review easier and costs little in size.
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
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
