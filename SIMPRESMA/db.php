<?php
// Konfigurasi koneksi database MySQL
// Ubah sesuai pengaturan server Anda (XAMPP/Laragon default: root tanpa password)
$DB_HOST = '127.0.0.1';
$DB_PORT = '3306';
$DB_NAME = 'simpresma';
$DB_USER = 'root';
$DB_PASS = '';

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;port=$DB_PORT;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    // Buat database jika belum ada
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$DB_NAME` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$DB_NAME`");

    // Buat tabel users jika belum ada
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            email VARCHAR(150) NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('mahasiswa','admin') NOT NULL DEFAULT 'mahasiswa',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Seed akun default jika tabel masih kosong
    $count = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($count === 0) {
        $stmt = $pdo->prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)");
        $stmt->execute(['admin',   'admin@example.com',   password_hash('admin123',   PASSWORD_DEFAULT), 'admin']);
        $stmt->execute(['student', 'student@example.com', password_hash('student123', PASSWORD_DEFAULT), 'mahasiswa']);
    }

    // Buat tabel pengajuan jika belum ada. Data formulir dan path gambar disimpan permanen di database.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            backend_id VARCHAR(120) NOT NULL UNIQUE,
            data LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
        // Tabel notifikasi dipisahkan agar status baca dan waktu notifikasi tersimpan rapi.
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                backend_id VARCHAR(120) NOT NULL UNIQUE,
                recipient_username VARCHAR(100) NOT NULL,
                notif_type ENUM('approved','rejected','feedback') NOT NULL DEFAULT 'feedback',
                feedback TEXT NOT NULL,
                unread TINYINT(1) NOT NULL DEFAULT 1,
                source_backend_id VARCHAR(120) DEFAULT NULL,
                payload LONGTEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_notifications_recipient_unread (recipient_username, unread),
                INDEX idx_notifications_source (source_backend_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
} catch (PDOException $e) {
    die('Koneksi database gagal: ' . htmlspecialchars($e->getMessage()));
}
