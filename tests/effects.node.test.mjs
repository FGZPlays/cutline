import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip } from '../src/lib/timeline.ts';
import { EFFECT_CATALOG, createEffect } from '../src/lib/effects.ts';
import { animatedEffectParam, buildEffectFilter, clipVisualState, processPixelBuffer } from '../src/lib/rendering.ts';

function videoClip(effects = [], keyframes = [], patch = {}) {
  return makeClip({ trackId: 'v1', name: 'Test clip', kind: 'video', duration: 5, effects, keyframes, ...patch });
}

test('effect catalogue exposes configured controls for the real effects', () => {
  assert.ok(EFFECT_CATALOG.length >= 30, `Expected a broad effect catalogue, got ${EFFECT_CATALOG.length}`);
  assert.equal(new Set(EFFECT_CATALOG.map(item => item.type)).size, EFFECT_CATALOG.length);
  for (const item of EFFECT_CATALOG) {
    assert.ok(item.label.length > 0);
    assert.ok(item.description.length > 0);
    assert.ok(item.defaults && typeof item.defaults === 'object');
  }
});

test('effect parameter keyframes animate one specific effect instance', () => {
  const effect = createEffect('brightness');
  const clip = videoClip([effect], [
    { id: 'kf1', property: `effect:${effect.id}:value`, time: 0, value: 50, easing: 'linear' },
    { id: 'kf2', property: `effect:${effect.id}:value`, time: 4, value: 150, easing: 'linear' },
  ]);
  assert.equal(animatedEffectParam(clip, effect, 'value', 2, 100), 100);
  assert.equal(animatedEffectParam(clip, effect, 'value', 4, 100), 150);
});

test('slide, zoom, and spin presets change transform state during playback', () => {
  const slide = createEffect('slide-in-left');
  slide.params.duration = 1;
  slide.params.distance = 50;
  const clip = videoClip([slide], [], { x: 50 });
  assert.ok(clipVisualState(clip, 0).x < 2);
  assert.equal(clipVisualState(clip, 1).x, 50);

  const zoom = createEffect('zoom-in');
  zoom.params.duration = 1;
  zoom.params.fromScale = 0.25;
  const zoomed = videoClip([zoom]);
  assert.ok(clipVisualState(zoomed, 0).scale < 0.3);
  assert.equal(clipVisualState(zoomed, 1).scale, 1);

  const spin = createEffect('spin-in');
  spin.params.duration = 1;
  spin.params.turns = 1;
  const spun = videoClip([spin], [], { rotation: 10 });
  assert.equal(clipVisualState(spun, 0).rotation, -350);
  assert.equal(clipVisualState(spun, 1).rotation, 10);
});

test('CSS-backed effects create actual CanvasRenderingContext2D filter expressions', () => {
  const clip = videoClip([createEffect('brightness'), createEffect('hue-rotate'), createEffect('blur')]);
  clip.effects[0].params.value = 145;
  clip.effects[1].params.value = 35;
  clip.effects[2].params.value = 3;
  const filter = buildEffectFilter(clip, 0);
  assert.match(filter, /brightness\(145%\)/);
  assert.match(filter, /hue-rotate\(35deg\)/);
  assert.match(filter, /blur\(3px\)/);
});

test('temperature processing changes RGB pixels in the warm direction', () => {
  const effect = createEffect('temperature');
  effect.params.value = 40;
  const clip = videoClip([effect]);
  const pixels = new Uint8ClampedArray([100, 100, 100, 255]);
  processPixelBuffer(pixels, 1, 1, clip, 0);
  assert.ok(pixels[0] > 100);
  assert.ok(pixels[2] < 100);
});

test('threshold effect changes output pixels to true black or white', () => {
  const effect = createEffect('threshold');
  effect.params.value = 128;
  const clip = videoClip([effect]);
  const pixels = new Uint8ClampedArray([200, 180, 160, 255, 20, 30, 40, 255]);
  processPixelBuffer(pixels, 2, 1, clip, 0);
  assert.deepEqual([...pixels], [255, 255, 255, 255, 0, 0, 0, 255]);
});

test('chroma key removes matching green pixels instead of only adding an effect label', () => {
  const effect = createEffect('chroma');
  effect.params.color = '#00ff00';
  effect.params.threshold = 30;
  effect.params.softness = 20;
  const clip = videoClip([effect]);
  const pixels = new Uint8ClampedArray([0, 255, 0, 255, 250, 20, 30, 255]);
  processPixelBuffer(pixels, 2, 1, clip, 0);
  assert.equal(pixels[3], 0);
  assert.equal(pixels[7], 255);
});

test('chroma key threshold accepts animated per-effect parameters', () => {
  const effect = createEffect('chroma');
  effect.params.color = '#00ff00';
  effect.params.threshold = 0;
  effect.params.softness = 1;
  const clip = videoClip([effect], [
    { id: 'kf1', property: `effect:${effect.id}:threshold`, time: 0, value: 0, easing: 'linear' },
    { id: 'kf2', property: `effect:${effect.id}:threshold`, time: 2, value: 400, easing: 'linear' },
  ]);
  const early = new Uint8ClampedArray([0, 245, 0, 255]);
  const late = new Uint8ClampedArray([0, 245, 0, 255]);
  processPixelBuffer(early, 1, 1, clip, 0);
  processPixelBuffer(late, 1, 1, clip, 2);
  assert.equal(early[3], 255);
  assert.equal(late[3], 0);
});

test('disabled effects are ignored by filter and pixel processing', () => {
  const effect = createEffect('brightness');
  effect.enabled = false;
  const clip = videoClip([effect]);
  assert.equal(buildEffectFilter(clip, 0), 'none');
});


test('newly added effects start with visible non-neutral settings where appropriate', () => {
  const visibleDefaults = {
    brightness: effect => effect.params.value !== 100,
    contrast: effect => effect.params.value !== 100,
    saturation: effect => effect.params.value !== 100,
    'hue-rotate': effect => effect.params.value !== 0,
    exposure: effect => effect.params.value !== 0,
    gamma: effect => effect.params.value !== 1,
    temperature: effect => effect.params.value !== 0,
    tint: effect => effect.params.value !== 0,
    blur: effect => effect.params.value > 0,
    sharpen: effect => effect.params.value > 0,
    pixelate: effect => effect.params.value > 1,
    crop: effect => Object.values(effect.params).some(value => Number(value) > 0),
    opacity: effect => effect.params.value < 100,
  };
  for (const [type, check] of Object.entries(visibleDefaults)) {
    assert.ok(check(createEffect(type)), `${type} should visibly alter the layer at its initial setting`);
  }
});

test('every effect catalogue entry has a usable renderer path or a documented timeline behavior', () => {
  const timelineHandled = new Set(['opacity', 'fade-in', 'fade-out', 'cross-dissolve', 'slide-in-left', 'slide-in-right', 'slide-in-up', 'slide-in-down', 'zoom-in', 'spin-in']);
  const filterHandled = new Set(['brightness', 'contrast', 'saturation', 'hue-rotate', 'grayscale', 'sepia', 'invert', 'exposure', 'blur', 'drop-shadow']);
  const pixelHandled = new Set(['gamma', 'temperature', 'tint', 'posterize', 'threshold', 'noise', 'sharpen', 'chroma']);
  const canvasHandled = new Set(['pixelate', 'vignette', 'crop', 'mirror-horizontal', 'mirror-vertical', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down']);
  for (const definition of EFFECT_CATALOG) {
    assert.ok(timelineHandled.has(definition.type) || filterHandled.has(definition.type) || pixelHandled.has(definition.type) || canvasHandled.has(definition.type), `No known render implementation for ${definition.type}`);
  }
});
