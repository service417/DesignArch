import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../format.dart';
import '../state/session.dart';
import '../widgets/stage_card.dart';

/// A worker's month: what they earned, what has been paid, what is still owed.
///
/// Dated by when each earning arose — when the price was accepted — not by when
/// it was paid. A month's work is the work done in it; dating by payment would
/// shuffle an earning into the next month just because it was settled late.
class MonthlyReportScreen extends StatefulWidget {
  const MonthlyReportScreen({super.key});

  @override
  State<MonthlyReportScreen> createState() => _MonthlyReportScreenState();
}

class _MonthlyReportScreenState extends State<MonthlyReportScreen> {
  late Future<MonthlyReport> _future;
  DateTime _month = DateTime.now();

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<MonthlyReport> _load() {
    final label = '${_month.year}-${_month.month.toString().padLeft(2, '0')}';
    return context.read<Session>().api.monthlyReport(month: label);
  }

  void _shift(int months) {
    setState(() {
      _month = DateTime(_month.year, _month.month + months);
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isCurrentMonth =
        _month.year == DateTime.now().year && _month.month == DateTime.now().month;

    return Scaffold(
      appBar: AppBar(title: const Text('Monthly statement')),
      body: FutureBuilder<MonthlyReport>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final report = snapshot.data;
          if (report == null) {
            return EmptyState(
              icon: Icons.cloud_off,
              title: 'Could not load',
              body: snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Try again in a moment.',
            );
          }

          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.chevron_left),
                        onPressed: () => _shift(-1),
                        tooltip: 'Previous month',
                      ),
                      Expanded(
                        child: Text(
                          _monthLabel(_month),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                      ),
                      IconButton(
                        // No forward past the current month: there is nothing
                        // there, and an empty screen reads as a fault.
                        icon: const Icon(Icons.chevron_right),
                        onPressed: isCurrentMonth ? null : () => _shift(1),
                        tooltip: 'Next month',
                      ),
                    ],
                  ),
                ),
              ),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Earned this month', style: TextStyle(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Text(
                        formatMinor(report.earned),
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 16),
                      _Line(label: 'Paid', value: formatMinor(report.paid)),
                      _Line(label: 'Still owed', value: formatMinor(report.outstanding)),
                      _Line(label: 'Jobs completed', value: '${report.jobsCompleted}'),
                      const SizedBox(height: 14),
                      Text(
                        'Payment progress — ${report.paymentProgress}%',
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: report.paymentProgress / 100,
                          minHeight: 8,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              if (report.jobs.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: EmptyState(
                    icon: Icons.event_busy,
                    title: 'Nothing this month',
                    body: 'Earnings appear here once you accept a price for finished work.',
                  ),
                ),

              for (final job in report.jobs)
                Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Text(job.jobCardTitle,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(job.projectName),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatMinor(job.amount),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: job.isPaid
                                ? const Color(0xFFE6F3EC)
                                : const Color(0xFFFDF1DC),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            job.isPaid ? 'Paid' : 'Unpaid',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: job.isPaid
                                  ? const Color(0xFF1A6B45)
                                  : const Color(0xFF8A5A00),
                            ),
                          ),
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

String _monthLabel(DateTime month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${names[month.month - 1]} ${month.year}';
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
