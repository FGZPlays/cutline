import React, { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronRight, Clapperboard, Clock3, Film,
  FolderOpen, Layers3, Plus, Play, Sparkles, Video,
} from 'lucide-react';
import type { Project } from './types';
import { listProjects } from './lib/storage';

type StorageState = 'loading' | 'ready' | 'unavailable';

function startNewProject() {
  window.location.hash = '#/editor?new=1';
}

function openProject(projectId: string) {
  window.location.hash = '#/editor?project=' + encodeURIComponent(projectId);
}

function relativeDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' hr ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + ' days ago';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function projectFormat(project: Project): string {
  return project.settings.width + ' × ' + project.settings.height + ' · ' + project.settings.fps + ' fps';
}

export default function DesktopHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [storageState, setStorageState] = useState<StorageState>('loading');

  useEffect(() => {
    let canceled = false;
    listProjects().then(saved => {
      if (canceled) return;
      setProjects(saved);
      setStorageState('ready');
    }).catch(() => {
      if (canceled) return;
      setProjects([]);
      setStorageState('unavailable');
    });
    return () => { canceled = true; };
  }, []);

  const latest = projects[0];
  const recent = projects.slice(0, 4);

  return (
    <div className="desktop-home">
      <header className="desktop-home-topbar">
        <button className="desktop-home-brand" onClick={() => { window.location.hash = '#/desktop-home'; }} aria-label="Cutline home">
          <span className="desktop-home-logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="desktop-home-wordmark">cutline</span>
          <span className="desktop-home-brand-divider" />
          <span className="desktop-home-edition">DESKTOP STUDIO</span>
        </button>
        <div className="desktop-home-topbar-right">
          <span className="desktop-home-version"><span className="desktop-home-live-dot" /> LOCAL-FIRST EDITOR</span>
          <button className="desktop-home-top-action" onClick={startNewProject}><Plus size={15} /> New project</button>
        </div>
      </header>

      <main className="desktop-home-main">
        <div className="desktop-home-overline">
          <span><span className="desktop-home-overline-mark" /> YOUR WORKSPACE</span>
          <span className="desktop-home-overline-right">01 / CREATE SOMETHING GOOD</span>
        </div>

        <section className="desktop-home-hero" aria-labelledby="desktop-home-title">
          <div className="desktop-home-hero-copy">
            <div className="desktop-home-kicker"><Sparkles size={13} /> YOUR NEXT STORY STARTS HERE</div>
            <h1 id="desktop-home-title">Make room for<br />your <span>next cut.</span></h1>
            <p className="desktop-home-subtitle">Bring your footage together, shape the pacing, and make the moment feel just right. Your workspace is ready when you are.</p>
            <div className="desktop-home-actions">
              <button className="desktop-home-primary" onClick={startNewProject}><Plus size={16} /> Start a new project <ArrowRight size={16} /></button>
              {latest ? (
                <button className="desktop-home-secondary" onClick={() => openProject(latest.id)}><Play size={14} fill="currentColor" /> Continue editing</button>
              ) : (
                <div className="desktop-home-secondary-hint"><FolderOpen size={15} /> Your saved projects will appear here</div>
              )}
            </div>
            <div className="desktop-home-capabilities">
              <span><Check size={12} /> Layered timeline</span>
              <span><Check size={12} /> Effects and speed ramps</span>
              <span><Check size={12} /> Projects saved locally</span>
            </div>
          </div>

          <div className="desktop-home-visual" aria-hidden="true">
            <div className="desktop-home-visual-glow" />
            <div className="desktop-home-visual-card">
              <div className="desktop-home-visual-titlebar">
                <div className="desktop-home-mini-brand"><span /><span /><span /></div>
                <span>SEQUENCE 01 <b>·</b> UNTITLED</span>
                <span className="desktop-home-titlebar-dots"><i /><i /><i /></span>
              </div>
              <div className="desktop-home-preview-row">
                <div className="desktop-home-preview-screen">
                  <div className="desktop-home-preview-grid" />
                  <div className="desktop-home-sun" />
                  <div className="desktop-home-mountain desktop-home-mountain-back" />
                  <div className="desktop-home-mountain desktop-home-mountain-front" />
                  <div className="desktop-home-water" />
                  <div className="desktop-home-preview-label"><span>YOUR STORY, IN MOTION</span><b>FRAME 0182</b></div>
                </div>
                <div className="desktop-home-side-metrics">
                  <span>SEQUENCE</span><b>01</b>
                  <span>FRAME RATE</span><b>30 <small>FPS</small></b>
                  <span>RESOLUTION</span><b>1080p</b>
                </div>
              </div>
              <div className="desktop-home-mini-timeline">
                <div className="desktop-home-ruler"><span>00:00</span><span>00:04</span><span>00:08</span><span>00:12</span><span>00:16</span></div>
                <div className="desktop-home-track"><span>V1</span><i className="home-clip home-clip-a" /><i className="home-clip home-clip-b" /><i className="home-clip home-clip-c" /></div>
                <div className="desktop-home-track"><span>V2</span><i className="home-clip home-clip-d" /><i className="home-clip home-clip-e" /></div>
                <div className="desktop-home-track desktop-home-audio-track"><span>A1</span><i className="home-audio-wave" /></div>
                <div className="desktop-home-playhead" />
              </div>
              <div className="desktop-home-visual-footer"><span>LOCAL PROJECT WORKSPACE</span><span><span className="desktop-home-live-dot" /> READY TO CREATE</span></div>
            </div>
            <div className="desktop-home-float-tag"><Video size={14} /><span>YOUR CUT. YOUR STYLE.</span></div>
          </div>
        </section>

        <section className="desktop-home-projects" aria-labelledby="desktop-home-projects-title">
          <div className="desktop-home-section-heading">
            <div>
              <div className="desktop-home-section-kicker"><Clock3 size={13} /> PICK UP WHERE YOU LEFT OFF</div>
              <h2 id="desktop-home-projects-title">Recent projects</h2>
            </div>
            {storageState === 'ready' && projects.length > 0 && <span className="desktop-home-recent-count">SHOWING {recent.length} OF {projects.length}</span>}
          </div>

          {storageState === 'loading' ? (
            <div className="desktop-home-project-grid" aria-label="Loading saved projects">
              <div className="desktop-home-project-skeleton" /><div className="desktop-home-project-skeleton" /><div className="desktop-home-project-skeleton" />
            </div>
          ) : storageState === 'unavailable' ? (
            <div className="desktop-home-empty">
              <span className="desktop-home-empty-icon"><FolderOpen size={22} /></span>
              <div><h3>Local projects could not be loaded</h3><p>You can still start a new project. Saved-project storage may be unavailable in this session.</p></div>
              <button className="desktop-home-inline-action" onClick={startNewProject}>Start a project <ArrowRight size={14} /></button>
            </div>
          ) : recent.length > 0 ? (
            <div className="desktop-home-project-grid">
              {recent.map(project => (
                <button className="desktop-home-project-card" key={project.id} onClick={() => openProject(project.id)} title={'Open ' + project.name}>
                  <span className="desktop-home-project-card-top"><span className="desktop-home-project-icon"><Clapperboard size={16} /></span><span className="desktop-home-project-open"><ArrowUpRight size={15} /></span></span>
                  <span className="desktop-home-project-name">{project.name || 'Untitled Project'}</span>
                  <span className="desktop-home-project-format">{projectFormat(project)}</span>
                  <span className="desktop-home-project-card-bottom"><span>{project.clips.length} {project.clips.length === 1 ? 'clip' : 'clips'} · {project.assets.length} media</span><span>{relativeDate(project.updatedAt)}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="desktop-home-empty">
              <span className="desktop-home-empty-icon"><Film size={22} /></span>
              <div><h3>Your first project is waiting</h3><p>Start with a blank timeline, then bring in video, audio, or images when you’re ready.</p></div>
              <button className="desktop-home-inline-action" onClick={startNewProject}>Create your first project <ChevronRight size={15} /></button>
            </div>
          )}
        </section>

        <footer className="desktop-home-footer">
          <span><Layers3 size={13} /> CUTLINE DESKTOP</span>
          <span>YOUR MEDIA STAYS ON THIS DEVICE <i /> MADE FOR THE NEXT FRAME</span>
        </footer>
      </main>
    </div>
  );
}
