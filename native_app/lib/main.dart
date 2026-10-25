import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  runApp(const CutlineApp());
}

const ink = Color(0xFF101316);
const panel = Color(0xFF191D22);
const raised = Color(0xFF222830);
const line = Color(0xFF343B44);
const accent = Color(0xFFB8D9C4);
const textMain = Color(0xFFE8ECEF);
const textMuted = Color(0xFF9AA5AF);

class CutlineApp extends StatelessWidget {
  const CutlineApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Cutline',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: ink,
      colorScheme: ColorScheme.fromSeed(seedColor: accent, brightness: Brightness.dark),
      useMaterial3: true,
      fontFamily: 'Inter',
      appBarTheme: const AppBarTheme(backgroundColor: ink, foregroundColor: textMain, elevation: 0),
      cardTheme: CardThemeData(color: panel, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: line))),
    ),
    home: const EditorHome(),
  );
}

class MediaClip {
  MediaClip(this.path) : name = path.split(Platform.pathSeparator).last;
  final String path;
  final String name;
  String get extension => name.contains('.') ? name.split('.').last.toUpperCase() : 'MEDIA';
}

class EditorHome extends StatefulWidget {
  const EditorHome({super.key});
  @override
  State<EditorHome> createState() => _EditorHomeState();
}

class _EditorHomeState extends State<EditorHome> {
  final Player _player = Player();
  late final VideoController _videoController = VideoController(_player);
  final List<MediaClip> _clips = [];
  int _selected = -1;
  double _speed = 1;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _importMedia() async {
    setState(() { _busy = true; _error = null; });
    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        type: FileType.custom,
        allowedExtensions: ['mp4','mov','mkv','webm','avi','m4v','mp3','wav','aac','m4a','flac','png','jpg','jpeg','webp'],
      );
      if (result != null) {
        final incoming = result.files.where((f) => f.path != null).map((f) => MediaClip(f.path!)).toList();
        if (incoming.isNotEmpty && mounted) {
          setState(() { _clips.addAll(incoming); _selected = _clips.length - 1; });
          await _openClip(_selected);
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not import media: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openClip(int index) async {
    if (index < 0 || index >= _clips.length) return;
    setState(() { _selected = index; _error = null; });
    try {
      await _player.open(Media(_clips[index].path));
      await _player.setRate(_speed);
    } catch (e) {
      if (mounted) setState(() => _error = 'This media could not be previewed: $e');
    }
  }

  Future<void> _removeClip(int index) async {
    final wasSelected = index == _selected;
    setState(() {
      _clips.removeAt(index);
      if (_clips.isEmpty) _selected = -1;
      else if (index < _selected) _selected--;
      else if (wasSelected) _selected = index.clamp(0, _clips.length - 1).toInt();
    });
    if (_selected >= 0 && (wasSelected || _clips.isNotEmpty)) {
      await _openClip(_selected);
    } else {
      await _player.stop();
    }
  }

  Future<void> _setSpeed(double value) async {
    setState(() => _speed = value);
    await _player.setRate(value);
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 850;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: raised, border: Border.all(color: line), borderRadius: BorderRadius.circular(8)), child: const Icon(Icons.graphic_eq_rounded, size: 19, color: accent)),
          const SizedBox(width: 11),
          const Text('cutline', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.7)),
          const SizedBox(width: 10),
          const Text('NATIVE EDITOR', style: TextStyle(color: textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
          const Spacer(),
          if (!Platform.isAndroid) _pill(Platform.isWindows ? 'WINDOWS' : Platform.isLinux ? 'LINUX' : 'DESKTOP'),
        ]),
      ),
      body: SafeArea(child: Padding(
        padding: EdgeInsets.all(wide ? 20 : 12),
        child: Column(children: [
          _topBar(),
          const SizedBox(height: 14),
          Expanded(child: wide ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(width: 245, child: _mediaPanel()),
            const SizedBox(width: 14),
            Expanded(child: _previewPanel()),
          ]) : Column(children: [
            Expanded(flex: 6, child: _previewPanel()),
            const SizedBox(height: 12),
            Expanded(flex: 5, child: _mediaPanel()),
          ])),
          const SizedBox(height: 14),
          SizedBox(height: wide ? 220 : 190, child: _timelinePanel()),
        ]),
      )),
    );
  }

  Widget _topBar() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
    decoration: BoxDecoration(color: panel, border: Border.all(color: line), borderRadius: BorderRadius.circular(12)),
    child: Row(children: [
      const Icon(Icons.movie_creation_outlined, color: accent, size: 19),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Untitled sequence', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(_clips.isEmpty ? 'Import footage to start a project' : '${_clips.length} media item${_clips.length == 1 ? '' : 's'} in this session', style: const TextStyle(fontSize: 11, color: textMuted)),
      ])),
      if (!Platform.isAndroid) OutlinedButton.icon(onPressed: _importMedia, icon: const Icon(Icons.add, size: 17), label: const Text('Import media')),
      if (Platform.isAndroid) IconButton.filled(onPressed: _importMedia, icon: const Icon(Icons.add_rounded), tooltip: 'Import media'),
    ]),
  );

  Widget _mediaPanel() => _panel(
    title: 'MEDIA BIN',
    trailing: IconButton(onPressed: _busy ? null : _importMedia, icon: const Icon(Icons.add_rounded, size: 19), tooltip: 'Import media'),
    child: _clips.isEmpty
      ? Center(child: Padding(padding: const EdgeInsets.all(22), child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 46, height: 46, decoration: BoxDecoration(color: raised, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.video_library_outlined, color: textMuted)),
          const SizedBox(height: 12),
          const Text('Your media starts here', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 5),
          const Text('Add video, audio or image files from your device.', textAlign: TextAlign.center, style: TextStyle(color: textMuted, fontSize: 11, height: 1.5)),
          const SizedBox(height: 13),
          FilledButton.tonal(onPressed: _busy ? null : _importMedia, child: Text(_busy ? 'Opening…' : 'Import files')),
        ])))
      : ListView.separated(
          padding: const EdgeInsets.all(8),
          itemCount: _clips.length,
          separatorBuilder: (_, __) => const SizedBox(height: 5),
          itemBuilder: (context, i) {
            final clip = _clips[i];
            final active = i == _selected;
            return InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => _openClip(i),
              child: Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(color: active ? const Color(0xFF29372F) : Colors.transparent, border: Border.all(color: active ? const Color(0xFF64856E) : Colors.transparent), borderRadius: BorderRadius.circular(8)),
                child: Row(children: [
                  Container(width: 36, height: 36, decoration: BoxDecoration(color: raised, borderRadius: BorderRadius.circular(6)), child: Icon(_mediaIcon(clip.extension), size: 17, color: active ? accent : textMuted)),
                  const SizedBox(width: 9),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(clip.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(clip.extension, style: const TextStyle(color: textMuted, fontSize: 9, letterSpacing: .7)),
                  ])),
                  IconButton(visualDensity: VisualDensity.compact, onPressed: () => _removeClip(i), icon: const Icon(Icons.close, size: 15), tooltip: 'Remove'),
                ]),
              ),
            );
          },
        ),
  );

  Widget _previewPanel() => _panel(
    title: 'PREVIEW MONITOR',
    trailing: _pill(_selected >= 0 ? _clips[_selected].extension : 'NO MEDIA'),
    child: Column(children: [
      Expanded(child: Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        decoration: BoxDecoration(color: const Color(0xFF080A0C), border: Border.all(color: line), borderRadius: BorderRadius.circular(8)),
        clipBehavior: Clip.antiAlias,
        child: _selected < 0
          ? const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.play_circle_outline_rounded, size: 40, color: Color(0xFF59636E)), SizedBox(height: 8), Text('Preview appears here', style: TextStyle(color: textMuted, fontSize: 12))]))
          : Stack(fit: StackFit.expand, children: [
              Video(controller: _videoController, fit: BoxFit.contain),
              Positioned(left: 12, bottom: 12, child: _pill(_clips[_selected].name)),
            ]),
      )),
      Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 12), child: Row(children: [
        IconButton.filledTonal(onPressed: _selected < 0 ? null : () => _player.seek(Duration.zero), icon: const Icon(Icons.replay_rounded, size: 18), tooltip: 'Restart'),
        const SizedBox(width: 5),
        StreamBuilder<bool>(stream: _player.stream.playing, initialData: false, builder: (context, snap) => IconButton.filled(onPressed: _selected < 0 ? null : () => snap.data == true ? _player.pause() : _player.play(), icon: Icon(snap.data == true ? Icons.pause_rounded : Icons.play_arrow_rounded), tooltip: 'Play / pause')),
        const SizedBox(width: 12),
        const Text('SPEED', style: TextStyle(fontSize: 9, color: textMuted, letterSpacing: 1, fontWeight: FontWeight.w700)),
        const SizedBox(width: 7),
        DropdownButton<double>(value: _speed, underline: const SizedBox.shrink(), isDense: true, items: const [
          DropdownMenuItem(value: .25, child: Text('0.25×')),
          DropdownMenuItem(value: .5, child: Text('0.5×')),
          DropdownMenuItem(value: 1, child: Text('1×')),
          DropdownMenuItem(value: 1.5, child: Text('1.5×')),
          DropdownMenuItem(value: 2, child: Text('2×')),
        ], onChanged: (v) { if (v != null) _setSpeed(v); }),
        const Spacer(),
        StreamBuilder<Duration>(stream: _player.stream.position, initialData: Duration.zero, builder: (context, snap) => Text(_time(snap.data ?? Duration.zero), style: const TextStyle(color: textMuted, fontSize: 10))),
      ])),
    ]),
  );

  Widget _timelinePanel() => _panel(
    title: 'SEQUENCE TIMELINE',
    trailing: Row(mainAxisSize: MainAxisSize.min, children: [_pill('V1'), _pill('A1'), const SizedBox(width: 7), Text('${_clips.length} CLIPS', style: const TextStyle(color: textMuted, fontSize: 9, letterSpacing: 1))]),
    child: _clips.isEmpty
      ? const Center(child: Text('Import media, then select a clip to preview it.', style: TextStyle(color: textMuted, fontSize: 11)))
      : Column(children: [
          Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), child: Row(children: [
            const Icon(Icons.vertical_align_center_rounded, size: 14, color: textMuted),
            const SizedBox(width: 7),
            const Text('MEDIA ORDER', style: TextStyle(fontSize: 9, letterSpacing: 1, color: textMuted, fontWeight: FontWeight.w700)),
            const Spacer(),
            const Text('Select a block to preview', style: TextStyle(fontSize: 9, color: textMuted)),
          ])),
          Expanded(child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 3, 12, 12),
            itemCount: _clips.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final clip = _clips[i];
              final active = i == _selected;
              return InkWell(
                onTap: () => _openClip(i),
                borderRadius: BorderRadius.circular(7),
                child: Container(
                  width: 180,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: active ? const Color(0xFF29372F) : const Color(0xFF20262D), border: Border.all(color: active ? const Color(0xFF82B194) : line), borderRadius: BorderRadius.circular(7)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [Icon(_mediaIcon(clip.extension), size: 14, color: active ? accent : textMuted), const SizedBox(width: 6), Expanded(child: Text(clip.extension, style: const TextStyle(color: textMuted, fontSize: 9, letterSpacing: .7))), Text('${i + 1}'.padLeft(2, '0'), style: const TextStyle(color: textMuted, fontSize: 9))]),
                    const Spacer(),
                    Text(clip.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Container(height: 4, decoration: BoxDecoration(color: active ? accent : const Color(0xFF607D6B), borderRadius: BorderRadius.circular(3))),
                  ]),
                ),
              );
            },
          )),
        ]),
  );

  Widget _panel({required String title, required Widget child, Widget? trailing}) => Container(
    decoration: BoxDecoration(color: panel, border: Border.all(color: line), borderRadius: BorderRadius.circular(12)),
    clipBehavior: Clip.antiAlias,
    child: Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(13, 8, 8, 8), child: Row(children: [
        Text(title, style: const TextStyle(fontSize: 9, color: textMuted, letterSpacing: 1.2, fontWeight: FontWeight.w800)),
        const Spacer(),
        if (trailing != null) trailing,
      ])),
      const Divider(height: 1, color: line),
      Expanded(child: child),
    ]),
  );

  Widget _pill(String value) => Container(
    constraints: const BoxConstraints(maxWidth: 180),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(color: raised, border: Border.all(color: line), borderRadius: BorderRadius.circular(5)),
    child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 8, color: textMuted, fontWeight: FontWeight.w700, letterSpacing: .6)),
  );

  IconData _mediaIcon(String ext) {
    if (['MP4','MOV','MKV','WEBM','AVI','M4V'].contains(ext)) return Icons.movie_outlined;
    if (['MP3','WAV','AAC','M4A','FLAC'].contains(ext)) return Icons.audiotrack_rounded;
    return Icons.image_outlined;
  }

  String _time(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.inMinutes)}:${two(d.inSeconds % 60)}';
  }
}
