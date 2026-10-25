import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const electronMain = read('electron/main.cjs');
const devScript = read('scripts/dev-electron.mjs');
const router = read('src/main.tsx');
const home = read('src/DesktopHome.tsx');
const editor = read('src/App.tsx');

test('packaged and development desktop apps launch at the Cutline home screen', () => {
  assert.match(electronMain, /cutline-desktop=1#\/desktop-home/);
  assert.match(devScript, /cutline-desktop=1#\/desktop-home/);
  assert.match(router, /route === '#\/desktop-home'/);
  assert.match(router, /window\.location\.protocol === 'file:'/);
});

test('desktop home can start a blank project and open a saved project', () => {
  assert.match(home, /window\.location\.hash = '#\/editor\?new=1'/);
  assert.match(home, /window\.location\.hash = '#\/editor\?project='/);
  assert.match(home, /listProjects\(\)/);
  assert.match(editor, /params\.get\('project'\)/);
  assert.match(editor, /params\.get\('new'\) === '1'/);
  assert.match(editor, /initialProject = launchRequest\.startFresh/);
});

test('the web root stays on the marketing site unless the editor route is selected', () => {
  assert.match(router, /if \(isDesktop && \(route === '#\/desktop-home'/);
  assert.match(router, /return <Site \/>/);
});
