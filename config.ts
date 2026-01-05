
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
    // Pengecekan aman untuk environment variables
    url: (import.meta as any).env?.VITE_SUPABASE_URL || 
         (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : null) || 
         "https://nwkqmurafkzpuibuzgbw.supabase.co",
         
    anonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
             (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : null) || 
             "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53a3FtdXJhZmt6cHVpYnV6Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg2NjIsImV4cCI6MjA4MzE1NDY2Mn0.ozF1KmR3PZTBCcUlWrhwAGy068oYLyt0yVRFmaGgn2U",
             
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
