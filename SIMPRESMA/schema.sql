-- Database SIMPRESMA
CREATE DATABASE IF NOT EXISTS simpresma CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simpresma;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('mahasiswa','admin') NOT NULL DEFAULT 'mahasiswa',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    backend_id VARCHAR(120) NOT NULL UNIQUE,
    data LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
