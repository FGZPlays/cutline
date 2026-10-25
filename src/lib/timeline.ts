import type { Clip, Keyframe, Project, Track } from '../types';

export const EPSILON = 0.0001;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const clipEnd = (clip: Clip) => clip.start + clip.duration;
export const sequenceDuration = (project: Project) => Math.max(0, ...project.clips.map(clipEnd));

export function createId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function makeDefaultTracks(): Track[] {
  return [
    { id: 'track_v2', name: 'V2', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'track_v1', name: 'V1', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'track_a1', name: 'A1', kind: 'audio', muted: false, hidden: false, locked: false },
    { id: 'track_a2', name: 'A2', kind: 'audio', muted: false, hidden: false, locked: false },
  ];
}

export function makeClip(input: Partial<Clip> & Pick<Clip, 'trackId' | 'name' | 'kind' | 'duration'>): Clip {
  return {
    id: input.id ?? createId('clip'),
    trackId: input.trackId,
    name: input.name,
    kind: input.kind,
    assetId: input.assetId,
    start: Math.max(0, input.start ?? 0),
    sourceIn: Math.max(0, input.sourceIn ?? 0),
    duration: Math.max(0.04, input.duration),
    effects: input.effects ?? [],
    keyframes: input.keyframes ?? [],
    text: input.text,
    x: input.x ?? 50,
    y: input.y ?? 50,
    scale: input.scale ?? 1,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    gain: input.gain ?? 1,
    pan: input.pan ?? 0,
    playbackRate: input.playbackRate ?? 1,
    linkedClipId: input.linkedClipId,
  };
}

export function splitClip(clips: Clip[], clipId: string, time: number): Clip[] {
  const clip = clips.find(item => item.id === clipId);
  if (!clip || time <= clip.start + EPSILON || time >= clipEnd(clip) - EPSILON) return clips;
  const firstDuration = time - clip.start;
  const secondDuration = clip.duration - firstDuration;
  const first = { ...clip, duration: firstDuration };
  const rateAtCut = playbackRateAt(clip, firstDuration);
  const speedFrames = clip.keyframes.filter(k => k.property === 'playbackRate').sort((a, b) => a.time - b.time);
  const activeSpeedFrame = speedFrames.filter(frame => frame.time <= firstDuration).at(-1);
  const futureFrames = clip.keyframes
    .filter(k => k.property === 'playbackRate' ? k.time > firstDuration + EPSILON : k.time >= firstDuration)
    .map(k => ({ ...k, id: createId('kf'), time: Math.max(0, k.time - firstDuration) }));
  if (speedFrames.length) futureFrames.push({
    id: createId('kf'), property: 'playbackRate', time: 0, value: rateAtCut,
    easing: activeSpeedFrame?.easing ?? 'ease-in-out',
  });
  const second: Clip = {
    ...clip,
    id: createId('clip'),
    name: `${clip.name} (cut)`,
    start: time,
    sourceIn: clip.sourceIn + sourceOffsetAt(clip, firstDuration),
    duration: secondDuration,
    playbackRate: rateAtCut,
    keyframes: futureFrames,
    effects: clip.effects.map(effect => ({ ...effect, id: createId('effect'), params: { ...effect.params } })),
    linkedClipId: undefined,
  };
  return clips.flatMap(item => item.id === clipId ? [first, second] : [item]);
}

export function moveClip(clips: Clip[], clipId: string, nextStart: number, nextTrackId?: string): Clip[] {
  return clips.map(clip => clip.id === clipId ? { ...clip, start: Math.max(0, nextStart), trackId: nextTrackId ?? clip.trackId } : clip);
}

export function rippleDelete(clips: Clip[], clipId: string): Clip[] {
  const removed = clips.find(clip => clip.id === clipId);
  if (!removed) return clips;
  const linked = removed.linkedClipId ? clips.find(clip => clip.id === removed.linkedClipId) : undefined;
  const removedParts = [removed, ...(linked ? [linked] : [])];
  const removedIds = new Set(removedParts.map(clip => clip.id));
  let result = clips.filter(clip => !removedIds.has(clip.id));
  for (const part of removedParts) {
    result = result.map(clip => {
      if (!removedIds.has(clip.id) && clip.trackId === part.trackId && clip.start >= clipEnd(part) - EPSILON) return { ...clip, start: Math.max(0, clip.start - part.duration) };
      return clip;
    });
  }
  return result;
}

function cloneClipAtEnd(clip: Clip): Clip {
  return {
    ...clip,
    id: createId('clip'),
    name: `${clip.name} copy`,
    start: clipEnd(clip),
    linkedClipId: undefined,
    effects: clip.effects.map(effect => ({ ...effect, id: createId('effect'), params: { ...effect.params } })),
    keyframes: clip.keyframes.map(k => ({ ...k, id: createId('kf') })),
  };
}

export function duplicateClip(clips: Clip[], clipId: string): Clip[] {
  const clip = clips.find(item => item.id === clipId);
  if (!clip) return clips;
  return [...clips, cloneClipAtEnd(clip)];
}

export function duplicateClipGroup(clips: Clip[], clipId: string): { clips: Clip[]; selectedId: string | null } {
  const clip = clips.find(item => item.id === clipId);
  if (!clip) return { clips, selectedId: null };
  const linked = clip.linkedClipId ? clips.find(item => item.id === clip.linkedClipId) : undefined;
  const primaryCopy = cloneClipAtEnd(clip);
  if (!linked) return { clips: [...clips, primaryCopy], selectedId: primaryCopy.id };
  const linkedCopy = cloneClipAtEnd(linked);
  primaryCopy.linkedClipId = linkedCopy.id;
  linkedCopy.linkedClipId = primaryCopy.id;
  return { clips: [...clips, primaryCopy, linkedCopy], selectedId: primaryCopy.id };
}

export function evaluateKeyframes(keyframes: Keyframe[], property: string, time: number, fallback: number): number {
  const frames = keyframes.filter(k => k.property === property).sort((a, b) => a.time - b.time);
  if (!frames.length) return fallback;
  if (time <= frames[0].time) return frames[0].value;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1].value;
  const rightIndex = frames.findIndex(frame => frame.time >= time);
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  const linearT = (time - left.time) / (right.time - left.time);
  let t = linearT;
  switch (left.easing) {
    case 'ease-in': t = linearT * linearT; break;
    case 'ease-out': t = 1 - (1 - linearT) ** 2; break;
    case 'ease-in-out': t = linearT < 0.5 ? 2 * linearT * linearT : 1 - ((-2 * linearT + 2) ** 2) / 2; break;
  }
  return left.value + (right.value - left.value) * t;
}

function easingIntegral(easing: Keyframe['easing'], t: number): number {
  const x = clamp(t, 0, 1);
  switch (easing) {
    case 'ease-in': return x ** 3 / 3;
    case 'ease-out': return x * x - x ** 3 / 3;
    case 'ease-in-out': return x < 0.5 ? (2 * x ** 3) / 3 : x - 0.5 + (2 * (1 - x) ** 3) / 3;
    default: return x * x / 2;
  }
}

/** Current playback speed, in source-media seconds per timeline second. */
export function playbackRateAt(clip: Clip, localTime: number): number {
  return clamp(evaluateKeyframes(clip.keyframes, 'playbackRate', Math.max(0, localTime), clip.playbackRate), 0.1, 4);
}

/** Map timeline time to source time by integrating the eased speed curve. */
export function sourceOffsetAt(clip: Clip, localTime: number): number {
  const time = Math.max(0, localTime);
  const frames = clip.keyframes.filter(frame => frame.property === 'playbackRate').slice().sort((a, b) => a.time - b.time);
  if (!frames.length) return time * clamp(clip.playbackRate, 0.1, 4);
  const first = frames[0];
  const firstRate = clamp(first.value, 0.1, 4);
  if (time <= first.time) return time * firstRate;
  let offset = Math.max(0, first.time) * firstRate;
  for (let i = 0; i < frames.length - 1; i++) {
    const left = frames[i], right = frames[i + 1];
    const span = right.time - left.time;
    if (span <= EPSILON) continue;
    const from = Math.max(left.time, 0), to = Math.min(time, right.time);
    if (to > from) {
      const t0 = (from - left.time) / span, t1 = (to - left.time) / span;
      const leftRate = clamp(left.value, 0.1, 4);
      const delta = clamp(right.value, 0.1, 4) - leftRate;
      offset += leftRate * (to - from) + delta * span * (easingIntegral(left.easing, t1) - easingIntegral(left.easing, t0));
    }
    if (time <= right.time) return offset;
  }
  const last = frames[frames.length - 1];
  if (time > last.time) offset += (time - last.time) * clamp(last.value, 0.1, 4);
  return offset;
}

export function withUpdatedClip(project: Project, clipId: string, patch: Partial<Clip>): Project {
  return { ...project, updatedAt: Date.now(), clips: project.clips.map(clip => clip.id === clipId ? { ...clip, ...patch } : clip) };
}

export function snapTime(time: number, clips: Clip[], excludeId: string | undefined, threshold: number): number {
  const candidates = [0, ...clips.filter(c => c.id !== excludeId).flatMap(c => [c.start, clipEnd(c)])];
  let best = time;
  let distance = threshold;
  for (const candidate of candidates) {
    const d = Math.abs(candidate - time);
    if (d < distance) { best = candidate; distance = d; }
  }
  return Math.max(0, best);
}
