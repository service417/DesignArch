import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

/// Thrown for any non-2xx response, carrying the API's own message.
///
/// The server writes these for people — "A stage in status 'APPROVED' cannot be
/// moved by 'ACCEPT_PRICE'" — so showing them verbatim beats inventing a vaguer
/// one on the client.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message, [this.code]);
  final int statusCode;
  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// The DesignArc API client.
///
/// In development the API is reached over an adb reverse tunnel:
///
///   adb reverse tcp:3000 tcp:3000
///
/// which maps the device's own localhost:3000 onto the host machine's port 3000.
/// That is preferred over the emulator's 10.0.2.2 host alias for two reasons: it
/// works identically on a physical phone plugged in over USB, and 10.0.2.2 is
/// served by the emulator's slirp stack on the radio interface — recent system
/// images (API 36) route through wlan0, where that alias is simply unreachable.
///
/// Point at a real deployment with:
///   flutter run --dart-define=API_BASE_URL=https://api.designarc.lk
class ApiClient {
  ApiClient({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static const _storage = FlutterSecureStorage();
  static const _accessKey = 'designarc.access';
  static const _refreshKey = 'designarc.refresh';

  final http.Client _http;

  /// Guards against a burst of 401s each starting its own refresh. The API
  /// rotates refresh tokens and revokes the whole family on reuse, so parallel
  /// refreshes would sign the user out mid-shift.
  Future<bool>? _refreshInFlight;

  Future<String?> get accessToken => _storage.read(key: _accessKey);

  Future<void> _saveTokens(String access, String refresh) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }

  Uri _uri(String path) => Uri.parse('$baseUrl/api/v1$path');

  Future<Map<String, String>> _headers({bool json = true}) async {
    final token = await accessToken;
    return {
      if (json) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// Runs a request, refreshing once and replaying it on a 401.
  Future<http.Response> _send(
    Future<http.Response> Function() attempt, {
    bool allowRetry = true,
  }) async {
    late http.Response response;
    try {
      response = await attempt();
    } on SocketException {
      // The most common failure on a workshop connection deserves a message
      // that says what to do, not "SocketException".
      throw ApiException(0, 'No connection to DesignArc. Check your network and try again.');
    }

    if (response.statusCode == 401 && allowRetry) {
      final refreshed = await (_refreshInFlight ??= _refresh());
      _refreshInFlight = null;
      if (refreshed) return _send(attempt, allowRetry: false);
    }

    return response;
  }

  Future<bool> _refresh() async {
    final refreshToken = await _storage.read(key: _refreshKey);
    if (refreshToken == null) return false;

    final response = await _http.post(
      _uri('/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );

    if (response.statusCode != 200) {
      await clearTokens();
      return false;
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    await _saveTokens(body['accessToken'] as String, body['refreshToken'] as String);
    return true;
  }

  Never _throwFor(http.Response response) {
    String message = 'Something went wrong.';
    String? code;
    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic>) {
        code = body['code'] as String?;
        final raw = body['message'];
        // Validation failures come back as a list of messages.
        message = raw is List ? raw.join('. ') : (raw as String? ?? message);
      }
    } catch (_) {
      // A non-JSON body (a proxy error page, say) leaves the default message.
    }
    throw ApiException(response.statusCode, message, code);
  }

  Future<dynamic> _decode(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return jsonDecode(response.body);
    }
    _throwFor(response);
  }

  Future<dynamic> get(String path) async =>
      _decode(await _send(() async => _http.get(_uri(path), headers: await _headers())));

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async => _decode(
        await _send(() async => _http.post(
              _uri(path),
              headers: await _headers(),
              body: jsonEncode(body ?? const {}),
            )),
      );

  // ------------------------------------------------------------------ auth

  Future<AppUser> login(String email, String password) async {
    final response = await _http.post(
      _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) _throwFor(response);

    final tokens = jsonDecode(response.body) as Map<String, dynamic>;
    await _saveTokens(tokens['accessToken'] as String, tokens['refreshToken'] as String);
    return me();
  }

  /// Identity from the server, never from decoding the JWT locally: the device
  /// cannot verify a signature, so anything read out of a token is only a claim.
  Future<AppUser> me() async => AppUser.fromJson(await get('/users/me') as Map<String, dynamic>);

  Future<void> logout() async {
    final refreshToken = await _storage.read(key: _refreshKey);
    await clearTokens();
    if (refreshToken == null) return;
    // Best effort: never let a failed revoke block signing out locally.
    try {
      await _http.post(
        _uri('/auth/logout'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
    } catch (_) {}
  }

  // ---------------------------------------------------------------- stages

  Future<List<Stage>> myStages({bool includeCompleted = false}) async {
    final data = await get('/stages/mine?includeCompleted=$includeCompleted') as List<dynamic>;
    return data.map((s) => Stage.fromJson(s as Map<String, dynamic>)).toList();
  }

  Future<List<Stage>> awaitingInspection() async {
    final data = await get('/stages/awaiting-inspection') as List<dynamic>;
    return data.map((s) => Stage.fromJson(s as Map<String, dynamic>)).toList();
  }

  Future<StageDetail> stage(String id) async =>
      StageDetail.fromJson(await get('/stages/$id') as Map<String, dynamic>);

  /// Every stage action carries `expectedVersion`, so a change made by someone
  /// else while this screen was open is rejected rather than silently
  /// overwritten. On a shared job that is the difference between a conflict the
  /// worker is told about and one nobody notices.
  /// Take the job on. Nothing can start until this happens.
  Future<void> acceptAssignment(String id, int version) =>
      post('/stages/$id/assignment/accept', {'expectedVersion': version});

  /// Hand the job back. Other workers' assignments on the same card are
  /// untouched; this one returns to the office for reassignment.
  Future<void> declineAssignment(String id, int version, String reason) =>
      post('/stages/$id/assignment/decline', {
        'expectedVersion': version,
        'reason': reason.trim(),
      });

  /// A supervisor's on-site confirmation that the work genuinely changed scope.
  /// Carries no amount: the office still sets the number.
  Future<void> confirmScopeChange(String id, int version, String reason) =>
      post('/stages/$id/scope-change', {
        'expectedVersion': version,
        'reason': reason.trim(),
      });

  Future<void> startWork(String id, int version) =>
      post('/stages/$id/start', {'expectedVersion': version});

  Future<void> markReady(String id, int version) =>
      post('/stages/$id/ready', {'expectedVersion': version});

  Future<void> resumeRework(String id, int version) =>
      post('/stages/$id/rework', {'expectedVersion': version});

  Future<void> approve(String id, int version) =>
      post('/stages/$id/approve', {'expectedVersion': version});

  Future<void> reject(String id, int version, String reason) =>
      post('/stages/$id/reject', {'expectedVersion': version, 'reason': reason});

  Future<void> acceptPrice(String id, int version) =>
      post('/stages/$id/price/accept', {'expectedVersion': version});

  Future<void> declinePrice(String id, int version, String? reason) => post(
        '/stages/$id/price/decline',
        {
          'expectedVersion': version,
          if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
        },
      );

  /// Upload inspection evidence. Multipart, so it does not go through `post`.
  Future<void> uploadPhoto(String stageId, File file) async {
    Future<http.Response> attempt() async {
      final request = http.MultipartRequest('POST', _uri('/stages/$stageId/photos'))
        ..headers.addAll(await _headers(json: false))
        ..files.add(await http.MultipartFile.fromPath('file', file.path));
      return http.Response.fromStream(await request.send());
    }

    final response = await _send(attempt);
    if (response.statusCode < 200 || response.statusCode >= 300) _throwFor(response);
  }

  /// The design files for a job card — the brief the work is done from.
  Future<List<DesignFile>> designFiles(String jobCardId) async {
    final data = await get('/job-cards/$jobCardId/attachments') as List<dynamic>;
    return data.map((f) => DesignFile.fromJson(f as Map<String, dynamic>)).toList();
  }

  // ------------------------------------------------------------ dashboards

  Future<WorkerHome> workerHome() async =>
      WorkerHome.fromJson(await get('/dashboard/worker') as Map<String, dynamic>);

  Future<SupervisorSummary> supervisorHome() async =>
      SupervisorSummary.fromJson(await get('/dashboard/supervisor') as Map<String, dynamic>);

  Future<MonthlyReport> monthlyReport({String? month}) async => MonthlyReport.fromJson(
        await get('/dashboard/worker/monthly${month == null ? '' : '?month=$month'}')
            as Map<String, dynamic>,
      );

  // -------------------------------------------------------------- earnings

  Future<EarningsSummary> myEarnings() async =>
      EarningsSummary.fromJson(await get('/earnings') as Map<String, dynamic>);

  // --------------------------------------------------------- notifications

  Future<List<AppNotification>> notifications() async {
    final data = await get('/notifications') as List<dynamic>;
    return data.map((n) => AppNotification.fromJson(n as Map<String, dynamic>)).toList();
  }

  Future<int> unreadCount() async {
    final data = await get('/notifications/unread-count') as Map<String, dynamic>;
    return data['unread'] as int;
  }

  Future<void> markAllRead() => post('/notifications/read-all');
}
