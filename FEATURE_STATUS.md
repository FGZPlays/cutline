# Cutline feature status

Status definitions: **Implemented** means present in source and connected to the UI; **Tested** means an automated test or manual browser test was actually run; **Partial** means usable but limited; **Not implemented** means do not treat the feature as available.

## Website and desktop distribution (0.4.1)

| Feature | Status | Notes |
|---|---|---|
| Public Cutline website | Implemented | `src/Site.tsx` provides the root page with web-editor entry and platform download cards. Actual installer links remain disabled in a local build without `VITE_RELEASE_DOWNLOAD_BASE`. |
| In-page web editor route | Implemented | `#/editor` mounts the existing React editor; the wordmark takes users back to the website. Browser and editor share the same built bundle. |
| Electron desktop shell | Implemented in source; package untested | Opens the editor in a standalone window, disables renderer Node integration, and enables context isolation/sandboxing. It has not been manually launched here. |
| Windows `.exe` installer | Built in failed v0.4.0 workflow; not published | NSIS packaging succeeded, but no GitHub Release was created because the Linux matrix job failed. New v0.4.1 release run pending. |
| Debian / Ubuntu `.deb` | Fix committed; new build pending | v0.4.0 failed because electron-builder requires author/maintainer email metadata. v0.4.1 adds this metadata. |
| Fedora `.rpm` | Fix committed; new build pending | Should proceed after the v0.4.1 author/maintainer metadata fix; not yet verified. |
| Linux AppImage | Built during failed v0.4.0 workflow; not published | Packaging proceeded to the DEB target, then Linux job failed. v0.4.1 rerun pending. |
| GitHub Pages deployment | Deployed successfully | The latest website build and Pages deployment workflow completed successfully; desktop download publishing is separate. |
| Automated versioned releases | Workflow configured; not run | The `v0.4.0` release build failed on Linux because the package author email was missing, so the publish job was skipped. Version `0.4.1` adds author/maintainer metadata; push tag `v0.4.1` to build and publish installers. |
| Cross-device project synchronization | Not implemented | Web IndexedDB and Electron local-file-origin storage are separate. Export/import the project JSON and keep the source media available to move projects manually. |

## Core editing

| Feature | Status | Notes |
|---|---|---|
| React + TypeScript + Vite application | Implemented in source | `npm run dev:web` opens the website; `#/editor` opens the editor. React render errors show a readable error panel rather than a blank page. Full browser startup/build needs npm dependencies installed. |
| Cutline-owned right-click menus | Implemented | Custom menus for clips, media items, tracks, and empty editor/timeline areas; browser context menus are prevented inside the editor surface. Not manually browser-tested in this environment. |
| Local video/audio/image import | Implemented | Depends on browser decoding support; files stay local. |
| Asset metadata and thumbnails | Partial | Duration/dimensions and image/video thumbnail; no contact sheet or proxy workflow. |
| Audio waveform display | Partial | Peaks generated via Web Audio for supported files under a size limit. |
| Multi-track timeline | Implemented | Video and audio tracks; add more tracks when required. |
| Drag clips to move | Implemented | Snapping can be toggled. Moving a linked clip moves its partner. |
| Trim clip start/end | Implemented | Source in-point follows left trims. |
| Split clips | Implemented | Uses playhead; linked clips are split together in the common case. |
| Ripple delete | Partial | Ripple closes gaps on the deleted clip's track; linked partner removal is supported, cross-track ripple alignment needs more work. |
| Copy/cut/paste | Implemented | In-app clipboard supports a selected clip and linked partner via keyboard shortcuts. |
| Track lock, mute, visibility | Implemented | Track state is reflected in the preview/audio playback. |
| Resizable panels | Implemented | Drag the column separators and timeline divider; keyboard arrows also adjust focused separators. |
| Undo/redo | Implemented | In-memory history for project editing; history is not persisted across reloads. |
| Markers | Partial | Add and seek to markers; marker editing/deletion UI is not complete. |
| Keyboard shortcuts | Partial | Common transport, split, tool, save, undo/redo, duplicate, delete, and frame-step shortcuts. |
| Sequence settings | Implemented | Width, height, frame rate, background color. |

## Preview, effects, and titles

| Feature | Status | Notes |
|---|---|---|
| Source monitor | Implemented | Native browser source controls for video/audio; image preview for image sources. |
| Program monitor | Implemented | Canvas compositing of active visual clips; browser playback accuracy varies with decoder behavior. |
| Per-clip/layer processing | Implemented | Each visual clip has an offscreen canvas layer. Effects run on that layer before it is composited over lower tracks, and the same `drawFrame` renderer is used by preview and browser-recorded export. Applying an effect now switches to Properties so users see and can adjust the applied effect immediately. |
| Transform: position, scale, rotation, opacity | Implemented | Canvas transforms and opacity; keyframes supported for transform values. |
| Brightness, contrast, saturation, hue, exposure, grayscale, sepia, invert, blur | Implemented | Canvas `filter` pipeline; exact support depends on browser Canvas filter support. |
| Gamma, temperature, tint, posterize, threshold, film grain | Implemented | Pixel-buffer processing. Grain uses randomized noise and therefore is not deterministic between renders. |
| Sharpen | Implemented | CPU convolution on the layer pixel buffer; can be slow at full HD/4K. |
| Vignette, drop shadow, horizontal/vertical flip | Implemented | Applied per clip layer. |
| Crop | Partial | Clears pixels on each edge using percentage controls; does not perform a full Premiere-style crop/reframe workflow with anchor/scale controls. |
| Chroma key | Partial | Real RGB-distance alpha key and softness. No spill suppression, edge refinement, or production-quality matte. |
| Fade-in/fade-out, cross dissolve, directional wipes | Implemented | Clip-local animation rendered into the preview and recording export. These are effect-based transitions, not draggable transition items with handles on the timeline. A dissolve needs lower-track content under the clip to reveal it. |
| Slide-in, zoom-in, spin-in presets | Implemented | Animated layer transform presets with editable duration/distance/scale/turns. Numeric effect parameters can be keyframed per effect instance. |
| Editable title overlay | Implemented | Text, font, size, fill, outline, shadow; rendered as an editable clip. Advanced shape/graphics tools are not included. |
| Effect parameter keyframes | Implemented | Each effect instance gets a unique keyframe namespace, so two instances of the same effect can animate separately. Legacy type-based parameter keyframes remain readable. |
| Keyframe interpolation | Implemented | Linear and ease curves for transform/opacity and numeric effect parameters. Effect duration controls are not keyframeable. |
| Effect controls | Implemented | Numeric parameters have editable number fields and continuous sliders. Slider gestures are grouped into one undo step. Common filter defaults are non-neutral so adding an effect produces an immediately visible change; transition/motion effects remain time-local. |
| Effects ordering | Partial | CSS filters compose in effect-list order; custom pixel effects run afterward as a group, followed by crop/wipe, vignette, and pixelation. Mixed processing types do not yet follow a strict serial effect-stack order. |
| LUTs, RGB curves, color wheels, scopes, lens correction, optical flow, advanced masks | Not implemented | These require additional image-processing and editor tooling. |

## Audio, tracking, and export

| Feature | Status | Notes |
|---|---|---|
| Synchronized audio clip playback | Partial | Master timeline clock synchronizes media elements, with drift correction; high-precision sync needs browser testing. |
| Per-clip audio gain and track mute | Implemented | Uses HTMLMediaElement gain for preview and MediaRecorder export graph. |
| Audio pan and gain keyframes | Partial | Preview uses a Web Audio stereo panner and gain/volume automation; keyframed pan is applied in preview, while export panning currently uses the base pan value. |
| Audio fades and crossfades | Partial | Per-clip fade-in/fade-out envelopes are supported; crossfades and dedicated mixing controls remain unfinished. |
| Canvas video export with progress/cancel | Partial | Real-time MediaRecorder capture; supported container/codecs depend on browser. |
| Export output verification by reopening/decoding | Not tested | Needs a real browser integration test. |
| WebCodecs / FFmpeg.wasm offline renderer | Not implemented | Current export is real-time canvas capture. |
| Motion tracking and tracking-path correction | Not implemented | No tracking placeholder is exposed in the UI. |
| IndexedDB project/media persistence | Implemented | Browser quota can limit storage; source Blobs stored separately from project JSON. |
| Portable project JSON + relinking by filename | Partial | JSON excludes media by design; import original files to restore matching missing asset IDs. |
| Automated timeline/effect/distribution tests | Tested | Node built-in test runner: 31/31 passed, including pixel-buffer processing, timeline operations, keyframes, route wiring, packaging targets, desktop wrapper hardening, and release workflow structure. |
| End-to-end browser/audio/export tests | Not implemented | Requires browser automation and representative media fixtures. |
| Full Vite production build | Not tested | Dependency installation timed out in this environment. TS/TSX syntax transpilation passed, but the strict typecheck cannot be considered successful: React and Lucide declarations are unavailable until dependencies are installed. The complete Vite build still requires `npm install` locally. |

## Latest fixes (0.4.0) — website and desktop packaging

- Added Cutline-owned context menus for clips, media, tracks, and timeline/workspace backgrounds; the native browser menu is suppressed inside the editor surface, and menu items invoke the same editor actions as the toolbar/keyboard commands.
- Changed effect application to show the clip's Properties/Applied Effects panel right away. Applying an effect to a selected source asset now creates an actual timeline clip and attaches the effect instead of silently refusing because no timeline clip is selected.
- Added slider controls for numeric effect parameters and one-step undo grouping while dragging a slider.
- Changed default values for common filters so users can see the effect immediately, then fine-tune it. Effects are applied to the selected timeline clip or, when a Project-panel source is selected, to a new timeline clip.
- Added automatic browser opening to `npm run dev` and a Fedora-friendly `start-cutline.sh` launcher. Added a React error boundary that displays render errors rather than leaving a blank content area.
- The Node core and distribution suites pass 31/31 tests. TS/TSX syntax transpilation, Node syntax checks, shell syntax, `package.json` parsing, and icon file existence checks pass. A full TypeScript typecheck, Vite production build, Electron startup, and real installer build remain unverified because npm registry access failed with `EAI_AGAIN` before dependencies could be installed.

## Known engineering follow-ups

1. Replace real-time `MediaRecorder` export with a deterministic offline render pipeline using WebCodecs where available and FFmpeg.wasm or an explicit backend fallback.
2. Move compositing and pixel effects to a worker/OffscreenCanvas; cache processed frames and provide preview-quality scaling for expensive pixel effects.
3. Implement trim bounds against source duration, frame-accurate snapping, strict effect-stack ordering, draggable transition handles/items, and complete audio graph/panning/gain automation.
4. Add automatic recovery snapshots, project history serialization, asset relink dialog, storage quota warnings, and media deletion/cleanup controls.
5. Add Playwright-based browser coverage using generated sample video/audio, verify the output file is decodable, and compare rendered frame pixels for effects.
6. Implement actual computer-vision tracking and tracking-loss/manual-correction UX before exposing motion tracking.
