import type { Asset, AssetKind } from '../types';
import { createId } from './timeline';

export function classifyFile(file: File): AssetKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext && ['mp4', 'mov', 'm4v', 'webm', 'ogv', 'mkv'].includes(ext)) return 'video';
  if (ext && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  return null;
}

export function readMediaMetadata(file: File, kind: AssetKind): Promise<Pick<Asset, 'duration' | 'width' | 'height' | 'thumbnail' | 'waveform'>> {
  const url = URL.createObjectURL(file);
  return new Promise(resolve => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ duration: 5, width: img.naturalWidth, height: img.naturalHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.72) });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { resolve({ duration: 5 }); URL.revokeObjectURL(url); };
      img.src = url;
      return;
    }
    const media = document.createElement(kind === 'video' ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const duration = Number.isFinite(media.duration) ? Math.max(0.1, media.duration) : 5;
      let thumbnail: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      if (kind === 'video') {
        width = (media as HTMLVideoElement).videoWidth;
        height = (media as HTMLVideoElement).videoHeight;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = Math.max(1, Math.round(240 * ((height || 9) / (width || 16))));
          canvas.getContext('2d')?.drawImage(media as HTMLVideoElement, 0, 0, canvas.width, canvas.height);
          thumbnail = canvas.toDataURL('image/jpeg', 0.72);
        } catch { /* Some formats do not expose a frame at metadata time. */ }
      }
      resolve({ duration, width, height, thumbnail });
      URL.revokeObjectURL(url);
    };
    media.onerror = () => { resolve({ duration: 5 }); URL.revokeObjectURL(url); };
    media.src = url;
    try { media.load(); } catch { /* metadata may be unavailable in restricted environments */ }
  });
}

export async function makeAsset(file: File): Promise<{ asset: Asset; blob: Blob }> {
  const kind = classifyFile(file);
  if (!kind) throw new Error(`Unsupported media type: ${file.name}`);
  const metadata = await readMediaMetadata(file, kind);
  let waveform: number[] | undefined;
  if (kind !== 'image') waveform = await createWaveform(file).catch(() => undefined);
  return {
    asset: {
      id: createId('asset'), name: file.name, kind, mimeType: file.type || 'application/octet-stream',
      size: file.size, ...metadata, waveform,
    },
    blob: file,
  };
}

async function createWaveform(file: File): Promise<number[]> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass || file.size > 64 * 1024 * 1024) return [];
  const ctx = new AudioContextClass();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const bins = 180;
    const stride = Math.max(1, Math.floor(channel.length / bins));
    const peaks: number[] = [];
    for (let i = 0; i < bins; i++) {
      let max = 0;
      const start = i * stride;
      for (let j = start; j < Math.min(start + stride, channel.length); j += 1) max = Math.max(max, Math.abs(channel[j]));
      peaks.push(max);
    }
    return peaks;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
