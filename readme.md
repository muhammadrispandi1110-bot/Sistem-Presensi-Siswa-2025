# 🚀 Panduan Deployment & Database Cloud (Netlify + Supabase)
## SMAN 11 Makassar - Sistem Presensi Digital 2026

Dokumen ini berisi langkah-langkah agar aplikasi Bapak bisa berjalan di internet (Netlify) dan menyimpan data secara permanen di Cloud (Supabase).

---

## 1. Persiapan Database (Supabase)
Aplikasi ini membutuhkan **Supabase** sebagai pengganti Excel/Penyimpanan Lokal.

1.  Buka [Supabase.com](https://supabase.com/) dan buat proyek baru.
2.  Buka menu **SQL Editor** di panel kiri.
3.  Klik **New Query** dan tempel kode SQL berikut, lalu klik **Run**:

```sql
-- Membuat tabel penyimpanan utama
CREATE TABLE IF NOT EXISTS app_storage (
  id TEXT PRIMARY KEY,
  classes JSONB NOT NULL DEFAULT '[]',
  attendance JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mengizinkan akses baca/tulis tanpa login database yang rumit (RLS Public)
ALTER TABLE app_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Akses Publik" ON app_storage FOR ALL USING (true) WITH CHECK (true);
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

## 3. Cara Kerja Sistem Cloud-Only
Aplikasi ini sudah dimodifikasi untuk bekerja sebagai berikut:

*   **Tanpa LocalStorage**: Data tidak akan tertinggal di komputer/HP. Begitu Bapak Logout, memori bersih.
*   **Auto-Sync**: Setiap kali Bapak mengubah kehadiran atau nilai, aplikasi menunggu 1 detik (saat Bapak berhenti mengetik) lalu mengirim data ke Supabase.
*   **Indikator Header**: 
    *   `🟢 Tersimpan di Cloud`: Data aman di server.
    *   `🟡 Menyimpan...`: Sedang proses upload.
    *   `🔴 Offline/Error`: Koneksi internet terputus atau API Key salah.

---

## 4. Keamanan Data
*   **Username/Password**: Saat ini disetel `admin` / `admin`. Bapak bisa mengubahnya di file `config.ts`.
*   **Database ID**: Data disimpan dengan ID `main_store`. Ini berarti satu akun Supabase mengelola satu set data sekolah ini.

---
*Dikembangkan untuk efisiensi administrasi guru SMAN 11 Makassar.*
