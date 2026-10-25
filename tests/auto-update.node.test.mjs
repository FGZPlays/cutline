import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('packaged desktop app checks for updates and installs on quit', () => {
  const main = read('../electron/main.cjs');
  assert.match(main, /require\('electron-updater'\)/);
  assert.match(main, /autoUpdater\.checkForUpdates\(\)/);
  assert.match(main, /autoUpdater\.autoDownload = true/);
  assert.match(main, /autoUpdater\.autoInstallOnAppQuit = true/);
  assert.match(main, /quitAndInstall\(\)/);
  assert.match(main, /if \(!app\.isPackaged/);
});

test('release workflow requires updater metadata for each platform', () => {
  const workflow = read('../.github/workflows/release.yml');
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /latest-linux\.yml/);
  assert.match(workflow, /files: release\/\*/);
});

test('release version and portable Linux filename stay aligned', () => {
  const pkg = JSON.parse(read('../package.json'));
  const site = read('../src/Site.tsx');
  assert.equal(pkg.version, '0.4.3');
  assert.match(site, /Cutline-\$\{APP_VERSION\}-x86_64\.AppImage/);
});

test('website download links wait for a matching versioned release', () => {
  const workflow = read('../.github/workflows/site.yml');
  assert.match(workflow, /LATEST_RELEASE_TAG.*v\$PACKAGE_VERSION/);
  assert.match(workflow, /VITE_RELEASE_DOWNLOAD_BASE=/);
});
