import 'package:intl/intl.dart';

/// Money on the workshop floor.
///
/// The API sends amounts as strings because they are integer minor units (LKR
/// cents) held in BigInt on the server. Parsing one into a Dart `int` would be
/// safe up to 2^63, but `double` would not be — and a rounding error here is a
/// worker being paid the wrong amount. So amounts stay in BigInt and never
/// become a floating-point number at any point.
String formatMinor(String? minor) {
  if (minor == null || minor.isEmpty) return '—';

  final value = BigInt.tryParse(minor);
  if (value == null) return '—';

  final negative = value.isNegative;
  final absolute = negative ? -value : value;

  final rupees = absolute ~/ BigInt.from(100);
  final cents = (absolute % BigInt.from(100)).toString().padLeft(2, '0');
  final grouped = rupees.toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ',',
      );

  return '${negative ? '-' : ''}LKR $grouped.$cents';
}

/// Timestamps are stored UTC and shown in Asia/Colombo, per the architecture
/// decision. `toLocal()` is correct here because the device is in Colombo; a
/// deployment outside Sri Lanka would need an explicit zone conversion.
String formatWhen(String? iso) {
  if (iso == null) return '—';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return '—';
  return DateFormat('d MMM y, HH:mm').format(parsed.toLocal());
}

String formatDay(String? iso) {
  if (iso == null) return '—';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return '—';
  return DateFormat('d MMM y').format(parsed.toLocal());
}

/// How long something has been waiting, for queue screens.
String howLong(String? iso) {
  if (iso == null) return '';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return '';

  final elapsed = DateTime.now().difference(parsed.toLocal());
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m';
  if (elapsed.inHours < 24) return '${elapsed.inHours}h';
  return '${elapsed.inDays}d';
}
