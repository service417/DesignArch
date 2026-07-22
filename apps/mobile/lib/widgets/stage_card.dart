import 'package:flutter/material.dart';

import '../api/models.dart';
import '../format.dart';
import '../theme.dart';

/// One stage in a list.
///
/// Shows the offered price on the card itself. The worker's whole question on
/// their queue screen is "what am I being offered?", and making them open each
/// stage to find out would be a round trip per row on a workshop connection.
class StageCard extends StatelessWidget {
  const StageCard({super.key, required this.stage, required this.onTap, this.showWorker = false});

  final Stage stage;
  final VoidCallback onTap;
  final bool showWorker;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final price = stage.acceptedPrice ?? stage.proposedPrice;
    final awaitingDecision = stage.status == 'PRICE_PROPOSED';

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      stage.jobCard.title,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                  ),
                  StatusChip(stage.status),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${stage.jobCard.project.name} · ${stage.isCarpentry ? 'Carpentry' : 'Painting'}',
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
              ),

              if (showWorker && stage.assignee != null) ...[
                const SizedBox(height: 2),
                Text(
                  stage.assignee!.name,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
              ],

              if (stage.status == 'REJECTED' && stage.rejectionReason != null) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: scheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    stage.rejectionReason!,
                    style: TextStyle(color: scheme.onErrorContainer, fontSize: 13),
                  ),
                ),
              ],

              if (price != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Text(
                      formatMinor(price),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                        color: awaitingDecision ? scheme.primary : scheme.onSurface,
                      ),
                    ),
                    const Spacer(),
                    if (awaitingDecision)
                      Text(
                        'Tap to accept or decline',
                        style: TextStyle(color: scheme.primary, fontSize: 12, fontWeight: FontWeight.w600),
                      )
                    else
                      Text(
                        howLong(stage.updatedAt),
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                  ],
                ),
              ] else ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (stage.photoCount > 0) ...[
                      Icon(Icons.photo_camera, size: 14, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(
                        '${stage.photoCount}',
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                      const SizedBox(width: 12),
                    ],
                    const Spacer(),
                    Text(
                      howLong(stage.updatedAt),
                      style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A consistent empty state — a blank screen reads as a bug.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: scheme.outline),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 4),
            Text(
              body,
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
