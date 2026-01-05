
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CLASSES as INITIAL_CLASSES } from './constants';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData } from './types';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate } from './utils';

const DARK_STATUS_COLORS: Record<AttendanceStatus, string> = {
  'H': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 ring-emerald-500/20',
  'S': 'text-blue-400 bg-blue-500/10 border-blue-500/30 ring-blue-500/20',
  'I': 'text-amber-400 bg-amber-500/10 border-amber-500/30 ring-amber-500/20',
  'A': 'text-rose-400 bg-rose-500/10 border-rose-500/30 ring-rose-500/20'
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
    assignDue: formatDate(new Date())
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

  const activeClass = classes.find(c => c.id === activeClassId);

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
    if (reportTab === 'Weekly') return getWeekDates(currentDate);
    if (reportTab === 'Monthly') return getMonthDates(activeMonth);
    return getSemesterDates();
  }, [reportTab, currentDate, activeMonth]);

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
    
    const rows = [
      ["No", "Nama Siswa", "Hadir (H)", "Sakit (S)", "Izin (I)", "Alpa (A)", "Persentase (%)"],
      ...activeClass.students.map((s, idx) => {
        const stats = calculateStats(s.id, reportDates);
        const total = stats.H + stats.S + stats.I + stats.A;
        const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
        return [(idx + 1).toString(), s.name, stats.H.toString(), stats.S.toString(), stats.I.toString(), stats.A.toString(), percent.toString()];
      })
    ];
    
    downloadCSV(filename, rows);
    showToast('Rekap Excel Berhasil Diunduh!');
  };

  const exportAssignmentToExcel = (assignment: Assignment) => {
    if (!activeClass) return;
    const filename = `Nilai_${assignment.title}_${activeClass.name}.csv`;
    
    const rows = [
      ["No", "Nama Siswa", "NIS", "Status Pengumpulan", "Nilai"],
      ...activeClass.students.map((s, idx) => {
        const sub = assignment.submissions[s.id] || { isSubmitted: false, score: '' };
        return [
          (idx + 1).toString(),
          s.name,
          s.nis,
          sub.isSubmitted ? "Sudah Mengumpulkan" : "Belum",
          sub.score || "0"
        ];
      })
    ];
    
    downloadCSV(filename, rows);
    showToast('Nilai Excel Berhasil Diunduh!');
  };

  const handleExportData = () => {
    const data = { classes, attendance, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_presensi_${formatDate(new Date())}.json`;
    a.click();
    showToast('Backup Berhasil!');
  };

  const downloadTemplate = () => {
    const csvContent = "nis,name\n261001,ANDI MUHAMMAD\n261002,SITI NURHALIZA";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "template_siswa.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeClassId) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newStudents: Student[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const [nis, name] = line.split(',').map(s => s.trim());
        if (nis && name) {
          newStudents.push({
            id: `std-${Date.now()}-${i}`,
            nis,
            name,
            nisn: ''
          });
        }
      }

      if (newStudents.length > 0) {
        setClasses(prev => prev.map(c => 
          c.id === activeClassId 
            ? { ...c, students: [...c.students, ...newStudents] } 
            : c
        ));
        showToast(`Berhasil mengimpor ${newStudents.length} siswa!`);
      } else {
        showToast('Tidak ada data valid yang ditemukan.', 'error');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleAddOrEditClass = () => {
    if (!adminFormData.className) return;
    if (editingClass) {
      setClasses(classes.map(c => c.id === editingClass.id ? { ...c, name: adminFormData.className } : c));
    } else {
      const newId = `cls-${Date.now()}`;
      setClasses([...classes, { id: newId, name: adminFormData.className, students: [], assignments: [] }]);
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

  const handleAddOrEditAssignment = () => {
    if (!activeClassId || !adminFormData.assignTitle) return;
    const newClasses = [...classes];
    const classIdx = newClasses.findIndex(c => c.id === activeClassId);
    if (classIdx === -1) return;
    const currentAssignments = newClasses[classIdx].assignments || [];
    if (editingAssignment) {
      newClasses[classIdx].assignments = currentAssignments.map(a => 
        a.id === editingAssignment.id ? { ...a, title: adminFormData.assignTitle, description: adminFormData.assignDesc, dueDate: adminFormData.assignDue } : a
      );
    } else {
      const newA: Assignment = {
        id: `task-${Date.now()}`,
        title: adminFormData.assignTitle,
        description: adminFormData.assignDesc,
        dueDate: adminFormData.assignDue,
        submissions: {}
      };
      newClasses[classIdx].assignments = [...currentAssignments, newA];
    }
    setClasses(newClasses);
    setShowAssignmentModal(false);
    setEditingAssignment(null);
  };

  const updateSubmission = (assignmentId: string, studentId: string, field: keyof SubmissionData, value: any) => {
    setClasses(classes.map(c => {
      if (c.id === activeClassId) {
        return {
          ...c,
          assignments: (c.assignments || []).map(a => {
            if (a.id === assignmentId) {
              const currentSub = a.submissions[studentId] || { isSubmitted: false, score: '' };
              return { ...a, submissions: { ...a.submissions, [studentId]: { ...currentSub, [field]: value } } };
            }
            return a;
          })
        };
      }
      return c;
    }));
  };

  const getSubmittedCount = (assignment: Assignment) => {
    return Object.values(assignment.submissions).filter(s => s.isSubmitted).length;
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
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] space-y-3 w-full max-w-sm px-4">
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
          {/* DAILY */}
          {view === 'Daily' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between no-print">
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Hadir Hari Ini</h2>
                <div className="flex gap-2">
                  <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(d); }} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                  <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(d); }} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
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

          {/* REPORTS */}
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
                      Unduh Excel (Rekap)
                   </button>
                   <button onClick={handlePrint} className="px-8 py-4 active-gradient text-white rounded-2xl font-black text-[11px] uppercase shadow-2xl flex items-center gap-3 hover:scale-[1.03] active:scale-[0.97] transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Cetak Laporan
                   </button>
                 </div>
              </div>

              {reportTab === 'Monthly' && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-print">
                   {MONTHS_2026.map(m => (
                     <button key={m.value} onClick={() => setActiveMonth(m.value)} className={`flex-none px-5 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${activeMonth === m.value ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-xl' : 'border-slate-800 text-slate-600 hover:border-slate-700'}`}>{m.name}</button>
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
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Performa Sempurna (100%)</span>
                      </div>
                   </div>
                   <div className="dark-card p-8 rounded-[2.5rem] bg-rose-600/5 border-rose-500/20">
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-[0.3em] mb-4">Tingkat Ketidakhadiran</p>
                      <div className="flex items-end gap-2">
                         <span className="text-5xl font-black text-white leading-none">{classSummary.absentRate}%</span>
                         <span className="text-xs font-bold text-slate-500 pb-1">Total Absensi</span>
                      </div>
                   </div>
                </div>
              )}

              <div className="dark-card rounded-[3.5rem] overflow-hidden shadow-2xl print:border-2 print:border-black print:rounded-none">
                 <div className="p-12 border-b border-white/5 text-center space-y-4 print:p-6 print:border-black">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter print:text-black print:text-2xl">Laporan Rekapitulasi Presensi Siswa</h3>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] print:text-black">
                       <span>Sekolah: <span className="text-white print:text-black">{schoolName}</span></span>
                       <span>Kelas: <span className="text-white print:text-black">{activeClass?.name || '-'}</span></span>
                       <span>Periode: <span className="text-indigo-400 print:text-black">{reportTab === 'Weekly' ? 'Mingguan' : reportTab === 'Monthly' ? MONTHS_2026[activeMonth].name : 'Semester 1 (Jan-Jun)'}</span></span>
                    </div>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] print:text-black">
                      <thead className="bg-slate-950/50 border-b border-white/5 print:bg-transparent print:border-black">
                        <tr>
                          <th className="p-6 font-black text-slate-500 uppercase w-12 text-center print:text-black">No</th>
                          <th className="p-6 font-black text-slate-500 uppercase tracking-widest print:text-black">Nama Peserta Didik</th>
                          <th className="p-6 text-center font-black text-emerald-400 uppercase w-16 print:text-black">H</th>
                          <th className="p-6 text-center font-black text-blue-400 uppercase w-16 print:text-black">S</th>
                          <th className="p-6 text-center font-black text-amber-400 uppercase w-16 print:text-black">I</th>
                          <th className="p-6 text-center font-black text-rose-400 uppercase w-16 print:text-black">A</th>
                          <th className="p-6 text-center font-black text-indigo-400 uppercase w-32 print:text-black">Persentase</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 print:divide-black">
                        {activeClass?.students.map((s, idx) => {
                          const stats = calculateStats(s.id, reportDates);
                          const total = stats.H + stats.S + stats.I + stats.A;
                          const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
                          return (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors group print:hover:bg-transparent">
                              <td className="p-6 text-center font-bold text-slate-600 print:text-black">{idx + 1}</td>
                              <td className="p-6 font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors print:text-black">{s.name}</td>
                              <td className="p-6 text-center font-bold text-emerald-500/80 print:text-black">{stats.H}</td>
                              <td className="p-6 text-center font-bold text-blue-500/80 print:text-black">{stats.S}</td>
                              <td className="p-6 text-center font-bold text-amber-500/80 print:text-black">{stats.I}</td>
                              <td className="p-6 text-center font-bold text-rose-500/80 print:text-black">{stats.A}</td>
                              <td className="p-6 text-center">
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

          {/* ASSIGNMENTS */}
          {view === 'Assignments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between no-print">
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Daftar Penugasan</h2>
                <button onClick={() => { setEditingAssignment(null); setAdminFormData({ ...adminFormData, assignTitle: '', assignDesc: '', assignDue: formatDate(new Date()) }); setShowAssignmentModal(true); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2">
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
                          <span className="text-indigo-400">{subCount} / {totalCount} Siswa</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                      <button onClick={() => { setActiveAssignment(a); setShowGradingModal(true); }} className="w-full py-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-xl">Kelola Nilai</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADMIN */}
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
                      <h3 className="font-black text-white uppercase tracking-tighter">Manajemen Kelas</h3>
                      <button onClick={() => { setEditingClass(null); setAdminFormData({ ...adminFormData, className: '' }); setShowClassModal(true); }} className="px-5 py-3 active-gradient text-white rounded-xl font-black text-[9px] uppercase">Tambah Kelas</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {classes.map(c => (
                        <div key={c.id} className="p-5 bg-slate-950/50 border border-slate-800 rounded-2xl flex items-center justify-between">
                           <div>
                              <p className="font-black text-white uppercase text-xs tracking-tight">{c.name}</p>
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">{c.students.length} Siswa</p>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              {adminTab === 'Siswa' && (
                <div className="dark-card p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <h3 className="font-black text-white uppercase tracking-tighter">Database Siswa - {activeClass?.name}</h3>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={downloadTemplate} className="px-5 py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-black text-[9px] uppercase flex items-center gap-2 hover:bg-slate-800 transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V3m0 0L8 7m4-4l4 4" /></svg>
                          Template CSV
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" id="csv-upload" />
                        <label htmlFor="csv-upload" className="px-5 py-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl font-black text-[9px] uppercase cursor-pointer flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                          Unggah CSV
                        </label>
                        <button onClick={() => { setEditingStudent(null); setAdminFormData({ ...adminFormData, studentName: '', studentNis: '' }); setShowStudentModal(true); }} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg">Tambah Siswa</button>
                      </div>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-[10px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                          <tr>
                            <th className="p-4 font-black text-slate-500 uppercase">Nama</th>
                            <th className="p-4 font-black text-slate-500 uppercase text-center">NIS</th>
                            <th className="p-4 font-black text-slate-500 uppercase text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {activeClass?.students.map(s => (
                            <tr key={s.id}>
                              <td className="p-4 font-black text-white uppercase">{s.name}</td>
                              <td className="p-4 text-center font-bold text-slate-400">{s.nis}</td>
                              <td className="p-4">
                                <div className="flex justify-center gap-2">
                                  <button onClick={() => handleDeleteStudent(s.id)} className="p-2 text-rose-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              )}

              {adminTab === 'Database' && (
                <div className="dark-card p-12 rounded-[3rem] text-center space-y-6 shadow-2xl">
                   <div className="w-20 h-20 bg-slate-900 rounded-3xl mx-auto flex items-center justify-center border border-white/5 text-indigo-400">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 1.1.9 2 2 2h12a2 2 0 002-2V7M4 7a2 2 0 012-2h12a2 2 0 012 2M4 7l8 5 8-5M8 11h.01M12 11h.01M16 11h.01" /></svg>
                   </div>
                   <h3 className="text-xl font-black text-white uppercase tracking-tighter">Cadangkan Data Lokal</h3>
                   <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest max-w-sm mx-auto leading-relaxed">Gunakan fitur ini untuk mendownload semua data yang tersimpan di browser Anda ke file JSON.</p>
                   <button onClick={handleExportData} className="px-10 py-5 bg-slate-900 border border-slate-800 rounded-3xl text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-2xl">Unduh Database (.json)</button>
                </div>
              )}

              {adminTab === 'Cloud' && (
                <div className="dark-card p-10 rounded-[3rem] space-y-8 shadow-2xl border-indigo-500/20">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400">
                         <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                      </div>
                      <div>
                         <h3 className="text-xl font-black text-white uppercase tracking-tighter">Konfigurasi Cloud (Netlify)</h3>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Status: Siap untuk Sinkronisasi</p>
                      </div>
                   </div>
                   <div className="space-y-6 bg-slate-950 p-6 rounded-2xl border border-white/5">
                      <div className="space-y-4">
                         <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">A. Cari API Key di Supabase:</h4>
                         <ol className="text-[10px] text-slate-400 space-y-2 list-decimal ml-4 font-bold">
                            <li>Buka <a href="https://supabase.com/dashboard" target="_blank" className="text-indigo-400 underline">Dashboard Supabase</a></li>
                            <li>Pilih Project Bapak > Klik Ikon <b>Settings (Gerigi ⚙️)</b></li>
                            <li>Klik Menu <b>API</b></li>
                            <li>Lihat bagian <b>Project Config</b> dan <b>Project API keys</b></li>
                         </ol>
                      </div>

                      <div className="space-y-4">
                         <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">B. Masukkan ke Netlify:</h4>
                         <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-slate-900 rounded-xl border border-white/5">
                               <span className="text-[10px] font-black text-slate-400">NETLIFY KEY</span>
                               <span className="text-[10px] font-black text-indigo-400">SALIN DARI SUPABASE</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5">
                               <code className="text-[10px] font-black text-white">VITE_SUPABASE_URL</code>
                               <span className="text-[9px] font-bold text-slate-500 italic">Salin "Project URL"</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5">
                               <code className="text-[10px] font-black text-white">VITE_SUPABASE_ANON_KEY</code>
                               <span className="text-[9px] font-bold text-slate-500 italic">Salin "anon public" key</span>
                            </div>
                         </div>
                      </div>
                   </div>
                   <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest text-center">Variabel ini menjaga agar database Bapak tetap rahasia dan aman.</p>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      {showGradingModal && activeAssignment && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-4xl p-8 md:p-12 rounded-[3.5rem] space-y-8 animate-in zoom-in-95 shadow-2xl border-indigo-500/20 max-h-[90vh] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                  <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Penilaian: {activeAssignment.title}</h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Centang pengumpulan dan isi nilai.</p>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => exportAssignmentToExcel(activeAssignment)} className="px-5 py-3 bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 rounded-xl font-black text-[9px] uppercase flex items-center gap-2 hover:bg-emerald-600 hover:text-white transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Unduh Nilai (Excel)
                 </button>
                 <button onClick={() => setShowGradingModal(false)} className="p-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
               <div className="grid grid-cols-1 gap-2">
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
                            <button onClick={() => updateSubmission(activeAssignment.id, s.id, 'isSubmitted', !sub.isSubmitted)} className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${sub.isSubmitted ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-transparent'}`}>
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <input type="text" value={sub.score} onChange={(e) => updateSubmission(activeAssignment.id, s.id, 'score', e.target.value)} placeholder="0" className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-center text-xs font-black text-white focus:border-indigo-500 outline-none" />
                         </div>
                      </div>
                    );
                  })}
               </div>
            </div>
            <button onClick={() => { setShowGradingModal(false); showToast('Penilaian Disimpan!'); }} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] text-xs uppercase tracking-widest transition-all">Selesai & Simpan</button>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingAssignment ? 'Ubah Tugas' : 'Buat Tugas Baru'}</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nama Tugas</label>
                <input value={adminFormData.assignTitle} onChange={e => setAdminFormData({...adminFormData, assignTitle: e.target.value})} type="text" placeholder="Contoh: TRIGONOMETRI" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Deadline</label>
                <input value={adminFormData.assignDue} onChange={e => setAdminFormData({...adminFormData, assignDue: e.target.value})} type="date" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setShowAssignmentModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Batal</button>
              <button onClick={handleAddOrEditAssignment} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showClassModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingClass ? 'Ubah Kelas' : 'Tambah Kelas'}</h4>
            <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nama Kelas</label>
                <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} type="text" placeholder="XII.1" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowClassModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Batal</button>
              <button onClick={handleAddOrEditClass} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showStudentModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="dark-card w-full max-w-md p-10 rounded-[3rem] space-y-8 animate-in zoom-in-95 shadow-2xl">
            <h4 className="text-2xl font-black text-white uppercase tracking-tighter text-center">{editingStudent ? 'Ubah Siswa' : 'Tambah Siswa'}</h4>
            <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nama Lengkap</label>
                  <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} placeholder="Nama Siswa" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500 uppercase" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">NIS</label>
                  <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} placeholder="NIS" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white font-bold outline-none focus:border-indigo-500" />
                </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowStudentModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 text-slate-400 font-black rounded-2xl text-[10px] uppercase">Batal</button>
              <button onClick={handleAddOrEditStudent} className="flex-1 py-5 active-gradient text-white font-black rounded-2xl text-[10px] uppercase">Simpan</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .dark-card { border: none !important; background: transparent !important; box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; width: 100% !important; }
          table { width: 100% !important; border-collapse: collapse !important; color: black !important; }
          th, td { border: 1.5px solid black !important; color: black !important; padding: 10px !important; }
          header { display: none !important; }
          main { padding: 0 !important; width: 100% !important; max-width: 100% !important; }
          .view-transition { transform: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
