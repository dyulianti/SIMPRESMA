<?php
session_start();
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

function send_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function require_login(): void
{
    if (empty($_SESSION['user'])) {
        send_json(['ok' => false, 'message' => 'Sesi login sudah habis. Silakan login ulang.'], 401);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    if (!is_array($data)) {
        send_json(['ok' => false, 'message' => 'Data tidak valid.'], 400);
    }
    return $data;
}

function normalize_record(array $record): array
{
    if (empty($record['__backendId'])) {
        $record['__backendId'] = 'simpresma-' . time() . '-' . bin2hex(random_bytes(6));
    }
    return $record;
}

function is_notification_record(array $record): bool
{
    return (($record['is_notification'] ?? false) === true) || (($record['type'] ?? '') === 'notification');
}

function resolve_record_table(array $record): string
{
    $sourceTable = $record['__sourceTable'] ?? '';
    if ($sourceTable === 'notifications' || $sourceTable === 'submissions') {
        return $sourceTable;
    }

    return is_notification_record($record) ? 'notifications' : 'submissions';
}

function fetch_submission_records(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT backend_id, data, created_at, updated_at FROM submissions ORDER BY id ASC');
    $records = [];
    foreach ($stmt->fetchAll() as $row) {
        $decoded = json_decode($row['data'], true);
        if (!is_array($decoded)) {
            continue;
        }
        $decoded['__backendId'] = $decoded['__backendId'] ?? $row['backend_id'];
        $decoded['__sourceTable'] = 'submissions';
        $decoded['__createdAt'] = $row['created_at'];
        $decoded['__updatedAt'] = $row['updated_at'];
        $records[] = $decoded;
    }

    return $records;
}

function fetch_notification_records(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT backend_id, recipient_username, notif_type, feedback, unread, source_backend_id, payload, created_at, updated_at FROM notifications ORDER BY id ASC');
    $records = [];
    foreach ($stmt->fetchAll() as $row) {
        $decoded = json_decode($row['payload'], true);
        if (!is_array($decoded)) {
            $decoded = [];
        }
        $decoded['__backendId'] = $decoded['__backendId'] ?? $row['backend_id'];
        $decoded['__sourceTable'] = 'notifications';
        $decoded['__createdAt'] = $row['created_at'];
        $decoded['__updatedAt'] = $row['updated_at'];
        $decoded['type'] = $decoded['type'] ?? 'notification';
        $decoded['is_notification'] = true;
        $decoded['submitted_by'] = $decoded['submitted_by'] ?? $row['recipient_username'];
        $decoded['notif_type'] = $decoded['notif_type'] ?? $row['notif_type'];
        $decoded['feedback'] = $decoded['feedback'] ?? $row['feedback'];
        $decoded['unread'] = (bool) ((int) $row['unread']);
        $decoded['source_backend_id'] = $decoded['source_backend_id'] ?? $row['source_backend_id'];
        if (empty($decoded['tanggal'])) {
            $decoded['tanggal'] = $row['created_at'];
        }
        $records[] = $decoded;
    }

    return $records;
}

require_login();

$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'list') {
        $data = array_merge(fetch_submission_records($pdo), fetch_notification_records($pdo));
        usort($data, static function (array $left, array $right): int {
            $leftTime = strtotime($left['__createdAt'] ?? $left['tanggal'] ?? 'now') ?: 0;
            $rightTime = strtotime($right['__createdAt'] ?? $right['tanggal'] ?? 'now') ?: 0;
            return $leftTime <=> $rightTime;
        });
        send_json(['ok' => true, 'data' => $data]);
    }

    if ($action === 'upload') {
        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
            send_json(['ok' => false, 'message' => 'File gambar belum dipilih.'], 400);
        }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                send_json(['ok' => false, 'message' => 'File terlalu besar. Kurangi ukuran gambar atau naikkan upload_max_filesize di PHP.'], 400);
            }
            send_json(['ok' => false, 'message' => 'Upload gagal. Coba pilih gambar lagi.'], 400);
        }
        if ($file['size'] > 5 * 1024 * 1024) {
            send_json(['ok' => false, 'message' => 'File terlalu besar (maksimal 5MB).'], 400);
        }

        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            send_json(['ok' => false, 'message' => 'File harus berupa gambar JPG/PNG.'], 400);
        }

        $mime = $imageInfo['mime'] ?? '';
        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
        ];
        if (!isset($extensions[$mime])) {
            send_json(['ok' => false, 'message' => 'Format file harus JPG atau PNG.'], 400);
        }

        $uploadDir = __DIR__ . '/uploads';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0777, true)) {
            send_json(['ok' => false, 'message' => 'Folder uploads tidak bisa dibuat.'], 500);
        }
        @chmod($uploadDir, 0777);
        if (!is_writable($uploadDir)) {
            send_json(['ok' => false, 'message' => 'Folder uploads belum bisa ditulis. Klik kanan folder uploads > Properties > hilangkan Read-only, atau beri permission write.'], 500);
        }

        $fileName = date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.' . $extensions[$mime];
        $target = $uploadDir . '/' . $fileName;
        if (!move_uploaded_file($file['tmp_name'], $target)) {
            send_json(['ok' => false, 'message' => 'Gagal menyimpan gambar ke server. Pastikan folder uploads bisa ditulis Apache/XAMPP.'], 500);
        }
        @chmod($target, 0644);

        send_json(['ok' => true, 'url' => 'uploads/' . $fileName]);
    }

    if ($action === 'create') {
        $record = normalize_record(read_json_body());
        if (is_notification_record($record)) {
            $recipient = trim((string) ($record['submitted_by'] ?? $record['recipient_username'] ?? ''));
            if ($recipient === '') {
                send_json(['ok' => false, 'message' => 'Penerima notifikasi tidak ditemukan.'], 400);
            }
            $stmt = $pdo->prepare('INSERT INTO notifications (backend_id, recipient_username, notif_type, feedback, unread, source_backend_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $record['__backendId'],
                $recipient,
                $record['notif_type'] ?? 'feedback',
                $record['feedback'] ?? '',
                !empty($record['unread']) ? 1 : 0,
                $record['source_backend_id'] ?? null,
                json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
            send_json(['ok' => true, 'data' => $record]);
        }

        $stmt = $pdo->prepare('INSERT INTO submissions (backend_id, data) VALUES (?, ?)');
        $stmt->execute([$record['__backendId'], json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
        send_json(['ok' => true, 'data' => $record]);
    }

    if ($action === 'update') {
        $record = read_json_body();
        if (empty($record['__backendId'])) {
            send_json(['ok' => false, 'message' => 'ID data tidak ditemukan.'], 400);
        }
        if (resolve_record_table($record) === 'notifications') {
            $recipient = trim((string) ($record['submitted_by'] ?? $record['recipient_username'] ?? ''));
            if ($recipient === '') {
                $recipient = 'unknown';
            }
            $stmt = $pdo->prepare('UPDATE notifications SET recipient_username = ?, notif_type = ?, feedback = ?, unread = ?, source_backend_id = ?, payload = ? WHERE backend_id = ?');
            $stmt->execute([
                $recipient,
                $record['notif_type'] ?? 'feedback',
                $record['feedback'] ?? '',
                !empty($record['unread']) ? 1 : 0,
                $record['source_backend_id'] ?? null,
                json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                $record['__backendId'],
            ]);
        } else {
            $stmt = $pdo->prepare('UPDATE submissions SET data = ? WHERE backend_id = ?');
            $stmt->execute([json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $record['__backendId']]);
        }
        send_json(['ok' => true, 'data' => $record]);
    }

    if ($action === 'delete') {
        $record = read_json_body();
        if (empty($record['__backendId'])) {
            send_json(['ok' => false, 'message' => 'ID data tidak ditemukan.'], 400);
        }
        if (resolve_record_table($record) === 'notifications') {
            $stmt = $pdo->prepare('DELETE FROM notifications WHERE backend_id = ?');
            $stmt->execute([$record['__backendId']]);
        } else {
            $stmt = $pdo->prepare('DELETE FROM submissions WHERE backend_id = ?');
            $stmt->execute([$record['__backendId']]);
        }
        send_json(['ok' => true]);
    }

    send_json(['ok' => false, 'message' => 'Aksi API tidak dikenal.'], 404);
} catch (Throwable $e) {
    send_json(['ok' => false, 'message' => 'Terjadi kesalahan server: ' . $e->getMessage()], 500);
}
