import type { Effect, EffectType } from '../types';
import { createId } from './timeline.ts';

export type EffectCategory = 'COLOR & IMAGE' | 'STYLIZE' | 'TRANSITIONS' | 'MOTION';
export interface EffectParamDefinition {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  kind?: 'number' | 'color';
  animatable?: boolean;
}
export interface EffectDefinition {
  type: EffectType;
  label: string;
  category: EffectCategory;
  description: string;
  defaults: Record<string, number | string | boolean>;
  controls: EffectParamDefinition[];
  visual: boolean;
}

const number = (key: string, label: string, min: number, max: number, step = 1, unit = '', animatable = true): EffectParamDefinition => ({ key, label, min, max, step, unit, animatable });
const color = (key: string, label: string): EffectParamDefinition => ({ key, label, kind: 'color', animatable: false });

export const EFFECT_CATALOG: EffectDefinition[] = [
  { type: 'brightness', label: 'Brightness', category: 'COLOR & IMAGE', description: 'Adjust overall luminance', defaults: { value: 125 }, controls: [number('value', 'Amount', 0, 300, 5, '%')], visual: true },
  { type: 'contrast', label: 'Contrast', category: 'COLOR & IMAGE', description: 'Adjust tonal contrast', defaults: { value: 125 }, controls: [number('value', 'Amount', 0, 300, 5, '%')], visual: true },
  { type: 'saturation', label: 'Saturation', category: 'COLOR & IMAGE', description: 'Adjust color intensity', defaults: { value: 135 }, controls: [number('value', 'Amount', 0, 300, 5, '%')], visual: true },
  { type: 'hue-rotate', label: 'Hue / Color Wheel', category: 'COLOR & IMAGE', description: 'Rotate the hue spectrum', defaults: { value: 35 }, controls: [number('value', 'Hue', -180, 180, 1, '°')], visual: true },
  { type: 'exposure', label: 'Exposure', category: 'COLOR & IMAGE', description: 'Adjust exposure in stops', defaults: { value: 0.7 }, controls: [number('value', 'Stops', -4, 4, 0.1, ' EV')], visual: true },
  { type: 'gamma', label: 'Gamma', category: 'COLOR & IMAGE', description: 'Adjust midtone response', defaults: { value: 1.25 }, controls: [number('value', 'Gamma', 0.1, 3, 0.05, '×')], visual: true },
  { type: 'temperature', label: 'Color Temperature', category: 'COLOR & IMAGE', description: 'Warm or cool the image', defaults: { value: 25 }, controls: [number('value', 'Warm / Cool', -100, 100, 1)], visual: true },
  { type: 'tint', label: 'Tint', category: 'COLOR & IMAGE', description: 'Shift green and magenta balance', defaults: { value: 20 }, controls: [number('value', 'Green / Magenta', -100, 100, 1)], visual: true },
  { type: 'grayscale', label: 'Black & White', category: 'COLOR & IMAGE', description: 'Blend to monochrome', defaults: { value: 100 }, controls: [number('value', 'Amount', 0, 100, 1, '%')], visual: true },
  { type: 'sepia', label: 'Sepia', category: 'COLOR & IMAGE', description: 'Apply a warm sepia tone', defaults: { value: 65 }, controls: [number('value', 'Amount', 0, 100, 1, '%')], visual: true },
  { type: 'invert', label: 'Invert Colors', category: 'COLOR & IMAGE', description: 'Invert image colors', defaults: { value: 100 }, controls: [number('value', 'Amount', 0, 100, 1, '%')], visual: true },
  { type: 'blur', label: 'Gaussian Blur', category: 'STYLIZE', description: 'Soften visual detail', defaults: { value: 5 }, controls: [number('value', 'Radius', 0, 50, 1, ' px')], visual: true },
  { type: 'sharpen', label: 'Sharpen', category: 'STYLIZE', description: 'Enhance local edge contrast', defaults: { value: 1 }, controls: [number('value', 'Amount', 0, 5, 0.1)], visual: true },
  { type: 'pixelate', label: 'Mosaic / Pixelate', category: 'STYLIZE', description: 'Pixelate the current layer', defaults: { value: 12 }, controls: [number('value', 'Block size', 1, 80, 1, ' px')], visual: true },
  { type: 'posterize', label: 'Posterize', category: 'STYLIZE', description: 'Reduce the number of color levels', defaults: { value: 8 }, controls: [number('value', 'Levels', 2, 32, 1)], visual: true },
  { type: 'threshold', label: 'Threshold', category: 'STYLIZE', description: 'Convert luminance to black and white', defaults: { value: 128 }, controls: [number('value', 'Threshold', 0, 255, 1)], visual: true },
  { type: 'noise', label: 'Film Grain', category: 'STYLIZE', description: 'Add animated film grain', defaults: { value: 22 }, controls: [number('value', 'Amount', 0, 80, 1, '%')], visual: true },
  { type: 'vignette', label: 'Vignette', category: 'STYLIZE', description: 'Darken the edges of the layer', defaults: { value: 35 }, controls: [number('value', 'Strength', 0, 100, 1, '%')], visual: true },
  { type: 'drop-shadow', label: 'Drop Shadow', category: 'STYLIZE', description: 'Add a shadow around visible pixels', defaults: { distance: 8, blur: 12, opacity: 65, color: '#000000' }, controls: [number('distance', 'Distance', 0, 100, 1, ' px'), number('blur', 'Blur', 0, 100, 1, ' px'), number('opacity', 'Opacity', 0, 100, 1, '%'), color('color', 'Color')], visual: true },
  { type: 'chroma', label: 'Chroma Key', category: 'COLOR & IMAGE', description: 'Remove a color backdrop from this layer', defaults: { color: '#00ff00', threshold: 90, softness: 35 }, controls: [color('color', 'Key color'), number('threshold', 'Threshold', 0, 441, 5), number('softness', 'Softness', 0, 200, 5)], visual: true },
  { type: 'crop', label: 'Crop', category: 'COLOR & IMAGE', description: 'Crop edges from the layer', defaults: { top: 5, right: 5, bottom: 5, left: 5 }, controls: [number('top', 'Top', 0, 45, 1, '%'), number('right', 'Right', 0, 45, 1, '%'), number('bottom', 'Bottom', 0, 45, 1, '%'), number('left', 'Left', 0, 45, 1, '%')], visual: true },
  { type: 'opacity', label: 'Layer Opacity', category: 'COLOR & IMAGE', description: 'Animate this layer’s opacity', defaults: { value: 80 }, controls: [number('value', 'Opacity', 0, 100, 1, '%')], visual: true },
  { type: 'mirror-horizontal', label: 'Flip Horizontal', category: 'STYLIZE', description: 'Mirror the layer horizontally', defaults: {}, controls: [], visual: true },
  { type: 'mirror-vertical', label: 'Flip Vertical', category: 'STYLIZE', description: 'Mirror the layer vertically', defaults: {}, controls: [], visual: true },
  { type: 'fade-in', label: 'Fade In', category: 'TRANSITIONS', description: 'Reveal the layer from transparent', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'fade-out', label: 'Fade Out', category: 'TRANSITIONS', description: 'Fade the layer to transparent', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'cross-dissolve', label: 'Cross Dissolve', category: 'TRANSITIONS', description: 'Fade through adjacent layers/clips', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'wipe-left', label: 'Wipe Left', category: 'TRANSITIONS', description: 'Reveal from left to right', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'wipe-right', label: 'Wipe Right', category: 'TRANSITIONS', description: 'Reveal from right to left', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'wipe-up', label: 'Wipe Up', category: 'TRANSITIONS', description: 'Reveal from bottom to top', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'wipe-down', label: 'Wipe Down', category: 'TRANSITIONS', description: 'Reveal from top to bottom', defaults: { duration: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false)], visual: true },
  { type: 'slide-in-left', label: 'Slide In Left', category: 'MOTION', description: 'Animate the layer from the left', defaults: { duration: 0.8, distance: 100 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('distance', 'Distance', 0, 200, 5, '%')], visual: true },
  { type: 'slide-in-right', label: 'Slide In Right', category: 'MOTION', description: 'Animate the layer from the right', defaults: { duration: 0.8, distance: 100 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('distance', 'Distance', 0, 200, 5, '%')], visual: true },
  { type: 'slide-in-up', label: 'Slide In Up', category: 'MOTION', description: 'Animate the layer from below', defaults: { duration: 0.8, distance: 100 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('distance', 'Distance', 0, 200, 5, '%')], visual: true },
  { type: 'slide-in-down', label: 'Slide In Down', category: 'MOTION', description: 'Animate the layer from above', defaults: { duration: 0.8, distance: 100 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('distance', 'Distance', 0, 200, 5, '%')], visual: true },
  { type: 'zoom-in', label: 'Zoom In', category: 'MOTION', description: 'Animate scale into place', defaults: { duration: 0.8, fromScale: 0.2 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('fromScale', 'Start scale', 0.01, 1, 0.05, '×')], visual: true },
  { type: 'spin-in', label: 'Spin In', category: 'MOTION', description: 'Rotate into place', defaults: { duration: 0.8, turns: 1 }, controls: [number('duration', 'Duration', 0.05, 30, 0.1, ' s', false), number('turns', 'Turns', 0.25, 4, 0.25)], visual: true },
];

const lookup = new Map(EFFECT_CATALOG.map(definition => [definition.type, definition]));
export function getEffectDefinition(type: EffectType): EffectDefinition {
  return lookup.get(type) ?? EFFECT_CATALOG[0];
}
export function createEffect(type: EffectType): Effect {
  const definition = getEffectDefinition(type);
  return { id: createId('effect'), type, enabled: true, params: { ...definition.defaults } };
}
export function getEffectLabel(type: EffectType): string {
  return getEffectDefinition(type).label;
}
