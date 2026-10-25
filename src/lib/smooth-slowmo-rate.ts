import type { Clip } from '../types';

export function minimumClipPlaybackRate(clip: Pick<Clip, 'playbackRate' | 'keyframes'>): number {
  const rates = clip.keyframes
    .filter(frame => frame.property === 'playbackRate' && Number.isFinite(frame.value))
    .map(frame => frame.value);
  return Math.max(0.1, Math.min(clip.playbackRate, ...rates));
}

/**
 * Select enough frames for a slow clip to make distinct frames available at the
 * output sequence rate. Cap the processor at 120 fps to keep workloads bounded.
 */
export function smoothSlowMoTargetFps(
  clip: Pick<Clip, 'playbackRate' | 'keyframes'>,
  sequenceFps: number,
  sourceFps = 0,
): number {
  const baseFps = Math.max(30, Math.min(60, Math.round(Number.isFinite(sequenceFps) ? sequenceFps : 30)));
  const requested = Math.ceil(baseFps / minimumClipPlaybackRate(clip));
  const rounded = Math.ceil(requested / 30) * 30;
  return Math.max(Math.ceil(sourceFps || 0), 60, Math.min(120, rounded));
}

export function smoothSlowMoRateExceedsCap(
  clip: Pick<Clip, 'playbackRate' | 'keyframes'>,
  sequenceFps: number,
): boolean {
  const baseFps = Math.max(30, Math.min(60, Math.round(Number.isFinite(sequenceFps) ? sequenceFps : 30)));
  return baseFps / minimumClipPlaybackRate(clip) > 120;
}
