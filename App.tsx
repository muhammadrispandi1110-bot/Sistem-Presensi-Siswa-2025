
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, STATUS_LABELS } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const DARK_STATUS_COLORS: Record<AttendanceStatus, string> = {
  'H': 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 ring-emerald-500/20',
  'S': 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 ring-blue-500/20',
  'I': 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 ring-emerald-500/20',
  'A': 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 ring-rose-500/20'
};

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

const MENU_ITEMS: { view: ViewType; label: string }[] = [
  { view: 'Admin', label: 'Admin' },
  { view: 'Reports', label: 'Laporan Presensi' },
  { view: 'TaskReports', label: 'Rekap Tugas' },
];

type ParsedStudent = Omit<Student, 'id'>;
type Theme = 'light' | 'dark';

const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
  if (!isOpen) return null;
  const sizeClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-slate-900/70 dark:bg-black/70 z-50 flex items-center justify-center p-4 print-hide">
      <div className={`w-full ${sizeClass} bg-white dark:bg-slate-800 rounded-xl shadow-lg flex flex-col view-transition`}>
        <header className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <main className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</main>
        <footer className="flex justify-end p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl border-t border-slate-200 dark:border-slate-700">
          {footer}
        </footer>
      </div>
    </div>
  );
};

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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{schoolConfig.name}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Sistem Presensi Digital {schoolConfig.year}</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" htmlFor="username">Username</label>
            <input type="text" id="username" value={loginForm.user} onChange={e => setLoginForm(f => ({ ...f, user: e.target.value }))} className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white" placeholder="admin"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2" htmlFor="password">Password</label>
            <input type="password" id="password" value={loginForm.pass} onChange={e => setLoginForm(f => ({ ...f, pass: e.target.value }))} className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white" placeholder="••••••••"/>
          </div>
          <button type="submit" className="w-full active-gradient text-white font-semibold py-2 rounded-lg">Login</button>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSemester, setActiveSemester] = useState<1 | 2>(1);
  
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as Theme;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'dark' ? 'light' : 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

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
  const [view, setView] = useState<ViewType>('Admin');
  const [reportTab, setReportTab] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Semester'>('Daily');
  const [adminTab, setAdminTab] = useState<'Kelas' | 'Siswa' | 'Tugas' | 'Database'>('Kelas');
  const [currentDate, setCurrentDate] = useState(new Date(defaults.startYear, defaults.startMonth, 1));
  const [activeMonth, setActiveMonth] = useState(defaults.startMonth);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [showModal, setShowModal] = useState<'class' | 'student' | 'assignment' | null>(null);
  const [editingItem, setEditingItem] = useState<ClassData | Student | Assignment | null>(null);
  const [adminSelectedClassId, setAdminSelectedClassId] = useState<string | null>(null);
  
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [uploadFileName, setUploadFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  useEffect(() => {
    if (activeClassId) {
      setExpandedClassId(activeClassId);
    }
  }, [activeClassId]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!supabase) {
      setClasses(INITIAL_CLASSES);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const { data: classesData, error: classesError } = await supabase.from('classes').select('*').order('name');
      if (classesError) throw classesError;

      const { data: studentsData, error: studentsError } = await supabase.from('students').select('*');
      if (studentsError) throw studentsError;

      const { data: assignmentsData, error: assignmentsError } = await supabase.from('assignments').select('*').order('due_date');
      if (assignmentsError) throw assignmentsError;
      
      const { data: submissionsData, error: submissionsError } = await supabase.from('submissions').select('*');
      if (submissionsError) throw submissionsError;
      
      const { data: attendanceData, error: attendanceError } = await supabase.from('attendance_records').select('*');
      if (attendanceError) throw attendanceError;

      const assembledClasses = classesData.map(c => {
        const classStudents = studentsData.filter(s => s.class_id === c.id);
        const classAssignments = assignmentsData.filter(a => a.class_id === c.id).map(a => {
            const assignmentSubmissions: { [studentId: string]: SubmissionData } = {};
            classStudents.forEach(student => {
              const submission = submissionsData.find(s => s.student_id === student.id && s.assignment_id === a.id);
              assignmentSubmissions[student.id] = { 
                isSubmitted: submission?.is_submitted || false, 
                score: submission?.score || '' 
              };
            });
            return { ...a, id: a.id, title: a.title, description: a.description || '', dueDate: a.due_date, submissions: assignmentSubmissions };
        });
        return { ...c, id: c.id, name: c.name, schedule: c.schedule, students: classStudents, assignments: classAssignments };
      });

      const reconstructedAttendance: AttendanceRecord = {};
      attendanceData.forEach(rec => {
        if (!reconstructedAttendance[rec.student_id]) reconstructedAttendance[rec.student_id] = {};
        reconstructedAttendance[rec.student_id][rec.record_date] = rec.status as AttendanceStatus;
      });

      setClasses(assembledClasses);
      setAttendance(reconstructedAttendance);
      
      if (assembledClasses.length > 0) {
        if (!activeClassId || !assembledClasses.find(c => c.id === activeClassId)) {
          setActiveClassId(assembledClasses[0].id);
          setView('Dashboard');
        }
        if (!adminSelectedClassId || !assembledClasses.find(c => c.id === adminSelectedClassId)) setAdminSelectedClassId(assembledClasses[0].id);
      }
    } catch (err: any) {
      showToast('Gagal memuat Cloud, periksa koneksi/pengaturan.', 'error');
      setClasses(INITIAL_CLASSES);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId, adminSelectedClassId, showToast]);

  useEffect(() => {
    if (isAuthenticated) fetchFromCloud();
    else setIsLoading(false);
  }, [isAuthenticated, fetchFromCloud]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  
  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    const updated = { ...attendance, [studentId]: { ...attendance[studentId], [date]: status } };
    setAttendance(updated);
    if (!supabase) return;
    await supabase.from('attendance_records').upsert({ student_id: studentId, record_date: date, status }, { onConflict: 'student_id, record_date' });
  };

  const handleManualSave = async () => {
    setIsSyncing(true);
    try {
        await fetchFromCloud();
        showToast('Seluruh data berhasil disimpan ke cloud!', 'success');
    } catch (e) {
        showToast('Gagal melakukan sinkronisasi manual.', 'error');
    } finally {
        setIsSyncing(false);
    }
  };

  const weeklyDates = useMemo(() => getWeekDates(currentDate, activeClass?.schedule), [currentDate, activeClass]);
  const monthlyDates = useMemo(() => getMonthDates(activeMonth, activeClass?.schedule), [activeMonth, activeClass]);
  const semesterDates = useMemo(() => getSemesterDates(activeSemester, activeClass?.schedule), [activeSemester, activeClass]);

  const handleExportAttendanceToExcel = useCallback(() => {
    if (!activeClass) return;

    if (reportTab === 'Semester') {
        const semesterMonths = activeSemester === 1 ? MONTHS_2026.slice(0, 6) : MONTHS_2026.slice(6, 12);
        const headers1 = ["No", "Nama Siswa"];
        const headers2 = ["", ""];
        
        semesterMonths.forEach(m => {
            headers1.push(m.name, "", "", "");
            headers2.push("H", "S", "I", "A");
        });
        headers1.push("TOTAL SEMESTER", "", "", "", "PERSENTASE");
        headers2.push("H", "S", "I", "A", "%");

        const data = activeClass.students.map((student, index) => {
            const row = [index + 1, student.name];
            const semesterTotals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
            let totalDays = 0;

            semesterMonths.forEach(m => {
                const monthDates = getMonthDates(m.value, activeClass.schedule);
                const monthTotals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
                monthDates.forEach(d => {
                    const status = attendance[student.id]?.[formatDate(d)] || 'H';
                    monthTotals[status]++;
                    semesterTotals[status]++;
                    totalDays++;
                });
                row.push(monthTotals.H, monthTotals.S, monthTotals.I, monthTotals.A);
            });
            const perc = totalDays > 0 ? ((semesterTotals.H / totalDays) * 100).toFixed(0) + '%' : '0%';
            row.push(semesterTotals.H, semesterTotals.S, semesterTotals.I, semesterTotals.A, perc);
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers1, headers2, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan Semester");
        XLSX.writeFile(wb, `Laporan_Semester_${activeSemester}_${activeClass.name}.xlsx`);
        showToast('Laporan semester berhasil disimpan!');
        return;
    }

    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? weeklyDates : monthlyDates;
    const dateHeaders = dates.map(d => formatDate(d));
    const headers = ["No", "Nama Siswa", ...dateHeaders, "H", "S", "I", "A", "%"];
    
    const data = activeClass.students.map((student, index) => {
      const totals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
      const statusRow = dates.map(d => {
        const status = attendance[student.id]?.[formatDate(d)] || 'H';
        totals[status]++;
        return status;
      });
      const totalDays = dates.length;
      const percentage = totalDays > 0 ? ((totals.H / totalDays) * 100).toFixed(1) + '%' : '0%';
      return [index + 1, student.name, ...statusRow, totals.H, totals.S, totals.I, totals.A, percentage];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Presensi");
    XLSX.writeFile(workbook, `Laporan_Presensi_${activeClass.name}.xlsx`);
    showToast('Laporan berhasil disimpan!');
  }, [activeClass, attendance, reportTab, currentDate, weeklyDates, monthlyDates, activeSemester, showToast]);

  const AdminView = () => {
    return <div className="p-6">Menu Admin (Sesuai Konfigurasi Bapak)</div>;
  };

  const DashboardView = () => {
    if (!activeClass) return <div className="p-6 text-slate-500 dark:text-slate-400">Pilih kelas untuk memulai.</div>;
    const dateStr = formatDate(currentDate);

    return (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
            <div className="mb-6 flex items-center justify-between mobile-stack gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Kelas: {activeClass.name}</h2>
                    <p className="text-slate-500 dark:text-slate-400">Kelola presensi harian ({DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')})</p>
                </div>
                <button onClick={handleManualSave} disabled={isSyncing} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-95 disabled:opacity-50">
                    Simpan Perubahan
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeClass.students.map((student, idx) => {
                    const status = attendance[student.id]?.[dateStr] || 'H';
                    return (
                        <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between shadow-sm">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{idx + 1}. {student.name}</p>
                            <div className="flex gap-1">
                                {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => (
                                    <button key={s} onClick={() => handleAttendanceChange(student.id, dateStr, s)} className={`w-8 h-8 rounded-md font-bold text-xs ${status === s ? DARK_STATUS_COLORS[s] : 'bg-slate-100 dark:bg-slate-900 text-slate-500'}`}>{s}</button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  const ReportsView = () => {
    if (!activeClass) return <div className="p-6 text-slate-500 dark:text-slate-400">Pilih kelas.</div>;
    
    const dates = useMemo(() => {
        if (reportTab === 'Daily') return [currentDate];
        if (reportTab === 'Weekly') return weeklyDates;
        if (reportTab === 'Monthly') return monthlyDates;
        return semesterDates;
    }, [reportTab, currentDate, weeklyDates, monthlyDates, semesterDates]);

    const totals = useMemo(() => {
        const classTotals: Record<string, Record<AttendanceStatus | 'T', number>> = {};
        activeClass.students.forEach(s => {
          classTotals[s.id] = { 'H': 0, 'S': 0, 'I': 0, 'A': 0, 'T': 0 };
          dates.forEach(d => {
            const status = attendance[s.id]?.[formatDate(d)] || 'H';
            classTotals[s.id][status]++;
            classTotals[s.id]['T']++;
          });
        });
        return classTotals;
    }, [activeClass.students, dates, attendance]);

    const reportTitle = useMemo(() => {
        if (reportTab === 'Daily') return `HARIAN: ${currentDate.toLocaleDateString('id-ID')}`;
        if (reportTab === 'Weekly') return `MINGGUAN (MULAI ${weeklyDates[0]?.toLocaleDateString('id-ID')})`;
        if (reportTab === 'Monthly') return `BULANAN: ${MONTHS_2026[activeMonth].name}`;
        return `REKAPAN SEMESTER ${activeSemester} (${activeSemester === 1 ? 'JANUARI - JUNI' : 'JULI - DESEMBER'})`;
    }, [reportTab, currentDate, weeklyDates, activeMonth, activeSemester]);

    const semesterMonths = useMemo(() => {
        return activeSemester === 1 ? MONTHS_2026.slice(0, 6) : MONTHS_2026.slice(6, 12);
    }, [activeSemester]);

    return (
      <div className="flex-1 p-4 sm:p-6 flex flex-col overflow-hidden print:block print:overflow-visible">
        <div className="flex items-center justify-between mb-6 mobile-stack gap-4 print-hide">
          <div><h2 className="text-2xl font-bold text-slate-900 dark:text-white">Laporan Kehadiran</h2><p className="text-slate-500 dark:text-slate-400">Laporan untuk Kelas {activeClass.name}</p></div>
          <div className="flex gap-2">
            <button onClick={handleExportAttendanceToExcel} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 transition-all">
                Simpan Laporan
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-200 dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-all">
                Cetak
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 mb-4 print-hide">
          <div className="flex">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`px-4 py-2 font-semibold text-sm ${reportTab === tab ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500'}`}>
                    {tab.replace('Daily', 'Harian').replace('Weekly', 'Mingguan').replace('Monthly', 'Bulanan')}
                </button>
            ))}
          </div>
          {reportTab === 'Semester' && (
              <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500">Pilih Semester:</span>
                  <select value={activeSemester} onChange={e => setActiveSemester(parseInt(e.target.value) as 1 | 2)} className="bg-white dark:bg-slate-800 border border-slate-300 rounded px-2 py-1 text-sm">
                      <option value={1}>Semester 1 (Jan-Jun)</option>
                      <option value={2}>Semester 2 (Jul-Des)</option>
                  </select>
              </div>
          )}
          {reportTab === 'Monthly' && (<select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-white dark:bg-slate-800 border border-slate-300 rounded px-2 py-1 text-sm">{MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}</select>)}
        </div>

        <div className="hidden print-header">
          <h2>{school.name}</h2>
          <h3>LAPORAN PRESENSI KELAS: {activeClass.name}</h3>
          <p>{reportTitle}</p>
        </div>

        <div className="overflow-auto flex-1 print:overflow-visible print:block">
          {reportTab === 'Semester' ? (
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-collapse text-[10px]">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 print:static">
                      <tr>
                        <th rowSpan={2} className="px-1 py-2 text-left text-[9px] font-bold text-slate-500 border">No</th>
                        <th rowSpan={2} className="px-2 py-2 text-left text-[9px] font-bold text-slate-500 border" style={{minWidth: '150px'}}>Nama Siswa</th>
                        {semesterMonths.map(m => <th key={m.value} colSpan={4} className="px-1 py-1 text-center font-bold border">{m.name.substring(0,3)}</th>)}
                        <th colSpan={4} className="px-1 py-1 text-center font-bold bg-slate-200 border">Total Semester</th>
                        <th rowSpan={2} className="px-1 py-1 text-center font-bold text-indigo-600 border">%</th>
                      </tr>
                      <tr className="bg-slate-50">
                        {semesterMonths.map(m => (<React.Fragment key={`${m.value}-sub`}><th className="border">H</th><th className="border">S</th><th className="border">I</th><th className="border">A</th></React.Fragment>))}
                        <th className="border bg-slate-200">H</th><th className="border bg-slate-200">S</th><th className="border bg-slate-200">I</th><th className="border bg-slate-200">A</th>
                      </tr>
                  </thead>
                  <tbody>
                      {activeClass.students.map((s, idx) => {
                          const semesterTotals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
                          let semesterDays = 0;
                          return (
                              <tr key={s.id} className="hover:bg-slate-50 print:break-inside-avoid">
                                <td className="px-1 py-1 text-center border">{idx + 1}</td>
                                <td className="px-2 py-1 font-medium border text-[10px] truncate">{s.name}</td>
                                {semesterMonths.map(m => {
                                    const mDates = getMonthDates(m.value, activeClass.schedule);
                                    const mTotals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
                                    mDates.forEach(d => {
                                        const status = attendance[s.id]?.[formatDate(d)] || 'H';
                                        mTotals[status]++; semesterTotals[status]++; semesterDays++;
                                    });
                                    return (
                                        <React.Fragment key={`${m.value}-d`}><td className="text-center border">{mTotals.H || '-'}</td><td className="text-center border text-blue-600">{mTotals.S || '-'}</td><td className="text-center border text-amber-600">{mTotals.I || '-'}</td><td className="text-center border text-rose-600">{mTotals.A || '-'}</td></React.Fragment>
                                    );
                                })}
                                <td className="text-center border font-bold bg-slate-100">{semesterTotals.H}</td><td className="text-center border font-bold bg-slate-100">{semesterTotals.S}</td><td className="text-center border font-bold bg-slate-100">{semesterTotals.I}</td><td className="text-center border font-bold bg-slate-100">{semesterTotals.A}</td>
                                <td className="text-center border font-bold text-indigo-600">{semesterDays > 0 ? ((semesterTotals.H / semesterDays) * 100).toFixed(0) : 0}%</td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 border-collapse">
              <thead className="bg-slate-100 sticky top-0 print:static">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase w-10 border">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase border" style={{minWidth: '200px'}}>Nama Siswa</th>
                  {dates.map(d => (<th key={d.toISOString()} className="px-2 py-3 text-center text-[10px] font-medium text-slate-500 border"><div>{DAY_NAMES[d.getDay()].substring(0,3)}</div><div>{d.getDate()}</div></th>))}
                  {(['H', 'S', 'I', 'A'] as const).map(s => <th key={s} className="px-2 py-3 text-center text-xs font-bold border">{s}</th>)}
                  <th className="px-3 py-3 text-center text-xs font-bold text-indigo-600 border">%</th>
                </tr>
              </thead>
              <tbody>
                {activeClass.students.map((s, idx) => {
                  const perc = totals[s.id].T > 0 ? ((totals[s.id].H / totals[s.id].T) * 100).toFixed(1) : '0';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 print:break-inside-avoid">
                      <td className="px-3 py-2 text-sm text-slate-500 border">{idx + 1}</td>
                      <td className="px-4 py-2 text-sm font-medium border">{s.name}</td>
                      {dates.map(d => {
                        const status = attendance[s.id]?.[formatDate(d)] || 'H';
                        return (<td key={formatDate(d)} className={`px-2 py-2 text-center text-xs font-bold border ${status === 'H' ? 'text-emerald-700' : 'text-rose-700'}`}>{status}</td>)
                      })}
                      {(['H', 'S', 'I', 'A'] as const).map(st => <td key={st} className="px-2 py-2 text-center text-sm border">{totals[s.id][st]}</td>)}
                      <td className="px-3 py-2 text-center text-sm font-bold text-indigo-600 border">{perc}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-100">Memuat...</div>;
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} showToast={showToast} authConfig={auth} schoolConfig={school} />;

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex relative print:block">
      <nav className="w-64 glass-panel p-4 flex flex-col print-hide">
        <h2 className="text-xl font-bold mb-6 text-indigo-600">{school.name}</h2>
        <div className="flex flex-col gap-2">
            {MENU_ITEMS.map(m => (
                <button key={m.view} onClick={() => setView(m.view)} className={`px-4 py-2 text-left rounded-lg text-sm font-bold ${view === m.view ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'}`}>{m.label}</button>
            ))}
            <div className="mt-4 border-t pt-4">
                <p className="text-xs font-bold text-slate-400 mb-2">KELAS</p>
                {classes.map(c => (
                    <button key={c.id} onClick={() => { setActiveClassId(c.id); setView('Dashboard'); }} className={`w-full px-4 py-2 text-left rounded-lg text-sm font-medium ${activeClassId === c.id ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>{c.name}</button>
                ))}
            </div>
        </div>
        <button onClick={toggleTheme} className="mt-auto p-2 text-xs font-bold text-slate-500 uppercase">{theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}</button>
      </nav>
      <main className="flex-1 flex flex-col overflow-hidden print:block">
        {view === 'Dashboard' && <DashboardView />}
        {view === 'Reports' && <ReportsView />}
        {view === 'Admin' && <AdminView />}
        {view === 'TaskReports' && <div className="p-6">Rekap Tugas (Sesuai Konfigurasi)</div>}
      </main>
      <div className="fixed bottom-4 right-4 z-50 space-y-2 print-hide">
        {notifications.map(n => <div key={n.id} className="bg-indigo-600 text-white px-4 py-2 rounded shadow-lg text-sm animate-bounce">{n.message}</div>)}
      </div>
    </div>
  );
};

export default App;
