import type { Clip, Effect, Project } from '../types';
import { evaluateKeyframes, clipEnd, playbackRateAt, sourceOffsetAt } from './timeline.ts';

export type MediaElementMap = Map<string, HTMLVideoElement>;
export type ImageElementMap = Map<string, HTMLImageElement>;

const layerCache = new Map<string, HTMLCanvasElement>();
const pixelateCache = new Map<string, HTMLCanvasElement>();
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clamp255 = (value: number) => Math.max(0, Math.min(255, value));
const smoothOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;

export function animatedEffectParam(clip: Clip, effect: Effect, key: string, localTime: number, fallback: number): number {
  const raw = effect.params[key];
  const property = `effect:${effect.id}:${key}`;
  if (clip.keyframes.some(frame => frame.property === property)) {
    return evaluateKeyframes(clip.keyframes, property, localTime, typeof raw === 'number' ? raw : fallback);
  }
  // Older projects used type-based keyframe names. Keep them readable for compatibility.
  return evaluateKeyframes(clip.keyframes, `${effect.type}.${key}`, localTime, typeof raw === 'number' ? raw : fallback);
}

function effectByType(clip: Clip, type: string): Effect | undefined {
  return clip.effects.find(item => item.type === type && item.enabled);
}
function param(clip: Clip, effect: Effect, key: string, localTime: number, fallback: number): number {
  return animatedEffectParam(clip, effect, key, localTime, fallback);
}
function progress(localTime: number, duration: number): number {
  return smoothOut(clamp01(localTime / Math.max(0.001, duration)));
}

export function clipVisualState(clip: Clip, localTime: number) {
  let x = evaluateKeyframes(clip.keyframes, 'x', localTime, clip.x);
  let y = evaluateKeyframes(clip.keyframes, 'y', localTime, clip.y);
  let scale = evaluateKeyframes(clip.keyframes, 'scale', localTime, clip.scale);
  let rotation = evaluateKeyframes(clip.keyframes, 'rotation', localTime, clip.rotation);
  let opacity = evaluateKeyframes(clip.keyframes, 'opacity', localTime, clip.opacity);
  const opacityEffect = effectByType(clip, 'opacity');
  if (opacityEffect) opacity *= param(clip, opacityEffect, 'value', localTime, 100) / 100;

  const fadeIn = effectByType(clip, 'fade-in');
  const fadeOut = effectByType(clip, 'fade-out');
  const dissolve = effectByType(clip, 'cross-dissolve');
  if (fadeIn) opacity *= clamp01(localTime / Math.max(0.001, Number(fadeIn.params.duration || 1)));
  if (fadeOut) opacity *= clamp01((clip.duration - localTime) / Math.max(0.001, Number(fadeOut.params.duration || 1)));
  if (dissolve) {
    const duration = Number(dissolve.params.duration || 1);
    opacity *= clamp01(localTime / Math.max(0.001, duration));
    if (clip.duration - localTime < duration) opacity *= clamp01((clip.duration - localTime) / Math.max(0.001, duration));
  }

  const slideEffects = ['slide-in-left', 'slide-in-right', 'slide-in-up', 'slide-in-down'] as const;
  for (const type of slideEffects) {
    const effect = effectByType(clip, type);
    if (!effect) continue;
    const p = progress(localTime, Number(effect.params.duration || 0.8));
    const distance = param(clip, effect, 'distance', localTime, 100) * (1 - p);
    if (type === 'slide-in-left') x -= distance;
    if (type === 'slide-in-right') x += distance;
    if (type === 'slide-in-up') y += distance;
    if (type === 'slide-in-down') y -= distance;
  }
  const zoom = effectByType(clip, 'zoom-in');
  if (zoom) {
    const p = progress(localTime, Number(zoom.params.duration || 0.8));
    scale *= param(clip, zoom, 'fromScale', localTime, 0.2) + (1 - param(clip, zoom, 'fromScale', localTime, 0.2)) * p;
  }
  const spin = effectByType(clip, 'spin-in');
  if (spin) {
    const p = progress(localTime, Number(spin.params.duration || 0.8));
    rotation -= 360 * param(clip, spin, 'turns', localTime, 1) * (1 - p);
  }

  const visual: Record<string, number> = {
    x, y, scale, rotation,
    opacity: clamp01(opacity),
    brightness: 100, contrast: 100, saturation: 100, blur: 0,
  };
  for (const effect of clip.effects) {
    if (!effect.enabled) continue;
    switch (effect.type) {
      case 'brightness': visual.brightness = param(clip, effect, 'value', localTime, 100); break;
      case 'contrast': visual.contrast = param(clip, effect, 'value', localTime, 100); break;
      case 'saturation': visual.saturation = param(clip, effect, 'value', localTime, 100); break;
      case 'blur': visual.blur = param(clip, effect, 'value', localTime, 0); break;
    }
  }
  return visual;
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip, width: number, height: number) {
  const text = clip.text;
  if (!text) return;
  ctx.textAlign = text.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${text.fontWeight || '600'} ${text.fontSize || 64}px ${text.fontFamily || 'Arial'}`;
  const lines = String(text.text || '').split('\n');
  const lineHeight = (text.fontSize || 64) * 1.18;
  const x = text.align === 'left' ? width * 0.08 : text.align === 'right' ? width * 0.92 : width * 0.5;
  const startY = height * 0.5 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    if (text.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,.72)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
    }
    if (text.outlineWidth > 0) {
      ctx.lineWidth = text.outlineWidth; ctx.lineJoin = 'round'; ctx.strokeStyle = text.outlineColor || '#000000';
      ctx.strokeText(line, x, y, width * 0.9);
    }
    ctx.fillStyle = text.color || '#ffffff'; ctx.fillText(line, x, y, width * 0.9);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  });
}

export function buildEffectFilter(clip: Clip, localTime: number): string {
  const filters: string[] = [];
  for (const effect of clip.effects) {
    if (!effect.enabled) continue;
    const value = (fallback: number) => param(clip, effect, 'value', localTime, fallback);
    switch (effect.type) {
      case 'brightness': filters.push(`brightness(${value(100)}%)`); break;
      case 'contrast': filters.push(`contrast(${value(100)}%)`); break;
      case 'saturation': filters.push(`saturate(${value(100)}%)`); break;
      case 'hue-rotate': filters.push(`hue-rotate(${value(0)}deg)`); break;
      case 'grayscale': filters.push(`grayscale(${value(100)}%)`); break;
      case 'sepia': filters.push(`sepia(${value(65)}%)`); break;
      case 'invert': filters.push(`invert(${value(100)}%)`); break;
      case 'exposure': filters.push(`brightness(${100 * 2 ** value(0)}%)`); break;
      case 'blur': filters.push(`blur(${value(0)}px)`); break;
      case 'drop-shadow': {
        const distance = param(clip, effect, 'distance', localTime, 8);
        const blur = param(clip, effect, 'blur', localTime, 12);
        const opacity = param(clip, effect, 'opacity', localTime, 65) / 100;
        const color = String(effect.params.color || '#000000').replace(/[^#a-fA-F0-9]/g, '').slice(0, 7) || '#000000';
        const rgba = hexToRgba(color, opacity);
        filters.push(`drop-shadow(0 ${distance}px ${blur}px ${rgba})`); break;
      }
    }
  }
  return filters.join(' ') || 'none';
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(full, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${clamp01(alpha)})`;
}

function layerCanvas(clipId: string, width: number, height: number): HTMLCanvasElement {
  let layer = layerCache.get(clipId);
  if (!layer) { layer = document.createElement('canvas'); layerCache.set(clipId, layer); }
  if (layer.width !== width) layer.width = width;
  if (layer.height !== height) layer.height = height;
  return layer;
}

function applyChroma(data: Uint8ClampedArray, effect: Effect, clip: Clip, localTime: number) {
  const key = String(effect.params.color || '#00ff00');
  const parse = (part: string, fallback: number) => { const parsed = Number.parseInt(part, 16); return Number.isFinite(parsed) ? parsed : fallback; };
  const rKey = parse(key.slice(1, 3), 0);
  const gKey = parse(key.slice(3, 5), 255);
  const bKey = parse(key.slice(5, 7), 0);
  const threshold = Math.max(0, param(clip, effect, 'threshold', localTime, 90));
  const softness = Math.max(1, param(clip, effect, 'softness', localTime, 35));
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const dr = data[i] - rKey, dg = data[i + 1] - gKey, db = data[i + 2] - bKey;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance < threshold) data[i + 3] = 0;
    else if (distance < threshold + softness) data[i + 3] = Math.round(data[i + 3] * (distance - threshold) / softness);
  }
}

export function processPixelBuffer(data: Uint8ClampedArray, width: number, height: number, clip: Clip, localTime: number): Uint8ClampedArray {
  const pixelEffects = clip.effects.filter(effect => effect.enabled && ['gamma', 'temperature', 'tint', 'posterize', 'threshold', 'noise', 'sharpen', 'chroma'].includes(effect.type));
  for (const effect of pixelEffects) {
    const value = param(clip, effect, 'value', localTime, 0);
    if (effect.type === 'chroma') { applyChroma(data, effect, clip, localTime); continue; }
    if (effect.type === 'sharpen') {
      const amount = Math.max(0, param(clip, effect, 'value', localTime, 0));
      if (amount <= 0) continue;
      const source = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (!source[i + 3]) continue;
        for (let c = 0; c < 3; c++) {
          const neighbors = source[i - width * 4 + c] + source[i + width * 4 + c] + source[i - 4 + c] + source[i + 4 + c];
          data[i + c] = clamp255(source[i + c] * (1 + 4 * amount) - neighbors * amount);
        }
      }
      continue;
    }
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (effect.type === 'gamma') {
        const gamma = Math.max(0.1, param(clip, effect, 'value', localTime, 1));
        data[i] = clamp255(255 * (r / 255) ** (1 / gamma)); data[i + 1] = clamp255(255 * (g / 255) ** (1 / gamma)); data[i + 2] = clamp255(255 * (b / 255) ** (1 / gamma));
      } else if (effect.type === 'temperature') {
        data[i] = clamp255(r + value * 0.7); data[i + 2] = clamp255(b - value * 0.7);
      } else if (effect.type === 'tint') {
        data[i] = clamp255(r + value * 0.4); data[i + 1] = clamp255(g - value * 0.7); data[i + 2] = clamp255(b + value * 0.4);
      } else if (effect.type === 'posterize') {
        const levels = Math.max(2, Math.round(param(clip, effect, 'value', localTime, 8)));
        for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] / 255 * (levels - 1)) / (levels - 1) * 255;
      } else if (effect.type === 'threshold') {
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mono = luminance >= param(clip, effect, 'value', localTime, 128) ? 255 : 0;
        data[i] = mono; data[i + 1] = mono; data[i + 2] = mono;
      } else if (effect.type === 'noise') {
        const amount = Math.max(0, param(clip, effect, 'value', localTime, 0)) * (Math.random() - 0.5) * 2;
        data[i] = clamp255(r + amount); data[i + 1] = clamp255(g + amount); data[i + 2] = clamp255(b + amount);
      }
    }
  }
  return data;
}

function applyPixelEffects(ctx: CanvasRenderingContext2D, clip: Clip, localTime: number, width: number, height: number) {
  if (!clip.effects.some(effect => effect.enabled && ['gamma', 'temperature', 'tint', 'posterize', 'threshold', 'noise', 'sharpen', 'chroma'].includes(effect.type))) return;
  try {
    const image = ctx.getImageData(0, 0, width, height);
    processPixelBuffer(image.data, width, height, clip, localTime);
    ctx.putImageData(image, 0, 0);
  } catch { /* A tainted browser canvas cannot safely expose pixels; leave the layer unprocessed. */ }
}

function applyCropAndWipe(ctx: CanvasRenderingContext2D, clip: Clip, localTime: number, width: number, height: number) {
  const crop = effectByType(clip, 'crop');
  if (crop) {
    const top = height * param(clip, crop, 'top', localTime, 0) / 100;
    const right = width * param(clip, crop, 'right', localTime, 0) / 100;
    const bottom = height * param(clip, crop, 'bottom', localTime, 0) / 100;
    const left = width * param(clip, crop, 'left', localTime, 0) / 100;
    ctx.clearRect(0, 0, width, top); ctx.clearRect(0, height - bottom, width, bottom);
    ctx.clearRect(0, 0, left, height); ctx.clearRect(width - right, 0, right, height);
  }
  const wipes = ['wipe-left', 'wipe-right', 'wipe-up', 'wipe-down'] as const;
  for (const type of wipes) {
    const wipe = effectByType(clip, type);
    if (!wipe) continue;
    const p = clamp01(localTime / Math.max(0.001, Number(wipe.params.duration || 1)));
    if (p >= 1) continue;
    if (type === 'wipe-left') ctx.clearRect(width * p, 0, width * (1 - p), height);
    if (type === 'wipe-right') ctx.clearRect(0, 0, width * (1 - p), height);
    if (type === 'wipe-up') ctx.clearRect(0, 0, width, height * (1 - p));
    if (type === 'wipe-down') ctx.clearRect(0, height * p, width, height * (1 - p));
  }
}

function applyVignette(ctx: CanvasRenderingContext2D, clip: Clip, localTime: number, width: number, height: number) {
  for (const effect of clip.effects.filter(item => item.enabled && item.type === 'vignette')) {
    const strength = clamp01(param(clip, effect, 'value', localTime, 35) / 100);
    if (strength <= 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.08, width / 2, height / 2, Math.hypot(width, height) * 0.67);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.55, `rgba(0,0,0,${strength * 0.12})`);
    gradient.addColorStop(1, `rgba(0,0,0,${strength * 0.82})`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); ctx.restore();
  }
}

function applyPixelate(ctx: CanvasRenderingContext2D, clip: Clip, localTime: number, width: number, height: number) {
  const effects = clip.effects.filter(effect => effect.enabled && effect.type === 'pixelate');
  for (const effect of effects) {
    const blockSize = Math.max(1, Math.round(param(clip, effect, 'value', localTime, 1)));
    if (blockSize <= 1) continue;
    let small = pixelateCache.get(clip.id);
    if (!small) { small = document.createElement('canvas'); pixelateCache.set(clip.id, small); }
    small.width = Math.max(1, Math.ceil(width / blockSize)); small.height = Math.max(1, Math.ceil(height / blockSize));
    const sctx = small.getContext('2d');
    if (!sctx) continue;
    sctx.imageSmoothingEnabled = true; sctx.clearRect(0, 0, small.width, small.height); sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
    ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, width, height); ctx.imageSmoothingEnabled = true;
  }
}

export function drawFrame(
  canvas: HTMLCanvasElement,
  project: Project,
  time: number,
  videoByClip: MediaElementMap,
  imagesByAsset: ImageElementMap,
): void {
  const width = project.settings.width;
  const height = project.settings.height;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  ctx.save(); ctx.fillStyle = project.settings.background || '#101114'; ctx.fillRect(0, 0, width, height);

  const trackPosition = new Map(project.tracks.map((track, index) => [track.id, index]));
  const active = project.clips
    .filter(clip => {
      const track = project.tracks.find(t => t.id === clip.trackId);
      return (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'adjustment') && clip.start <= time && clipEnd(clip) > time && !track?.hidden;
    })
    .sort((a, b) => (trackPosition.get(b.trackId) ?? 0) - (trackPosition.get(a.trackId) ?? 0));

  const activeIds = new Set(project.clips.map(clip => clip.id));
  for (const id of layerCache.keys()) if (!activeIds.has(id)) layerCache.delete(id);
  for (const id of pixelateCache.keys()) if (!activeIds.has(id)) pixelateCache.delete(id);

  for (const clip of active) {
    const localTime = time - clip.start;
    const visual = clipVisualState(clip, localTime);
    const layer = layerCanvas(clip.id, width, height);
    const lctx = layer.getContext('2d');
    if (!lctx) continue;
    lctx.clearRect(0, 0, width, height);
    if (clip.kind === 'adjustment') {
      lctx.save();
      lctx.filter = buildEffectFilter(clip, localTime);
      lctx.drawImage(canvas, 0, 0, width, height);
      lctx.restore();
      applyPixelEffects(lctx, clip, localTime, width, height);
      applyCropAndWipe(lctx, clip, localTime, width, height);
      applyVignette(lctx, clip, localTime, width, height);
      applyPixelate(lctx, clip, localTime, width, height);
      ctx.save();
      ctx.globalAlpha = visual.opacity;
      ctx.translate(width * visual.x / 100, height * visual.y / 100);
      ctx.rotate(visual.rotation * Math.PI / 180);
      ctx.scale(visual.scale, visual.scale);
      ctx.drawImage(layer, -width / 2, -height / 2, width, height);
      ctx.restore();
      continue;
    }
    lctx.save(); lctx.filter = buildEffectFilter(clip, localTime);
    if (effectByType(clip, 'mirror-horizontal') || effectByType(clip, 'mirror-vertical')) {
      lctx.translate(width / 2, height / 2);
      lctx.scale(effectByType(clip, 'mirror-horizontal') ? -1 : 1, effectByType(clip, 'mirror-vertical') ? -1 : 1);
      lctx.translate(-width / 2, -height / 2);
    }
    if (clip.kind === 'text') drawText(lctx, clip, width, height);
    else if (clip.kind === 'image' && clip.assetId) {
      const img = imagesByAsset.get(clip.assetId);
      if (img?.complete && img.naturalWidth) {
        const fit = Math.min(width / img.naturalWidth, height / img.naturalHeight);
        const drawW = img.naturalWidth * fit, drawH = img.naturalHeight * fit;
        lctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      }
    } else if (clip.kind === 'video') {
      const video = videoByClip.get(clip.id);
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
        const drawW = video.videoWidth * fit, drawH = video.videoHeight * fit;
        lctx.drawImage(video, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      }
    }
    lctx.restore();

    applyPixelEffects(lctx, clip, localTime, width, height);
    applyCropAndWipe(lctx, clip, localTime, width, height);
    applyVignette(lctx, clip, localTime, width, height);
    applyPixelate(lctx, clip, localTime, width, height);

    ctx.save();
    ctx.globalAlpha = visual.opacity;
    ctx.translate(width * visual.x / 100, height * visual.y / 100);
    ctx.rotate(visual.rotation * Math.PI / 180);
    ctx.scale(visual.scale, visual.scale);
    ctx.drawImage(layer, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
  ctx.restore();
}

export function syncMediaToTime(project: Project, time: number, videoByClip: MediaElementMap, audioByClip: Map<string, HTMLAudioElement>, playing: boolean, audioPanners?: Map<string, StereoPannerNode>): void {
  for (const clip of project.clips) {
    if (clip.kind !== 'video' && clip.kind !== 'audio') continue;
    const track = project.tracks.find(t => t.id === clip.trackId);
    const element: HTMLMediaElement | undefined = clip.kind === 'video' ? videoByClip.get(clip.id) : audioByClip.get(clip.id);
    if (!element) continue;
    const localTime = Math.max(0, time - clip.start);
    const rate = playbackRateAt(clip, localTime);
    if (Math.abs(element.playbackRate - rate) > 0.015) element.playbackRate = rate;
    const active = clip.start <= time && clipEnd(clip) > time;
    if (clip.kind === 'audio') {
      const audio = element as HTMLAudioElement;
      const localTime = time - clip.start;
      let gain = evaluateKeyframes(clip.keyframes, 'gain', localTime, clip.gain);
      const fadeIn = clip.effects.find(effect => effect.type === 'fade-in' && effect.enabled);
      const fadeOut = clip.effects.find(effect => effect.type === 'fade-out' && effect.enabled);
      const dissolve = clip.effects.find(effect => effect.type === 'cross-dissolve' && effect.enabled);
      if (fadeIn) gain *= clamp01(localTime / Math.max(0.001, Number(fadeIn.params.duration || 1)));
      if (fadeOut) gain *= clamp01((clip.duration - localTime) / Math.max(0.001, Number(fadeOut.params.duration || 1)));
      if (dissolve) {
        const fade = Math.max(0.001, Number(dissolve.params.duration || 1));
        gain *= clamp01(localTime / fade);
        if (clip.duration - localTime < fade) gain *= clamp01((clip.duration - localTime) / fade);
      }
      audio.volume = track?.muted ? 0 : Math.min(1, Math.max(0, gain));
      const panner = audioPanners?.get(clip.id);
      if (panner) panner.pan.value = Math.max(-1, Math.min(1, evaluateKeyframes(clip.keyframes, 'pan', localTime, clip.pan)));
    }
    if (!active || !playing || track?.muted && clip.kind === 'audio') {
      element.pause();
      if (active) {
        const target = clip.sourceIn + sourceOffsetAt(clip, Math.max(0, time - clip.start));
        if (Math.abs(element.currentTime - target) > 0.03 && Number.isFinite(target)) {
          try { element.currentTime = Math.max(0, target); } catch { /* wait for metadata */ }
        }
      }
      continue;
    }
    const target = clip.sourceIn + (time - clip.start) * clip.playbackRate;
    if (Number.isFinite(target) && Math.abs(element.currentTime - target) > 0.28) {
      try { element.currentTime = Math.max(0, target); } catch { /* seek may not be ready */ }
    }
    if (element.paused) void element.play().catch(() => undefined);
  }
}

export function supportedRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}
