import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../package.json'));

test('one versioned project provides web and desktop commands', () => {
  assert.equal(pkg.productName, 'Cutline');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof pkg.author.email, 'string');
  assert.ok(pkg.author.email.includes('@'));
  assert.match(pkg.build.linux.maintainer, /<[^<>]+@[^<>]+>/);
  assert.equal(pkg.main, 'electron/main.cjs');
  assert.ok(pkg.scripts['dev:web']);
  assert.ok(pkg.scripts['dev:desktop']);
  assert.ok(pkg.scripts['build:web']);
  assert.ok(pkg.scripts['dist:win']);
  assert.ok(pkg.scripts['dist:linux']);
});

test('electron-builder targets Windows installer, Debian, Fedora, and portable Linux', () => {
  const build = pkg.build;
  assert.equal(build.productName, 'Cutline');
  assert.ok(build.files.includes('dist/**/*'));
  assert.ok(build.files.includes('electron/**/*'));
  assert.ok(build.win.target.some(item => item.target === 'nsis'));
  const targets = build.linux.target.map(item => item.target);
  assert.ok(targets.includes('deb'));
  assert.ok(targets.includes('rpm'));
  assert.ok(targets.includes('AppImage'));
  assert.equal(build.win.artifactName, 'Cutline-Setup-${version}.${ext}');
  assert.equal(build.linux.artifactName, 'Cutline-${version}-${arch}.${ext}');
  assert.equal(build.publish[0].provider, 'github');
  assert.equal(build.publish[0].owner, 'FGZPlays');
  assert.equal(build.publish[0].repo, 'cutline');
  assert.equal(pkg.dependencies['electron-updater'], '^6.8.11');
  assert.equal(pkg.dependencies['@ffmpeg/ffmpeg'], '^0.12.15');
  assert.equal(pkg.dependencies['@ffmpeg/core'], '^0.12.10');
  assert.equal(pkg.dependencies['@ffmpeg/util'], '^0.12.2');
});

test('desktop wrapper hardens BrowserWindow and starts at the desktop home screen', () => {
  const main = read('../electron/main.cjs');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /#\/desktop-home/);
  assert.match(main, /setWindowOpenHandler/);
});

test('website contains a working web-editor route and current platform downloads', () => {
  const site = read('../src/Site.tsx');
  const bootstrap = read('../src/main.tsx');
  assert.match(site, /href="#\/editor"/);
  assert.match(site, /VITE_RELEASE_DOWNLOAD_BASE/);
  assert.match(site, /Cutline-Native-Windows-x64\.zip/);
  assert.match(site, /Cutline-Native-Linux-x64\.tar\.gz/);
  assert.match(site, /Cutline-\$\{APP_VERSION\}-x86_64\.rpm/);
  assert.match(site, /Cutline-\$\{APP_VERSION\}-android\.apk/);
  assert.match(site, /Cutline-\$\{APP_VERSION\}-x86_64\.AppImage/);
  assert.match(bootstrap, /route === '#\/editor' \|\| route\.startsWith\('#\/editor\?')/);
  assert.match(bootstrap, /addEventListener\('hashchange'/);
});

test('Smooth slow-mo FFmpeg core assets are copied before builds', () => {
  const script = read('../scripts/copy-ffmpeg-core.mjs');
  assert.equal(pkg.scripts.prebuild, 'node scripts/copy-ffmpeg-core.mjs');
  assert.match(script, /ffmpeg-core\.wasm/);
  assert.match(script, /ffmpeg-core\.js/);
});

test('CI workflows build the website and publish desktop artifacts on a version tag', () => {
  const website = read('../.github/workflows/site.yml');
  const release = read('../.github/workflows/release.yml');
  assert.match(website, /actions\/upload-pages-artifact/);
  assert.match(website, /actions\/deploy-pages/);
  assert.match(website, /repository_dispatch/);
  assert.match(website, /releases\/latest\/download/);
  assert.match(website, /releases\/latest/);
  assert.match(release, /cutline-release-published/);
  assert.match(release, /dist:win/);
  assert.match(release, /dist:linux/);
  assert.match(release, /softprops\/action-gh-release/);
  assert.match(release, /pattern: cutline-\*/);
});

test('required desktop entry and icon resources exist', () => {
  assert.ok(existsSync(new URL('../electron/main.cjs', import.meta.url)));
  assert.ok(existsSync(new URL('../build/icon.png', import.meta.url)));
  assert.ok(existsSync(new URL('../build/icon.ico', import.meta.url)));
  assert.ok(existsSync(new URL('../public/favicon.svg', import.meta.url)));
});
