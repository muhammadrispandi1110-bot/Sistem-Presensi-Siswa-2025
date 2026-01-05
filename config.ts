
export const APP_CONFIG = {
  // Pengaturan Autentikasi
  auth: {
    username: 'admin',
    password: 'admin',
  },

  // Identitas Sekolah & Akademik
  school: {
    name: "SMAN 11 MAKASSAR",
    year: "2026",
    semester: "Ganjil", // Ganjil / Genap
    periodName: "Semester 1 (Jan-Jun)",
  },

  // Pengaturan Database (Supabase)
  // Membaca dari Environment Variables Netlify (VITE_ prefix wajib untuk Vite)
  database: {
    url: (import.meta as any).env?.VITE_SUPABASE_URL || (process.env as any)?.VITE_SUPABASE_URL || "https://nwkqmurafkzpuibuzgbw.supabase.co",
    anonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (process.env as any)?.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53a3FtdXJhZmt6cHVpYnV6Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg2NjIsImV4cCI6MjA4MzE1NDY2Mn0.ozF1KmR3PZTBCcUlWrhwAGy068oYLyt0yVRFmaGgn2U",
    storageId: 'main_store', // ID baris di tabel app_storage
    syncDebounceMs: 1000,   // Jeda waktu sebelum push ke cloud (ms)
  },

  // Pengaturan Default Aplikasi
  defaults: {
    teachingDays: [1, 2, 3, 4, 5], // 1:Senin s/d 5:Jumat
    startMonth: 0, // 0 = Januari
    startYear: 2026,
  }
};
