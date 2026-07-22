import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../api/models.dart';

/// Who is signed in, and the single place that decides it.
///
/// Deliberately thin: the API is the authority on identity and on every rule,
/// so this holds no cached business state that could drift from the server.
class Session extends ChangeNotifier {
  Session(this.api);

  final ApiClient api;

  AppUser? _user;
  bool _restoring = true;
  String? _error;

  AppUser? get user => _user;
  bool get restoring => _restoring;
  String? get error => _error;
  bool get signedIn => _user != null;

  /// On launch, try the stored token before showing the login screen — a worker
  /// should not have to sign in at the start of every shift.
  Future<void> restore() async {
    try {
      if (await api.accessToken != null) _user = await api.me();
    } catch (_) {
      // An expired or revoked session simply means "sign in again".
      await api.clearTokens();
      _user = null;
    } finally {
      _restoring = false;
      notifyListeners();
    }
  }

  Future<bool> signIn(String email, String password) async {
    _error = null;
    notifyListeners();

    try {
      final user = await api.login(email.trim(), password);

      if (user.role == 'ADMIN') {
        // Admins work from the web console. Saying so is more useful than
        // letting them in to a screen of empty queues and 403s.
        await api.clearTokens();
        _error = 'Administrators use the DesignArc web console, not this app.';
        notifyListeners();
        return false;
      }

      _user = user;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    await api.logout();
    _user = null;
    notifyListeners();
  }
}
