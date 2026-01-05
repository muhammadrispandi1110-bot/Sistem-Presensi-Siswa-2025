
# Panduan Penggunaan Sistem Presensi & Penilaian Digital
## SMAN 11 Makassar - Semester Ganjil 2026

Aplikasi ini menggunakan sistem **Single Row JSON Sync** untuk memastikan data Kelas, Siswa, Tugas, dan Nilai selalu sinkron antar perangkat tanpa konflik database yang rumit.

---

## 1. Akses Sistem (Login)
*   **Username**: `admin` (Dapat diubah di `config.ts`)
*   **Password**: `admin` (Dapat diubah di `config.ts`)

---

## 2. Persiapan Database (PENTING)
Agar data tersimpan secara permanen di awan, Bapak harus membuat tabel berikut di Supabase:

1.  Buka **[Supabase Dashboard](https://supabase.com/dashboard)**.
2.  Pilih Project Bapak.
3.  Klik menu **SQL Editor**.
4.  Klik **New Query** dan tempel kode berikut, lalu klik **Run**:

```sql
CREATE TABLE app_storage (
  id TEXT PRIMARY KEY,
  classes JSONB NOT NULL DEFAULT '[]',
  attendance JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matikan RLS atau buat policy agar aplikasi bisa menulis data
ALTER TABLE app_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON app_storage FOR ALL USING (true) WITH CHECK (true);
```

---

## 3. Menghubungkan ke Netlify
1.  Dapatkan **URL** dan **Anon Key** dari menu **Settings > API** di Supabase.
2.  Masukkan ke Netlify Environment Variables:
    *   `VITE_SUPABASE_URL` = [URL Bapak]
    *   `VITE_SUPABASE_ANON_KEY` = [Anon Key Bapak]
3.  Deploy ulang aplikasi.

---

## 4. Status Koneksi
Perhatikan titik di samping nama sekolah:
*   ⚪ **Abu-abu**: Mode Lokal (Data hanya tersimpan di browser ini).
*   🟢 **Hijau**: Mode Cloud (Data tersimpan aman di Supabase).

---
*Dibuat untuk kemajuan digitalisasi SMAN 11 Makassar.*
