# 🚀 Panduan Deployment & Database Cloud (Netlify + Supabase)
## SMAN 11 Makassar - Sistem Presensi Digital 2026

Dokumen ini berisi langkah-langkah agar aplikasi Bapak bisa berjalan di internet (Netlify) dan menyimpan data secara permanen di Cloud (Supabase).

---

## 1. Persiapan Database (Supabase)
Aplikasi ini membutuhkan **Supabase** sebagai pengganti Excel/Penyimpanan Lokal. Skema di bawah ini menggunakan pendekatan relasional yang merupakan praktik terbaik untuk memastikan data terstruktur, efisien, dan mudah dikelola.

1.  Buka [Supabase.com](https://supabase.com/) dan buat proyek baru.
2.  Buka menu **SQL Editor** di panel kiri.
3.  Klik **New Query** dan tempel seluruh kode SQL di bawah ini, lalu klik **Run**:

```sql
-- SKEMA DATABASE RELASIONAL UNTUK APLIKASI PRESENSI

-- 1. Tabel untuk menyimpan daftar kelas
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    schedule INTEGER[] DEFAULT '{1,2,3,4,5}', -- Senin-Jumat
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "classes" IS 'Menyimpan data setiap kelas yang diajar.';

-- 2. Tabel untuk menyimpan data siswa, terhubung ke kelas
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nis TEXT,
    nisn TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "students" IS 'Menyimpan data siswa, setiap siswa terhubung ke satu kelas.';

-- 3. Tabel untuk menyimpan data tugas, terhubung ke kelas
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "assignments" IS 'Menyimpan data tugas yang diberikan untuk setiap kelas.';

-- 4. Tabel untuk menyimpan data nilai/pengumpulan tugas (submissions)
-- Ini menghubungkan siswa dan tugas
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    is_submitted BOOLEAN DEFAULT FALSE,
    score TEXT, -- Menggunakan TEXT agar fleksibel (misal: 100, A+, Tuntas)
    submitted_at TIMESTAMPTZ,
    UNIQUE(assignment_id, student_id) -- Pastikan satu siswa hanya bisa submit sekali per tugas
);
COMMENT ON TABLE "submissions" IS 'Mencatat status pengumpulan dan nilai setiap siswa untuk setiap tugas.';

-- 5. Tabel untuk menyimpan catatan absensi
CREATE TABLE attendance_records (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    status CHAR(1) NOT NULL CHECK (status IN ('H', 'S', 'I', 'A')), -- Hadir, Sakit, Izin, Alpa
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, record_date) -- Pastikan satu siswa hanya punya satu status per hari
);
COMMENT ON TABLE "attendance_records" IS 'Mencatat setiap status kehadiran harian siswa.';


-- AKTIFKAN KEAMANAN (ROW LEVEL SECURITY) & BUAT KEBIJAKAN AKSES
-- Kebijakan ini mengizinkan aplikasi untuk membaca dan menulis data di semua tabel.

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for classes" ON classes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for students" ON students FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for assignments" ON assignments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access for attendance" ON attendance_records FOR ALL USING (true) WITH CHECK (true);

```

---

## 2. Menghubungkan ke Netlify
Agar Netlify tahu alamat database Bapak, Bapak harus memasukkan "Kunci Pintu" (API Key) di pengaturan Netlify.

1.  Masuk ke dashboard **Netlify** Bapak.
2.  Pilih situs/site Bapak.
3.  Buka menu **Site Configuration** > **Environment variables**.
4.  Klik **Add a variable** dan masukkan dua kunci berikut:

| Key (Nama Variabel) | Value (Isi) |
| :--- | :--- |
| `VITE_SUPABASE_URL` | *Ambil dari Supabase: Project Settings > API > Project URL* |
| `VITE_SUPABASE_ANON_KEY` | *Ambil dari Supabase: Project Settings > API > `anon` `public` key* |

5.  **Penting**: Setelah mengisi, lakukan **Redeploy** (Deploy ulang) agar Netlify membaca kunci tersebut.

---

## 3. Cara Kerja Aplikasi
Versi aplikasi saat ini masih menggunakan penyimpanan tunggal berbasis JSON. Untuk dapat memanfaatkan skema database relasional di atas, **diperlukan refactoring (penyesuaian kode) pada file `App.tsx`** untuk membaca dan menulis data ke masing-masing tabel, bukan lagi ke satu file `app_storage`.

Langkah ini akan membuat aplikasi jauh lebih tangguh dan skalabel di masa depan.

---

## 4. Keamanan Data
*   **Username/Password**: Saat ini disetel `admin` / `admin`. Bapak bisa mengubahnya di file `config.ts`.
*   **Row Level Security**: Skrip SQL di atas sudah menyertakan kebijakan keamanan dasar yang mengizinkan aplikasi Bapak untuk mengakses data. Tanpa ini, Supabase akan memblokir semua permintaan.

---
*Dikembangkan untuk efisiensi administrasi guru SMAN 11 Makassar.*