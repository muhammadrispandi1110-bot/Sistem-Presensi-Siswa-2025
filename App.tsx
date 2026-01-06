
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, STATUS_LABELS } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const DARK_STATUS_COLORS: Record<AttendanceStatus, string> = {
  'H': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 ring-emerald-500/20',
  'S': 'text-blue-400 bg-blue-500/10 border-blue-500/30 ring-blue-500/20',
  'I': 'text-amber-400 bg-amber-500/10 border-amber-500/30 ring-emerald-500/20',
  'A': 'text-rose-400 bg-rose-500/10 border-rose-500/30 ring-rose-500/20'
};

const MONTH_COLORS: Record<number, string> = {
  0: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  1: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  2: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  3: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  4: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  5: 'bg-violet-500/20 text-violet-400 border-violet-500/30'
};

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

// Komponen Login yang diisolasi untuk efisiensi
const LoginScreen = ({ onLoginSuccess, showToast, authConfig, schoolConfig }) => {
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.user === authConfig.username && loginForm.pass === authConfig.password) {
      onLoginSuccess();
    } else {
      showToast('Username atau Password salah!', 'error');
    }
  };
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center login-bg p-4">
        <div className="w-full max-w-sm glass-panel rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">{schoolConfig.name}</h1>
                <p className="text-slate-400 mt-1">Sistem Presensi Digital {schoolConfig.year}</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="username">Username</label>
                    <input
                        type="text"
                        id="username"
                        value={loginForm.user}
                        onChange={e => setLoginForm(f => ({ ...f, user: e.target.value }))}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="admin"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={loginForm.pass}
                        onChange={e => setLoginForm(f => ({ ...f, pass: e.target.value }))}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="••••••••"
                    />
                </div>
                <button type="submit" className="w-full active-gradient text-white font-semibold py-2 rounded-lg">
                    Login
                </button>
            </form>
        </div>
    </div>
  );
};


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { database, auth, school, defaults } = APP_CONFIG;
  
  const supabase = useMemo(() => {
    try {
      if (database.url && database.anonKey) {
        return createClient(database.url, database.anonKey);
      }
    } catch (e) {
      console.error("Supabase Init Error:", e);
    }
    return null;
  }, [database.url, database.anonKey]);

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});

  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('Daily');
  const [reportTab, setReportTab] = useState<'Weekly' | 'Monthly' | 'Semester'>('Weekly');
  const [adminTab, setAdminTab] = useState<'Kelas' | 'Siswa' | 'Database'>('Kelas');
  const [currentDate, setCurrentDate] = useState(new Date(defaults.startYear, defaults.startMonth, 1));
  const [activeMonth, setActiveMonth] = useState(defaults.startMonth);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [showClassModal, setShowClassModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  
  const [editingClass, setEditingClass] = useState<ClassData | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  
  const [adminFormData, setAdminFormData] = useState({ 
    className: '', 
    studentName: '', 
    studentNis: '',
    studentNisn: '',
    schedule: defaults.teachingDays
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!supabase) {
      if(database.url && database.anonKey) {
        showToast('Gagal terhubung ke Cloud', 'error');
      }
      setClasses(INITIAL_CLASSES);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const { data: classesData, error: classesError } = await supabase.from('classes').select('*').order('created_at');
      if (classesError) throw classesError;

      const { data: studentsData, error: studentsError } = await supabase.from('students').select('*');
      if (studentsError) throw studentsError;

      const { data: assignmentsData, error: assignmentsError } = await supabase.from('assignments').select('*');
      if (assignmentsError) throw assignmentsError;
      
      const { data: submissionsData, error: submissionsError } = await supabase.from('submissions').select('*');
      if (submissionsError) throw submissionsError;
      
      const { data: attendanceData, error: attendanceError } = await supabase.from('attendance_records').select('*');
      if (attendanceError) throw attendanceError;

      const assembledClasses = classesData.map(c => {
        const classStudents = studentsData.filter(s => s.class_id === c.id);
        const classAssignments = assignmentsData.filter(a => a.class_id === c.id).map(a => {
            const assignmentSubmissions = submissionsData.filter(sub => sub.assignment_id === a.id);
            const submissionsMap: { [studentId: string]: SubmissionData } = {};
            assignmentSubmissions.forEach(sub => {
                submissionsMap[sub.student_id] = { isSubmitted: sub.is_submitted, score: sub.score };
            });
            return { ...a, description: a.description || '', dueDate: a.due_date, submissions: submissionsMap };
        });
        return { ...c, students: classStudents, assignments: classAssignments };
      });

      const reconstructedAttendance: AttendanceRecord = {};
      attendanceData.forEach(rec => {
        if (!reconstructedAttendance[rec.student_id]) {
          reconstructedAttendance[rec.student_id] = {};
        }
        reconstructedAttendance[rec.student_id][rec.record_date] = rec.status as AttendanceStatus;
      });

      setClasses(assembledClasses);
      setAttendance(reconstructedAttendance);
      
      if (assembledClasses.length > 0 && !activeClassId) {
        setActiveClassId(assembledClasses[0].id);
      } else if(assembledClasses.length === 0){
        setActiveClassId(null);
      }
      
    } catch (err: any) {
      console.error('Fetch Failed:', err);
      showToast('Gagal memuat Cloud, periksa koneksi/pengaturan.', 'error');
      setClasses(INITIAL_CLASSES);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId, database.url, database.anonKey, showToast]);

  useEffect(() => {
    // Simulasi loading awal yang lebih baik
    setTimeout(() => {
       if (isAuthenticated) {
         fetchFromCloud();
       } else {
         setIsLoading(false);
       }
    }, 500)
  }, [isAuthenticated, fetchFromCloud]);
  
  const seedInitialData = useCallback(async () => {
    if (!supabase) {
        showToast('Koneksi database tidak ditemukan', 'error');
        return;
    }
    if (!window.confirm('Apakah Anda yakin ingin mengisi database dengan data awal? Tindakan ini akan menambahkan 4 kelas dan seluruh siswanya. Lakukan ini hanya jika database Anda kosong.')) {
        return;
    }

    setIsSyncing(true);
    showToast('Memulai proses seeding...', 'info');

    try {
        for (const initialClass of INITIAL_CLASSES) {
            let classId: string;
            
            const { data: existingClass } = await supabase
                .from('classes').select('id').eq('name', initialClass.name).single();

            if (existingClass) {
                classId = existingClass.id;
            } else {
                const { data: newClass, error: classError } = await supabase
                    .from('classes')
                    .insert({ name: initialClass.name, schedule: initialClass.schedule || defaults.teachingDays })
                    .select('id')
                    .single();
                
                if (classError) throw classError;
                classId = newClass.id;
            }

            if (initialClass.students && initialClass.students.length > 0) {
                const studentsToInsert = initialClass.students.map(student => ({
                    class_id: classId,
                    name: student.name,
                    nis: student.nis,
                    nisn: student.nisn
                }));

                const { error: studentError } = await supabase.from('students').insert(studentsToInsert);
                if (studentError) {
                    console.error(`Gagal seeding siswa untuk kelas ${initialClass.name}:`, studentError);
                    showToast(`Sebagian siswa u/ ${initialClass.name} mungkin sudah ada`, 'error');
                }
            }
        }
        showToast('Seeding data awal berhasil!', 'success');
        await fetchFromCloud();

    } catch (err: any) {
        console.error('Seeding Failed:', err);
        showToast(`Proses seeding gagal: ${err.message}`, 'error');
    } finally {
        setIsSyncing(false);
    }
}, [supabase, showToast, fetchFromCloud, defaults.teachingDays]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  
  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    const updatedAttendance = { ...attendance };
    if (!updatedAttendance[studentId]) updatedAttendance[studentId] = {};
    updatedAttendance[studentId][date] = status;
    setAttendance(updatedAttendance);

    if (!supabase) return;
    
    setIsSyncing(true);
    const { error } = await supabase.from('attendance_records').upsert(
      { student_id: studentId, record_date: date, status: status },
      { onConflict: 'student_id, record_date' }
    );
    if(error) {
      showToast('Gagal simpan absensi', 'error');
      console.error(error);
    }
    setIsSyncing(false);
  };
  
  const weeklyDates = useMemo(() => getWeekDates(currentDate, activeClass?.schedule), [currentDate, activeClass]);
  const monthlyDates = useMemo(() => getMonthDates(activeMonth, activeClass?.schedule), [activeMonth, activeClass]);
  const semesterDates = useMemo(() => getSemesterDates(activeClass?.schedule), [activeClass]);

  // UI Render Components
  const AdminView = () => (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
        <h2 className="text-2xl font-bold text-white mb-6">Manajemen & Pengaturan</h2>
        <div className="flex border-b border-slate-700 mb-6">
            {(['Kelas', 'Siswa', 'Database'] as const).map(tab => (
                <button key={tab} onClick={() => setAdminTab(tab)} className={`px-4 py-2 font-semibold text-sm ${adminTab === tab ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}>
                    {tab}
                </button>
            ))}
        </div>
        
        {adminTab === 'Database' && (
             <div className="space-y-6">
                <div>
                    <h3 className="text-lg font-semibold text-slate-200 mb-2">Status Koneksi Database</h3>
                    <div className={`p-4 rounded-lg border ${database.url && database.anonKey ? 'bg-emerald-900/50 border-emerald-500/30' : 'bg-rose-900/50 border-rose-500/30'}`}>
                    {database.url && database.anonKey ? (
                        <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="font-semibold text-emerald-300">Terhubung ke Supabase Cloud</p>
                            <p className="text-sm text-slate-400">Aplikasi berhasil terhubung ke database. Data akan tersimpan secara online.</p>
                        </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <p className="font-semibold text-rose-300">Konfigurasi Database Belum Lengkap</p>
                            <p className="text-sm text-slate-400">Kunci API Supabase belum diatur. Aplikasi berjalan dalam mode lokal. Ikuti panduan di `readme.md` untuk setup.</p>
                        </div>
                        </div>
                    )}
                    </div>
                </div>

                {supabase && classes.length === 0 && !isLoading && (
                    <div>
                    <h3 className="text-lg font-semibold text-slate-200 mb-2">Isi Data Awal</h3>
                    <div className="p-4 rounded-lg border bg-slate-800 border-slate-700">
                        <p className="text-slate-300 mb-4">
                        Database Anda terdeteksi kosong. Klik tombol di bawah untuk mengisi data awal (4 kelas beserta daftar siswanya) secara otomatis.
                        </p>
                        <button
                        onClick={seedInitialData}
                        disabled={isSyncing}
                        className="w-full justify-center flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                        {isSyncing ? (
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                        )}
                        {isSyncing ? 'Memproses...' : 'Isi Database Dengan Data Awal'}
                        </button>
                    </div>
                    </div>
                )}
            </div>
        )}
    </div>
  )

  const DailyView = () => {
    if(!activeClass) return <div className="p-6 text-slate-400">Pilih kelas untuk memulai.</div>
    const dateStr = formatDate(currentDate);

    return (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
            <div className="flex items-center justify-between mb-6 mobile-stack">
                <div>
                    <h2 className="text-2xl font-bold text-white">Presensi Harian</h2>
                    <p className="text-slate-400">{DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 rounded-md bg-slate-700 hover:bg-slate-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600">Hari Ini</button>
                    <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 rounded-md bg-slate-700 hover:bg-slate-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeClass.students.map((student, idx) => {
                const status = attendance[student.id]?.[dateStr] || 'H';
                return(
                <div key={student.id} className="dark-card p-4 rounded-xl flex flex-col justify-between">
                    <div>
                        <p className="text-slate-400 text-sm">{idx + 1}.</p>
                        <p className="font-semibold text-slate-200 mt-1 truncate">{student.name}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-4">
                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => (
                            <button
                                key={s}
                                onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)}
                                disabled={isFutureDate(currentDate)}
                                className={`h-10 text-sm font-bold rounded-md transition-all ${status === s ? DARK_STATUS_COLORS[s] : 'bg-slate-800 hover:bg-slate-700'} ${isFutureDate(currentDate) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >{s}</button>
                        ))}
                    </div>
                </div>
                )
            })}
            </div>
        </div>
    )
  }

  const NotificationArea = () => (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {notifications.map(n => (
            <div key={n.id} className={`px-4 py-2 rounded-md text-sm font-semibold text-white animate-fadeInScale ${n.type === 'success' ? 'bg-emerald-600' : n.type === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>
                {n.message}
            </div>
        ))}
    </div>
  )
  
  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center text-slate-400">Memuat Aplikasi...</div>;
  }
  
  if (!isAuthenticated) { 
    return (
      <>
        <LoginScreen 
          onLoginSuccess={() => {
            setIsAuthenticated(true);
            setIsLoading(true);
          }}
          showToast={showToast}
          authConfig={auth}
          schoolConfig={school}
        />
        <NotificationArea />
      </>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-200 flex flex-col md:flex-row">
      <nav className="w-full md:w-64 glass-panel flex-shrink-0 p-4 space-y-2 overflow-y-auto">
        <h2 className="text-xl font-bold px-2">{school.name}</h2>
        
        <div className="pt-4">
            <h3 className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Menu</h3>
            {(['Daily', 'Reports', 'Assignments', 'Admin'] as ViewType[]).map(v => (
                 <button key={v} onClick={() => setView(v)} className={`w-full text-left px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-3 nav-link ${view === v ? 'bg-slate-700 text-white active' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {v}
                </button>
            ))}
        </div>

        <div className="pt-4">
            <h3 className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kelas</h3>
            {classes.map(c => (
                <button key={c.id} onClick={() => setActiveClassId(c.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium truncate ${activeClassId === c.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {c.name}
                </button>
            ))}
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'Daily' && <DailyView />}
        {view === 'Admin' && <AdminView />}
        {/* Other views to be placed here */}
      </main>
      
      <NotificationArea />
    </div>
  );
};

export default App;
