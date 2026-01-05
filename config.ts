
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
  database: {
    url: (window as any).process?.env?.VITE_SUPABASE_URL || "",
    anonKey: (window as any).process?.env?.VITE_SUPABASE_ANON_KEY || "",
    storageId: 'main_store', // ID baris di tabel app_storage
    syncDebounceMs: 1000,   // Jeda waktu sebelum push ke cloud (ms) - Dipercepat menjadi 1 detik
  },

  // Pengaturan Default Aplikasi
  defaults: {
    teachingDays: [1, 2, 3, 4, 5], // 1:Senin s/d 5:Jumat
    startMonth: 0, // 0 = Januari
    startYear: 2026,
  }
};
