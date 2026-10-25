import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the HTML entry point shows startup feedback instead of a permanently blank root', async () => {
  const html = await read('index.html');
  assert.match(html, /Starting Cutline/);
  assert.match(html, /Cutline did not finish starting/);
  assert.match(html, /src\/main\.tsx/);
});

test('the Vite dev command asks to open a browser and the launcher explains dependency failures', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const launcher = await read('start-cutline.sh');
  assert.match(pkg.scripts.dev, /--open/);
  assert.match(launcher, /npm install --no-audit --no-fund/);
  assert.match(launcher, /Dependency installation failed/);
});

test('React bootstrap has a visible error boundary and a missing-root fallback', async () => {
  const main = await read('src/main.tsx');
  assert.match(main, /AppErrorBoundary/);
  assert.match(main, /Cutline hit an error/);
  assert.match(main, /Cutline failed to start/);
});

test('Cutline routes right-clicks to its own context menu and suppresses the browser menu', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /onContextMenu=\{openContextMenu\}/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /aria-label="Cutline context menu"/);
  assert.match(app, /case 'duplicate'/);
  assert.match(app, /case 'asset-add'/);
});

test('applying effects connects the catalogue to selected clips and the properties controls', async () => {
  const app = await read('src/App.tsx');
  const renderer = await read('src/lib/rendering.ts');
  assert.match(app, /replaceClip\(targetClip\.id, \{ effects: \[\.\.\.targetClip\.effects, effect\] \}\)/);
  assert.match(app, /setActivePanel\('media'\)/);
  assert.match(app, /<EffectControl effect=\{effect\}/);
  assert.match(renderer, /applyPixelEffects\(lctx, clip, localTime, width, height\)/);
  assert.match(renderer, /ctx\.drawImage\(layer, -width \/ 2, -height \/ 2, width, height\)/);
});


test('smooth speed ramps and draggable adjustment layers are wired into the editor', async () => {
  const app = await read('src/App.tsx');
  const timeline = await read('src/lib/timeline.ts');
  const renderer = await read('src/lib/rendering.ts');
  assert.match(app, /setSpeedRamp/);
  assert.match(app, /application\/x-cutline-effect/);
  assert.match(app, /createAdjustmentLayer/);
  assert.match(app, /track-name-input/);
  assert.match(app, /moveTrack/);
  assert.match(timeline, /sourceOffsetAt/);
  assert.match(renderer, /clip\.kind === 'adjustment'/);
});
