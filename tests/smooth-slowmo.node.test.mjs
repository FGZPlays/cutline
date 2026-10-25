import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { minimumClipPlaybackRate, smoothSlowMoRateExceedsCap, smoothSlowMoTargetFps } from '../src/lib/smooth-slowmo-rate.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function clip(playbackRate, rates = []) {
  return { playbackRate, keyframes: rates.map((value, index) => ({ id: 'kf' + index, property: 'playbackRate', time: index + 1, value, easing: 'linear' })) };
}

test('motion interpolation target follows the slowest speed ramp', () => {
  const video = clip(1, [1, 0.5, 1]);
  assert.equal(minimumClipPlaybackRate(video), 0.5);
  assert.equal(smoothSlowMoTargetFps(video, 30), 60);
  assert.equal(smoothSlowMoTargetFps(clip(0.25), 30), 120);
  assert.equal(smoothSlowMoTargetFps(clip(0.5), 60), 120);
});

test('interpolation preserves already high-frame-rate sources', () => {
  assert.equal(smoothSlowMoTargetFps(clip(0.5), 30, 120), 120);
});

test('very slow speeds report when the 120 fps processing cap is insufficient', () => {
  assert.equal(smoothSlowMoRateExceedsCap(clip(0.25), 30), false);
  assert.equal(smoothSlowMoRateExceedsCap(clip(0.1), 30), true);
});

test('Cutline separates motion interpolation from speed-ramp easing', () => {
  const app = read('src/App.tsx');
  const processor = read('src/lib/smooth-slowmo.ts');
  assert.match(app, /Smooth slow-mo/);
  assert.match(app, /generateSmoothSlowMoMedia/);
  assert.match(app, /smoothSlowMoAssetId/);
  assert.match(processor, /minterpolate=fps=/);
  assert.match(processor, /mi_mode=mci/);
  assert.match(processor, /mc_mode=aobmc/);
});
