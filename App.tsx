
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const DARK_STATUS_COLORS: Record<AttendanceStatus, string> = {
  'H': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 ring-emerald-500/20',
  'S': 'text-blue-400 bg-blue-500/10 border-blue-500/30 ring-blue-500/20',
  'I': 'text-amber-400 bg-amber-500/10 border-amber-500/30 ring-emerald-500/20',
  'A': 'text-rose-400 bg-rose-500/10 border-rose-500/30 ring-rose-500/20'
};

const MONTH_COLORS: Record<number, string> = {
  0: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', // Jan
  1: 'bg-rose-500/20 text-rose-400 border-rose-500/30',     // Feb
  2: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', // Mar
  3: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   // Apr
  4: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     // Mei
  5: 'bg-violet-500/20 text-violet-400 border-violet-500/30'  // Jun
};

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [loginError, setLoginError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabaseUrl = (window as any).process?.env?.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = (window as any).process?.env?.VITE_SUPABASE_ANON_KEY || "";
  const isCloudConfigured = supabaseUrl !== "" && supabaseAnonKey !== "";

  const [classes, setClasses] = useState<ClassData[]>(() => {
    const saved = localStorage.getItem('classes_v1');
    return saved ? JSON.parse(saved) : INITIAL_CLASSES;
  });

  const [activeClassId, setActiveClassId] = useState(classes[0]?.id || '');
  const [view, setView] = useState<ViewType>('Daily');
  const [reportTab, setReportTab] = useState<'Weekly' | 'Monthly' | 'Semester'>('Weekly');
  const [adminTab, setAdminTab] = useState<'Kelas' | 'Siswa' | 'Database' | 'Cloud'>('Kelas');
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1));
  const [activeMonth, setActiveMonth] = useState(0);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [showClassModal, setShowClassModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showGradingModal, setShowGradingModal] = useState(false);
  
  const [editingClass, setEditingClass] = useState<ClassData | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  
  const [adminFormData, setAdminFormData] = useState({ 
    className: '', 
    studentName: '', 
    studentNis: '',
    assignTitle: '',
    assignDesc: '',
    assignDue: formatDate(new Date()),
    schedule: [] as number[]
  });

  const [attendance, setAttendance] = useState<AttendanceRecord>(() => {
    const saved = localStorage.getItem('attendance_v5');
    return saved ? JSON.parse(saved) : {};
  });

  const schoolName = "SMAN 11 MAKASSAR";

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('attendance_v5', JSON.stringify(attendance));
      localStorage.setItem('classes_v1', JSON.stringify(classes));
    }
  }, [attendance, classes, isAuthenticated]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);

  useEffect(() => {
    if (activeClass?.schedule && activeClass.schedule.length > 0) {
      if (!activeClass.schedule.includes(currentDate.getDay())) {
        setCurrentDate(getNextTeachingDate(currentDate, activeClass.schedule, 'next'));
      }
    }
  }, [activeClassId]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.user === 'admin' && loginForm.pass === 'admin') {
      setIsAuthenticated(true);
      showToast('Akses Diterima!', 'info');
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Keluar sistem?')) setIsAuthenticated(false);
  };

  const handleStatusChange = (studentId: string, date: string, status: AttendanceStatus) => {
    if (isFutureDate(new Date(date))) return;
    setAttendance(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [date]: status }
    }));
  };

  const calculateStats = (studentId: string, dates: Date[]) => {
    const stats = { H: 0, S: 0, I: 0, A: 0 };
    dates.forEach(d => {
      const dateStr = formatDate(d);
      const status = (attendance[studentId]?.[dateStr] || 'H') as AttendanceStatus;
      stats[status]++;
    });
    return stats;
  };

  const reportDates = useMemo(() => {
    if (reportTab === 'Weekly') return getWeekDates(currentDate, activeClass?.schedule);
    if (reportTab === 'Monthly') return getMonthDates(activeMonth, activeClass?.schedule);
    return getSemesterDates(activeClass?.schedule);
  }, [reportTab, currentDate, activeMonth, activeClass]);

  const classSummary = useMemo(() => {
    if (!activeClass) return null;
    let totalH = 0, totalA = 0, totalS = 0, totalI = 0;
    let studentStats = activeClass.students.map(s => {
      const stats = calculateStats(s.id, reportDates);
      totalH += stats.H; totalA += stats.A; totalS += stats.S; totalI += stats.I;
      const total = stats.H + stats.S + stats.I + stats.A;
      return { name: s.name, percent: total > 0 ? (stats.H / total) * 100 : 0 };
    });

    const avg = studentStats.reduce((acc, curr) => acc + curr.percent, 0) / (studentStats.length || 1);
    const sorted = [...studentStats].sort((a,b) => b.percent - a.percent);

    return {
      avg: Math.round(avg),
      best: sorted[0]?.name || '-',
      absentRate: Math.round(((totalA + totalS + totalI) / (totalH + totalA + totalS + totalI || 1)) * 100)
    };
  }, [activeClass, reportDates]);

  const handlePrint = () => {
    window.print();
  };

  const downloadCSV = (filename: string, rows: string[][]) => {
    const csvContent = rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportReportToExcel = () => {
    if (!activeClass) return;
    const period = reportTab === 'Weekly' ? 'Mingguan' : reportTab === 'Monthly' ? MONTHS_2026[activeMonth].name : 'Semester';
    const filename = `Rekap_Presensi_${activeClass.name}_${period}.csv`;
    
    // Header dinamis berdasarkan tanggal mengajar
    const dateHeaders = reportDates.map(d => formatDate(d));
    const headerRow = ["No", "Nama Siswa", ...dateHeaders, "H", "S", "I", "A", "%"];
    
    const rows = [
      headerRow,
      ...activeClass.students.map((s, idx) => {
        const stats = calculateStats(s.id, reportDates);
        const dailyStatus = reportDates.map(d => attendance[s.id]?.[formatDate(d)] || 'H');
        const total = stats.H + stats.S + stats.I + stats.A;
        const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
        return [
          (idx + 1).toString(), 
          s.name, 
          ...dailyStatus, 
          stats.H.toString(), 
          stats.S.toString(), 
          stats.I.toString(), 
          stats.A.toString(), 
          percent.toString()
        ];
      })
    ];
    
    downloadCSV(filename, rows);
    showToast('Rekap Excel Berhasil Diunduh!');
  };

  const handleAddOrEditClass = () => {
    if (!adminFormData.className) return;
    if (editingClass) {
      setClasses(classes.map(c => c.id === editingClass.id ? { ...c, name: adminFormData.className, schedule: adminFormData.schedule } : c));
    } else {
      const newId = `cls-${Date.now()}`;
      setClasses([...classes, { id: newId, name: adminFormData.className, students: [], assignments: [], schedule: adminFormData.schedule }]);
      if (!activeClassId) setActiveClassId(newId);
    }
    setShowClassModal(false);
    setEditingClass(null);
  };

  const handleAddOrEditStudent = () => {
    if (!activeClassId || !adminFormData.studentName) return;
    if (editingStudent) {
      setClasses(classes.map(c => c.id === activeClassId ? { ...c, students: c.students.map(s => s.id === editingStudent.id ? { ...s, name: adminFormData.studentName, nis: adminFormData.studentNis } : s) } : c));
    } else {
      const newS = { id: `std-${Date.now()}`, name: adminFormData.studentName, nis: adminFormData.studentNis, nisn: '' };
      setClasses(classes.map(c => c.id === activeClassId ? { ...c, students: [...c.students, newS] } : c));
    }
    setShowStudentModal(false);
    setEditingStudent(null);
  };

  const handleDeleteStudent = (id: string) => {
    if (window.confirm('Hapus siswa?')) {
      setClasses(classes.map(c => c.id === activeClassId ? { ...c, students: c.students.filter(s => s.id !== id) } : c));
    }
  };

  const getSubmittedCount = (assignment: Assignment) => {
    return Object.values(assignment.submissions || {}).filter(s => s.isSubmitted).length;
  };

  const updateSubmission = (assignmentId: string, studentId: string, field: keyof SubmissionData, value: any) => {
    setClasses(prev => prev.map(c => {
      if (c.id === activeClassId) {
        const updatedAssignments = (c.assignments || []).map(a => {
          if (a.id === assignmentId) {
            const updated = {
              ...a,
              submissions: {
                ...a.submissions,
                [studentId]: { ...(a.submissions[studentId] || { isSubmitted: false, score: '' }), [field]: value }
              }
            };
            if (activeAssignment?.id === assignmentId) {
              setActiveAssignment(updated);
            }
            return updated;
          }
          return a;
        });
        return { ...c, assignments: updatedAssignments };
      }
      return c;
    }));
  };

  const handleAddOrEditAssignment = () => {
    if (!activeClassId || !adminFormData.assignTitle) return;
    
    const assignmentData: Assignment = editingAssignment ? {
      ...editingAssignment,
      title: adminFormData.assignTitle,
      description: adminFormData.assignDesc,
      dueDate: adminFormData.assignDue
    } : {
      id: `asgn-${Date.now()}`,
      title: adminFormData.assignTitle,
      description: adminFormData.assignDesc,
      dueDate: adminFormData.assignDue,
      submissions: {}
    };

    setClasses(prev => prev.map(c => {
      if (c.id === activeClassId) {
        const currentAssignments = c.assignments || [];
        const newAssignments = editingAssignment 
          ? currentAssignments.map(a => a.id === editingAssignment.id ? assignmentData : a)
          : [...currentAssignments, assignmentData];
        return { ...c, assignments: newAssignments };
      }
      return c;
    }));

    setShowAssignmentModal(false);
    setEditingAssignment(null);
    showToast(editingAssignment ? 'Tugas diperbarui!' : 'Tugas baru ditambahkan!');
  };

  const toggleScheduleDay = (day: number) => {
    setAdminFormData(prev => ({
      ...prev,
      schedule: prev.schedule.includes(day) 
        ? prev.schedule.filter(d => d !== day) 
        : [...prev.schedule, day].sort()
    }));
  };

  const handleSaveAttendance = () => {
    // Data sebenarnya sudah tersimpan di localStorage via useEffect,
    // tombol ini memberikan konfirmasi visual bagi user.
    localStorage.setItem('attendance_v5', JSON.stringify(attendance));
    showToast('Presensi berhasil disimpan ke memori lokal!', 'success');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen login-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md glass-panel p-10 rounded-[2.5rem] animate-in zoom-in-95 duration-500 shadow-2xl space-y-8 text-center">
          <div className="w-20 h-20 active-gradient rounded-3xl mx-auto flex items-center justify-center shadow-2xl ring-4 ring-indigo-500/20 mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Portal Digital</h1>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <input type="text" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold transition-all" placeholder="Username" />
              <input type="password" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold transition-all" placeholder="Password" />
            </div>
            <button type="submit" className="w-full active-gradient text-white font-black py-5 rounded-2xl text-[11px] uppercase tracking-[0.2em]">Masuk Sistem</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200">
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] space-y-3 w-full max-sm px-4">
        {notifications.map(n => (
          <div key={n.id} className="p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 bg-indigo-950/90 border-indigo-500/30 text-indigo-100">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-500">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest">{n.message}</p>
          </div>
        ))}
      </div>

      <header className="sticky top-0 z-50 glass-panel border-b border-white/5 no-print">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 active-gradient rounded-2xl flex items-center justify-center text-white font-black">{activeClass?.name?.split(' ')[1]?.charAt(0) || 'S'}</div>
            <div>
              <h1 className="font-black text-white text-lg uppercase leading-none">{activeClass?.name || 'Sistem Sekolah'}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{schoolName}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="px-5 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl font-black text-[10px] uppercase hover:bg-rose-600 hover:text-white transition-all">Keluar</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8 pb-32">
        <div className="no-print space-y-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {classes.map(c => (
              <button key={c.id} onClick={() => setActiveClassId(c.id)} className={`flex-none px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${activeClassId === c.id ? 'active-gradient border-transparent text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}>
                {c.name}
              </button>
            ))}
          </div>

          <nav className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-[2.5rem] border border-white/5 shadow-2xl">
            {[
              { id: 'Daily', label: 'Presensi', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'Reports', label: 'Rekapitulasi', icon: 'M9 17v-2m3 2v-4m3 2v-6m-8-2h8a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z' },
              { id: 'Assignments', label: 'Tugas & Nilai', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { id: 'Admin', label: 'Manajemen', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
            ].map((t) => (
              <button key={t.id} onClick={() => setView(t.id as ViewType)} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all ${view === t.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'text-slate-600 hover:text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={t.icon} /></svg>
                <span className="mobile-hide">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="view-transition">
          {/* DAILY PRESENCE VIEW */}
          {view === 'Daily' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between no-print">
                <div className="flex flex-col">
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter">Hadir Hari Ini</h2>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">
                    {DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveAttendance} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2 hover:bg-indigo-700 transition-all mr-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    Simpan
                  </button>
                  <button onClick={() => setCurrentDate(getNextTeachingDate(currentDate, activeClass?.schedule || [1,2,3,4,5], 'prev'))} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                  <button onClick={() => setCurrentDate(getNextTeachingDate(currentDate, activeClass?.schedule || [1,2,3,4,5], 'next'))} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
                </div>
              </div>
              <div className="space-y-3">
                {activeClass?.students.map((s, idx) => {
                  const status = attendance[s.id]?.[formatDate(currentDate)] || 'H';
                  return (
                    <div key={s.id} className="dark-card p-5 rounded-[2rem] flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs">{idx + 1}</div>
                        <div>
                          <p className="font-black text-white text-xs uppercase leading-none group-hover:text-indigo-400 transition-colors">{s.name}</p>
                          <p className="text-[9px] font-bold text-slate-600 tracking-widest">NIS: {s.nis}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(st => (
                          <button key={st} onClick={() => handleStatusChange(s.id, formatDate(currentDate), st)} className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all border ${status === st ? DARK_STATUS_COLORS[st] + ' scale-110 shadow-lg' : 'bg-transparent border-transparent text-slate-700 hover:bg-white/5'}`}>{st}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REPORTS VIEW - REKAPITULASI */}
          {view === 'Reports' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 no-print">
                 <div className="flex gap-2 p-1.5 bg-slate-900 rounded-[1.5rem] border border-white/5">
                    {['Weekly', 'Monthly', 'Semester'].map(t => (
                      <button key={t} onClick={() => setReportTab(t as any)} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${reportTab === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>{t === 'Weekly' ? 'Mingguan' : t === 'Monthly' ? 'Bulanan' : 'Semester'}</button>
                    ))}
                 </div>
                 <div className="flex gap-3">
                   <button onClick={exportReportToExcel} className="px-6 py-4 bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 rounded-2xl font-black text-[11px] uppercase flex items-center gap-3 hover:bg-emerald-600 hover:text-white transition-all shadow-xl">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Unduh Excel
                   </button>
                   <button onClick={handlePrint} className="px-8 py-4 active-gradient text-white rounded-2xl font-black text-[11px] uppercase shadow-2xl flex items-center gap-3 hover:scale-[1.03] active:scale-[0.97] transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Cetak Rekap
                   </button>
                 </div>
              </div>

              {reportTab === 'Monthly' && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-print">
                   {MONTHS_2026.map(m => (
                     <button key={m.value} onClick={() => setActiveMonth(m.value)} className={`flex-none px-6 py-3 rounded-2xl text-[10px] font-black uppercase border transition-all ${activeMonth === m.value ? MONTH_COLORS[m.value] + ' shadow-xl' : 'border-slate-800 text-slate-600 hover:border-slate-700'}`}>{m.name}</button>
                   ))}
                </div>
              )}

              {classSummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
                   <div className="dark-card p-8 rounded-[2.5rem] bg-indigo-600/5 border-indigo-500/20">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4">Rata-rata Kehadiran</p>
                      <div className="flex items-end gap-2">
                         <span className="text-5xl font-black text-white leading-none">{classSummary.avg}%</span>
                         <span className="text-xs font-bold text-slate-500 pb-1">Efektivitas</span>
                      </div>
                   </div>
                   <div className="dark-card p-8 rounded-[2.5rem] bg-emerald-600/5 border-emerald-500/20">
                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4">Siswa Terajin</p>
                      <div className="space-y-1">
                         <span className="text-lg font-black text-white uppercase tracking-tight block truncate">{classSummary.best}</span>
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Performa 100%</span>
                      </div>
                   </div>
                   <div className="dark-card p-8 rounded-[2.5rem] bg-rose-600/5 border-rose-500/20">
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-[0.3em] mb-4">Ketidakhadiran</p>
                      <div className="flex items-end gap-2">
                         <span className="text-5xl font-black text-white leading-none">{classSummary.absentRate}%</span>
                         <span className="text-xs font-bold text-slate-500 pb-1">Total Absen</span>
                      </div>
                   </div>
                </div>
              )}

              <div className="dark-card rounded-[3.5rem] overflow-hidden shadow-2xl print:border-2 print:border-black print:rounded-none">
                 <div className="p-12 border-b border-white/5 text-center space-y-4 print:p-6 print:border-black bg-slate-900/40">
                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter print:text-black print:text-2xl">Daftar Hadir Peserta Didik</h3>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] print:text-black">
                       <span>Sekolah: <span className="text-white print:text-black font-extrabold">{schoolName}</span></span>
                       <span>Kelas: <span className="text-white print:text-black font-extrabold">{activeClass?.name || '-'}</span></span>
                       <span>Periode: <span className="text-indigo-400 print:text-black font-extrabold">{reportTab === 'Weekly' ? 'Mingguan' : reportTab === 'Monthly' ? MONTHS_2026[activeMonth].name : 'Semester 1 (Jan-Jun)'}</span></span>
                    </div>
                    <div className="flex justify-center gap-2 mt-4 no-print">
                      {(activeClass?.schedule || [1,2,3,4,5]).map(d => (
                         <span key={d} className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-full text-[8px] font-black text-slate-500 uppercase">{DAY_NAMES[d]}</span>
                      ))}
                    </div>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse print:text-black">
                      <thead className="bg-slate-950/80 border-b border-white/5 print:bg-transparent print:border-black">
                        <tr>
                          <th className="p-6 font-black text-slate-500 uppercase w-12 text-center sticky left-0 bg-slate-950/80 z-20 print:bg-white print:text-black">No</th>
                          <th className="p-6 font-black text-slate-500 uppercase tracking-widest min-w-[200px] sticky left-12 bg-slate-950/80 z-20 print:bg-white print:text-black">Nama Peserta Didik</th>
                          
                          {/* HEADERS TANGGAL DINAMIS */}
                          {reportDates.map((d, i) => (
                            <th key={i} className={`p-4 text-center font-black border-l border-white/5 min-w-[50px] print:border-black print:text-black ${MONTH_COLORS[d.getMonth()]}`}>
                               <span className="block text-[8px] opacity-70 mb-1">{DAY_NAMES[d.getDay()].slice(0, 3)}</span>
                               <span className="block text-lg leading-none">{d.getDate()}</span>
                            </th>
                          ))}

                          <th className="p-6 text-center font-black text-emerald-400 uppercase w-16 border-l border-white/5 bg-slate-950/90 print:border-black print:text-black">H</th>
                          <th className="p-6 text-center font-black text-blue-400 uppercase w-16 border-l border-white/5 bg-slate-950/90 print:border-black print:text-black">S</th>
                          <th className="p-6 text-center font-black text-amber-400 uppercase w-16 border-l border-white/5 bg-slate-950/90 print:border-black print:text-black">I</th>
                          <th className="p-6 text-center font-black text-rose-400 uppercase w-16 border-l border-white/5 bg-slate-950/90 print:border-black print:text-black">A</th>
                          <th className="p-6 text-center font-black text-indigo-400 uppercase w-24 border-l border-white/5 bg-slate-950/90 print:border-black print:text-black">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 print:divide-black">
                        {activeClass?.students.map((s, idx) => {
                          const stats = calculateStats(s.id, reportDates);
                          const total = stats.H + stats.S + stats.I + stats.A;
                          const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
                          return (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors group print:hover:bg-transparent">
                              <td className="p-6 text-center font-bold text-slate-600 sticky left-0 bg-[#0f172a] group-hover:bg-slate-800 transition-colors z-10 print:bg-white print:text-black">{idx + 1}</td>
                              <td className="p-6 font-black text-white uppercase tracking-tight sticky left-12 bg-[#0f172a] group-hover:text-indigo-400 group-hover:bg-slate-800 transition-colors z-10 print:bg-white print:text-black">{s.name}</td>
                              
                              {/* STATUS HARIAN */}
                              {reportDates.map((d, i) => {
                                 const status = attendance[s.id]?.[formatDate(d)] || 'H';
                                 const isFuture = isFutureDate(d);
                                 return (
                                   <td key={i} className={`p-4 text-center border-l border-white/5 font-black text-xs print:border-black print:text-black ${isFuture ? 'opacity-20' : ''}`}>
                                      <span className={status === 'H' ? 'text-emerald-500/40' : DARK_STATUS_COLORS[status].split(' ')[0]}>{status}</span>
                                   </td>
                                 );
                              })}

                              <td className="p-6 text-center font-bold text-emerald-500 bg-slate-950/30 border-l border-white/5 print:border-black print:text-black">{stats.H}</td>
                              <td className="p-6 text-center font-bold text-blue-500 bg-slate-950/30 border-l border-white/5 print:border-black print:text-black">{stats.S}</td>
                              <td className="p-6 text-center font-bold text-amber-500 bg-slate-950/30 border-l border-white/5 print:border-black print:text-black">{stats.I}</td>
                              <td className="p-6 text-center font-bold text-rose-500 bg-slate-950/30 border-l border-white/5 print:border-black print:text-black">{stats.A}</td>
                              <td className="p-6 text-center bg-indigo-500/5 border-l border-white/5 print:border-black">
                                 <span className="font-black text-indigo-400 text-sm print:text-black">{percent}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                 </div>
              </div>
            </div>
          )}

          {/* ASSIGNMENTS VIEW */}
          {view === 'Assignments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between no-print">
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Daftar Penugasan</h2>
                <button onClick={() => { setEditingAssignment(null); setAdminFormData({ ...adminFormData, assignTitle: '', assignDesc: '', assignDue: formatDate(new Date()) }); setShowAssignmentModal(true); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2 hover:scale-105 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  Buat Tugas
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(activeClass?.assignments || []).map(a => {
                  const subCount = getSubmittedCount(a);
                  const totalCount = activeClass?.students.length || 1;
                  const percent = Math.round((subCount / totalCount) * 100);
                  return (
                    <div key={a.id} className="dark-card p-8 rounded-[2.5rem] space-y-5 relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          </div>
                          <div>
                            <h4 className="font-black text-white text-base uppercase leading-tight">{a.title}</h4>
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1">Deadline: {new Date(a.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                          <span className="text-slate-500">Progres</span>
                          <span className="text-indigo-400 font-bold">{subCount} / {totalCount} Siswa</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                      <button onClick={() => { setActiveAssignment(a); setShowGradingModal(true); }} className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-xl">Kelola Nilai</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADMIN VIEW */}
          {view === 'Admin' && (
            <div className="space-y-6">
              <div className="flex gap-4 p-1.5 bg-slate-900 rounded-[2rem] border border-white/5 overflow-x-auto scrollbar-hide">
                 {['Kelas', 'Siswa', 'Database', 'Cloud'].map(t => (
                   <button key={t} onClick={() => setAdminTab(t as any)} className={`flex-none md:flex-1 px-6 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${adminTab === t ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'text-slate-600 hover:text-slate-400'}`}>{t}</button>
                 ))}
              </div>
              
              {adminTab === 'Kelas' && (
                <div className="dark-card p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                   <div className="flex items-center justify-between">
                      <h3 className="font-black text-white uppercase tracking-tighter text-xl">Manajemen Kelas</h3>
                      <button onClick={() => { 
                        setEditingClass(null); 
                        setAdminFormData({ ...adminFormData, className: '', schedule: [1,2,3,4,5] }); 
                        setShowClassModal(true); 
                      }} className="px-6 py-3 active-gradient text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Tambah Kelas</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {classes.map(c => (
                        <div key={c.id} className="p-6 bg-slate-950/50 border border-slate-800 rounded-[2.5rem] flex items-center justify-between group hover:border-indigo-500/50 transition-all">
                           <div className="space-y-3">
                              <p className="font-black text-white uppercase text-sm tracking-tight group-hover:text-indigo-400 transition-all">{c.name}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(c.schedule || [1,2,3,4,5]).map(d => (
                                  <span key={d} className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[8px] font-black text-indigo-400 uppercase">{DAY_NAMES[d].slice(0, 3)}</span>
                                ))}
                              </div>
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">{c.students.length} Siswa Terdaftar</p>
                           </div>
                           <button onClick={() => {
                             setEditingClass(c);
                             setAdminFormData({...adminFormData, className: c.name, schedule: c.schedule || [1,2,3,4,5]});
                             setShowClassModal(true);
                           }} className="p-4 bg-slate-900 border border-slate-800 text-slate-500 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all shadow-xl">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                           </button>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              {adminTab === 'Siswa' && (
                <div className="dark-card p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <h3 className="font-black text-white uppercase tracking-tighter text-xl">Database Siswa - {activeClass?.name}</h3>
                      <button onClick={() => { setEditingStudent(null); setAdminFormData({ ...adminFormData, studentName: '', studentNis: '' }); setShowStudentModal(true); }} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg">Tambah Siswa</button>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-[10px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                          <tr>
                            <th className="p-4 font-black text-slate-500 uppercase">Nama Lengkap</th>
                            <th className="p-4 font-black text-slate-500 uppercase text-center">NIS</th>
                            <th className="p-4 font-black text-slate-500 uppercase text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {activeClass?.students.map(s => (
                            <tr key={s.id}>
                              <td className="p-4 font-black text-white uppercase">{s.name}</td>
                              <td className="p-4 text-center font-bold text-slate-400">{s.nis}</td>
                              <td className="p-4 text-center">
                                <button onClick={() => handleDeleteStudent(s.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODALS SECTION */}
      {showGradingModal && activeAssignment && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-4xl p-8 md:p-12 rounded-[3.5rem] space-y-8 animate-in zoom-in-95 shadow-2xl border-indigo-500/20 max-h-[90vh] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                  <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Penilaian: {activeAssignment.title}</h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Status Pengumpulan dan Pemberian Nilai.</p>
               </div>
               <button onClick={() => setShowGradingModal(false)} className="p-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            {/* Modal Body Scroll */}
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">
               {activeClass?.students.map((s, idx) => {
                 const sub = activeAssignment.submissions[s.id] || { isSubmitted: false, score: '' };
                 return (
                   <div key={s.id} className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${sub.isSubmitted ? 'bg-emerald-600/5 border-emerald-500/20' : 'bg-slate-900/30 border-slate-800'}`}>
                      <div className="flex items-center gap-4 flex-1">
                         <span className="text-[10px] font-black text-slate-700 w-6">{idx + 1}</span>
                         <div>
                            <p className={`font-black uppercase text-xs transition-colors ${sub.isSubmitted ? 'text-emerald-400' : 'text-white'}`}>{s.name}</p>
                            <p className="text-[9px] font-bold text-slate-600">NIS: {s.nis}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-6">
                         <button onClick={() => updateSubmission(activeAssignment.id, s.id, 'isSubmitted', !sub.isSubmitted)} className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${sub.isSubmitted ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-950 border-slate-800 text-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                         </button>
                         <input type="text" value={sub.score} onChange={(e) => updateSubmission(activeAssignment.id, s.id, 'score', e.target.value)} placeholder="0" className="w-20 bg-slate-950 border border-slate-800 rounded-xl p-3 text-center text-sm font-black text-white focus:border-indigo-500 outline-none transition-all" />
                      </div>
                   </div>
                 );
               })}
            </div>
            <button onClick={() => { setShowGradingModal(false); showToast('Penilaian Disimpan!'); }} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] text-xs uppercase tracking-widest transition-all">Simpan Seluruh Nilai</button>
          </div>
        </div>
      )}

      {showClassModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl border-indigo-500/20">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingClass ? 'Ubah Informasi Kelas' : 'Tambah Kelas Baru'}</h4>
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nama Kelas</label>
                    <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} type="text" placeholder="XII.IPA.1" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase transition-all" />
                </div>
                <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Jadwal Mengajar (Hari)</label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(d => (
                        <button key={d} onClick={() => toggleScheduleDay(d)} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border ${adminFormData.schedule.includes(d) ? 'bg-indigo-600 border-transparent text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-700'}`}>
                          {DAY_NAMES[d].slice(0, 3)}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] font-bold text-indigo-400/60 italic text-center leading-relaxed px-4">Rekapitulasi hanya akan menampilkan tanggal pada hari yang dipilih di atas.</p>
                </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowClassModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase hover:bg-slate-800 transition-all">Batal</button>
              <button onClick={handleAddOrEditClass} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase hover:scale-105 transition-all">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showStudentModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl border-indigo-500/20">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingStudent ? 'Ubah Data Siswa' : 'Daftarkan Siswa'}</h4>
            <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nama Lengkap</label>
                  <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} placeholder="Input Nama" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">NIS (Nomor Induk Siswa)</label>
                  <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} placeholder="Input NIS" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 transition-all" />
                </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setShowStudentModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Batal</button>
              <button onClick={handleAddOrEditStudent} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingAssignment ? 'Ubah Detail Tugas' : 'Buat Penugasan Baru'}</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Judul Penugasan</label>
                <input value={adminFormData.assignTitle} onChange={e => setAdminFormData({...adminFormData, assignTitle: e.target.value})} type="text" placeholder="Contoh: ANALISIS DATA" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Batas Pengumpulan (Deadline)</label>
                <input value={adminFormData.assignDue} onChange={e => setAdminFormData({...adminFormData, assignDue: e.target.value})} type="date" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 transition-all" />
              </div>
            </div>
            <div className="flex gap-4 pt-6">
              <button onClick={() => setShowAssignmentModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Batal</button>
              <button onClick={handleAddOrEditAssignment} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase">Simpan Tugas</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .dark-card { border: none !important; background: transparent !important; box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; width: 100% !important; overflow: visible !important; }
          table { width: 100% !important; border-collapse: collapse !important; color: black !important; font-size: 8px !important; }
          th, td { border: 1px solid black !important; color: black !important; padding: 4px !important; background: transparent !important; position: static !important; }
          th { font-weight: 900 !important; }
          header { display: none !important; }
          main { padding: 0 !important; width: 100% !important; max-width: 100% !important; }
          .view-transition { transform: none !important; animation: none !important; }
          .bg-slate-900\/40 { background: transparent !important; }
          .text-white { color: black !important; }
          .text-slate-400, .text-slate-500, .text-slate-600 { color: #333 !important; }
          [class*='bg-'], [class*='text-'] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        /* Smooth scrolling for reports table */
        .overflow-x-auto {
           scroll-behavior: smooth;
           -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </div>
  );
};

export default App;
