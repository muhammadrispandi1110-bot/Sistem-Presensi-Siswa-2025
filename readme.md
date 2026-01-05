# Panduan Penggunaan Sistem Presensi & Penilaian Digital
## SMAN 11 Makassar - Semester Ganjil 2026

Selamat datang di **Sistem Presensi Digital**. Aplikasi ini dirancang untuk membantu Bapak/Ibu Guru dalam mengelola kehadiran siswa, administrasi tugas, serta rekapitulasi nilai secara efisien dan profesional.

---

## 1. Akses Sistem (Login)
Untuk menjaga keamanan data, aplikasi dilindungi oleh sistem login:
*   **Username**: `admin`
*   **Password**: `admin`

---

## 2. Deployment & Netlify
Aplikasi ini sudah dikonfigurasi untuk berjalan di **Netlify**. File `_redirects` telah disertakan untuk mencegah error 404 saat halaman di-refresh.

---

## 3. Konfigurasi Supabase (SQL Editor)
Jika Bapak ingin menggunakan database cloud dari Supabase, silakan buat project baru di [supabase.com](https://supabase.com) dan jalankan script berikut di menu **SQL Editor**:

```sql
-- 1. Tabel Kelas
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Siswa
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  nis TEXT,
  nisn TEXT,
  name TEXT NOT NULL,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Absensi
CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('H', 'S', 'I', 'A')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date)
);

-- 4. Tabel Tugas
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Pengumpulan/Nilai
CREATE TABLE submissions (
  id BIGSERIAL PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  is_submitted BOOLEAN DEFAULT FALSE,
  score TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);
```

---

## 4. Fitur Unggulan
*   **Impor Massal CSV**: Tambah daftar siswa sekaligus via file Excel/CSV.
*   **Ekspor Excel**: Unduh rekap absensi dan nilai tugas langsung ke format `.csv` (Excel).
*   **Laporan Siap Cetak**: Format laporan resmi dengan kolom tanda tangan kepala sekolah dan wali kelas.

---
*Dibuat dengan dedikasi untuk kemajuan digitalisasi pendidikan di SMAN 11 Makassar.*