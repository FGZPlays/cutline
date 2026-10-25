import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, playbackRateAt, sourceOffsetAt } from '../src/lib/timeline.ts';

const closeTo = (actual, expected, tolerance = 0.0001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test('constant slow motion maps timeline time to source time at the selected speed', () => {
  const clip = makeClip({ trackId: 'v1', name: 'Slow clip', kind: 'video', duration: 8, playbackRate: 0.5 });
  closeTo(sourceOffsetAt(clip, 6), 3);
  closeTo(playbackRateAt(clip, 2), 0.5);
});

test('ease-in-out playback speed ramps smoothly interpolate speed and integrate source time', () => {
  const clip = makeClip({
    trackId: 'v1', name: 'Speed ramp', kind: 'video', duration: 4, playbackRate: 1,
    keyframes: [
      { id: 'speed-start', property: 'playbackRate', time: 0, value: 1, easing: 'ease-in-out' },
      { id: 'speed-slow', property: 'playbackRate', time: 4, value: 0.25, easing: 'ease-in-out' },
    ],
  });
  closeTo(playbackRateAt(clip, 2), 0.625);
  closeTo(sourceOffsetAt(clip, 4), 2.5);
});

test('source offset remains continuous after the final speed-ramp keyframe', () => {
  const clip = makeClip({
    trackId: 'v1', name: 'Ramp then hold', kind: 'video', duration: 8, playbackRate: 1,
    keyframes: [
      { id: 'speed-start', property: 'playbackRate', time: 0, value: 1, easing: 'ease-in-out' },
      { id: 'speed-slow', property: 'playbackRate', time: 4, value: 0.25, easing: 'ease-in-out' },
    ],
  });
  closeTo(sourceOffsetAt(clip, 8), 3.5);
});
