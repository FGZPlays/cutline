# Cutline

Cutline is one React + TypeScript video-editor codebase delivered in two experiences: a public GitHub Pages website with the browser editor, and a standalone Electron desktop application. `#/editor` opens the actual editor; `/` is the Cutline product and downloads page.

**Current editor scope:** Cutline is an early nonlinear editor, not yet a full Premiere Pro replacement. Read [`FEATURE_STATUS.md`](./FEATURE_STATUS.md) for tested, partial, and unfinished functionality. Browser export currently uses real-time MediaRecorder rather than a deterministic offline FFmpeg/WebCodecs renderer.

## Experiences and installers

| Target | Build output | Build command |
|---|---|---|
| Website / browser editor | `dist/` static website | `npm run build` |
| Windows 10+ x64 | `Cutline-Setup-0.4.1.exe` | `npm run dist:win` on Windows or the release workflow |
| Debian / Ubuntu x64 | `Cutline-0.4.1-amd64.deb` | `npm run dist:linux` on Linux or the release workflow |
| Fedora / RPM x64 | `Cutline-0.4.1-x86_64.rpm` | `npm run dist:linux` on Linux or the release workflow |
| Portable Linux x64 | `Cutline-0.4.1-x86_64.AppImage` | `npm run dist:linux` on Linux or the release workflow |

Release filenames include the package version. Update `package.json` and the release tag together.

## Requirements

- Node.js 22 or newer and npm for development/build tooling.
- Internet access for the initial npm dependency install and Electron runtime download.
- For Windows installers, build on a Windows runner. The included GitHub Actions workflow does this automatically.
- For Linux packages, build on a supported Linux runner. The GitHub Actions workflow uses Ubuntu to create `.deb`, `.rpm`, and AppImage artifacts.

## Run the web version locally

```bash
npm install
npm run dev:web
```

Vite prints the local URL (normally `http://localhost:5173`). The root route shows the Cutline website. Click **Open web editor**, or go directly to `http://localhost:5173/#/editor`.

To run the web version's production build locally:

```bash
npm run build
npm run preview
```

The static website/editor files are written to `dist/` and are published to GitHub Pages by the included GitHub Actions workflow. The Vite base path is relative so the same build can also be loaded from Electron's packaged `file://` URL.

## Run the standalone desktop app in development

```bash
npm install
npm run dev:desktop
```

This starts Vite on localhost and opens Electron directly into `#/editor`. The Electron shell enables context isolation and sandboxing, disables Node integration in the renderer, and opens external web links in the system browser.

## Build installers locally

On Windows x64:

```bash
npm install
npm run dist:win
```

On Linux x64 (Fedora, Ubuntu, or another supported Linux development system):

```bash
npm install
npm run dist:linux
```

Packaged files are written to `release/`. On Fedora, install a built RPM with `sudo dnf install ./release/Cutline-0.4.1-x86_64.rpm`. On Debian/Ubuntu, install a DEB with `sudo apt install ./release/Cutline-0.4.1-amd64.deb`. AppImage requires execute permission before first launch (`chmod +x ./release/Cutline-0.4.1-x86_64.AppImage`).

The Windows and Linux packages are built on their native CI runners by design. Avoid cross-building Windows from Fedora to claim a verified Windows installer; create a version tag and let GitHub Actions build each platform on its own runner.

## Publish the website and download releases

The v0.4.0 release attempt failed on Linux packaging because Debian/RPM metadata had no maintainer email. v0.4.1 adds the required package author and maintainer metadata. Push the matching v0.4.1 tag to build and publish a fresh release.

The repository includes two GitHub Actions workflows:

- `.github/workflows/site.yml` builds and deploys the website/editor to GitHub Pages on pushes to `main`, and refreshes the download links after a release is published. It checks whether a latest release exists so installer buttons remain disabled until real release files are available.
- `.github/workflows/release.yml` creates the Windows installer, Debian package, Fedora RPM, and Linux AppImage when a `v*` tag is pushed, then attaches them to a GitHub Release.

To activate them:

1. Open **Settings → Pages** in the GitHub repository and set **Build and deployment → Source** to **GitHub Actions**.
2. Push the website code to `main`; the Actions workflow builds and deploys the site.
3. Check `package.json` version (currently `0.4.1`), then create and push the matching release tag:

   ```bash
   git tag v0.4.1
   git push origin v0.4.1
   ```

4. Wait for the **Build Cutline desktop installers** workflow to finish successfully. It builds on Windows and Ubuntu runners and publishes release assets. The website is configured by CI to link to `https://github.com/OWNER/REPOSITORY/releases/latest/download` automatically using the actual repository name.

The browser download links remain disabled until the first non-draft, non-prerelease GitHub Release exists. GitHub Actions sets the website version, source repository, and release download base during each deployment, so no `.env` file or Netlify environment variables are required for the hosted GitHub Pages site.

## Testing

```bash
npm test
npm run build
```

The Node test runner checks timeline editing, effect processing, keyframe behavior, startup safeguards, route links, Electron packaging configuration, and GitHub Actions release targets. A successful unit test run is not the same as testing installers on every operating system; test generated Windows, Debian, and Fedora packages on their target platforms before announcing a public release.

## Basic editing workflow

1. Open `#/editor`, then click **Import** or drop supported video, audio, or image files into the workspace.
2. Drag a media item onto a compatible track. Double-click a media item to add it at the playhead.
3. Select clips to adjust transform, clip timing, audio, text, effects, and keyframes. Right-click inside the editor for Cutline's own contextual actions.
4. Use the blade tool or `S` to split at the playhead; drag clip edges to trim. Common editing actions are available in the menus and keyboard shortcuts.
5. Projects and imported media are persisted locally in IndexedDB. Export a project JSON for a portable timeline document; source media is not embedded in the JSON.
6. Use **Export** to record the program canvas in a format supported by the browser. Export is real-time and must remain in the foreground for best results.

## Important storage and synchronization note

The web app and desktop app use the same editor code and data model, but browser IndexedDB and Electron's local file-origin storage are separate stores. **Projects do not automatically sync between web and desktop.** Use project JSON export/import and keep the original media available to move projects between environments. No account or remote media upload backend is included.

## Browser and media limitations

- Media decoding depends on supported codecs in the active browser/Chromium runtime.
- Browser export uses MediaRecorder. WebM is the expected output in Chromium; MP4/H.264 is offered only if the browser reports that MIME type as supported.
- Export is a real-time recording, not a deterministic offline render. Very long or 4K sequences can be slow and memory-intensive.
- IndexedDB/project media use is subject to browser storage quotas and cleanup/eviction policies.
- Some CPU-intensive effects can slow real-time preview. Motion tracking, full grading scopes/LUT workflow, and deterministic offline rendering are unfinished.

## Privacy

Cutline does not include a media-upload endpoint. Imported files stay on the current device by default. Publishing the static website does not send footage to the web host; only normal page assets are downloaded. Clearing browser site data or removing local app data can delete saved projects/media, so keep project backups and original footage.
