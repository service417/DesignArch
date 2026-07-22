import 'package:flutter/material.dart';

/// A workshop tool, not a consumer app.
///
/// Large touch targets and high contrast: this is used on a phone with sawdust
/// on the screen, in a shed with variable light, often one-handed.
const seed = Color(0xFF7A4A1E);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: seed);

  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: const Color(0xFFF6F7F9),
    appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        // 52dp: comfortably above the 48dp minimum, for gloved hands.
        minimumSize: const Size.fromHeight(52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
    ),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
  );
}

/// Status colours grouped by what a status *means* to the person looking at it,
/// rather than nine arbitrary hues.
({Color bg, Color fg, String label}) statusChip(String status, ColorScheme scheme) {
  switch (status) {
    case 'ASSIGNED':
      return (bg: scheme.surfaceContainerHighest, fg: scheme.onSurfaceVariant, label: 'Not started');
    case 'IN_PROGRESS':
      return (bg: const Color(0xFFE7EFFA), fg: const Color(0xFF1F4D7A), label: 'In progress');
    case 'READY_FOR_INSPECTION':
      return (bg: const Color(0xFFFDF1DC), fg: const Color(0xFF8A5A00), label: 'Awaiting inspection');
    case 'APPROVED':
      return (bg: const Color(0xFFE6F3EC), fg: const Color(0xFF1A6B45), label: 'Approved');
    case 'REJECTED':
      return (bg: const Color(0xFFFBEAEA), fg: const Color(0xFFA32A2A), label: 'Needs rework');
    case 'PRICE_PROPOSED':
      return (bg: const Color(0xFFFDF1DC), fg: const Color(0xFF8A5A00), label: 'Price offered');
    case 'PRICE_DECLINED':
      return (bg: const Color(0xFFFBEAEA), fg: const Color(0xFFA32A2A), label: 'Price declined');
    case 'PRICE_ACCEPTED':
      return (bg: const Color(0xFFE6F3EC), fg: const Color(0xFF1A6B45), label: 'Price agreed');
    case 'COMPLETED':
      return (bg: const Color(0xFFE6F3EC), fg: const Color(0xFF1A6B45), label: 'Completed');
    default:
      return (bg: scheme.surfaceContainerHighest, fg: scheme.onSurfaceVariant, label: status);
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final chip = statusChip(status, Theme.of(context).colorScheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: chip.bg, borderRadius: BorderRadius.circular(999)),
      child: Text(
        chip.label,
        style: TextStyle(color: chip.fg, fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }
}
