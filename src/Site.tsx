import { ArrowDownToLine, ArrowRight, Check, CirclePlay, Code2, ExternalLink, Film, FolderLock, Globe2, Laptop, Monitor, Package, ShieldCheck, Sparkles, Terminal, Video } from 'lucide-react';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.4.1';
const DOWNLOAD_BASE = (import.meta.env.VITE_RELEASE_DOWNLOAD_BASE || '').replace(/\/+$/, '');
const SOURCE_REPOSITORY = (import.meta.env.VITE_SOURCE_REPOSITORY || '').replace(/\/+$/, '');

const downloads = [
  {
    id: 'windows',
    name: 'Windows',
    format: '.EXE installer',
    file: `Cutline-Setup-${APP_VERSION}.exe`,
    icon: Monitor,
    detail: 'Windows 10 or newer · x64',
    action: 'Download for Windows',
  },
  {
    id: 'debian',
    name: 'Debian / Ubuntu',
    format: '.DEB package',
    file: `Cutline-${APP_VERSION}-amd64.deb`,
    icon: Package,
    detail: 'Debian, Ubuntu and compatible distributions · x64',
    action: 'Download .deb',
  },
  {
    id: 'fedora',
    name: 'Fedora Linux',
    format: '.RPM package',
    file: `Cutline-${APP_VERSION}-x86_64.rpm`,
    icon: Terminal,
    detail: 'Fedora, RHEL and RPM-based distributions · x64',
    action: 'Download .rpm',
  },
];

export default function Site() {
  return (
    <div className="site-page">
      <header className="site-nav">
        <a className="site-brand" href="#home" aria-label="Cutline home">
          <span className="site-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>cutline</span>
          <span className="site-brand-tag">STUDIO</span>
        </a>
        <nav className="site-nav-links" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#downloads">Downloads</a>
          {SOURCE_REPOSITORY && <a href={SOURCE_REPOSITORY} target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>}
        </nav>
        <a className="site-nav-cta" href="#/editor">Open editor <ArrowRight size={15} /></a>
      </header>

      <main>
        <section className="site-hero" id="home">
          <div className="site-hero-copy">
            <div className="site-eyebrow"><span className="site-eyebrow-dot" /> VIDEO EDITING, ON YOUR TERMS</div>
            <h1>Your timeline.<br /><span>Your workflow.</span></h1>
            <p className="site-hero-lede">A focused video editor for the web and desktop. Cut your footage, shape the look, animate your ideas, and keep your projects close.</p>
            <div className="site-hero-actions">
              <a className="site-button site-button-primary" href="#/editor"><CirclePlay size={17} /> Open web editor <ArrowRight size={16} /></a>
              <a className="site-button site-button-secondary" href="#downloads"><ArrowDownToLine size={16} /> Get Cutline</a>
            </div>
            <div className="site-trust-line"><ShieldCheck size={15} /><span>Local-first media workflow</span><span className="site-trust-divider" /><span>Web + desktop</span><span className="site-trust-divider" /><span>Version {APP_VERSION}</span></div>
          </div>

          <div className="site-product-frame" aria-label="Cutline editor workspace preview">
            <div className="site-window-bar">
              <span className="site-window-dots"><i /><i /><i /></span>
              <span className="site-window-title"><span className="site-mini-mark">C</span> cutline <span className="site-window-muted">/ editor</span></span>
              <span className="site-window-version">LOCAL PROJECT</span>
            </div>
            <div className="site-preview-layout">
              <aside className="site-preview-library">
                <div className="site-preview-label">PROJECT</div>
                <div className="site-preview-folder"><Film size={13} /> Summer montage</div>
                <div className="site-preview-media"><span className="site-media-thumb thumb-one"><Video size={14} /></span><span><b>coastline.mp4</b><small>00:18 · VIDEO</small></span></div>
                <div className="site-preview-media"><span className="site-media-thumb thumb-two"><Video size={14} /></span><span><b>city-night.mp4</b><small>00:12 · VIDEO</small></span></div>
                <div className="site-preview-media"><span className="site-media-thumb thumb-three"><Film size={14} /></span><span><b>title-card.png</b><small>IMAGE</small></span></div>
              </aside>
              <div className="site-preview-monitor-wrap">
                <div className="site-preview-label">PROGRAM MONITOR <span>00:00:08:12</span></div>
                <div className="site-preview-screen"><div className="site-screen-sun" /><div className="site-screen-hill hill-back" /><div className="site-screen-hill hill-front" /><div className="site-screen-caption">find your frame.</div><div className="site-screen-crosshair" /></div>
                <div className="site-preview-transport"><span>1080p</span><span className="site-preview-play"><span /></span><span>30 FPS</span></div>
              </div>
            </div>
            <div className="site-preview-timeline">
              <div className="site-preview-timeline-title"><span>TIMELINE</span><span>00:00:32:18</span></div>
              <div className="site-track"><label>V2</label><div className="site-track-lanes"><span className="site-clip clip-title">TITLE · FIND YOUR FRAME</span></div></div>
              <div className="site-track"><label>V1</label><div className="site-track-lanes"><span className="site-clip clip-coast">coastline.mp4</span><span className="site-clip clip-city">city-night.mp4</span><span className="site-clip clip-forest">forest-road.mp4</span></div></div>
              <div className="site-track"><label>A1</label><div className="site-track-lanes"><span className="site-waveform"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></div></div>
              <div className="site-playhead" />
            </div>
            <div className="site-preview-status"><span><span className="site-status-light" /> READY</span><span>PROJECTS STAY ON YOUR DEVICE</span></div>
          </div>
          <div className="site-hero-bottom-note"><span className="site-note-line" /> A quieter workspace for focused edits <span className="site-note-line" /></div>
        </section>

        <section className="site-feature-section" id="features">
          <div className="site-section-heading">
            <div className="site-eyebrow">THE WORKSPACE</div>
            <h2>Made for the edit.<br /><span>Not the noise.</span></h2>
            <p>Start in the browser, move to desktop when you want a dedicated window, and work with the same Cutline project model.</p>
          </div>
          <div className="site-feature-grid">
            <article className="site-feature-card"><span className="site-feature-icon"><Globe2 size={20} /></span><span className="site-feature-number">01 / ACCESS</span><h3>Open on the web</h3><p>Launch the editor from your browser without installing the desktop application. Browser codec and storage limits still apply.</p><a href="#/editor">Open web editor <ArrowRight size={14} /></a></article>
            <article className="site-feature-card"><span className="site-feature-icon"><Laptop size={20} /></span><span className="site-feature-number">02 / DESKTOP</span><h3>Your own workspace</h3><p>Install Cutline on Windows or Linux for a standalone app window, with no development server to run.</p><a href="#downloads">Choose a download <ArrowRight size={14} /></a></article>
            <article className="site-feature-card"><span className="site-feature-icon"><FolderLock size={20} /></span><span className="site-feature-number">03 / OWNERSHIP</span><h3>Local-first by design</h3><p>Imported files are processed locally by the app. The website does not upload your footage to a media server.</p><span className="site-feature-static"><Check size={14} /> No media upload endpoint</span></article>
          </div>
        </section>

        <section className="site-download-section" id="downloads">
          <div className="site-download-heading">
            <div><div className="site-eyebrow">GET CUTLINE</div><h2>One editor.<br /><span>Your platform.</span></h2></div>
            <p>Choose the build for your system. The web editor stays available above; desktop installers are published as versioned release assets.</p>
          </div>
          <div className="site-download-grid">
            {downloads.map(item => {
              const Icon = item.icon;
              const href = DOWNLOAD_BASE ? `${DOWNLOAD_BASE}/${encodeURIComponent(item.file)}` : undefined;
              return <article className={`site-download-card ${item.id === 'fedora' ? 'site-download-featured' : ''}`} key={item.id}>
                <span className="site-download-icon"><Icon size={22} /></span>
                <div className="site-download-platform">{item.name}</div>
                <div className="site-download-format">{item.format}</div>
                <p>{item.detail}</p>
                {href ? <a className="site-download-button" href={href}><ArrowDownToLine size={16} /> {item.action}</a> : <button className="site-download-button site-download-disabled" type="button" disabled title="Set VITE_RELEASE_DOWNLOAD_BASE and publish a GitHub release to enable downloads"><ArrowDownToLine size={16} /> Release build not published</button>}
                <div className="site-download-footnote">{href ? `Cutline ${APP_VERSION}` : 'Available after the first packaged release'}</div>
              </article>;
            })}
          </div>
          <div className="site-appimage-row"><span className="site-appimage-icon"><Package size={17} /></span><div><b>Prefer a portable Linux build?</b><span>The release workflow also publishes an AppImage for compatible distributions.</span></div>{DOWNLOAD_BASE ? <a href={`${DOWNLOAD_BASE}/Cutline-${APP_VERSION}-x64.AppImage`}>Get AppImage <ArrowRight size={14} /></a> : <span className="site-appimage-soon">Included in desktop releases</span>}</div>
          {!DOWNLOAD_BASE && <div className="site-release-notice"><Sparkles size={15} /><span>Installer links will activate when this project is published to GitHub and the first tagged release is built. The web editor can be opened right now.</span></div>}
        </section>

        <section className="site-bottom-cta"><div><div className="site-eyebrow">READY WHEN YOU ARE</div><h2>Make the next cut.</h2><p>Launch the browser editor and start with the media you already have.</p></div><a className="site-button site-button-primary" href="#/editor">Open Cutline <ArrowRight size={16} /></a></section>
      </main>

      <footer className="site-footer"><a className="site-brand site-footer-brand" href="#home"><span className="site-mark" aria-hidden="true"><i /><i /><i /></span><span>cutline</span></a><span>Video editing software for a focused workflow.</span><div className="site-footer-links"><a href="#features">Features</a><a href="#downloads">Downloads</a>{SOURCE_REPOSITORY && <a href={SOURCE_REPOSITORY} target="_blank" rel="noreferrer"><Code2 size={13} /> Source code</a>}</div><span className="site-footer-version">v{APP_VERSION}</span></footer>
    </div>
  );
}
