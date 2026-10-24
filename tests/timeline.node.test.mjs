import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, splitClip, moveClip, rippleDelete, duplicateClip, duplicateClipGroup, snapTime, evaluateKeyframes, sequenceDuration } from '../src/lib/timeline.ts';

const clip = (patch = {}) => makeClip({ id: 'clip-a', trackId: 'track_v1', name: 'sample.mp4', kind: 'video', duration: 10, start: 2, sourceIn: 1, assetId: 'asset-a', ...patch });

test('split preserves exact timeline and source positions', () => {
  const result = splitClip([clip()], 'clip-a', 6);
  assert.equal(result.length, 2);
  assert.equal(result[0].duration, 4);
  assert.equal(result[1].start, 6);
  assert.equal(result[1].sourceIn, 5);
  assert.equal(splitClip([clip()], 'clip-a', 2).length, 1);
});

test('move clamps clips at the sequence start', () => {
  assert.equal(moveClip([clip()], 'clip-a', -4)[0].start, 0);
});

test('ripple delete closes the gap and keeps unrelated tracks fixed', () => {
  const first = clip({ id: 'first', start: 0, duration: 3 });
  const second = clip({ id: 'second', start: 3, duration: 4 });
  const later = clip({ id: 'later', start: 11, duration: 2 });
  const other = clip({ id: 'other', start: 11, duration: 2, trackId: 'track_v2' });
  const result = rippleDelete([first, second, later, other], 'second');
  assert.equal(result.find(item => item.id === 'later')?.start, 7);
  assert.equal(result.find(item => item.id === 'other')?.start, 11);
});

test('deleting a linked clip also ripples its partner track', () => {
  const video = clip({ id: 'video', start: 0, duration: 5, linkedClipId: 'audio' });
  const audio = clip({ id: 'audio', kind: 'audio', trackId: 'track_a1', start: 0, duration: 5, linkedClipId: 'video' });
  const laterVideo = clip({ id: 'v2', start: 5, duration: 2 });
  const laterAudio = clip({ id: 'a2', kind: 'audio', trackId: 'track_a1', start: 5, duration: 2 });
  const result = rippleDelete([video, audio, laterVideo, laterAudio], 'video');
  assert.equal(result.length, 2);
  assert.equal(result.find(item => item.id === 'v2')?.start, 0);
  assert.equal(result.find(item => item.id === 'a2')?.start, 0);
});

test('duplicate makes a new clip at the end of the source clip', () => {
  const result = duplicateClip([clip()], 'clip-a');
  assert.equal(result.length, 2);
  assert.equal(result[1].start, 12);
  assert.notEqual(result[1].id, 'clip-a');
  assert.equal(result[1].linkedClipId, undefined);
});

test('duplicate linked clip group preserves audio/video pairing', () => {
  const video = clip({ id: 'video', start: 0, duration: 5, linkedClipId: 'audio' });
  const audio = clip({ id: 'audio', trackId: 'track_a1', kind: 'audio', start: 0, duration: 5, linkedClipId: 'video' });
  const result = duplicateClipGroup([video, audio], 'video');
  assert.equal(result.clips.length, 4);
  const videoCopy = result.clips.find(item => item.id === result.selectedId);
  const audioCopy = result.clips.find(item => item.id === videoCopy?.linkedClipId);
  assert.equal(videoCopy?.start, 5);
  assert.equal(audioCopy?.start, 5);
  assert.equal(audioCopy?.linkedClipId, videoCopy?.id);
});

test('snapping uses the closest boundary inside the tolerance', () => {
  assert.equal(snapTime(12.06, [clip()], undefined, 0.12), 12);
  assert.equal(snapTime(12.3, [clip()], undefined, 0.12), 12.3);
});

test('keyframe interpolation supports linear and ease-in curves', () => {
  const frames = [
    { id: 'kf1', property: 'x', time: 0, value: 0, easing: 'linear' },
    { id: 'kf2', property: 'x', time: 10, value: 100, easing: 'linear' },
  ];
  assert.equal(evaluateKeyframes(frames, 'x', 5, 99), 50);
  assert.equal(evaluateKeyframes(frames, 'x', -1, 99), 0);
  assert.equal(evaluateKeyframes(frames, 'y', 5, 99), 99);
  assert.equal(evaluateKeyframes(frames.map(frame => ({ ...frame, easing: 'ease-in' })), 'x', 5, 0), 25);
});

test('sequence duration is the latest timeline clip end', () => {
  assert.equal(sequenceDuration({ clips: [clip({ start: 2, duration: 10 }), clip({ id: 'last', start: 11, duration: 5 })] }), 16);
});
