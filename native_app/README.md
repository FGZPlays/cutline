# Cutline Native

This Flutter application is the native UI track for Cutline. It builds as a native Android APK and native Windows/Linux desktop bundles. It does not embed the Cutline website or load an iframe.

## Current native features

- Native responsive workspace for phones, tablets, Windows, and Linux.
- Import local video, audio, and image files using the platform file picker.
- Preview supported media locally.
- Play/pause, restart, and preview speed controls.
- Media bin and visual sequence-order panel; select or remove media items.

## Current limitations

This is an early native implementation, not feature parity with the existing web editor yet. The current native timeline is an ordered media list, not a full nonlinear multitrack timeline. Native trim/split editing, effect/keyframe parity, and final video export are not implemented here. The existing web editor remains available for those workflows while the native editor grows.

## Build locally

Install the Flutter stable SDK and the platform build dependencies, then:

```bash
cd native_app
flutter create --platforms=android,linux,windows --org com.cutline --project-name cutline_native .
flutter pub get
flutter run
```

Build an Android APK:

```bash
flutter build apk --release
```

Build Linux desktop on Linux:

```bash
flutter build linux --release
```

Build Windows desktop on Windows:

```bash
flutter build windows --release
```

The release workflow generates platform files, builds the APK and desktop bundles on their respective runners, and attaches the outputs to the versioned GitHub release.
