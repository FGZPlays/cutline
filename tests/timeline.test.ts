import { describe, expect, it } from 'vitest';
import type { Clip, Keyframe, Project } from '../src/types';
import { duplicateClip, duplicateClipGroup, evaluateKeyframes, makeClip, makeDefaultTracks, moveClip, rippleDelete, sequenceDuration, snapTime, splitClip } from '../src/lib/timeline';

const baseClip = (patch: Partial<Clip> = {}) => makeClip({ id: 'clip-a', trackId: 'track_v1', name: 'sample.mp4', kind: 'video', duration: 10, start: 2, assetId: 'asset-a', ...patch });
const projectFixture = (): Project => ({
  id: 'project-test', name: 'Test', createdAt: 0, updatedAt: 0,
  settings: { name: 'Sequence', width: 1920, height: 1080, fps: 30, background: '#000000' },
  assets: [], tracks: makeDefaultTracks(), clips: [baseClip()], markers: [],
});

describe('timeline operations', () => {
  it('splits a clip at a timeline time and advances the source in-point', () => {
    const clip = baseClip({ sourceIn: 1 });
    const result = splitClip([clip], clip.id, 6);
    expect(result).toHaveLength(2);
    expect(result[0].start).toBe(2);
    expect(result[0].duration).toBe(4);
    expect(result[1].start).toBe(6);
    expect(result[1].duration).toBe(6);
    expect(result[1].sourceIn).toBe(5);
    expect(result[0].id).toBe(clip.id);
  });

  it('does not split when the time is outside the clip body', () => {
    const clip = baseClip();
    expect(splitClip([clip], clip.id, 2)).toHaveLength(1);
    expect(splitClip([clip], clip.id, 12)).toHaveLength(1);
  });

  it('moves clips and clamps negative start times', () => {
    const clip = baseClip();
    const result = moveClip([clip], clip.id, -5, 'track_v2');
    expect(result[0].start).toBe(0);
    expect(result[0].trackId).toBe('track_v2');
  });

  it('ripple-deletes a clip and closes the gap on the same track', () => {
    const first = baseClip({ id: 'first', start: 0, duration: 3 });
    const second = baseClip({ id: 'second', start: 3, duration: 4 });
    const later = baseClip({ id: 'later', start: 11, duration: 2 });
    const otherTrack = baseClip({ id: 'other', start: 11, duration: 2, trackId: 'track_v2' });
    const result = rippleDelete([first, second, later, otherTrack], 'second');
    expect(result.map(c => c.id)).not.toContain('second');
    expect(result.find(c => c.id === 'later')?.start).toBe(7);
    expect(result.find(c => c.id === 'other')?.start).toBe(11);
  });

  it('duplicates at the end of the original clip', () => {
    const clip = baseClip({ start: 4, duration: 3 });
    const result = duplicateClip([clip], clip.id);
    expect(result).toHaveLength(2);
    expect(result[1].id).not.toBe(clip.id);
    expect(result[1].start).toBe(7);
    expect(result[1].duration).toBe(3);
  });


  it('duplicates linked video and audio clips as a new linked pair', () => {
    const video = baseClip({ id: 'video-original', start: 0, duration: 5, linkedClipId: 'audio-original' });
    const audio = baseClip({ id: 'audio-original', trackId: 'track_a1', kind: 'audio', name: 'sample.mp4 Audio', start: 0, duration: 5, linkedClipId: 'video-original' });
    const result = duplicateClipGroup([video, audio], video.id);
    expect(result.clips).toHaveLength(4);
    const videoCopy = result.clips.find(c => c.id === result.selectedId)!;
    const audioCopy = result.clips.find(c => c.id === videoCopy.linkedClipId)!;
    expect(videoCopy.start).toBe(5);
    expect(audioCopy.start).toBe(5);
    expect(audioCopy.linkedClipId).toBe(videoCopy.id);
  });

  it('snaps to a nearby clip edge when within tolerance', () => {
    const clips = [baseClip({ id: 'one', start: 1, duration: 3 })];
    expect(snapTime(4.07, clips, undefined, 0.12)).toBe(4);
    expect(snapTime(4.3, clips, undefined, 0.12)).toBe(4.3);
  });

  it('measures sequence duration from timeline clip ends', () => {
    const project = projectFixture();
    expect(sequenceDuration(project)).toBe(12);
  });
});

describe('keyframe interpolation', () => {
  const frames: Keyframe[] = [
    { id: 'kf1', property: 'x', time: 0, value: 0, easing: 'linear' },
    { id: 'kf2', property: 'x', time: 10, value: 100, easing: 'linear' },
  ];
  it('returns a fallback when there are no frames for a property', () => {
    expect(evaluateKeyframes(frames, 'y', 3, 42)).toBe(42);
  });
  it('interpolates linearly and clamps to endpoint keyframes', () => {
    expect(evaluateKeyframes(frames, 'x', -1, 50)).toBe(0);
    expect(evaluateKeyframes(frames, 'x', 5, 50)).toBe(50);
    expect(evaluateKeyframes(frames, 'x', 12, 50)).toBe(100);
  });
  it('supports eased interpolation', () => {
    const eased = frames.map(frame => ({ ...frame, easing: 'ease-in' as const }));
    expect(evaluateKeyframes(eased, 'x', 5, 0)).toBe(25);
  });
});
