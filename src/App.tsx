import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AudioLines, Bookmark, Check, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Command,
  Copy, Download, Film, FolderOpen, Gauge, Grid2X2, Image as ImageIcon, Import, Layers, Lock, Magnet,
  Maximize2, MoreHorizontal, Music2, Pause, Play, Plus, Redo2, RotateCcw, Save, Scissors, Search,
  Settings2, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Square, Trash2, Type, Undo2, Unlock,
  Video, Volume2, VolumeX, Wand2, X, Eye, EyeOff, ChevronLeft, FileVideo, MousePointer2, Crosshair,
} from 'lucide-react';
import type { Asset, Clip, Effect, EffectType, Keyframe, Project, SequenceSettings, Track } from './types';
import { createId, duplicateClipGroup, evaluateKeyframes, makeClip, makeDefaultTracks, moveClip, rippleDelete, sequenceDuration, snapTime, splitClip, withUpdatedClip } from './lib/timeline';
import { classifyFile, makeAsset } from './lib/media';
import { estimateStorage, getAssetBlob, getProject, importAssetBlobs, listProjects, saveProject, storeAssetBlob } from './lib/storage';
import { animatedEffectParam, drawFrame, supportedRecordingMimeType, syncMediaToTime } from './lib/rendering';
import { EFFECT_CATALOG, createEffect, getEffectDefinition, getEffectLabel } from './lib/effects';

const TRACK_HEADER = 156;
const BASE_WIDTH = 76;

type ToolName = 'select' | 'blade';
type PanelName = 'media' | 'effects';
type ExportPreset = '720p' | '1080p' | 'source';
type Gesture = { clipId: string; mode: 'left' | 'right'; originX: number; original: Clip; draft: Clip };
type ResizeDrag = { axis: 'x' | 'y'; side: 'left' | 'right' | 'timeline'; startPos: number; initial: number };
type ContextMenuKind = 'clip' | 'asset' | 'track' | 'timeline' | 'app';
type ContextMenuState = { x: number; y: number; kind: ContextMenuKind; clipId?: string; assetId?: string; trackId?: string };

function newProject(name = 'Untitled Project'): Project {
  const now = Date.now();
  return {
    id: createId('project'), name, createdAt: now, updatedAt: now,
    settings: { name: 'Sequence 01', width: 1920, height: 1080, fps: 30, background: '#101114' },
    assets: [], tracks: makeDefaultTracks(), clips: [], markers: [],
  };
}

function formatTime(seconds: number, fps = 30): string {
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const frames = Math.floor((safe - whole) * fps);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function effectDefaults(type: EffectType): Effect {
  return createEffect(type);
}

export default function App() {
  const [project, setProject] = useState<Project>(() => newProject());
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [playhead, setPlayheadState] = useState(0);
  const playheadRef = useRef(0);
  const setPlayhead = useCallback((time: number) => {
    const value = Math.max(0, Math.min(Math.max(15, sequenceDuration(project)) + 2, time));
    playheadRef.current = value;
    setPlayheadState(value);
  }, [project]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(BASE_WIDTH);
  const [projectPanelWidth, setProjectPanelWidth] = useState(245);
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(300);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [tool, setTool] = useState<ToolName>('select');
  const [activePanel, setActivePanel] = useState<PanelName>('media');
  const [assetFilter, setAssetFilter] = useState('');
  const [notice, setNotice] = useState('Ready');
  const [isSaving, setIsSaving] = useState(false);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [assetEpoch, setAssetEpoch] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>('1080p');
  const [exportFps, setExportFps] = useState(30);
  const [exportProgress, setExportProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [showSequenceSettings, setShowSequenceSettings] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [drafts, setDrafts] = useState<Map<string, Clip>>(new Map());
  const gestureRef = useRef<Gesture | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage?: number; quota?: number }>({});
  const [searchEffect, setSearchEffect] = useState('');
  const [clipboard, setClipboard] = useState<Clip[] | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const effectDragStartRef = useRef<Project | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRefMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefMap = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageMap = useRef<Map<string, HTMLImageElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const exportCancelRef = useRef<(() => void) | null>(null);
  const previewAudioContextRef = useRef<AudioContext | null>(null);
  const previewAudioGraphRef = useRef<WeakMap<HTMLAudioElement, { panner: StereoPannerNode }>>(new WeakMap());
  const [mediaCount, setMediaCount] = useState(0);

  const selectedClip = project.clips.find(clip => clip.id === selectedClipId) ?? null;
  const selectedAsset = project.assets.find(asset => asset.id === selectedAssetId) ?? null;
  const duration = useMemo(() => Math.max(15, sequenceDuration(project)), [project]);
  const timeWidth = Math.max(duration * zoom, 1200);
  const visibleAssets = project.assets.filter(asset => asset.name.toLowerCase().includes(assetFilter.toLowerCase()));
  const supportsExport = supportedRecordingMimeType();

  const commitProject = useCallback((next: Project, selected?: string | null) => {
    const updated = { ...next, updatedAt: Date.now() };
    setPast(items => [...items.slice(-39), project]);
    setFuture([]);
    setProject(updated);
    if (selected !== undefined) setSelectedClipId(selected);
    setNotice('Unsaved changes');
  }, [project]);

  const replaceClip = useCallback((clipId: string, patch: Partial<Clip>, record = true) => {
    const next = withUpdatedClip(project, clipId, patch);
    if (record) commitProject(next);
    else setProject(next);
  }, [project, commitProject]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const existing = await listProjects();
        if (canceled) return;
        setProjects(existing);
        if (existing.length) {
          const latest = existing[0];
          setProject(latest);
          const blobs = await importAssetBlobs(latest.assets);
          if (canceled) return;
          const nextUrls = new Map<string, string>();
          for (const asset of latest.assets) {
            const blob = blobs.get(asset.id);
            if (blob) nextUrls.set(asset.id, URL.createObjectURL(blob));
          }
          setUrls(nextUrls);
          setNotice(`Restored ${latest.name}`);
          if (latest.assets.some(asset => !blobs.has(asset.id))) setNotice('Some media is missing — relink it from the Project panel');
        }
        setStorageInfo(await estimateStorage());
      } catch {
        setNotice('Local project storage is unavailable; exports and editing still work for this session');
      }
    })();
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    setMediaCount(project.assets.length);
    // Load local image elements for drawing onto the compositing canvas.
    const alive = new Set<string>();
    for (const asset of project.assets.filter(item => item.kind === 'image')) {
      const src = urls.get(asset.id);
      if (!src) continue;
      alive.add(asset.id);
      if (!imageMap.current.has(asset.id)) {
        const image = new Image();
        image.onload = () => setAssetEpoch(epoch => epoch + 1);
        image.src = src;
        imageMap.current.set(asset.id, image);
      }
    }
    for (const id of [...imageMap.current.keys()]) if (!alive.has(id)) imageMap.current.delete(id);
  }, [project.assets, urls]);

  // Autosave the project document after edits. Original media blobs are stored separately in IndexedDB.
  useEffect(() => {
    let canceled = false;
    const timer = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveProject(project);
        if (!canceled) {
          setNotice('All changes saved locally');
          setProjects(current => [project, ...current.filter(item => item.id !== project.id)]);
          setStorageInfo(await estimateStorage());
        }
      } catch {
        if (!canceled) setNotice('Autosave failed — use Export Project to save a portable project file');
      } finally {
        if (!canceled) setIsSaving(false);
      }
    }, 700);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [project]);

  // Route active timeline audio through a browser audio graph so stereo pan is real, not just a UI field.
  useEffect(() => {
    if (!isPlaying || !('AudioContext' in window)) return;
    try {
      const context = previewAudioContextRef.current ?? new AudioContext();
      previewAudioContextRef.current = context;
      void context.resume().catch(() => undefined);
      for (const clip of project.clips.filter(item => item.kind === 'audio')) {
        const element = audioRefMap.current.get(clip.id);
        if (!element) continue;
        let graph = previewAudioGraphRef.current.get(element);
        if (!graph) {
          const source = context.createMediaElementSource(element);
          const panner = context.createStereoPanner();
          source.connect(panner);
          panner.connect(context.destination);
          graph = { panner };
          previewAudioGraphRef.current.set(element, graph);
        }
        graph.panner.pan.value = Math.max(-1, Math.min(1, clip.pan));
      }
    } catch {
      setNotice('Browser audio graph unavailable; basic audio playback remains available');
    }
  }, [isPlaying, project.clips, assetEpoch]);

  // The preview renderer and the timeline transport share one master clock.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let uiTick = 0;
    const loop = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      let time = playheadRef.current;
      if (isPlaying) {
        time += delta;
        if (time >= duration) {
          time = duration;
          playheadRef.current = time;
          setPlayheadState(time);
          setIsPlaying(false);
        } else {
          playheadRef.current = time;
          if (++uiTick % 4 === 0) setPlayheadState(time);
        }
      }
      syncMediaToTime(project, time, mediaRefMap.current, audioRefMap.current, isPlaying && time < duration);
      for (const clip of project.clips.filter(item => item.kind === 'audio')) {
        const element = audioRefMap.current.get(clip.id);
        const graph = element ? previewAudioGraphRef.current.get(element) : undefined;
        if (graph) graph.panner.pan.value = Math.max(-1, Math.min(1, evaluateKeyframes(clip.keyframes, 'pan', time - clip.start, clip.pan)));
      }
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, project, time, mediaRefMap.current, imageMap.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [project, isPlaying, duration, assetEpoch]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = gestureRef.current;
      if (!current) return;
      const delta = (event.clientX - current.originX) / zoom;
      let draft: Clip;
      if (current.mode === 'left') {
        const consumed = Math.max(-current.original.start, Math.min(current.original.duration - 0.05, delta));
        draft = { ...current.original, start: current.original.start + consumed, sourceIn: Math.max(0, current.original.sourceIn + consumed * current.original.playbackRate), duration: current.original.duration - consumed };
      } else {
        draft = { ...current.original, duration: Math.max(0.05, current.original.duration + delta) };
      }
      const nextGesture = { ...current, draft };
      gestureRef.current = nextGesture;
      setGesture(nextGesture);
      setDrafts(map => new Map(map).set(current.clipId, draft));
    };
    const handlePointerUp = () => {
      const current = gestureRef.current;
      if (!current) return;
      gestureRef.current = null;
      if (current.draft.start !== current.original.start || current.draft.duration !== current.original.duration || current.draft.sourceIn !== current.original.sourceIn) {
        const next = { ...project, clips: project.clips.map(clip => clip.id === current.clipId ? current.draft : clip) };
        commitProject(next);
      }
      setDrafts(map => { const nextMap = new Map(map); nextMap.delete(current.clipId); return nextMap; });
      setGesture(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [zoom, project, commitProject]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const delta = drag.axis === 'x' ? event.clientX - drag.startPos : event.clientY - drag.startPos;
      if (drag.side === 'left') setProjectPanelWidth(Math.max(180, Math.min(420, drag.initial + delta)));
      else if (drag.side === 'right') setInspectorPanelWidth(Math.max(240, Math.min(430, drag.initial - delta)));
      else setTimelineHeight(Math.max(230, Math.min(560, drag.initial - delta)));
    };
    const up = () => { resizeDragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>, drag: ResizeDrag) => {
    event.preventDefault();
    resizeDragRef.current = drag;
    document.body.style.cursor = drag.axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const ensureTrack = (kind: 'video' | 'audio') => {
    const candidate = project.tracks.find(track => track.kind === kind && !track.locked);
    if (candidate) return candidate;
    const track: Track = { id: createId('track'), name: `${kind === 'video' ? 'V' : 'A'}${project.tracks.filter(t => t.kind === kind).length + 1}`, kind, muted: false, hidden: false, locked: false };
    commitProject({ ...project, tracks: [...project.tracks, track] });
    return track;
  };

  const addAssetToTimeline = useCallback((assetId: string, targetTrackId?: string, atTime?: number) => {
    const asset = project.assets.find(item => item.id === assetId);
    if (!asset) return;
    let target = project.tracks.find(track => track.id === targetTrackId);
    const kind = asset.kind === 'audio' ? 'audio' : 'video';
    if (!target || target.kind !== kind || target.locked) target = project.tracks.find(track => track.kind === kind && !track.locked);
    if (!target) {
      const newTrack: Track = { id: createId('track'), name: `${kind === 'video' ? 'V' : 'A'}${project.tracks.filter(t => t.kind === kind).length + 1}`, kind, muted: false, hidden: false, locked: false };
      const clip = makeClip({ assetId: asset.id, trackId: newTrack.id, name: asset.name, kind: asset.kind === 'image' ? 'image' : asset.kind, duration: asset.duration, start: atTime ?? playheadRef.current });
      commitProject({ ...project, tracks: [...project.tracks, newTrack], clips: [...project.clips, clip] }, clip.id);
      setSelectedAssetId(null);
      setNotice(`Added ${asset.name} to ${newTrack.name}`);
      return;
    }
    const start = Math.max(0, atTime ?? playheadRef.current);
    const newClip = makeClip({ assetId: asset.id, trackId: target.id, name: asset.name, kind: asset.kind, duration: asset.duration, start });
    const clips = [...project.clips, newClip];
    let selected = newClip.id;
    // Video-only tracks carry their own video; a companion audio clip maintains source sync on A1.
    if (asset.kind === 'video') {
      const audioTrack = project.tracks.find(track => track.kind === 'audio' && !track.locked);
      if (audioTrack) {
        const audioClip = makeClip({ assetId: asset.id, trackId: audioTrack.id, name: `${asset.name} Audio`, kind: 'audio', duration: asset.duration, start, linkedClipId: newClip.id });
        newClip.linkedClipId = audioClip.id;
        clips.push(audioClip);
      }
    }
    commitProject({ ...project, clips }, selected);
    setSelectedAssetId(null);
    setNotice(`Added ${asset.name} to the timeline`);
  }, [project, commitProject]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter(file => classifyFile(file));
    if (!accepted.length) { setNotice('No supported video, audio, or image files found'); return; }
    setNotice(`Importing ${accepted.length} media file${accepted.length === 1 ? '' : 's'}…`);
    const imported: Asset[] = [];
    const nextUrls = new Map(urls);
    for (const file of accepted) {
      try {
        const { asset, blob } = await makeAsset(file);
        const missingMatch = project.assets.find(item => item.missing && item.name.toLowerCase() === file.name.toLowerCase());
        if (missingMatch) {
          const relinked = { ...asset, id: missingMatch.id };
          await storeAssetBlob(relinked.id, file.name, blob);
          nextUrls.set(relinked.id, URL.createObjectURL(blob));
          imported.push(relinked);
        } else {
          await storeAssetBlob(asset.id, file.name, blob);
          nextUrls.set(asset.id, URL.createObjectURL(blob));
          imported.push(asset);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : `Could not import ${file.name}`);
      }
    }
    setUrls(nextUrls);
    if (imported.length) {
      const assets = [...project.assets.filter(old => !imported.some(item => item.id === old.id)), ...imported];
      commitProject({ ...project, assets });
      setSelectedAssetId(imported[0].id);
      setAssetEpoch(epoch => epoch + 1);
      setNotice(`Imported ${imported.length} file${imported.length === 1 ? '' : 's'}`);
    }
  }, [project, urls, commitProject]);

  const saveNow = useCallback(async () => {
    try {
      await saveProject(project);
      setNotice('Project saved to this browser');
      setProjects(current => [project, ...current.filter(item => item.id !== project.id)]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save project locally');
    }
  }, [project]);

  const newProjectAction = () => {
    if (project.clips.length && !window.confirm('Create a new project? Your current project is autosaved locally.')) return;
    const next = newProject();
    setPast(items => [...items.slice(-39), project]);
    setFuture([]);
    setProject(next);
    setSelectedClipId(null);
    setSelectedAssetId(null);
    setPlayhead(0);
    setNotice('New project created');
  };

  const openProjectAction = async () => {
    try {
      const all = await listProjects();
      if (!all.length) { setNotice('No saved projects in this browser yet'); return; }
      const choices = all.map((item, i) => `${i + 1}. ${item.name} (${new Date(item.updatedAt).toLocaleString()})`).join('\n');
      const answer = window.prompt(`Open a local project — enter its number:\n\n${choices}`, '1');
      if (!answer) return;
      const index = Number(answer) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= all.length) { setNotice('Invalid project selection'); return; }
      const next = all[index];
      setPast(items => [...items.slice(-39), project]); setFuture([]); setProject(next); setSelectedClipId(null); setPlayhead(0);
      const blobs = await importAssetBlobs(next.assets);
      const nextUrls = new Map<string, string>();
      next.assets.forEach(asset => { const blob = blobs.get(asset.id); if (blob) nextUrls.set(asset.id, URL.createObjectURL(blob)); });
      setUrls(nextUrls);
      setNotice(next.assets.some(asset => !blobs.has(asset.id)) ? 'Project opened; some files need relinking by importing the original filenames' : `Opened ${next.name}`);
    } catch { setNotice('Could not open local projects'); }
  };

  const exportProjectFile = () => {
    const blob = new Blob([JSON.stringify({ format: 'cutline-project', version: 1, project }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cutline-project'}.cutline.json`; a.click();
    URL.revokeObjectURL(url); setNotice('Project document exported (media files are stored separately)');
  };

  const importProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; project?: Project };
      const incoming = parsed.project;
      if (parsed.format !== 'cutline-project' || !incoming || !Array.isArray(incoming.clips) || !Array.isArray(incoming.assets)) throw new Error('This is not a valid Cutline project file');
      const assets = incoming.assets.map(asset => ({ ...asset, missing: true }));
      const next = { ...incoming, assets, updatedAt: Date.now() };
      commitProject(next, null);
      setUrls(new Map()); setSelectedAssetId(assets[0]?.id ?? null); setPlayhead(0);
      setNotice('Project document opened; import the original media files to relink matching filenames');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open project file'); }
    if (projectInputRef.current) projectInputRef.current.value = '';
  };

  const undo = useCallback(() => {
    setPast(items => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture(next => [project, ...next.slice(0, 39)]);
      setProject(previous);
      setNotice('Undo');
      return items.slice(0, -1);
    });
  }, [project]);
  const redo = useCallback(() => {
    setFuture(items => {
      if (!items.length) return items;
      const nextProject = items[0];
      setPast(prev => [...prev.slice(-39), project]);
      setProject(nextProject);
      setNotice('Redo');
      return items.slice(1);
    });
  }, [project]);

  const splitAtPlayhead = useCallback((clipId = selectedClipId) => {
    if (!clipId) return;
    const selected = project.clips.find(clip => clip.id === clipId);
    if (!selected || playheadRef.current <= selected.start + 0.04 || playheadRef.current >= selected.start + selected.duration - 0.04) {
      setNotice('Place the playhead inside a clip to split it'); return;
    }
    const linked = selected.linkedClipId ? project.clips.find(clip => clip.id === selected.linkedClipId) : undefined;
    let clips = project.clips;
    const originalSelected = selected;
    clips = splitClip(clips, selected.id, playheadRef.current);
    const selectedParts = [clips.find(c => c.id === originalSelected.id), clips.find(c => c.trackId === originalSelected.trackId && c.id !== originalSelected.id && Math.abs(c.start - playheadRef.current) < 0.001 && c.name === `${originalSelected.name} (cut)`)].filter((c): c is Clip => Boolean(c));
    if (linked && playheadRef.current > linked.start + 0.04 && playheadRef.current < linked.start + linked.duration - 0.04) {
      const oldLinked = linked;
      clips = splitClip(clips, linked.id, playheadRef.current);
      const linkParts = [clips.find(c => c.id === oldLinked.id), clips.find(c => c.trackId === oldLinked.trackId && c.id !== oldLinked.id && Math.abs(c.start - playheadRef.current) < 0.001 && c.name === `${oldLinked.name} (cut)`)].filter((c): c is Clip => Boolean(c));
      if (selectedParts.length >= 2 && linkParts.length >= 2) {
        clips = clips.map(clip => {
          if (clip.id === selectedParts[0].id) return { ...clip, linkedClipId: linkParts[0].id };
          if (clip.id === selectedParts[1].id) return { ...clip, linkedClipId: linkParts[1].id };
          if (clip.id === linkParts[0].id) return { ...clip, linkedClipId: selectedParts[0].id };
          if (clip.id === linkParts[1].id) return { ...clip, linkedClipId: selectedParts[1].id };
          return clip;
        });
      }
    }
    commitProject({ ...project, clips });
    setNotice('Clip split at playhead');
  }, [project, selectedClipId, commitProject]);

  const deleteSelected = useCallback((ripple = true) => {
    if (!selectedClipId) return;
    const clip = project.clips.find(item => item.id === selectedClipId);
    if (!clip) return;
    let clips: Clip[];
    if (ripple) clips = rippleDelete(project.clips, clip.id);
    else clips = project.clips.filter(item => item.id !== clip.id && item.linkedClipId !== clip.id);
    setPast(items => [...items.slice(-39), project]); setFuture([]);
    setProject({ ...project, clips, updatedAt: Date.now() });
    setSelectedClipId(null);
    setNotice(ripple ? 'Ripple delete' : 'Clip removed');
  }, [project, selectedClipId]);

  const moveClipTo = (clipId: string, trackId: string, time: number) => {
    const clip = project.clips.find(item => item.id === clipId);
    const track = project.tracks.find(item => item.id === trackId);
    if (!clip || !track || track.locked) return;
    const correctedTrack = track.kind === 'audio' && clip.kind !== 'audio' ? project.tracks.find(t => t.kind === 'video' && !t.locked) : track.kind === 'video' && clip.kind === 'audio' ? project.tracks.find(t => t.kind === 'audio' && !t.locked) : track;
    if (!correctedTrack) return;
    const snapped = snapEnabled ? snapTime(time, project.clips, clip.id, 0.12) : Math.max(0, time);
    const delta = snapped - clip.start;
    let clips = moveClip(project.clips, clip.id, snapped, correctedTrack.id);
    if (clip.linkedClipId) clips = clips.map(item => item.id === clip.linkedClipId ? { ...item, start: Math.max(0, item.start + delta) } : item);
    commitProject({ ...project, clips }, clip.id);
  };

  const addText = () => {
    const text = window.prompt('Title text', 'Your title');
    if (!text) return;
    let track = project.tracks.find(t => t.id === 'track_v2' && !t.locked) ?? project.tracks.find(t => t.kind === 'video' && !t.locked);
    let tracks = project.tracks;
    if (!track) {
      track = { id: createId('track'), name: 'V3', kind: 'video', muted: false, hidden: false, locked: false };
      tracks = [...tracks, track];
    }
    const clip = makeClip({ trackId: track.id, name: `Title: ${text.slice(0, 24)}`, kind: 'text', duration: 5, start: playheadRef.current, text: { text, fontFamily: 'Arial', fontSize: 72, fontWeight: '700', color: '#ffffff', align: 'center', outlineColor: '#111111', outlineWidth: 2, shadow: true } });
    commitProject({ ...project, tracks, clips: [...project.clips, clip] }, clip.id);
    setSelectedAssetId(null);
    setNotice('Editable title created');
  };

  const addMarker = () => {
    const label = window.prompt('Marker label', `Marker ${project.markers.length + 1}`);
    if (label === null) return;
    const marker = { id: createId('marker'), time: playheadRef.current, label: label || 'Marker', color: '#e2b45e' };
    commitProject({ ...project, markers: [...project.markers, marker] });
  };

  const addEffect = (type: EffectType) => {
    let targetClip = selectedClip;
    if (!targetClip && selectedAsset) {
      const audioEffect = ['fade-in', 'fade-out', 'cross-dissolve'].includes(type);
      if (selectedAsset.kind === 'audio' && !audioEffect) { setNotice('Choose an audio fade for an audio source, or select a visual clip'); return; }
      const kind: Clip['kind'] = selectedAsset.kind === 'image' ? 'image' : selectedAsset.kind;
      const trackKind = kind === 'audio' ? 'audio' : 'video';
      let tracks = project.tracks;
      let track = tracks.find(item => item.kind === trackKind && !item.locked);
      if (!track) {
        track = { id: createId('track'), name: `${trackKind === 'video' ? 'V' : 'A'}${tracks.filter(item => item.kind === trackKind).length + 1}`, kind: trackKind, muted: false, hidden: false, locked: false };
        tracks = [...tracks, track];
      }
      const effect = effectDefaults(type);
      const newClip = makeClip({ assetId: selectedAsset.id, trackId: track.id, name: selectedAsset.name, kind, duration: Math.max(0.05, selectedAsset.duration || 5), start: playheadRef.current, effects: [effect] });
      const newClips: Clip[] = [...project.clips, newClip];
      if (selectedAsset.kind === 'video') {
        let audioTrack = tracks.find(item => item.kind === 'audio' && !item.locked);
        if (!audioTrack) {
          audioTrack = { id: createId('track'), name: `A${tracks.filter(item => item.kind === 'audio').length + 1}`, kind: 'audio', muted: false, hidden: false, locked: false };
          tracks = [...tracks, audioTrack];
        }
        const audioClip = makeClip({ assetId: selectedAsset.id, trackId: audioTrack.id, name: `${selectedAsset.name} Audio`, kind: 'audio', duration: newClip.duration, start: newClip.start, linkedClipId: newClip.id });
        newClip.linkedClipId = audioClip.id;
        newClips.push(audioClip);
      }
      targetClip = newClip;
      commitProject({ ...project, tracks, clips: newClips }, newClip.id);
      setSelectedAssetId(null);
      setActivePanel('media');
      setNotice(`${getEffectLabel(type)} added to a new timeline clip`);
      return;
    }
    if (!targetClip) { setNotice('Select a timeline clip or a source asset before adding an effect'); return; }
    if (targetClip.kind === 'audio' && !['fade-in', 'fade-out', 'cross-dissolve'].includes(type)) { setNotice('This effect requires a visual layer'); return; }
    const effect = effectDefaults(type);
    replaceClip(targetClip.id, { effects: [...targetClip.effects, effect] });
    setActivePanel('media');
    setNotice(`${getEffectLabel(type)} added — adjust it in Properties`);
  };

  const updateEffect = (effectId: string, patch: Partial<Effect>) => {
    if (!selectedClip) return;
    replaceClip(selectedClip.id, { effects: selectedClip.effects.map(effect => effect.id === effectId ? { ...effect, ...patch } : effect) }, !effectDragStartRef.current);
  };

  const beginEffectGesture = () => { effectDragStartRef.current = project; };
  const endEffectGesture = () => {
    const before = effectDragStartRef.current;
    if (before && before !== project) {
      setPast(items => [...items.slice(-39), before]);
      setFuture([]);
      setNotice('Effect parameter adjusted');
    }
    effectDragStartRef.current = null;
  };

  const addKeyframe = (property: string) => {
    if (!selectedClip) return;
    const current = playheadRef.current - selectedClip.start;
    const time = Math.max(0, Math.min(selectedClip.duration, current));
    const effectMatch = property.match(/^effect:([^:]+):(.+)$/);
    const effectForKeyframe = effectMatch ? selectedClip.effects.find(effect => effect.id === effectMatch[1]) : undefined;
    const value = property === 'x' ? selectedClip.x : property === 'y' ? selectedClip.y : property === 'scale' ? selectedClip.scale : property === 'rotation' ? selectedClip.rotation : property === 'opacity' ? selectedClip.opacity : property === 'gain' ? selectedClip.gain : effectForKeyframe ? animatedEffectParam(selectedClip, effectForKeyframe, effectMatch![2], time, Number(effectForKeyframe.params[effectMatch![2]] ?? 0)) : Number(selectedClip.effects.find(e => property.startsWith(`${e.type}.`))?.params[property.split('.')[1]] ?? 0);
    const frame: Keyframe = { id: createId('kf'), property, time, value, easing: 'linear' };
    replaceClip(selectedClip.id, { keyframes: [...selectedClip.keyframes.filter(k => !(k.property === property && Math.abs(k.time - time) < 0.0001)), frame] });
    setNotice(`Keyframe added for ${property}`);
  };

  const exportVideo = async () => {
    if (!supportsExport) { setNotice('This browser does not support MediaRecorder video export. Try a recent Chromium-based desktop browser.'); return; }
    const canvas = document.createElement('canvas');
    const settings: SequenceSettings = { ...project.settings, fps: exportFps };
    if (exportPreset === '720p') { settings.width = 1280; settings.height = 720; }
    else if (exportPreset === '1080p') { settings.width = 1920; settings.height = 1080; }
    const exportProject: Project = { ...project, settings };
    canvas.width = settings.width; canvas.height = settings.height;
    if (typeof canvas.captureStream !== 'function') { setNotice('This browser cannot capture a canvas for video export. Use a current desktop Chromium browser.'); return; }
    const stream = canvas.captureStream(settings.fps);
    let audioContext: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    const exportVideos = new Map<string, HTMLVideoElement>();
    const exportAudios = new Map<string, HTMLAudioElement>();
    const exportImages = new Map<string, HTMLImageElement>();
    const allMedia: HTMLMediaElement[] = [];
    const sources: MediaElementAudioSourceNode[] = [];
    const panners: StereoPannerNode[] = [];
    const exportPanners = new Map<string, StereoPannerNode>();
    let recorder: MediaRecorder;
    let raf = 0;
    let startAt = 0;
    let stopped = false;
    let canceled = false;
    const chunks: BlobPart[] = [];
    const mime = supportsExport;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      allMedia.forEach(media => { media.pause(); media.removeAttribute('src'); try { media.load(); } catch { /* cleanup */ } });
      sources.forEach(source => { try { source.disconnect(); } catch { /* already disconnected */ } });
      panners.forEach(panner => { try { panner.disconnect(); } catch { /* already disconnected */ } });
      if (audioContext) void audioContext.close().catch(() => undefined);
      stream.getTracks().forEach(track => track.stop());
    };
    try {
      for (const clip of exportProject.clips) {
        if (!clip.assetId) continue;
        const src = urls.get(clip.assetId);
        if (!src) throw new Error(`Media missing: ${clip.name}. Relink it before export.`);
        if (clip.kind === 'video') {
          const video = document.createElement('video'); video.src = src; video.muted = true; video.preload = 'auto'; video.playsInline = true;
          exportVideos.set(clip.id, video); allMedia.push(video);
        } else if (clip.kind === 'audio') {
          const audio = document.createElement('audio'); audio.src = src; audio.preload = 'auto'; audio.volume = 1;
          exportAudios.set(clip.id, audio); allMedia.push(audio);
        }
      }
      // Wait for source decoders and image assets before recording the first frame.
      setExporting(true); setExportProgress(0); setShowExport(false); setNotice('Preparing media for export…');
      await Promise.all(allMedia.map(media => new Promise<void>((resolve, reject) => {
        const minimumState = media instanceof HTMLVideoElement ? HTMLMediaElement.HAVE_CURRENT_DATA : HTMLMediaElement.HAVE_METADATA;
        if (media.readyState >= minimumState) { resolve(); return; }
        let done = false;
        const readyEvents = media instanceof HTMLVideoElement ? ['loadeddata', 'canplay'] : ['loadedmetadata', 'canplay'];
        const finish = () => { if (done) return; done = true; clearTimeout(timer); readyEvents.forEach(name => media.removeEventListener(name, finish)); media.removeEventListener('error', failed); resolve(); };
        const failed = () => { if (done) return; done = true; clearTimeout(timer); readyEvents.forEach(name => media.removeEventListener(name, finish)); reject(new Error(`The browser could not decode ${media.currentSrc || media.src}`)); };
        const timer = window.setTimeout(() => { if (!done) { done = true; readyEvents.forEach(name => media.removeEventListener(name, finish)); media.removeEventListener('error', failed); reject(new Error('Timed out preparing media for export. Check that the browser can play all source files.')); } }, 15000);
        readyEvents.forEach(name => media.addEventListener(name, finish, { once: true }));
        media.addEventListener('error', failed, { once: true });
        media.load();
      })));
      await Promise.all(exportProject.assets.filter(asset => asset.kind === 'image').map(asset => new Promise<void>((resolve, reject) => {
        const cached = imageMap.current.get(asset.id);
        if (cached?.complete && cached.naturalWidth) { exportImages.set(asset.id, cached); resolve(); return; }
        const src = urls.get(asset.id);
        if (!src) { reject(new Error(`Image media missing: ${asset.name}`)); return; }
        const image = new Image();
        image.onload = () => { exportImages.set(asset.id, image); resolve(); };
        image.onerror = () => reject(new Error(`The browser could not decode image ${asset.name}`));
        image.src = src;
      })));
      if (exportAudios.size && 'AudioContext' in window) {
        audioContext = new AudioContext();
        audioDestination = audioContext.createMediaStreamDestination();
        for (const [clipId, audio] of exportAudios.entries()) {
          const source = audioContext.createMediaElementSource(audio);
          const panner = audioContext.createStereoPanner();
          const audioClip = exportProject.clips.find(clip => clip.id === clipId);
          panner.pan.value = audioClip?.pan ?? 0;
          source.connect(panner);
          panner.connect(audioDestination);
          sources.push(source); panners.push(panner); exportPanners.set(clipId, panner);
        }
        await audioContext.resume();
      }
      if (audioDestination) for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { stopped = true; cleanup(); setExporting(false); setNotice('Export failed while recording the sequence'); };
      recorder.onstop = () => {
        cleanup();
        if (!canceled && chunks.length) {
          const blob = new Blob(chunks, { type: mime });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'cutline'}-export.${mime.includes('mp4') ? 'mp4' : 'webm'}`; anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
          setNotice(`Export complete · ${bytesLabel(blob.size)}`);
        } else if (canceled) setNotice('Export canceled');
        setExporting(false); setExportProgress(0); exportCancelRef.current = null;
      };
      setExporting(true); setExportProgress(0); setShowExport(false); setNotice('Rendering sequence…');
      recorder.start(500);
      const total = Math.max(0.1, sequenceDuration(exportProject));
      let lastUi = 0;
      let previous = performance.now();
      startAt = previous;
      const tick = (now: number) => {
        if (stopped) return;
        const time = Math.min(total, (now - startAt) / 1000);
        syncMediaToTime(exportProject, time, exportVideos, exportAudios, true, exportPanners);
        drawFrame(canvas, exportProject, time, exportVideos, exportImages);
        if (now - lastUi > 150) { setExportProgress(Math.round(time / total * 100)); lastUi = now; }
        previous = now;
        if (time >= total) {
          drawFrame(canvas, exportProject, total, exportVideos, exportImages);
          stopped = true; setExportProgress(100); recorder.stop(); return;
        }
        raf = requestAnimationFrame(tick);
      };
      exportCancelRef.current = () => {
        if (stopped) return;
        canceled = true; stopped = true; cancelAnimationFrame(raf);
        if (recorder.state !== 'inactive') recorder.stop();
      };
      raf = requestAnimationFrame(tick);
    } catch (error) {
      cleanup(); exportCancelRef.current = null; setExporting(false); setExportProgress(0); setNotice(error instanceof Error ? error.message : 'Export could not start');
    }
  };

  const copySelected = (cut = false) => {
    const clip = project.clips.find(item => item.id === selectedClipId);
    if (!clip) return;
    const linked = clip.linkedClipId ? project.clips.find(item => item.id === clip.linkedClipId) : undefined;
    setClipboard([clip, ...(linked ? [linked] : [])].map(item => ({ ...item, effects: item.effects.map(effect => ({ ...effect, params: { ...effect.params } })), keyframes: item.keyframes.map(frame => ({ ...frame })) })));
    if (cut) {
      const ids = new Set([clip.id, ...(linked ? [linked.id] : [])]);
      commitProject({ ...project, clips: project.clips.filter(item => !ids.has(item.id)) }, null);
      setNotice('Cut clip to clipboard');
    } else setNotice('Clip copied');
  };

  const pasteClipboard = () => {
    if (!clipboard?.length) { setNotice('Clipboard is empty'); return; }
    const offsetBase = Math.min(...clipboard.map(item => item.start));
    const idMap = new Map(clipboard.map(item => [item.id, createId('clip')]));
    const copies = clipboard.map(item => ({
      ...item,
      id: idMap.get(item.id)!,
      name: `${item.name} copy`,
      start: Math.max(0, playheadRef.current + item.start - offsetBase),
      linkedClipId: item.linkedClipId && idMap.has(item.linkedClipId) ? idMap.get(item.linkedClipId) : undefined,
      effects: item.effects.map(effect => ({ ...effect, id: createId('effect'), params: { ...effect.params } })),
      keyframes: item.keyframes.map(frame => ({ ...frame, id: createId('kf') })),
    }));
    commitProject({ ...project, clips: [...project.clips, ...copies] }, copies[0]?.id ?? null);
    setNotice('Clipboard pasted at playhead');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape') { setContextMenu(null); return; }
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.tagName === 'SELECT' || target.getAttribute('role') === 'separator')) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'n') { event.preventDefault(); newProjectAction(); }
      else if (command && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); }
      else if (command && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((command && event.key.toLowerCase() === 'y') || (command && event.shiftKey && event.key.toLowerCase() === 'z')) { event.preventDefault(); redo(); }
      else if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelected(false); }
      else if (command && event.key.toLowerCase() === 'x') { event.preventDefault(); copySelected(true); }
      else if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteClipboard(); }
      else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); if (selectedClipId) { const duplicated = duplicateClipGroup(project.clips, selectedClipId); commitProject({ ...project, clips: duplicated.clips }, duplicated.selectedId); } }
      else if (event.code === 'Space') { event.preventDefault(); setIsPlaying(playing => !playing); }
      else if (event.key.toLowerCase() === 's') splitAtPlayhead();
      else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected(false);
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setIsPlaying(false); setPlayhead(playheadRef.current - 1 / project.settings.fps); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setIsPlaying(false); setPlayhead(playheadRef.current + 1 / project.settings.fps); }
      else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'b') setTool('blade');
      else if (event.key.toLowerCase() === 'm') addMarker();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveNow, undo, redo, selectedClipId, project, commitProject, splitAtPlayhead, deleteSelected, setPlayhead, clipboard]);

  const rulerTicks = useMemo(() => {
    const interval = zoom < 45 ? 5 : zoom < 90 ? 2 : 1;
    const ticks: number[] = [];
    for (let time = 0; time <= duration; time += interval) ticks.push(time);
    return ticks;
  }, [zoom, duration]);

  const placeClipAtDrop = (event: React.DragEvent<HTMLDivElement>, track: Track) => {
    event.preventDefault();
    const clipPayload = event.dataTransfer.getData('application/x-cutline-clip');
    const assetPayload = event.dataTransfer.getData('application/x-cutline-asset');
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, (event.clientX - rect.left) / zoom);
    if (clipPayload) moveClipTo(clipPayload, track.id, time);
    else if (assetPayload) addAssetToTimeline(assetPayload, track.id, time);
  };

  const handleLaneClick = (event: React.MouseEvent<HTMLDivElement>, track: Track) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, (event.clientX - rect.left) / zoom);
    if (tool === 'blade') {
      const clip = project.clips.find(item => item.trackId === track.id && time > item.start && time < item.start + item.duration);
      if (clip) splitAtPlayhead(clip.id);
      else setPlayhead(time);
    } else setPlayhead(time);
  };

  const toggleTrackFlag = (trackId: string, flag: 'muted' | 'hidden' | 'locked') => {
    commitProject({ ...project, tracks: project.tracks.map(track => track.id === trackId ? { ...track, [flag]: !track[flag] } : track) });
  };

  const setSequenceValue = (key: keyof SequenceSettings, value: string | number) => {
    const next = { ...project, settings: { ...project.settings, [key]: value } };
    commitProject(next);
  };

  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-context-kind]');
    const rawKind = target?.dataset.contextKind;
    const kind: ContextMenuKind = rawKind === 'clip' || rawKind === 'asset' || rawKind === 'track' || rawKind === 'timeline' ? rawKind : 'app';
    const nextMenu: ContextMenuState = {
      x: event.clientX,
      y: event.clientY,
      kind,
      clipId: target?.dataset.clipId,
      assetId: target?.dataset.assetId,
      trackId: target?.dataset.trackId,
    };
    if (nextMenu.clipId) { setSelectedClipId(nextMenu.clipId); setSelectedAssetId(null); }
    if (nextMenu.assetId) { setSelectedAssetId(nextMenu.assetId); setSelectedClipId(null); }
    setContextMenu(nextMenu);
  };

  const runContextAction = (action: string) => {
    const menu = contextMenu;
    setContextMenu(null);
    if (!menu) return;
    if (menu.clipId) setSelectedClipId(menu.clipId);
    if (menu.assetId) setSelectedAssetId(menu.assetId);
    switch (action) {
      case 'copy': copySelected(false); break;
      case 'cut': copySelected(true); break;
      case 'split': if (menu.clipId) splitAtPlayhead(menu.clipId); break;
      case 'duplicate': if (menu.clipId) { const duplicated = duplicateClipGroup(project.clips, menu.clipId); commitProject({ ...project, clips: duplicated.clips }, duplicated.selectedId); } break;
      case 'delete': if (menu.clipId) deleteSelected(false); break;
      case 'ripple-delete': if (menu.clipId) deleteSelected(true); break;
      case 'effects': setActivePanel('effects'); break;
      case 'add-brightness': addEffect('brightness'); break;
      case 'add-blur': addEffect('blur'); break;
      case 'add-chroma': addEffect('chroma'); break;
      case 'add-vignette': addEffect('vignette'); break;
      case 'add-fade-in': addEffect('fade-in'); break;
      case 'add-fade-out': addEffect('fade-out'); break;
      case 'asset-add': if (menu.assetId) addAssetToTimeline(menu.assetId); break;
      case 'asset-source': if (menu.assetId) { setSelectedAssetId(menu.assetId); setActivePanel('media'); } break;
      case 'track-mute': if (menu.trackId) toggleTrackFlag(menu.trackId, 'muted'); break;
      case 'track-hide': if (menu.trackId) toggleTrackFlag(menu.trackId, 'hidden'); break;
      case 'track-lock': if (menu.trackId) toggleTrackFlag(menu.trackId, 'locked'); break;
      case 'paste': pasteClipboard(); break;
      case 'title': addText(); break;
      case 'marker': addMarker(); break;
      case 'import': fileInputRef.current?.click(); break;
      case 'settings': setShowSequenceSettings(true); break;
      case 'export': setShowExport(true); break;
      case 'select': if (menu.clipId) setSelectedClipId(menu.clipId); break;
      case 'deselect': setSelectedClipId(null); setSelectedAssetId(null); break;
    }
  };

  return (
    <div className="app-shell" style={{ gridTemplateRows: `42px 38px minmax(220px,1fr) 5px ${timelineHeight}px 24px` }} onContextMenu={openContextMenu} onClick={() => { if (contextMenu) setContextMenu(null); }} onDragOver={event => event.preventDefault()} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void importFiles(event.dataTransfer.files); } }}>
      <header className="topbar">
        <button className="brand-lockup brand-home-button" onClick={() => { window.location.hash = ''; }} title="Back to Cutline website" aria-label="Back to Cutline website"><div className="brand-mark"><span /><span /><span /></div><span className="brand-name">cutline</span><span className="brand-divider" /><span className="brand-workspace">EDITOR</span></button>
        <nav className="menubar" aria-label="Application menu">
          <div className="menu-wrap"><button className="menu-trigger">File <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={newProjectAction}>New Project <span>Ctrl+N</span></button><button onClick={() => void openProjectAction()}>Open Local Project…</button><button onClick={() => fileInputRef.current?.click()}>Import Media…</button><button onClick={() => projectInputRef.current?.click()}>Open Project File…</button><hr /><button onClick={() => void saveNow()}>Save Project <span>Ctrl+S</span></button><button onClick={exportProjectFile}>Export Project File…</button><button onClick={() => setShowExport(true)}>Export Sequence…</button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">Edit <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={undo}>Undo <span>Ctrl+Z</span></button><button onClick={redo}>Redo <span>Ctrl+Y</span></button><button onClick={() => copySelected(false)}>Copy <span>Ctrl+C</span></button><button onClick={() => copySelected(true)}>Cut <span>Ctrl+X</span></button><button onClick={pasteClipboard}>Paste <span>Ctrl+V</span></button><button onClick={() => { if (selectedClipId) { const duplicated = duplicateClipGroup(project.clips, selectedClipId); commitProject({ ...project, clips: duplicated.clips }, duplicated.selectedId); } }}>Duplicate Clip <span>Ctrl+D</span></button><button onClick={() => deleteSelected(true)}>Ripple Delete <span>Delete</span></button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">Clip <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={() => splitAtPlayhead()}>Split at Playhead <span>S</span></button><button onClick={() => { if (selectedClipId) { const duplicated = duplicateClipGroup(project.clips, selectedClipId); commitProject({ ...project, clips: duplicated.clips }, duplicated.selectedId); } }}>Duplicate</button><button onClick={() => deleteSelected(false)}>Delete Clip</button><button onClick={addText}>New Text Layer…</button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">Effects <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={() => addEffect('brightness')}>Brightness</button><button onClick={() => addEffect('contrast')}>Contrast</button><button onClick={() => addEffect('blur')}>Gaussian Blur</button><button onClick={() => addEffect('chroma')}>Chroma Key</button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">Sequence <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={() => setShowSequenceSettings(true)}>Sequence Settings…</button><button onClick={addMarker}>Add Marker <span>M</span></button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">View <ChevronDown size={12} /></button><div className="menu-popover"><button onClick={() => { setActivePanel('media'); setNotice('Project panel focused'); }}>Project Panel</button><button onClick={() => { setActivePanel('effects'); setNotice('Effects panel focused'); }}>Effects Panel</button><button onClick={() => setShowSequenceSettings(true)}>Workspace Settings</button></div></div>
          <div className="menu-wrap"><button className="menu-trigger">Help <ChevronDown size={12} /></button><div className="menu-popover menu-popover-right"><button onClick={() => setNotice('Cutline 0.4.0 · Web and desktop video editor')}>About Cutline</button><button onClick={() => setNotice('Space play/pause · S split · V select · B blade · Ctrl+S save · Ctrl+Z undo · ←/→ frame step')}>Keyboard Shortcuts…</button></div></div>
        </nav>
        <div className="topbar-right"><span className="local-badge"><span className="status-dot" /> LOCAL</span><button className="icon-button" title="Sequence settings" onClick={() => setShowSequenceSettings(true)}><Settings2 size={16} /></button><button className="topbar-save" onClick={() => void saveNow()}><Save size={14} /> {isSaving ? 'Saving' : 'Save'}</button></div>
      </header>

      <div className="toolbar-row">
        <div className="transport-tools">
          <button className={`tool-button ${tool === 'select' ? 'selected' : ''}`} title="Selection tool (V)" onClick={() => setTool('select')}><MousePointer2 size={16} /><span>Selection</span></button>
          <button className={`tool-button ${tool === 'blade' ? 'selected' : ''}`} title="Blade tool (B)" onClick={() => setTool('blade')}><Scissors size={16} /><span>Razor</span></button>
          <span className="toolbar-separator" />
          <button className="tool-button" title="Import media" onClick={() => fileInputRef.current?.click()}><Import size={16} /><span>Import</span></button>
          <button className="tool-button" title="Add title" onClick={addText}><Type size={16} /><span>Title</span></button>
          <button className="tool-button" title="Add timeline marker" onClick={addMarker}><Bookmark size={16} /><span>Marker</span></button>
        </div>
        <div className="toolbar-center"><span className="sequence-indicator"><Film size={14} /> {project.settings.name}</span><span className="toolbar-muted">{project.settings.width} × {project.settings.height} · {project.settings.fps} fps</span></div>
        <div className="toolbar-actions"><button className="icon-button" title="Undo" disabled={!past.length} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={16} /></button><span className="toolbar-separator" /><button className={`icon-button ${snapEnabled ? 'active' : ''}`} title="Toggle snapping" onClick={() => setSnapEnabled(v => !v)}><Magnet size={16} /></button><button className="export-button" onClick={() => setShowExport(true)}><Download size={15} /> Export</button></div>
      </div>

      <main className="workspace" style={{ gridTemplateColumns: `${projectPanelWidth}px 5px minmax(280px,1fr) 5px ${inspectorPanelWidth}px` }}>
        <aside className="panel project-panel">
          <div className="panel-heading"><div className="panel-title"><Grid2X2 size={14} /><span>PROJECT</span></div><div className="panel-heading-actions"><button className="subtle-icon" title="Import media" onClick={() => fileInputRef.current?.click()}><Plus size={15} /></button><button className="subtle-icon" title="More project actions" onClick={exportProjectFile}><MoreHorizontal size={16} /></button></div></div>
          <div className="project-name-row"><FolderOpen size={14} /><span className="project-name-text">{project.name}</span><span className="asset-count">{project.assets.length}</span></div>
          <div className="project-search"><Search size={14} /><input value={assetFilter} onChange={event => setAssetFilter(event.target.value)} placeholder="Search project" aria-label="Search media" /><span className="search-shortcut">⌘F</span></div>
          <div className="media-library-heading"><span>MEDIA</span><button onClick={() => fileInputRef.current?.click()}><Plus size={13} /> Import</button></div>
          <div className="asset-list">
            {visibleAssets.length === 0 ? <div className="empty-media"><div className="empty-media-icon"><Import size={21} /></div><strong>{project.assets.length ? 'No matches' : 'Import media to begin'}</strong><p>Drop video, audio, and image files here, or browse your computer.</p><button onClick={() => fileInputRef.current?.click()}>Choose files</button></div> : visibleAssets.map(asset => <div key={asset.id} className={`asset-row ${selectedAssetId === asset.id ? 'asset-selected' : ''}`} data-context-kind="asset" data-asset-id={asset.id} role="button" tabIndex={0} draggable onDragStart={event => event.dataTransfer.setData('application/x-cutline-asset', asset.id)} onClick={() => { setSelectedAssetId(asset.id); setSelectedClipId(null); }} onDoubleClick={() => addAssetToTimeline(asset.id)} onKeyDown={event => { if (event.key === 'Enter') { setSelectedAssetId(asset.id); setSelectedClipId(null); } if (event.key === ' ' ) addAssetToTimeline(asset.id); }} title="Drag onto a track or double-click to add to the timeline">
              <div className={`asset-thumb ${asset.kind}`}>{asset.thumbnail ? <img src={asset.thumbnail} alt="" /> : asset.kind === 'audio' ? <AudioLines size={22} /> : asset.kind === 'video' ? <FileVideo size={21} /> : <ImageIcon size={20} />}</div>
              <div className="asset-details"><span className="asset-name">{asset.name}{asset.missing ? <span className="missing-tag">MISSING</span> : null}</span><span className="asset-meta">{asset.kind.toUpperCase()} · {asset.duration.toFixed(1)}s · {bytesLabel(asset.size)}</span></div>
              <button className="asset-add" title="Add to timeline" onClick={event => { event.stopPropagation(); addAssetToTimeline(asset.id); }}><Plus size={14} /></button>
            </div>)}
          </div>
          <div className="project-panel-footer"><span><Layers size={12} /> {project.clips.length} timeline clips</span><span>{storageInfo.usage ? `${(storageInfo.usage / (1024 * 1024)).toFixed(0)} MB stored` : 'Local storage'}</span></div>
        </aside>
        <div className="panel-resize" role="separator" aria-label="Resize project panel" aria-orientation="vertical" tabIndex={0} onPointerDown={event => startResize(event, { axis: 'x', side: 'left', startPos: event.clientX, initial: projectPanelWidth })} onKeyDown={event => { if (event.key === 'ArrowLeft') setProjectPanelWidth(width => Math.max(180, width - 12)); if (event.key === 'ArrowRight') setProjectPanelWidth(width => Math.min(420, width + 12)); }} />

        <section className="center-workspace">
          <div className="monitor-strip">
            <section className="monitor-panel source-monitor">
              <div className="panel-heading"><div className="panel-title"><span>SOURCE MONITOR</span></div><span className="monitor-label">{selectedAsset?.name ?? 'No source selected'}</span><button className="subtle-icon" title="Fit source" onClick={() => setNotice('Source monitor fits the selected media')}><Maximize2 size={14} /></button></div>
              <div className="source-screen">
                {selectedAsset && urls.get(selectedAsset.id) ? selectedAsset.kind === 'image' ? <img className="source-image" src={urls.get(selectedAsset.id)} alt={selectedAsset.name} /> : selectedAsset.kind === 'video' ? <video key={selectedAsset.id} src={urls.get(selectedAsset.id)} controls preload="metadata" /> : <div className="source-audio"><div className="audio-cover"><Music2 size={36} /></div><strong>{selectedAsset.name}</strong><audio controls src={urls.get(selectedAsset.id)} /></div> : <div className="monitor-placeholder"><Clapperboard size={27} /><span>Select source media</span><small>Double-click a clip to add it to the timeline</small></div>}
              </div>
              <div className="monitor-controls"><span className="monitor-time">{selectedAsset ? `${selectedAsset.duration.toFixed(2)} sec` : '—:—:—:—'}</span><div className="source-controls"><button className="round-small" onClick={() => setSelectedAssetId(null)} title="Close source"><X size={12} /></button><button className="round-small" onClick={() => selectedAsset && addAssetToTimeline(selectedAsset.id)} title="Insert source to timeline"><Plus size={13} /></button></div><span className="monitor-mode">FIT</span></div>
            </section>

            <section className="monitor-panel program-monitor">
              <div className="panel-heading"><div className="panel-title"><span>PROGRAM MONITOR</span><span className="live-chip">LIVE</span></div><span className="monitor-label">{project.settings.name}</span><button className="subtle-icon" title="Program monitor full size" onClick={() => { const canvas = canvasRef.current; if (canvas?.requestFullscreen) void canvas.requestFullscreen(); }}><Maximize2 size={14} /></button></div>
              <div className="program-screen"><canvas ref={canvasRef} className="program-canvas" width={project.settings.width} height={project.settings.height} aria-label="Edited program preview" />{!project.clips.some(clip => ['video', 'image', 'text'].includes(clip.kind)) && <div className="program-empty"><Clapperboard size={22} /><span>Program preview</span><small>Drag media onto the timeline</small></div>}</div>
              <div className="monitor-controls"><span className="monitor-time current-time">{formatTime(playhead, project.settings.fps)}</span><div className="transport"><button className="round-small" title="Previous frame" onClick={() => { setIsPlaying(false); setPlayhead(playheadRef.current - 1 / project.settings.fps); }}><SkipBack size={13} /></button><button className="play-button" title={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying(value => !value)}>{isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button className="round-small" title="Next frame" onClick={() => { setIsPlaying(false); setPlayhead(playheadRef.current + 1 / project.settings.fps); }}><SkipForward size={13} /></button></div><span className="monitor-mode">{project.settings.width} × {project.settings.height}</span></div>
            </section>
          </div>
          <div className="center-bottom-row"><div className="mini-section"><Activity size={13} /><span>SEQUENCE</span><strong>{formatTime(duration, project.settings.fps)}</strong></div><div className="mini-section"><Gauge size={13} /><span>PREVIEW</span><strong>{project.settings.fps} fps</strong></div><div className="center-bottom-spacer"/><button className="text-action" onClick={() => setShowSequenceSettings(true)}><Settings2 size={13} /> Sequence settings</button></div>
        </section>
        <div className="panel-resize" role="separator" aria-label="Resize properties panel" aria-orientation="vertical" tabIndex={0} onPointerDown={event => startResize(event, { axis: 'x', side: 'right', startPos: event.clientX, initial: inspectorPanelWidth })} onKeyDown={event => { if (event.key === 'ArrowLeft') setInspectorPanelWidth(width => Math.min(430, width + 12)); if (event.key === 'ArrowRight') setInspectorPanelWidth(width => Math.max(240, width - 12)); }} />

        <aside className="panel inspector-panel">
          <div className="inspector-tabs"><button className={activePanel === 'media' ? 'active' : ''} onClick={() => setActivePanel('media')}><SlidersHorizontal size={13} /> PROPERTIES</button><button className={activePanel === 'effects' ? 'active' : ''} onClick={() => setActivePanel('effects')}><Wand2 size={13} /> EFFECTS</button></div>
          {activePanel === 'media' ? <div className="inspector-scroll">{selectedClip ? <>
            <div className="inspector-clip-header"><div className={`clip-type-icon ${selectedClip.kind}`}><span>{selectedClip.kind === 'video' ? <Video size={16} /> : selectedClip.kind === 'audio' ? <Music2 size={16} /> : selectedClip.kind === 'text' ? <Type size={16} /> : <ImageIcon size={16} />}</span></div><div className="inspector-clip-title"><strong>{selectedClip.name}</strong><span>{selectedClip.kind.toUpperCase()} CLIP</span></div><button className="subtle-icon" title="Delete selected clip" onClick={() => deleteSelected(false)}><Trash2 size={14} /></button></div>
            <InspectorSection title="TRANSFORM" icon={<Maximize2 size={13} />}>
              <NumberControl label="Position X" value={selectedClip.x} min={-100} max={200} step={1} onChange={v => replaceClip(selectedClip.id, { x: v })} keyframe={() => addKeyframe('x')} />
              <NumberControl label="Position Y" value={selectedClip.y} min={-100} max={200} step={1} onChange={v => replaceClip(selectedClip.id, { y: v })} keyframe={() => addKeyframe('y')} />
              <NumberControl label="Scale" value={selectedClip.scale} min={0.05} max={5} step={0.05} onChange={v => replaceClip(selectedClip.id, { scale: v })} keyframe={() => addKeyframe('scale')} />
              <NumberControl label="Rotation" value={selectedClip.rotation} min={-360} max={360} step={1} suffix="°" onChange={v => replaceClip(selectedClip.id, { rotation: v })} keyframe={() => addKeyframe('rotation')} />
              <NumberControl label="Opacity" value={selectedClip.opacity} min={0} max={1} step={0.05} onChange={v => replaceClip(selectedClip.id, { opacity: v })} keyframe={() => addKeyframe('opacity')} />
            </InspectorSection>
            <InspectorSection title="TIMING" icon={<Activity size={13} />}>
              <NumberControl label="Start" value={selectedClip.start} min={0} max={9999} step={0.1} suffix="s" onChange={v => replaceClip(selectedClip.id, { start: v })} />
              <NumberControl label="Source In" value={selectedClip.sourceIn} min={0} max={99999} step={0.1} suffix="s" onChange={v => replaceClip(selectedClip.id, { sourceIn: v })} />
              <NumberControl label="Duration" value={selectedClip.duration} min={0.05} max={99999} step={0.1} suffix="s" onChange={v => replaceClip(selectedClip.id, { duration: v })} />
              {(selectedClip.kind === 'video' || selectedClip.kind === 'audio') && <NumberControl label="Speed" value={selectedClip.playbackRate} min={0.25} max={4} step={0.25} suffix="×" onChange={v => { const scaledDuration = Math.max(0.05, selectedClip.duration * selectedClip.playbackRate / v); const linkedId = selectedClip.linkedClipId; const clips = project.clips.map(item => item.id === selectedClip.id || item.id === linkedId ? { ...item, playbackRate: v, duration: scaledDuration } : item); commitProject({ ...project, clips }, selectedClip.id); }} />}
            </InspectorSection>
            {selectedClip.kind === 'audio' && <InspectorSection title="AUDIO" icon={<Volume2 size={13} />}><NumberControl label="Gain" value={selectedClip.gain} min={0} max={1} step={0.05} onChange={v => replaceClip(selectedClip.id, { gain: v })} keyframe={() => addKeyframe('gain')} /><NumberControl label="Pan" value={selectedClip.pan} min={-1} max={1} step={0.1} onChange={v => replaceClip(selectedClip.id, { pan: v })} keyframe={() => addKeyframe('pan')} /></InspectorSection>}
            {selectedClip.kind === 'text' && selectedClip.text && <InspectorSection title="TEXT" icon={<Type size={13} />}><label className="field-block"><span>Content</span><textarea value={selectedClip.text.text} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, text: event.target.value } })} rows={3} /></label><div className="control-row"><label>Font size</label><input type="number" min={8} max={240} value={selectedClip.text.fontSize} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, fontSize: Number(event.target.value) } })} /></div><div className="control-row"><label>Typeface</label><select value={selectedClip.text.fontFamily} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, fontFamily: event.target.value } })}><option>Arial</option><option>Inter</option><option>Georgia</option><option>Impact</option><option>Verdana</option><option>Courier New</option></select></div><div className="control-row"><label>Weight</label><select value={selectedClip.text.fontWeight} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, fontWeight: event.target.value } })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></div><div className="control-row"><label>Alignment</label><select value={selectedClip.text.align} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, align: event.target.value as CanvasTextAlign } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div><div className="control-row"><label>Color</label><input type="color" value={selectedClip.text.color} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, color: event.target.value } })} /></div><div className="control-row"><label>Outline</label><input type="color" value={selectedClip.text.outlineColor} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, outlineColor: event.target.value } })} /><input type="number" min={0} max={12} value={selectedClip.text.outlineWidth} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, outlineWidth: Number(event.target.value) } })} /></div><label className="check-control"><input type="checkbox" checked={selectedClip.text.shadow} onChange={event => replaceClip(selectedClip.id, { text: { ...selectedClip.text!, shadow: event.target.checked } })} /> Drop shadow</label></InspectorSection>}
            <InspectorSection title="APPLIED EFFECTS" icon={<Wand2 size={13} />}><div className="applied-effects">{selectedClip.effects.length ? selectedClip.effects.map(effect => <div className="applied-effect-card" key={effect.id}><div className="applied-effect-row"><input className="effect-enable" type="checkbox" checked={effect.enabled} onChange={event => updateEffect(effect.id, { enabled: event.target.checked })} aria-label={`Enable ${getEffectLabel(effect.type)}`} /><span className="effect-dot" /><span>{getEffectLabel(effect.type)}</span><button className="subtle-icon" onClick={() => replaceClip(selectedClip.id, { effects: selectedClip.effects.filter(item => item.id !== effect.id) })} title="Remove effect"><X size={12} /></button></div>
              <EffectControl effect={effect} clip={selectedClip} playhead={playhead} onChange={(key, value) => { const property = `effect:${effect.id}:${key}`; const localTime = Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.start)); if (typeof value === 'number' && selectedClip.keyframes.some(frame => frame.property === property)) { const frame: Keyframe = { id: createId('kf'), property, time: localTime, value, easing: 'linear' }; replaceClip(selectedClip.id, { keyframes: [...selectedClip.keyframes.filter(item => !(item.property === property && Math.abs(item.time - localTime) < 0.0001)), frame] }, !effectDragStartRef.current); } else updateEffect(effect.id, { params: { ...effect.params, [key]: value } }); }} onKeyframe={key => addKeyframe(`effect:${effect.id}:${key}`)} onScrubStart={beginEffectGesture} onScrubEnd={endEffectGesture} />
            </div>) : <p className="muted-copy">No effects applied.</p>}<button className="add-effect-inline" onClick={() => setActivePanel('effects')}><Plus size={13} /> Browse effects</button></div></InspectorSection>
            <InspectorSection title="KEYFRAMES" icon={<Activity size={13} />}><div className="keyframe-list">{selectedClip.keyframes.length ? selectedClip.keyframes.slice().sort((a, b) => a.time - b.time).map(frame => <div className="keyframe-row" key={frame.id}><span className="key-diamond">◆</span><span>{frame.property.startsWith('effect:') ? (() => { const [, effectId, key] = frame.property.split(':'); const effect = selectedClip.effects.find(item => item.id === effectId); return `${effect ? getEffectLabel(effect.type) : 'Effect'} · ${key}`; })() : frame.property}</span><span>{frame.time.toFixed(2)}s</span><button className="subtle-icon" onClick={() => replaceClip(selectedClip.id, { keyframes: selectedClip.keyframes.filter(k => k.id !== frame.id) })} title="Delete keyframe"><X size={11} /></button></div>) : <p className="muted-copy">Move the playhead and click a diamond to add a keyframe.</p>}</div></InspectorSection>
          </> : selectedAsset ? <><div className="inspector-clip-header"><div className={`clip-type-icon ${selectedAsset.kind}`}>{selectedAsset.kind === 'video' ? <Video size={16} /> : selectedAsset.kind === 'audio' ? <Music2 size={16} /> : <ImageIcon size={16} />}</div><div className="inspector-clip-title"><strong>{selectedAsset.name}</strong><span>MEDIA SOURCE</span></div></div><InspectorSection title="SOURCE INFO" icon={<FileVideo size={13} />}><InfoLine label="Kind" value={selectedAsset.kind.toUpperCase()} /><InfoLine label="Duration" value={`${selectedAsset.duration.toFixed(2)} s`} /><InfoLine label="Resolution" value={selectedAsset.width && selectedAsset.height ? `${selectedAsset.width} × ${selectedAsset.height}` : '—'} /><InfoLine label="File size" value={bytesLabel(selectedAsset.size)} /><InfoLine label="Format" value={selectedAsset.mimeType || 'Unknown'} /></InspectorSection><button className="wide-action" onClick={() => addAssetToTimeline(selectedAsset.id)}><Plus size={14} /> Add to timeline</button></> : <div className="inspector-empty"><SlidersHorizontal size={24} /><strong>Nothing selected</strong><p>Select a clip on the timeline to edit its transform, timing, effects, and keyframes.</p></div>}</div> : <div className="inspector-scroll effects-browser"><div className="effects-search"><Search size={13} /><input value={searchEffect} onChange={event => setSearchEffect(event.target.value)} placeholder="Search effects and transitions" /></div>{(['COLOR & IMAGE', 'STYLIZE', 'TRANSITIONS', 'MOTION'] as const).map(category => { const entries = EFFECT_CATALOG.filter(definition => definition.category === category && `${definition.label} ${definition.description}`.toLowerCase().includes(searchEffect.toLowerCase())); return entries.length ? <React.Fragment key={category}><div className="effects-category"><span>{category}</span><span>{entries.length}</span></div>{entries.map(definition => <button key={definition.type} className="effect-browser-row" title={definition.description} disabled={(!selectedClip && !selectedAsset) || ((selectedClip?.kind === 'audio' || (!selectedClip && selectedAsset?.kind === 'audio')) && !['fade-in', 'fade-out', 'cross-dissolve'].includes(definition.type))} onClick={() => addEffect(definition.type)}><div className="effect-icon">{category === 'TRANSITIONS' ? <Layers size={14} /> : category === 'MOTION' ? <Activity size={14} /> : category === 'STYLIZE' ? <Sparkles size={14} /> : <Wand2 size={14} />}</div><div><strong>{definition.label}</strong><small>{definition.description}</small></div><Plus size={14} /></button>)}</React.Fragment> : null; })}<div className="effects-footnote"><Check size={13} /> Layer effects are composited in the preview and browser-recorded export. Effect order and browser codec support can affect output.</div></div>}
        </aside>
      </main>
      <div className="timeline-resize-bar" role="separator" aria-label="Resize timeline height" aria-orientation="horizontal" tabIndex={0} onPointerDown={event => startResize(event, { axis: 'y', side: 'timeline', startPos: event.clientY, initial: timelineHeight })} onKeyDown={event => { if (event.key === 'ArrowUp') setTimelineHeight(height => Math.min(560, height + 12)); if (event.key === 'ArrowDown') setTimelineHeight(height => Math.max(230, height - 12)); }}><span /></div>

      <section className="timeline-panel">
        <div className="timeline-titlebar"><div className="timeline-heading"><span className="timeline-heading-icon"><Layers size={15} /></span><strong>TIMELINE</strong><span className="timeline-sequence-name">{project.settings.name}</span><span className="timeline-divider" /><span className="timeline-clip-count">{project.clips.length} clips</span></div><div className="timeline-controls"><button className={`icon-button ${tool === 'select' ? 'active' : ''}`} title="Selection tool" onClick={() => setTool('select')}><MousePointer2 size={14} /></button><button className={`icon-button ${tool === 'blade' ? 'active' : ''}`} title="Blade tool" onClick={() => setTool('blade')}><Scissors size={14} /></button><button className={`icon-button ${snapEnabled ? 'active' : ''}`} title="Snapping" onClick={() => setSnapEnabled(v => !v)}><Magnet size={14} /></button><span className="timeline-divider" /><button className="icon-button" title="Zoom out" onClick={() => setZoom(z => Math.max(18, z - 8))}><span className="zoom-symbol">−</span></button><input className="zoom-slider" type="range" min={18} max={180} value={zoom} onChange={event => setZoom(Number(event.target.value))} aria-label="Timeline zoom" /><button className="icon-button" title="Zoom in" onClick={() => setZoom(z => Math.min(180, z + 8))}><span className="zoom-symbol">+</span></button><button className="icon-button" title="Zoom to sequence" onClick={() => setZoom(Math.max(18, Math.min(180, Math.floor(1100 / duration))))}><Maximize2 size={13} /></button></div></div>
        <div className="timeline-scroll" data-context-kind="timeline" ref={timelineScrollRef}>
          <div className="timeline-surface" style={{ width: TRACK_HEADER + timeWidth }}>
            <div className="timeline-ruler"><div className="track-label ruler-label"><span>TIME</span><span>{formatTime(playhead, project.settings.fps)}</span></div><div className="ruler-content" style={{ width: timeWidth }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, (event.clientX - rect.left) / zoom)); }}>
              {rulerTicks.map(tick => <div key={tick} className="ruler-tick" style={{ left: tick * zoom }}><span>{formatTime(tick, project.settings.fps).slice(3, 8)}</span><i /></div>)}
              {project.markers.map(marker => <button className="marker-flag" key={marker.id} style={{ left: marker.time * zoom, borderTopColor: marker.color }} title={`${marker.label} · ${formatTime(marker.time, project.settings.fps)}`} onClick={event => { event.stopPropagation(); setPlayhead(marker.time); }}><span /></button>)}
            </div></div>
            {project.tracks.map(track => <div className={`track-row ${track.kind}-track`} data-context-kind="track" data-track-id={track.id} key={track.id}>
              <div className="track-label"><div className={`track-type ${track.kind}`}>{track.kind === 'video' ? <Video size={13} /> : <AudioLines size={13} />}</div><span className="track-name">{track.name}</span><button className={`track-toggle ${track.locked ? 'flag-active' : ''}`} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => toggleTrackFlag(track.id, 'locked')}>{track.locked ? <Lock size={12} /> : <Unlock size={12} />}</button><button className={`track-toggle ${track.kind === 'audio' && track.muted || track.kind === 'video' && track.hidden ? 'flag-active' : ''}`} title={track.kind === 'audio' ? (track.muted ? 'Unmute track' : 'Mute track') : (track.hidden ? 'Show track' : 'Hide track')} onClick={() => toggleTrackFlag(track.id, track.kind === 'audio' ? 'muted' : 'hidden')}>{track.kind === 'audio' ? track.muted ? <VolumeX size={12} /> : <Volume2 size={12} /> : track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>
              <div className={`track-content ${track.locked ? 'track-locked' : ''}`} style={{ width: timeWidth }} onClick={event => handleLaneClick(event, track)} onDragOver={event => event.preventDefault()} onDrop={event => placeClipAtDrop(event, track)}>
                <div className="track-grid" style={{ backgroundSize: `${zoom}px 100%` }} />
                {project.clips.filter(clip => clip.trackId === track.id).map(clip => {
                  const shown = drafts.get(clip.id) ?? clip;
                  const active = selectedClipId === clip.id;
                  return <div key={clip.id} className={`timeline-clip ${shown.kind}-clip ${active ? 'clip-selected' : ''} ${track.locked ? 'clip-disabled' : ''}`} data-context-kind="clip" data-clip-id={clip.id} data-track-id={clip.trackId} style={{ left: shown.start * zoom, width: Math.max(12, shown.duration * zoom), opacity: track.kind === 'video' && track.hidden ? 0.45 : 1 }} draggable={!track.locked && !gesture} onDragStart={event => { event.dataTransfer.setData('application/x-cutline-clip', clip.id); event.dataTransfer.effectAllowed = 'move'; }} onClick={event => { event.stopPropagation(); if (tool === 'blade') { setPlayhead(Math.max(clip.start, Math.min(clip.start + clip.duration, (event.clientX - (event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0)) / zoom))); splitAtPlayhead(clip.id); } else { setSelectedClipId(clip.id); setSelectedAssetId(null); } }} title={`${clip.name} · ${formatTime(clip.start, project.settings.fps)} · ${clip.duration.toFixed(2)}s`}>
                    <button className="trim-handle trim-left" aria-label="Trim clip start" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); if (!track.locked) { const nextGesture = { clipId: clip.id, mode: 'left' as const, originX: event.clientX, original: clip, draft: clip }; gestureRef.current = nextGesture; setGesture(nextGesture); } }} />
                    <div className="clip-content"><div className="clip-header"><span className="clip-kind-mini">{shown.kind === 'video' ? <Video size={10} /> : shown.kind === 'audio' ? <AudioLines size={10} /> : shown.kind === 'text' ? <Type size={10} /> : <ImageIcon size={10} />}</span><span className="timeline-clip-name">{shown.name}</span></div>
                      {shown.kind === 'audio' && <div className="waveform">{(project.assets.find(asset => asset.id === shown.assetId)?.waveform ?? []).filter((_, i) => i % 2 === 0).slice(0, Math.max(1, Math.floor(shown.duration * zoom / 3))).map((peak, i) => <i key={i} style={{ height: `${Math.max(8, peak * 90)}%` }} />)}</div>}
                      {(shown.kind === 'video' || shown.kind === 'image') && project.assets.find(asset => asset.id === shown.assetId)?.thumbnail && shown.duration * zoom > 75 && <div className="clip-thumbnail-strip" style={{ backgroundImage: `url(${project.assets.find(asset => asset.id === shown.assetId)?.thumbnail})` }} />}
                    </div><button className="trim-handle trim-right" aria-label="Trim clip end" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); if (!track.locked) { const nextGesture = { clipId: clip.id, mode: 'right' as const, originX: event.clientX, original: clip, draft: clip }; gestureRef.current = nextGesture; setGesture(nextGesture); } }} />
                  </div>;
                })}
              </div>
            </div>)}
            <div className="playhead-line" style={{ left: TRACK_HEADER + playhead * zoom }}><div className="playhead-cap" /></div>
          </div>
        </div>
        <div className="timeline-footer"><span className="tool-status"><span className="tool-status-dot" /> {tool === 'select' ? 'Selection tool' : 'Razor tool'} {snapEnabled ? '· Snapping on' : '· Snapping off'}</span><span className="timeline-footer-time">{formatTime(playhead, project.settings.fps)} <span>/</span> {formatTime(duration, project.settings.fps)}</span><span className="timeline-footer-help">Drag clips to move · Drag clip edges to trim · Space to play/pause</span></div>
      </section>

      <footer className="statusbar"><div className="status-left"><span className="status-dot" /><span>{notice}</span></div><div className="status-right"><span>{isSaving ? 'SAVING…' : 'AUTOSAVE'}</span><span className="status-separator" /><span>{mediaCount} MEDIA</span><span className="status-separator" /><span>{past.length ? `${past.length} UNDO` : 'READY'}</span></div></footer>

      {/* Media elements used for real timeline preview; kept off-screen rather than removed from the document. */}
      <div className="media-runtime-bin" aria-hidden="true">{project.clips.map(clip => {
        if (!clip.assetId || !urls.get(clip.assetId)) return null;
        if (clip.kind === 'video') return <video key={clip.id} ref={element => { if (element) mediaRefMap.current.set(clip.id, element); else mediaRefMap.current.delete(clip.id); }} src={urls.get(clip.assetId)} preload="auto" muted playsInline />;
        if (clip.kind === 'audio') return <audio key={clip.id} ref={element => { if (element) audioRefMap.current.set(clip.id, element); else audioRefMap.current.delete(clip.id); }} src={urls.get(clip.assetId)} preload="auto" />;
        return null;
      })}</div>

      <input ref={fileInputRef} className="visually-hidden" type="file" multiple accept="video/*,audio/*,image/*,.mkv,.m4v,.flac,.svg" onChange={event => { if (event.target.files) void importFiles(event.target.files); event.currentTarget.value = ''; }} />
      <input ref={projectInputRef} className="visually-hidden" type="file" accept=".json,.cutline.json,application/json" onChange={event => void importProjectFile(event.target.files?.[0])} />

      {showSequenceSettings && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowSequenceSettings(false); }}><div className="modal-card sequence-modal"><div className="modal-header"><div><span className="modal-kicker">SEQUENCE</span><h2>Sequence settings</h2></div><button className="subtle-icon" onClick={() => setShowSequenceSettings(false)}><X size={17} /></button></div><div className="modal-body"><label className="field-block"><span>Sequence name</span><input value={project.settings.name} onChange={event => setSequenceValue('name', event.target.value)} /></label><div className="form-grid"><label className="field-block"><span>Width</span><select value={project.settings.width} onChange={event => setSequenceValue('width', Number(event.target.value))}><option value={3840}>3840 (4K UHD)</option><option value={2560}>2560 (QHD)</option><option value={1920}>1920 (Full HD)</option><option value={1280}>1280 (HD)</option><option value={854}>854 (SD widescreen)</option></select></label><label className="field-block"><span>Height</span><select value={project.settings.height} onChange={event => setSequenceValue('height', Number(event.target.value))}><option value={2160}>2160</option><option value={1440}>1440</option><option value={1080}>1080</option><option value={720}>720</option><option value={480}>480</option></select></label><label className="field-block"><span>Frame rate</span><select value={project.settings.fps} onChange={event => setSequenceValue('fps', Number(event.target.value))}><option value={23.976}>23.976 fps</option><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={29.97}>29.97 fps</option><option value={30}>30 fps</option><option value={50}>50 fps</option><option value={59.94}>59.94 fps</option><option value={60}>60 fps</option></select></label><label className="field-block"><span>Background</span><input type="color" value={project.settings.background} onChange={event => setSequenceValue('background', event.target.value)} /></label></div><p className="modal-note">Changing sequence settings affects the program canvas and future exports. Browser recording frame rate and codec support depend on your browser and hardware.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setShowSequenceSettings(false)}>Close</button><button className="primary-button" onClick={() => setShowSequenceSettings(false)}>Done</button></div></div></div>}

      {showExport && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowExport(false); }}><div className="modal-card export-modal"><div className="modal-header"><div><span className="modal-kicker">DELIVERY</span><h2>Export sequence</h2><p>Render the edited timeline, including supported visual effects and audio clips.</p></div><button className="subtle-icon" onClick={() => setShowExport(false)}><X size={17} /></button></div><div className="modal-body"><div className="export-summary"><div className="export-summary-icon"><FileVideo size={24} /></div><div><strong>{project.name}</strong><span>{formatTime(duration, project.settings.fps)} · {project.clips.length} clips · {project.tracks.length} tracks</span></div></div><div className="field-block"><span>Resolution</span><div className="preset-options"><button className={exportPreset === '720p' ? 'preset-selected' : ''} onClick={() => setExportPreset('720p')}><strong>HD</strong><span>1280 × 720</span></button><button className={exportPreset === '1080p' ? 'preset-selected' : ''} onClick={() => setExportPreset('1080p')}><strong>Full HD</strong><span>1920 × 1080</span></button><button className={exportPreset === 'source' ? 'preset-selected' : ''} onClick={() => setExportPreset('source')}><strong>Sequence</strong><span>{project.settings.width} × {project.settings.height}</span></button></div></div><div className="form-grid"><label className="field-block"><span>Frame rate</span><select value={exportFps} onChange={event => setExportFps(Number(event.target.value))}><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option><option value={50}>50 fps</option><option value={60}>60 fps</option></select></label><div className="field-block"><span>Container / codec</span><div className="readonly-value">{supportsExport ? supportsExport.includes('mp4') ? 'MP4 · H.264 (if browser exposes it)' : 'WebM · browser-supported VP8/VP9' : 'MediaRecorder unsupported'}</div></div></div><div className="export-warning"><Activity size={14} /><span>Export runs in real time in this browser tab. Long or high-resolution sequences may use significant memory and CPU. Keep this tab open.</span></div>{!supportsExport && <div className="error-note">This browser cannot record a canvas stream with MediaRecorder. Use an up-to-date desktop Chromium browser.</div>}</div><div className="modal-footer"><button className="secondary-button" onClick={() => setShowExport(false)}>Cancel</button><button className="primary-button" disabled={!supportsExport || exporting || project.clips.length === 0} onClick={() => void exportVideo()}><Download size={14} /> Start export</button></div></div></div>}
      {exporting && <div className="export-progress-panel"><div className="export-progress-heading"><div><span className="modal-kicker">RENDERING</span><strong>Exporting sequence…</strong></div><button className="subtle-icon" title="Cancel export" onClick={() => exportCancelRef.current?.()}><X size={16} /></button></div><div className="progress-track"><div style={{ width: `${exportProgress}%` }} /></div><div className="export-progress-meta"><span>{exportProgress}% complete</span><span>Keep Cutline open while rendering</span></div></div>}
      {contextMenu && <div className="cutline-context-menu" role="menu" aria-label="Cutline context menu" style={{ left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 238))}px`, top: `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 360))}px` }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => event.stopPropagation()}>
        <div className="context-menu-heading">{contextMenu.kind === 'clip' ? (project.clips.find(item => item.id === contextMenu.clipId)?.name ?? 'Clip actions') : contextMenu.kind === 'asset' ? (project.assets.find(item => item.id === contextMenu.assetId)?.name ?? 'Media actions') : contextMenu.kind === 'track' ? (project.tracks.find(item => item.id === contextMenu.trackId)?.name ?? 'Track actions') : contextMenu.kind === 'timeline' ? 'Timeline' : 'Cutline'}</div>
        {contextMenu.kind === 'clip' && <>
          <button role="menuitem" onClick={() => runContextAction('select')}><MousePointer2 size={13} /> Select clip</button>
          <button role="menuitem" onClick={() => runContextAction('split')}><Scissors size={13} /> Split at playhead <span>S</span></button>
          <div className="context-menu-separator" />
          <button role="menuitem" onClick={() => runContextAction('cut')}><Film size={13} /> Cut <span>Ctrl+X</span></button>
          <button role="menuitem" onClick={() => runContextAction('copy')}><Copy size={13} /> Copy <span>Ctrl+C</span></button>
          <button role="menuitem" onClick={() => runContextAction('duplicate')}><Layers size={13} /> Duplicate <span>Ctrl+D</span></button>
          <button role="menuitem" onClick={() => runContextAction('delete')}><Trash2 size={13} /> Delete clip <span>Del</span></button>
          <button role="menuitem" onClick={() => runContextAction('ripple-delete')}><Trash2 size={13} /> Ripple delete</button>
          <div className="context-menu-separator" />
          {project.clips.find(item => item.id === contextMenu.clipId)?.kind === 'audio' ? <>
            <button role="menuitem" onClick={() => runContextAction('add-fade-in')}><Activity size={13} /> Add audio fade in</button>
            <button role="menuitem" onClick={() => runContextAction('add-fade-out')}><Activity size={13} /> Add audio fade out</button>
          </> : <>
            <button role="menuitem" onClick={() => runContextAction('add-brightness')}><Wand2 size={13} /> Add brightness effect</button>
            <button role="menuitem" onClick={() => runContextAction('add-blur')}><Sparkles size={13} /> Add blur effect</button>
            <button role="menuitem" onClick={() => runContextAction('add-chroma')}><Wand2 size={13} /> Add chroma key</button>
            <button role="menuitem" onClick={() => runContextAction('add-vignette')}><Wand2 size={13} /> Add vignette</button>
            <button role="menuitem" onClick={() => runContextAction('effects')}><Plus size={13} /> Browse all effects…</button>
          </>}
        </>}
        {contextMenu.kind === 'asset' && <>
          <button role="menuitem" onClick={() => runContextAction('asset-source')}><Eye size={13} /> Select source</button>
          <button role="menuitem" onClick={() => runContextAction('asset-add')}><Plus size={13} /> Add to timeline</button>
          <div className="context-menu-separator" />
          <button role="menuitem" onClick={() => runContextAction('import')}><Import size={13} /> Import more media…</button>
        </>}
        {contextMenu.kind === 'track' && <>
          {project.tracks.find(track => track.id === contextMenu.trackId)?.kind === 'audio' && <button role="menuitem" onClick={() => runContextAction('track-mute')}><VolumeX size={13} /> Toggle audio mute</button>}
          {project.tracks.find(track => track.id === contextMenu.trackId)?.kind === 'video' && <button role="menuitem" onClick={() => runContextAction('track-hide')}><EyeOff size={13} /> Toggle visibility</button>}
          <button role="menuitem" onClick={() => runContextAction('track-lock')}><Lock size={13} /> Toggle lock</button>
          <div className="context-menu-separator" />
          <button role="menuitem" onClick={() => runContextAction('marker')}><Bookmark size={13} /> Add marker at playhead</button>
        </>}
        {(contextMenu.kind === 'timeline' || contextMenu.kind === 'app') && <>
          <button role="menuitem" onClick={() => runContextAction('paste')} disabled={!clipboard?.length}><Copy size={13} /> Paste at playhead <span>Ctrl+V</span></button>
          <button role="menuitem" onClick={() => runContextAction('title')}><Type size={13} /> New text layer…</button>
          <button role="menuitem" onClick={() => runContextAction('marker')}><Bookmark size={13} /> Add marker</button>
          <div className="context-menu-separator" />
          <button role="menuitem" onClick={() => runContextAction('import')}><Import size={13} /> Import media…</button>
          <button role="menuitem" onClick={() => runContextAction('settings')}><Settings2 size={13} /> Sequence settings…</button>
          <button role="menuitem" onClick={() => runContextAction('export')}><Download size={13} /> Export sequence…</button>
          <button role="menuitem" onClick={() => runContextAction('deselect')}><X size={13} /> Deselect</button>
        </>}
      </div>}
    </div>
  );
}

function InspectorSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="inspector-section"><div className="inspector-section-heading">{icon}<span>{title}</span><ChevronDown size={12} /></div><div className="inspector-section-content">{children}</div></section>;
}

function EffectControl({ effect, clip, playhead, onChange, onKeyframe, onScrubStart, onScrubEnd }: { effect: Effect; clip: Clip; playhead: number; onChange: (key: string, value: number | string | boolean) => void; onKeyframe: (key: string) => void; onScrubStart: () => void; onScrubEnd: () => void }) {
  const definition = getEffectDefinition(effect.type);
  const localTime = Math.max(0, Math.min(clip.duration, playhead - clip.start));
  return <>{definition.controls.map(control => {
    const raw = effect.params[control.key];
    if (control.kind === 'color') return <div className="control-row" key={control.key}><label>{control.label}</label><input aria-label={`${definition.label} ${control.label}`} type="color" value={String(raw ?? '#000000')} onChange={event => onChange(control.key, event.target.value)} /></div>;
    const base = typeof raw === 'number' ? raw : Number(control.min ?? 0);
    const value = animatedEffectParam(clip, effect, control.key, localTime, base);
    return <div className="effect-parameter" key={control.key}>
      <NumberControl label={control.label} value={value} min={control.min ?? 0} max={control.max ?? 100} step={control.step ?? 1} suffix={control.unit} onChange={next => onChange(control.key, next)} keyframe={control.animatable === false ? undefined : () => onKeyframe(control.key)} />
      <input className="effect-range" type="range" aria-label={`${definition.label} ${control.label} slider`} min={control.min ?? 0} max={control.max ?? 100} step={control.step ?? 1} value={Math.max(control.min ?? 0, Math.min(control.max ?? 100, value))} onPointerDown={onScrubStart} onPointerUp={onScrubEnd} onPointerCancel={onScrubEnd} onBlur={onScrubEnd} onChange={event => onChange(control.key, Number(event.target.value))} />
    </div>;
  })}</>;
}

function NumberControl({ label, value, min, max, step, suffix, onChange, keyframe }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void; keyframe?: () => void }) {
  return <div className="number-control"><label>{label}</label><div className="number-input-wrap"><input type="number" value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0} min={min} max={max} step={step} onChange={event => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} /><span>{suffix}</span></div>{keyframe && <button className="keyframe-add" title={`Add ${label} keyframe`} onClick={keyframe}>◆</button>}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}
