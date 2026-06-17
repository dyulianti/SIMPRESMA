# SIMPRESMA - Setup Database

Login sekarang menggunakan database MySQL (data tersimpan permanen).

## Cara Pakai (XAMPP / Laragon)

1. Jalankan **Apache** dan **MySQL** di XAMPP.
2. Copy folder `SIMPRESMA` ke `htdocs` (mis. `C:\xampp\htdocs\SIMPRESMA`).
3. Buka browser ke `http://localhost/SIMPRESMA/index.php`.
4. Database `simpresma`, tabel `users`, tabel `submissions`, dan folder `uploads` akan dipakai otomatis.
5. Jika upload gambar gagal, pastikan folder `SIMPRESMA/uploads` bisa ditulis oleh Apache/XAMPP.

## Konfigurasi Database

Edit `db.php` jika perlu:

```php
$DB_HOST = '127.0.0.1';
$DB_PORT = '3306';
$DB_NAME = 'simpresma';
$DB_USER = 'root';
$DB_PASS = '';
```

## Akun Default

| Role      | Username | Password   |
| --------- | -------- | ---------- |
| Admin     | admin    | admin123   |
| Mahasiswa | student  | student123 |

Akun mahasiswa baru yang didaftar lewat form **Register** akan tersimpan ke tabel `users`.

## Perbaikan Upload Gambar

Upload sertifikat, foto kegiatan, KTM, dan poster sekarang disimpan sebagai file di folder `uploads/`, sementara data pengajuan tersimpan di tabel `submissions`. Notifikasi disimpan terpisah di tabel `notifications` supaya status baca, sumber notifikasi, dan timestamp tidak tercampur dengan data pengajuan biasa. Ini mencegah halaman berhenti di status **Mengirim...** karena browser penuh menyimpan gambar base64 di `localStorage`.

## Jika Masih Muncul “Mengirim...” Lama

Versi ini sudah diberi timeout dan pesan error. Pastikan:

1. Apache dan MySQL XAMPP menyala.
2. Buka lewat `http://localhost/SIMPRESMA/index.php`, bukan file HTML langsung.
3. Folder `SIMPRESMA/uploads` tidak read-only.
4. File gambar JPG/PNG maksimal 5MB. Konfigurasi `.user.ini` dan `.htaccess` sudah menaikkan limit PHP sampai 10MB.
