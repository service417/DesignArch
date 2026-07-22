import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../format.dart';
import '../state/session.dart';
import '../theme.dart';

/// One stage, and everything the signed-in person may do to it.
///
/// The action buttons are derived from the stage's status and the viewer's role,
/// mirroring the server's state machine. That is a convenience, never a control:
/// the server re-checks every rule, so a stale screen produces a clear refusal
/// rather than an illegal transition.
class StageDetailScreen extends StatefulWidget {
  const StageDetailScreen({super.key, required this.stageId});
  final String stageId;

  @override
  State<StageDetailScreen> createState() => _StageDetailScreenState();
}

class _StageDetailScreenState extends State<StageDetailScreen> {
  StageDetail? _detail;
  String? _error;
  bool _loading = true;
  bool _acting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final detail = await context.read<Session>().api.stage(widget.stageId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _error = null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  /// Runs a stage action, then re-reads from the server rather than guessing the
  /// new state — the version has moved and only the server knows where to.
  Future<void> _act(Future<void> Function() action, String successMessage) async {
    setState(() => _acting = true);
    try {
      await action();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(successMessage), behavior: SnackBarBehavior.floating),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        // The server's message explains the rule better than a paraphrase.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            backgroundColor: Theme.of(context).colorScheme.error,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 6),
          ),
        );
        await _load();
      }
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;

    return Scaffold(
      appBar: AppBar(title: Text(detail?.stage.jobCard.title ?? 'Stage')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      _Header(detail: detail!),
                      _Photos(detail: detail),
                      _PriceHistory(detail: detail),
                    ],
                  ),
                ),
      bottomNavigationBar: detail == null
          ? null
          : _Actions(
              detail: detail,
              busy: _acting,
              onAct: _act,
              onReload: _load,
            ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.detail});
  final StageDetail detail;

  @override
  Widget build(BuildContext context) {
    final stage = detail.stage;
    final scheme = Theme.of(context).colorScheme;
    final price = stage.acceptedPrice ?? stage.proposedPrice;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${stage.jobCard.project.name} · ${stage.jobCard.project.client}',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ),
                StatusChip(stage.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              stage.isCarpentry ? 'Carpentry' : 'Painting',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            if (stage.jobCard.description != null) ...[
              const SizedBox(height: 6),
              Text(stage.jobCard.description!),
            ],
            if (stage.assignee != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.person_outline, size: 16, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Text(stage.assignee!.name, style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
              ),
            ],
            if (stage.status == 'REJECTED' && stage.rejectionReason != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Rework needed',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: scheme.onErrorContainer,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      stage.rejectionReason!,
                      style: TextStyle(color: scheme.onErrorContainer),
                    ),
                  ],
                ),
              ),
            ],
            if (price != null) ...[
              const SizedBox(height: 14),
              Text(
                stage.acceptedPrice != null ? 'Agreed price' : 'Offered',
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
              ),
              Text(
                formatMinor(price),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 26),
              ),
            ],
            if (detail.earningStatus != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(
                    detail.earningStatus == 'PAID' ? Icons.check_circle : Icons.schedule,
                    size: 16,
                    color: detail.earningStatus == 'PAID'
                        ? const Color(0xFF1A6B45)
                        : scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Text(detail.earningStatus == 'PAID' ? 'Paid' : 'Awaiting payment'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Photos extends StatelessWidget {
  const _Photos({required this.detail});
  final StageDetail detail;

  @override
  Widget build(BuildContext context) {
    if (detail.photos.isEmpty) return const SizedBox.shrink();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Inspection photographs (${detail.photos.length})',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 120,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: detail.photos.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final photo = detail.photos[index];
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      // The signed URL is relative to the API origin.
                      '${ApiClient.baseUrl}${photo.url}',
                      width: 120,
                      height: 120,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        width: 120,
                        height: 120,
                        color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceHistory extends StatelessWidget {
  const _PriceHistory({required this.detail});
  final StageDetail detail;

  static const _labels = {
    'PROPOSED': 'Price offered',
    'REVISED': 'Price revised',
    'ACCEPTED': 'You accepted',
    'DECLINED': 'You declined',
  };

  @override
  Widget build(BuildContext context) {
    if (detail.pricingHistory.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Price history', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final event in detail.pricingHistory)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _labels[event.action] ?? event.action,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          if (event.reason != null)
                            Text(
                              '“${event.reason}”',
                              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                            ),
                          Text(
                            formatWhen(event.createdAt),
                            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    if (event.value != null)
                      Text(
                        formatMinor(event.value),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The action bar. What appears here is a function of status and role.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.detail,
    required this.busy,
    required this.onAct,
    required this.onReload,
  });

  final StageDetail detail;
  final bool busy;
  final Future<void> Function(Future<void> Function(), String) onAct;
  final Future<void> Function() onReload;

  @override
  Widget build(BuildContext context) {
    final session = context.read<Session>();
    final user = session.user;
    final api = session.api;
    final stage = detail.stage;
    if (user == null) return const SizedBox.shrink();

    final buttons = <Widget>[];

    if (user.isWorker && stage.assignee?.id == user.id) {
      switch (stage.status) {
        case 'ASSIGNED':
          buttons.add(FilledButton.icon(
            onPressed: busy ? null : () => onAct(() => api.startWork(stage.id, stage.version), 'Work started'),
            icon: const Icon(Icons.play_arrow),
            label: const Text('Start work'),
          ));
        case 'IN_PROGRESS':
          buttons.add(FilledButton.icon(
            onPressed: busy ? null : () => onAct(() => api.markReady(stage.id, stage.version), 'Sent for inspection'),
            icon: const Icon(Icons.check),
            label: const Text('Ready for inspection'),
          ));
        case 'REJECTED':
          buttons.add(FilledButton.icon(
            onPressed: busy ? null : () => onAct(() => api.resumeRework(stage.id, stage.version), 'Back in progress'),
            icon: const Icon(Icons.build),
            label: const Text('Resume rework'),
          ));
        case 'PRICE_PROPOSED':
          buttons.add(FilledButton.icon(
            onPressed: busy
                ? null
                : () async {
                    final confirmed = await _confirmAccept(context, stage.proposedPrice);
                    if (confirmed == true) {
                      await onAct(() => api.acceptPrice(stage.id, stage.version), 'Price accepted');
                    }
                  },
            icon: const Icon(Icons.check_circle),
            label: Text('Accept ${formatMinor(stage.proposedPrice)}'),
          ));
          buttons.add(OutlinedButton(
            onPressed: busy
                ? null
                : () async {
                    final reason = await _askReason(context, 'Decline this price', optional: true);
                    if (reason != null) {
                      await onAct(() => api.declinePrice(stage.id, stage.version, reason), 'Price declined');
                    }
                  },
            child: const Text('Decline'),
          ));
      }
    }

    if (user.isSupervisor && stage.status == 'READY_FOR_INSPECTION') {
      buttons.add(FilledButton.icon(
        onPressed: busy ? null : () => _capture(context, api, stage.id, onReload),
        icon: const Icon(Icons.photo_camera),
        label: Text(detail.photos.isEmpty ? 'Take inspection photo' : 'Add another photo'),
      ));

      // Approval is gated on evidence existing, exactly as the server is. A
      // disabled button that says why beats a button that fails.
      buttons.add(FilledButton.icon(
        onPressed: busy || detail.photos.isEmpty
            ? null
            : () => onAct(() => api.approve(stage.id, stage.version), 'Approved'),
        icon: const Icon(Icons.verified),
        label: Text(detail.photos.isEmpty ? 'Photo required to approve' : 'Approve'),
      ));

      buttons.add(OutlinedButton(
        onPressed: busy
            ? null
            : () async {
                final reason = await _askReason(context, 'Why is this being rejected?');
                if (reason != null && reason.trim().length >= 5) {
                  await onAct(() => api.reject(stage.id, stage.version, reason), 'Sent back for rework');
                }
              },
        child: const Text('Reject'),
      ));
    }

    if (buttons.isEmpty) return const SizedBox.shrink();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final button in buttons)
              Padding(padding: const EdgeInsets.only(top: 8), child: button),
          ],
        ),
      ),
    );
  }

  /// Accepting is irreversible and creates the earning, so it is confirmed with
  /// the amount spelled out.
  Future<bool?> _confirmAccept(BuildContext context, String? price) => showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Accept this price?'),
          content: Text(
            'You will be recorded as agreeing to ${formatMinor(price)} for this work. '
            'This cannot be undone.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Accept')),
          ],
        ),
      );

  Future<String?> _askReason(BuildContext context, String title, {bool optional = false}) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: optional ? 'Optional' : 'At least 5 characters',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }

  /// Camera first, gallery as a fallback — a supervisor on site is expected to
  /// photograph the work in front of them, but a phone without a working camera
  /// should not block an inspection.
  Future<void> _capture(
    BuildContext context,
    ApiClient api,
    String stageId,
    Future<void> Function() reload,
  ) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final picked = await ImagePicker().pickImage(
      source: source,
      // Keeps uploads under the server's 5 MB cap on a slow connection without
      // losing the detail that makes a photograph useful as evidence.
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (picked == null) return;

    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Uploading…'), behavior: SnackBarBehavior.floating),
    );

    try {
      await api.uploadPhoto(stageId, File(picked.path));
      await reload();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Photo added'), behavior: SnackBarBehavior.floating),
        );
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            backgroundColor: Theme.of(context).colorScheme.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}
