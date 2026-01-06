#  Deploy Aplikasi Presensi ke Netlify dengan Database Supabase
## Panduan Lengkap untuk SMAN 11 Makassar

Selamat datang, Bapak. Dokumen ini akan memandu Bapak secara **langkah-demi-langkah** untuk membuat aplikasi presensi ini berjalan online di internet (menggunakan Netlify) dan terhubung ke database cloud pribadi milik Bapak (menggunakan Supabase).

---

### **Langkah 1: Menyiapkan Database di Supabase**

Supabase akan menjadi "hard disk online" tempat semua data presensi, kelas, dan siswa disimpan secara aman.

1.  **Buat Akun & Proyek Baru**
    *   Buka [Supabase.com](https://supabase.com/) dan daftar atau login.
    *   Di halaman dashboard, klik **"New Project"**.
    *   Beri nama proyek (misal: `presensi-sman11`) dan buat password yang kuat. Simpan password ini.
    *   Pilih region server yang terdekat (misal: Southeast Asia/Singapore).
    *   Klik **"Create new project"** dan tunggu beberapa menit hingga proses selesai.

2.  **Menjalankan Skrip SQL untuk Membuat Tabel**
    *   Setelah proyek siap, cari menu **SQL Editor** di panel kiri (ikonnya seperti lembaran kertas dengan tulisan SQL).
    *   Klik **"+ New query"**.
    *   **Salin (copy) seluruh kode SQL** yang ada di bawah ini, lalu **tempel (paste)** ke dalam editor di Supabase.
    *   Klik tombol hijau **"RUN"**. Skrip ini akan secara otomatis membuat semua tabel yang dibutuhkan aplikasi. Skrip ini aman untuk dijalankan berkali-kali.

```sql
-- SKEMA DATABASE RELASIONAL UNTUK APLIKASI PRESENSI
-- Skrip ini aman untuk dijalankan berulang kali.

-- 1. Tabel untuk menyimpan daftar kelas
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    schedule INTEGER[] DEFAULT '{1,2,3,4,5}', -- Senin-Jumat
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "classes" IS 'Menyimpan data setiap kelas yang diajar.';

-- 2. Tabel untuk menyimpan data siswa, terhubung ke kelas
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nis TEXT,
    nisn TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "students" IS 'Menyimpan data siswa, setiap siswa terhubung ke satu kelas.';

-- 3. Tabel untuk menyimpan data tugas, terhubung ke kelas
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE "assignments" IS 'Menyimpan data tugas yang diberikan untuk setiap kelas.';

-- 4. Tabel untuk menyimpan data nilai/pengumpulan tugas (submissions)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    is_submitted BOOLEAN DEFAULT FALSE,
    score TEXT, -- Menggunakan TEXT agar fleksibel (misal: 100, A+, Tuntas)
    submitted_at TIMESTAMPTZ,
    UNIQUE(assignment_id, student_id)
);
COMMENT ON TABLE "submissions" IS 'Mencatat status pengumpulan dan nilai setiap siswa untuk setiap tugas.';

-- 5. Tabel untuk menyimpan catatan absensi
CREATE TABLE IF NOT EXISTS attendance_records (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    status CHAR(1) NOT NULL CHECK (status IN ('H', 'S', 'I', 'A')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, record_date)
);
COMMENT ON TABLE "attendance_records" IS 'Mencatat setiap status kehadiran harian siswa.';


-- AKTIFKAN KEAMANAN (ROW LEVEL SECURITY) & BUAT KEBIJAKAN AKSES
-- Pendekatan "DROP" lalu "CREATE" memastikan skrip bisa dijalankan ulang tanpa error.
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access for classes" ON classes;
CREATE POLICY "Public access for classes" ON classes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access for students" ON students;
CREATE POLICY "Public access for students" ON students FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access for assignments" ON assignments;
CREATE POLICY "Public access for assignments" ON assignments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access for submissions" ON submissions;
CREATE POLICY "Public access for submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access for attendance" ON attendance_records;
CREATE POLICY "Public access for attendance" ON attendance_records FOR ALL USING (true) WITH CHECK (true);
```

3.  **Simpan Kunci Akses (API Keys)**
    *   Ini adalah "kunci pintu" agar aplikasi bisa masuk ke database Bapak.
    *   Di panel kiri, klik ikon gerigi **Settings**.
    *   Pilih menu **API**.
    *   Di halaman ini, Bapak akan menemukan dua hal penting:
        1.  **Project URL**: Salin URL ini.
        2.  **Project API Keys**: Cari kunci yang berlabel `anon` dan `public`. **Salin (copy) kunci ini.**
    *   Simpan kedua informasi ini di Notepad untuk sementara, kita akan membutuhkannya di langkah berikutnya.

---

### **Langkah 2: Deploy Aplikasi ke Netlify**

Netlify adalah layanan yang akan mempublikasikan aplikasi Bapak ke internet.

1.  **Hubungkan Akun GitHub ke Netlify**
    *   Buka [Netlify.com](https://app.netlify.com/) dan login (disarankan menggunakan akun GitHub Bapak).
    *   Di dashboard, klik **"Add new site"** lalu pilih **"Import an existing project"**.
    *   Pilih **GitHub** sebagai provider.
    *   Cari dan pilih repository (proyek) aplikasi presensi Bapak.

2.  **Konfigurasi dan Deploy**
    *   Netlify biasanya akan otomatis mendeteksi pengaturan yang benar. Cukup pastikan pengaturannya sudah sesuai dan klik tombol **"Deploy site"**.
    *   Tunggu beberapa saat hingga Netlify selesai membangun dan mempublikasikan situs Bapak.

---

### **Langkah 3: Menghubungkan Netlify ke Supabase**

Sekarang, kita beritahu Netlify "kunci pintu" ke database Supabase yang sudah Bapak simpan tadi.

1.  **Buka Pengaturan Situs di Netlify**
    *   Di dashboard Netlify, klik situs yang baru saja Bapak deploy.
    *   Buka menu **Site configuration** > **Environment variables**.

2.  **Tambahkan Variabel**
    *   Klik **"Add a variable"** dan pilih **"Add a single variable"**.
    *   Buat dua variabel, satu per satu:

| Key (Nama Variabel)      | Value (Isi Variabel)                                   |
| :----------------------- | :----------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Tempel **Project URL** yang Bapak salin dari Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Tempel **Kunci `anon` `public`** yang Bapak salin.     |

3.  **Deploy Ulang (PENTING!)**
    *   Setelah menyimpan kedua variabel di atas, Netlify perlu membaca konfigurasi baru ini.
    *   Buka tab **"Deploys"** untuk situs Bapak.
    *   Klik tombol **"Trigger deploy"** dan pilih **"Deploy site"**.
    *   Tunggu hingga proses deploy selesai.

---

### **Langkah 4: Mengisi Data Awal Aplikasi**

Setelah deploy ulang selesai, aplikasi Bapak sudah online dan terhubung ke database. Namun, databasenya masih kosong.

1.  **Buka dan Login ke Aplikasi**
    *   Buka alamat situs Netlify Bapak (misal: `nama-situs-bapak.netlify.app`).
    *   Login menggunakan username dan password default:
        *   Username: `admin`
        *   Password: `admin`
        *   *(Bapak bisa mengubahnya nanti di file `config.ts`)*

2.  **Gunakan Fitur "Isi Data Awal"**
    *   Di dalam aplikasi, navigasi ke menu **Manajemen** (Admin).
    *   Pilih tab **Database**.
    *   Bapak akan melihat panel status "Terhubung ke Supabase Cloud". Di bawahnya, akan ada panel **"Isi Data Awal"**.
    *   Klik tombol **"Isi Database Dengan Data Awal"**.
    *   Konfirmasi tindakan tersebut. Aplikasi akan secara otomatis mengisi database kosong Bapak dengan daftar kelas dan siswa awal.

**Selesai!** Aplikasi presensi Bapak kini sudah sepenuhnya online, terhubung dengan database cloud, dan siap digunakan. Semua data yang Bapak masukkan akan tersimpan dengan aman di akun Supabase Bapak.