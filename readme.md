
# Panduan Penggunaan Sistem Presensi & Penilaian Digital
## SMAN 11 Makassar - Semester Ganjil 2026

Aplikasi ini sekarang menggunakan sistem **Cloud-Only Architecture**. Seluruh data disimpan dan diambil langsung dari Supabase tanpa meninggalkan jejak di memori browser (LocalStorage).

---

## 1. Akses Sistem (Login)
*   **Username**: `admin`
*   **Password**: `admin`
*   Data hanya akan dimuat setelah Bapak berhasil login. Jika Bapak keluar (Logout), data akan dibersihkan dari layar.

---

## 2. Sinkronisasi Otomatis (Auto-Save)
*   **Tidak ada tombol simpan manual**: Aplikasi akan mendeteksi setiap perubahan (Absensi, Nilai, Data Siswa) dan mengirimkannya ke server dalam waktu 1 detik setelah Bapak berhenti mengetik/mengklik.
*   Perhatikan indikator di bawah nama sekolah: 
    *   `🟢 Tersimpan di Cloud`: Data sudah aman.
    *   `🟡 Menyimpan...`: Sedang proses pengiriman data.

---

## 3. Persiapan Database
Pastikan tabel `app_storage` sudah dibuat di Supabase Bapak melalui **SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS app_storage (
  id TEXT PRIMARY KEY,
  classes JSONB NOT NULL DEFAULT '[]',
  attendance JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kebijakan Akses Publik
ALTER TABLE app_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON app_storage FOR ALL USING (true) WITH CHECK (true);
```

---

## 4. Keamanan
Karena aplikasi ini tidak menyimpan data di `LocalStorage`, data Bapak sangat aman jika perangkat hilang atau digunakan orang lain (selama Bapak sudah Logout). Pastikan koneksi internet stabil saat melakukan pengisian.

---
*Dibuat untuk kemajuan digitalisasi SMAN 11 Makassar.*
