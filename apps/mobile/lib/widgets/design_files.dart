import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../state/session.dart';

/// The design files for a job card, as a horizontal carousel.
///
/// This is the brief a worker builds from, so it sits on the job screen for
/// everyone — not just the office. The count is in the heading because knowing
/// there are five drawings rather than one changes how you read the job.
class DesignFiles extends StatefulWidget {
  const DesignFiles({super.key, required this.jobCardId});
  final String jobCardId;

  @override
  State<DesignFiles> createState() => _DesignFilesState();
}

class _DesignFilesState extends State<DesignFiles> {
  late Future<List<DesignFile>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Session>().api.designFiles(widget.jobCardId);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DesignFile>>(
      future: _future,
      builder: (context, snapshot) {
        // While the first load is in flight, show nothing rather than flashing an
        // empty state that a moment later fills with files.
        if (snapshot.connectionState != ConnectionState.done) {
          return const SizedBox.shrink();
        }

        final files = snapshot.data ?? const <DesignFile>[];
        final scheme = Theme.of(context).colorScheme;

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.folder_open, size: 18, color: scheme.primary),
                    const SizedBox(width: 8),
                    Text(
                      'Design files (${files.length})',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Always shown, even when empty: a worker needs to be able to tell
                // "there are no drawings for this job" apart from "the section did
                // not load". A bare screen answers neither.
                if (files.isEmpty)
                  Text(
                    'No drawings or photos have been attached to this job yet.',
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                  )
                else
                  SizedBox(
                    height: 140,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: files.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (context, index) => _FileTile(file: files[index]),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({required this.file});
  final DesignFile file;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      width: 120,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () async {
              // A PDF has no useful in-app preview without a viewer package, and
              // the phone's own is better than anything worth bundling. Images
              // open full-screen in place.
              final url = Uri.parse('${ApiClient.baseUrl}${file.url}');
              if (file.isPdf) {
                await launchUrl(url, mode: LaunchMode.externalApplication);
              } else if (context.mounted) {
                await showDialog<void>(
                  context: context,
                  // A dark, edge-to-edge backdrop so the drawing is the whole
                  // screen — tap anywhere to dismiss, pinch to zoom into detail.
                  barrierColor: Colors.black87,
                  builder: (dialogContext) => GestureDetector(
                    onTap: () => Navigator.pop(dialogContext),
                    child: Stack(
                      children: [
                        Center(
                          child: InteractiveViewer(
                            maxScale: 5,
                            child: Image.network(url.toString(), fit: BoxFit.contain),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 32,
                          child: Text(
                            file.filename,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }
            },
            borderRadius: BorderRadius.circular(8),
            child: file.isPdf
                ? Container(
                    width: 120,
                    height: 100,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.picture_as_pdf, size: 36, color: scheme.primary),
                  )
                : ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      '${ApiClient.baseUrl}${file.url}',
                      width: 120,
                      height: 100,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        width: 120,
                        height: 100,
                        color: scheme.surfaceContainerHighest,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  ),
          ),
          const SizedBox(height: 6),
          Text(
            file.filename,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
