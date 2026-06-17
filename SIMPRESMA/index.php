<?php
session_start();
require_once __DIR__ . '/db.php';

$loginMode = 'login';
$message = '';
$messageType = 'success';
$loggedIn = false;
$user = null;

if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_destroy();
    header('Location: index.php');
    exit;
}
if (isset($_SESSION['user'])) {
    $loggedIn = true;
    $user = $_SESSION['user'];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $loginMode = $_POST['mode'] ?? 'login';
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $role = $_POST['login-role'] ?? 'mahasiswa';

    if ($loginMode === 'register') {
        $email = trim($_POST['login-email'] ?? '');
        $confirmPassword = $_POST['login-confirm-password'] ?? '';
        if ($role !== 'mahasiswa') {
            $message = 'Hanya mahasiswa dapat membuat akun.';
            $messageType = 'error';
        } elseif ($email === '' || $username === '' || $password === '') {
            $message = 'Email, username, dan password harus diisi.';
            $messageType = 'error';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $message = 'Format email tidak valid.';
            $messageType = 'error';
        } elseif (strlen($password) < 4) {
            $message = 'Password minimal 4 karakter.';
            $messageType = 'error';
        } elseif ($password !== $confirmPassword) {
            $message = 'Password dan konfirmasi tidak cocok.';
            $messageType = 'error';
        } else {
            $check = $pdo->prepare('SELECT id FROM users WHERE username = ?');
            $check->execute([$username]);
            if ($check->fetch()) {
                $message = 'Username sudah terdaftar.';
                $messageType = 'error';
            } else {
                $insert = $pdo->prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)');
                $insert->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), 'mahasiswa']);
                $message = 'Akun berhasil dibuat. Silakan login.';
                $messageType = 'success';
                $loginMode = 'login';
            }
        }
    } else {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ? AND role = ?');
        $stmt->execute([$username, $role]);
        $row = $stmt->fetch();
        $valid = false;
        if ($row) {
            // Mendukung password ter-hash maupun plaintext (kompatibilitas data lama)
            if (password_verify($password, $row['password'])) {
                $valid = true;
            } elseif ($row['password'] === $password) {
                $valid = true;
                // upgrade ke hash
                $upd = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
                $upd->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
            }
        }
        if (!$valid) {
            $message = 'Username atau password salah.';
            $messageType = 'error';
        } else {
            $_SESSION['user'] = [
                'username' => $row['username'],
                'role' => $row['role'],
                'email' => $row['email'],
            ];
            header('Location: index.php');
            exit;
        }
    }
}
$serverUserJson = $loggedIn ? json_encode($user) : 'null';
$initialRegisterMode = $loginMode === 'register' ? 'true' : 'false';
?>
<!doctype html>
<html lang="id" class="h-full">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manajemen Prestasi & Kompetisi</title>
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script src="https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js"></script>
    <script src="/_sdk/element_sdk.js"></script>
    <script src="/_sdk/data_sdk.js"></script>
    <link
      href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="style.css" />
  </head>
  <body class="h-full bg-slate-900 text-slate-200 overflow-hidden">
    <div id="app" class="h-full w-full flex flex-col">
      <div
        id="login-screen"
        class="h-full w-full flex items-center justify-center login-screen-bg <?= $loggedIn ? 'hidden' : '' ?>"
      >
        <div class="glass rounded-2xl p-8 w-full max-w-md fade-in">
          <div class="text-center mb-8">
            <div
              class="w-16 h-16 mx-auto mb-4 rounded-xl btn-primary flex items-center justify-center"
            >
              <i data-lucide="trophy" class="w-8 h-8 text-white"></i>
            </div>
            <h1 class="text-2xl font-bold gradient-text" id="login-title">
              SIMPRESMA
            </h1>
            <p class="text-slate-400 mt-2 text-sm" id="login-univ">
              Universitas Lampung
            </p>
          </div>
          <?php if ($message !== ''): ?>
            <div class="mb-4 text-sm rounded-lg px-4 py-3 <?= $messageType === 'error' ? 'bg-red-600/10 text-red-300 border border-red-500/20' : 'bg-green-600/10 text-green-300 border border-green-500/20' ?>">
              <?= htmlspecialchars($message) ?>
            </div>
          <?php endif; ?>
          <form id="login-form" class="space-y-4" method="post" action="index.php">
            <input type="hidden" name="mode" id="login-mode" value="<?= htmlspecialchars($loginMode) ?>" />
            <div
              class="text-center text-sm text-slate-300"
              id="login-form-title"
            >
              <?= $loginMode === 'register' ? 'Daftar Akun Mahasiswa' : 'Masuk ke akun Anda' ?>
            </div>
            <div>
              <label
                for="login-role"
                class="block text-sm font-medium text-slate-300 mb-1"
                >Login Sebagai</label
              >
              <select
                id="login-role"
                name="login-role"
                class="w-full px-4 py-3 rounded-lg text-sm"
              >
                <option value="mahasiswa" <?= isset($_POST['login-role']) && $_POST['login-role'] === 'mahasiswa' ? 'selected' : '' ?>>Mahasiswa</option>
                <option value="admin" <?= isset($_POST['login-role']) && $_POST['login-role'] === 'admin' ? 'selected' : '' ?>>Admin</option>
              </select>
            </div>
            <div id="login-email-field" class="<?= $loginMode === 'register' ? '' : 'hidden' ?>">
              <label
                for="login-email"
                class="block text-sm font-medium text-slate-300 mb-1"
                >Email</label
              >
              <input
                type="email"
                id="login-email"
                name="login-email"
                value="<?= isset($_POST['login-email']) ? htmlspecialchars($_POST['login-email']) : '' ?>"
                placeholder="Masukkan email"
                class="w-full px-4 py-3 rounded-lg text-sm"
              />
            </div>
            <div>
              <label
                for="login-username"
                class="block text-sm font-medium text-slate-300 mb-1"
                >Username</label
              >
              <input
                type="text"
                id="login-username"
                name="username"
                value="<?= isset($_POST['username']) ? htmlspecialchars($_POST['username']) : '' ?>"
                placeholder="Masukkan username"
                class="w-full px-4 py-3 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label
                for="login-password"
                class="block text-sm font-medium text-slate-300 mb-1"
                >Password</label
              >
              <input
                type="password"
                id="login-password"
                name="password"
                placeholder="Masukkan password"
                class="w-full px-4 py-3 rounded-lg text-sm"
                required
              />
            </div>
            <div id="login-confirm-password-field" class="<?= $loginMode === 'register' ? '' : 'hidden' ?>">
              <label
                for="login-confirm-password"
                class="block text-sm font-medium text-slate-300 mb-1"
                >Konfirmasi Password</label
              >
              <input
                type="password"
                id="login-confirm-password"
                name="login-confirm-password"
                placeholder="Ulangi password"
                class="w-full px-4 py-3 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              id="login-submit-btn"
              class="w-full btn-primary text-white font-semibold py-3 rounded-lg text-sm"
            >
              <?= $loginMode === 'register' ? 'Buat Akun' : 'Masuk' ?>
            </button>
            <button
              type="button"
              id="toggle-register-btn"
              class="w-full mt-2 px-4 py-3 rounded-lg text-sm bg-slate-700/70 text-slate-200 hover:bg-slate-600 transition"
            >
              <?= $loginMode === 'register' ? 'Sudah Punya Akun? Login' : 'Buat Akun Mahasiswa' ?>
            </button>
          </form>
        </div>
      </div>
      <div id="main-app" class="h-full w-full <?= $loggedIn ? 'flex' : 'hidden' ?> flex">
        <aside
          id="sidebar"
          class="w-64 h-full bg-slate-800/80 border-r border-slate-700/50 flex flex-col shrink-0"
        >
          <div class="p-5 border-b border-slate-700/50">
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-lg btn-primary flex items-center justify-center"
              >
                <i data-lucide="trophy" class="w-5 h-5 text-white"></i>
              </div>
              <div>
                <h2 class="font-bold text-sm text-white" id="sidebar-title">
                  SIMPRESMA
                </h2>
                <p class="text-xs text-slate-400" id="user-role-label">
                  <?= $loggedIn ? ($user['role'] === 'admin' ? 'Admin' : 'Mahasiswa') : 'Mahasiswa' ?>
                </p>
              </div>
            </div>
            <div class="mt-4">
              <button
                id="theme-toggle-btn"
                class="w-full px-3 py-2 text-xs rounded-lg bg-slate-700/70 text-white hover:bg-slate-600 transition"
              >
                Mode Terang
              </button>
            </div>
          </div>
          <nav class="flex-1 py-3 overflow-auto" id="nav-menu"></nav>
          <div class="p-4 border-t border-slate-700/50">
            <button
              id="logout-btn"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition"
            >
              <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
            </button>
          </div>
        </aside>
        <main class="flex-1 h-full overflow-auto p-6" id="main-content"></main>
      </div>
      <div
        id="toast-container"
        class="fixed top-4 right-4 z-50 space-y-2"
      ></div>
    </div>
    <script>
      window.serverUser = <?= $serverUserJson ?>;
      window.initialRegisterMode = <?= $initialRegisterMode ?>;
    </script>
    <script src="script.js"></script>
  </body>
</html>
