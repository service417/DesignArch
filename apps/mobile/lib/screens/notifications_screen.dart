import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../format.dart';
import '../state/session.dart';
import '../widgets/stage_card.dart';
import 'stage_detail_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<List<AppNotification>> _future;

  /// Plain language for each event. The enum names are for the wire.
  static const _text = {
    'STAGE_ASSIGNED': 'You have been given a new job',
    'READY_FOR_INSPECTION': 'Work is ready for inspection',
    'INSPECTION_APPROVED': 'Your work was approved',
    'INSPECTION_REJECTED': 'Your work needs rework',
    'PRICE_PROPOSED': 'A price has been offered',
    'PRICE_REVISED': 'The price has been revised',
    'PRICE_ACCEPTED': 'A price was accepted',
    'PRICE_DECLINED': 'A price was declined',
    'EARNING_PAID': 'You have been paid',
  };

  static const _icons = {
    'STAGE_ASSIGNED': Icons.assignment_ind_outlined,
    'READY_FOR_INSPECTION': Icons.fact_check_outlined,
    'INSPECTION_APPROVED': Icons.verified_outlined,
    'INSPECTION_REJECTED': Icons.report_problem_outlined,
    'PRICE_PROPOSED': Icons.local_offer_outlined,
    'PRICE_REVISED': Icons.edit_outlined,
    'PRICE_ACCEPTED': Icons.handshake_outlined,
    'PRICE_DECLINED': Icons.thumb_down_outlined,
    'EARNING_PAID': Icons.payments_outlined,
  };

  @override
  void initState() {
    super.initState();
    _future = context.read<Session>().api.notifications();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = context.read<Session>().api.notifications();
    });
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return FutureBuilder<List<AppNotification>>(
      future: _future,
      builder: (context, snapshot) {
        final items = snapshot.data ?? const <AppNotification>[];
        final unread = items.where((n) => !n.readFlag).length;

        return Column(
          children: [
            if (unread > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Text('$unread unread'),
                    const Spacer(),
                    TextButton(
                      onPressed: () async {
                        await context.read<Session>().api.markAllRead();
                        await _refresh();
                      },
                      child: const Text('Mark all read'),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refresh,
                child: switch (snapshot.connectionState) {
                  ConnectionState.waiting => const Center(child: CircularProgressIndicator()),
                  _ when snapshot.hasError => ListView(children: [
                      const SizedBox(height: 80),
                      EmptyState(
                        icon: Icons.cloud_off,
                        title: 'Could not load',
                        body: snapshot.error is ApiException
                            ? (snapshot.error as ApiException).message
                            : 'Pull down to try again.',
                      ),
                    ]),
                  _ when items.isEmpty => ListView(children: const [
                      SizedBox(height: 80),
                      EmptyState(
                        icon: Icons.notifications_none,
                        title: 'Nothing yet',
                        body: 'You will be told when work is assigned, inspected or priced.',
                      ),
                    ]),
                  _ => ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = items[index];
                        return ListTile(
                          leading: Icon(
                            _icons[item.eventType] ?? Icons.notifications_outlined,
                            color: item.readFlag ? scheme.outline : scheme.primary,
                          ),
                          title: Text(
                            _text[item.eventType] ?? item.eventType,
                            style: TextStyle(
                              fontWeight: item.readFlag ? FontWeight.w400 : FontWeight.w700,
                            ),
                          ),
                          subtitle: Text(formatWhen(item.createdAt)),
                          trailing: item.readFlag
                              ? null
                              : Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: scheme.primary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                          onTap: item.refType != 'stage'
                              ? null
                              : () async {
                                  await Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => StageDetailScreen(stageId: item.refId),
                                    ),
                                  );
                                  await _refresh();
                                },
                        );
                      },
                    ),
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
