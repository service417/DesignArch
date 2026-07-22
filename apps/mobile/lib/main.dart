import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/client.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/session.dart';
import 'theme.dart';

void main() {
  runApp(const DesignArcApp());
}

class DesignArcApp extends StatelessWidget {
  const DesignArcApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => Session(ApiClient())..restore(),
      child: MaterialApp(
        title: 'DesignArc',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();

    // Without this the login screen would flash on every launch while the
    // stored token is being checked.
    if (session.restoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return session.signedIn ? const HomeScreen() : const LoginScreen();
  }
}
