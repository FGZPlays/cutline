export type AssetKind = 'video' | 'audio' | 'image';
export type ClipKind = 'video' | 'audio' | 'image' | 'text' | 'adjustment';
export type TrackKind = 'video' | 'audio';
export type EffectType = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'opacity' | 'crop' | 'chroma' | 'fade-in' | 'fade-out' | 'hue-rotate' | 'exposure' | 'gamma' | 'temperature' | 'tint' | 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'pixelate' | 'posterize' | 'threshold' | 'noise' | 'vignette' | 'drop-shadow' | 'mirror-horizontal' | 'mirror-vertical' | 'cross-dissolve' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'slide-in-left' | 'slide-in-right' | 'slide-in-up' | 'slide-in-down' | 'zoom-in' | 'spin-in';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  size: number;
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  waveform?: number[];
  missing?: boolean;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Keyframe {
  id: string;
  property: string;
  time: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface TextStyle {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: CanvasTextAlign;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
}

export interface Clip {
  id: string;
  assetId?: string;
  trackId: string;
  name: string;
  kind: ClipKind;
  start: number;
  sourceIn: number;
  duration: number;
  effects: Effect[];
  keyframes: Keyframe[];
  text?: TextStyle;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  gain: number;
  pan: number;
  playbackRate: number;
  linkedClipId?: string;
}

export interface SequenceSettings {
  width: number;
  height: number;
  fps: number;
  name: string;
  background: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: SequenceSettings;
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  markers: { id: string; time: number; label: string; color: string }[];
}

export interface ProjectSnapshot {
  project: Project;
  selectedClipId: string | null;
  playhead: number;
}
