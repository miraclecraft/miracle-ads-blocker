// Renders docs/assets/logo.svg into the PNG sizes the manifest needs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [16, 32, 48, 128];

const svg = await readFile('docs/assets/logo.svg', 'utf8');
await mkdir('icons', { recursive: true });

for (const size of SIZES) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(`icons/icon${size}.png`, png);
  console.log(`icons/icon${size}.png`);
}
