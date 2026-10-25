import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export type SmoothSlowMoProgress = (progress: number) => void;
export interface SmoothSlowMoResult { blob: Blob; interpolationFps: number }

let enginePromise: Promise<FFmpeg> | undefined;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;

async function loadEngine(): Promise<FFmpeg> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const bases = [
      new URL('ffmpeg/', document.baseURI).href,
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/',
    ];
    let lastError: unknown;
    for (const base of bases) {
      const ffmpeg = new FFmpeg();
      try {
        const coreURL = await toBlobURL(new URL('ffmpeg-core.js', base).href, 'text/javascript');
        const wasmURL = await toBlobURL(new URL('ffmpeg-core.wasm', base).href, 'application/wasm');
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      } catch (error) {
        lastError = error;
        try { ffmpeg.terminate(); } catch { /* The core worker may not have started. */ }
      }
    }
    throw new Error(
      'The local frame-interpolation engine could not start. Check your connection and reload Cutline.' +
      (lastError instanceof Error ? ' Details: ' + lastError.message : ''),
    );
  })().catch(error => {
    enginePromise = undefined;
    throw error;
  });
  return enginePromise;
}

function getInputExtension(filename: string): string {
  const suffix = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return suffix && suffix.length <= 8 ? suffix : 'mp4';
}

/**
 * Generate a high-frame-rate copy with FFmpeg's motion-compensated minterpolate
 * filter. This creates intermediate frames locally; it is not a playback-rate curve
 * and does not send the user's video to an AI or media server.
 */
export async function generateSmoothSlowMoMedia(
  source: Blob,
  filename: string,
  targetFps: number,
  onProgress?: SmoothSlowMoProgress,
): Promise<SmoothSlowMoResult> {
  if (!source.size) throw new Error('The source video is empty.');
  if (source.size > MAX_SOURCE_BYTES) {
    throw new Error('Smooth slow-mo currently processes source clips up to 256 MiB in the browser. Try a shorter or smaller source clip.');
  }

  const ffmpeg = await loadEngine();
  const token = Math.random().toString(36).slice(2, 9);
  const inputName = 'cutline-input-' + token + '.' + getInputExtension(filename);
  const outputName = 'cutline-smooth-' + token + '.mp4';
  let progressListener: ((event: { progress: number; time: number }) => void) | undefined;

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await source.arrayBuffer()));
    const interpolationFps = Math.max(60, Math.min(120, Math.round(targetFps)));
    const filter = `minterpolate=fps=${interpolationFps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`;

    progressListener = ({ progress }) => onProgress?.(Math.max(0, Math.min(0.99, progress)));
    ffmpeg.on('progress', progressListener);
    const exitCode = await ffmpeg.exec([
      '-hide_banner',
      '-i', inputName,
      '-map', '0:v:0',
      '-vf', filter,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputName,
    ]);
    if (exitCode !== 0) {
      throw new Error('Motion interpolation failed. Try a shorter clip or a less demanding speed setting.');
    }
    const encoded = await ffmpeg.readFile(outputName);
    if (typeof encoded === 'string' || encoded.byteLength === 0) {
      throw new Error('FFmpeg produced an empty interpolated video.');
    }
    const bytes = new Uint8Array(encoded);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    onProgress?.(1);
    return { blob: new Blob([buffer], { type: 'video/mp4' }), interpolationFps };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown frame-interpolation error.';
    if (/minterpolate|No such filter|filter not found/i.test(message)) {
      throw new Error('This FFmpeg build does not include motion interpolation. Reload Cutline and try again.');
    }
    throw error;
  } finally {
    if (progressListener) ffmpeg.off('progress', progressListener);
    await Promise.all([inputName, outputName].map(name => ffmpeg.deleteFile(name).catch(() => undefined)));
  }
}
