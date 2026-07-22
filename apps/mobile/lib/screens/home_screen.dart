import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../format.dart';
import '../state/session.dart';
import '../widgets/stage_card.dart';
import 'notifications_screen.dart';
import 'stage_detail_screen.dart';

/// The app's shell, routed by role.
///
/// A worker and a supervisor get genuinely different apps: a worker sees their
/// own jobs and what they are owed, a supervisor sees a shared inspection queue
/// and has no earnings at all. Building one screen with conditionals everywhere
/// would blur that, and the role separation is the whole point of the design.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user;
    if (user == null) return const SizedBox.shrink();

    final tabs = user.isSupervisor
        ? const [_InspectionQueue(), NotificationsScreen()]
        : const [_MyWork(), _MyEarnings(), NotificationsScreen()];

    final destinations = user.isSupervisor
        ? const [
            NavigationDestination(icon: Icon(Icons.fact_check_outlined), selectedIcon: Icon(Icons.fact_check), label: 'Inspect'),
            NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          ]
        : const [
            NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman), label: 'My work'),
            NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Earnings'),
            NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          ];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(user.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            Text(
              switch (user.role) {
                'CARPENTER' => 'Carpenter',
                'PAINTER' => 'Painter',
                'SUPERVISOR' => 'Supervisor',
                _ => user.role,
              },
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Sign out?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                  ],
                ),
              );
              if (confirmed == true && context.mounted) {
                await context.read<Session>().signOut();
              }
            },
          ),
        ],
      ),
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: destinations,
      ),
    );
  }
}

/// A worker's own jobs.
class _MyWork extends StatefulWidget {
  const _MyWork();

  @override
  State<_MyWork> createState() => _MyWorkState();
}

class _MyWorkState extends State<_MyWork> {
  late Future<List<Stage>> _future;
  bool _includeCompleted = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Stage>> _load() =>
      context.read<Session>().api.myStages(includeCompleted: _includeCompleted);

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Text('Show finished jobs'),
              const Spacer(),
              Switch(
                value: _includeCompleted,
                onChanged: (value) {
                  setState(() {
                    _includeCompleted = value;
                    _future = _load();
                  });
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: _StageList(
            future: _future,
            onRefresh: _refresh,
            empty: const EmptyState(
              icon: Icons.beach_access_outlined,
              title: 'Nothing assigned',
              body: 'When the office assigns you a job it will appear here.',
            ),
          ),
        ),
      ],
    );
  }
}

/// The supervisor's shared inspection queue.
class _InspectionQueue extends StatefulWidget {
  const _InspectionQueue();

  @override
  State<_InspectionQueue> createState() => _InspectionQueueState();
}

class _InspectionQueueState extends State<_InspectionQueue> {
  late Future<List<Stage>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Session>().api.awaitingInspection();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<Session>().api.awaitingInspection());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _StageList(
      future: _future,
      onRefresh: _refresh,
      showWorker: true,
      empty: const EmptyState(
        icon: Icons.done_all,
        title: 'Nothing to inspect',
        body: 'Work marked ready by a carpenter or painter appears here.',
      ),
    );
  }
}

class _StageList extends StatelessWidget {
  const _StageList({
    required this.future,
    required this.onRefresh,
    required this.empty,
    this.showWorker = false,
  });

  final Future<List<Stage>> future;
  final Future<void> Function() onRefresh;
  final Widget empty;
  final bool showWorker;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: FutureBuilder<List<Stage>>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            final error = snapshot.error;
            return ListView(
              children: [
                const SizedBox(height: 80),
                EmptyState(
                  icon: Icons.cloud_off,
                  title: 'Could not load',
                  body: error is ApiException ? error.message : 'Pull down to try again.',
                ),
              ],
            );
          }

          final stages = snapshot.data ?? const <Stage>[];
          // Still scrollable when empty, or pull-to-refresh would not work.
          if (stages.isEmpty) {
            return ListView(children: [const SizedBox(height: 80), empty]);
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 6),
            itemCount: stages.length,
            itemBuilder: (context, index) {
              final stage = stages[index];
              return StageCard(
                stage: stage,
                showWorker: showWorker,
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => StageDetailScreen(stageId: stage.id),
                    ),
                  );
                  // The stage may have moved while it was open.
                  await onRefresh();
                },
              );
            },
          );
        },
      ),
    );
  }
}

/// What a worker has earned and what is still owed.
class _MyEarnings extends StatefulWidget {
  const _MyEarnings();

  @override
  State<_MyEarnings> createState() => _MyEarningsState();
}

class _MyEarningsState extends State<_MyEarnings> {
  late Future<EarningsSummary> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Session>().api.myEarnings();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<Session>().api.myEarnings());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<EarningsSummary>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final summary = snapshot.data;
          if (summary == null) {
            return ListView(children: [
              const SizedBox(height: 80),
              EmptyState(
                icon: Icons.cloud_off,
                title: 'Could not load',
                body: snapshot.error is ApiException
                    ? (snapshot.error as ApiException).message
                    : 'Pull down to try again.',
              ),
            ]);
          }

          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Owed to you', style: TextStyle(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Text(
                        formatMinor(summary.unpaidTotal),
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Paid to date: ${formatMinor(summary.paidTotal)}',
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ),
              if (summary.earnings.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: EmptyState(
                    icon: Icons.savings_outlined,
                    title: 'No earnings yet',
                    body: 'An earning is recorded when you accept a price for finished work.',
                  ),
                ),
              for (final earning in summary.earnings)
                Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Text(
                      earning.jobCardTitle,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      '${earning.projectName}\n${earning.isPaid ? 'Paid ${formatDay(earning.paidAt)}' : 'Awaiting payment'}',
                    ),
                    isThreeLine: true,
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatMinor(earning.amount),
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        const SizedBox(height: 4),
                        Icon(
                          earning.isPaid ? Icons.check_circle : Icons.schedule,
                          size: 16,
                          color: earning.isPaid ? const Color(0xFF1A6B45) : scheme.outline,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
