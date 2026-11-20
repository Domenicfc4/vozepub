-- =========================================================
-- ESQUEMA DE BASE DE DATOS PARA CLOUDFLARE D1 (SQLite)
-- VozEPUB Pro - Autenticación y Límite de 1 Libro por Cuenta
-- =========================================================

-- Tabla de Usuarios (Soporta Correo/Contraseña y Google OAuth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  salt TEXT,
  name TEXT,
  provider TEXT DEFAULT 'email',
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Libros de Usuario (Regla: Máximo 1 libro activo por usuario)
CREATE TABLE IF NOT EXISTS user_books (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author TEXT DEFAULT 'Autor desconocido',
  file_key TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  progress_percent INTEGER DEFAULT 0,
  current_chapter INTEGER DEFAULT 0,
  current_paragraph INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON user_books(user_id);
