
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
    // Kredensial ini HARUS diisi melalui Environment Variables di Netlify
    // Lihat panduan lengkap di file readme.md untuk cara pengisiannya.
    // Jika variabel ini tidak ditemukan, aplikasi akan menampilkan pesan error.
    url: (import.meta as any).env?.VITE_SUPABASE_URL || null,
    anonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || null,
             
    storageId: 'main_store',
    syncDebounceMs: 1000,
  },

  // Pengaturan Default Aplikasi
  defaults: {
    teachingDays: [1, 2, 3, 4, 5], 
    startMonth: 0, 
    startYear: 2026,
  }
};
