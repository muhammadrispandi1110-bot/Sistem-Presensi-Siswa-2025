# Panduan Penggunaan Sistem Presensi & Penilaian Digital
## SMAN 11 Makassar - Semester Ganjil 2026

Selamat datang di **Sistem Presensi Digital**. Aplikasi ini dirancang untuk membantu Bapak/Ibu Guru dalam mengelola kehadiran siswa, administrasi tugas, serta rekapitulasi nilai secara efisien dan profesional.

---

## 1. Akses Sistem (Login)
*   **Username**: `admin`
*   **Password**: `admin`

---

## 2. Deployment & Netlify
Aplikasi ini sudah dikonfigurasi untuk berjalan di **Netlify**. File `_redirects` telah disertakan untuk mencegah error 404 saat halaman di-refresh.

---

## 3. Cara Mendapatkan API Key Supabase
Bapak bisa menemukan kunci koneksi di:
1.  Buka **[Supabase Dashboard](https://supabase.com/dashboard)**.
2.  Pilih Project Bapak.
3.  Klik ikon **Settings (Gerigi ⚙️)** di pojok kiri bawah.
4.  Pilih menu **API**.
5.  Salin nilai berikut:
    *   **Project URL** -> Untuk `VITE_SUPABASE_URL`
    *   **anon public key** -> Untuk `VITE_SUPABASE_ANON_KEY`

---

## 4. Pengaturan Environment Variables (Netlify)
Masukkan kunci yang sudah disalin tadi ke Netlify:
1.  Buka **Netlify Dashboard** > Pilih situs Bapak.
2.  Pergi ke **Site configuration** > **Build & deploy** > **Environment variables**.
3.  Klik **Add a variable** dan masukkan dua kunci tersebut dengan nama yang tepat (Gunakan prefix `VITE_`).

---

## 5. Konfigurasi Database (SQL Editor)
Jalankan script berikut di menu **SQL Editor** Supabase:

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
  UNIQUE(student_id, date)
);
```

---
*Dibuat dengan dedikasi untuk kemajuan digitalisasi pendidikan di SMAN 11 Makassar.*