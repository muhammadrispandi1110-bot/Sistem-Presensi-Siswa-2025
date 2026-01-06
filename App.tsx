
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
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

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  
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
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
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
    schedule: defaults.teachingDays
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!supabase) {
      showToast('Gagal terhubung ke Cloud', 'error');
      setClasses(INITIAL_CLASSES);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
      // 1. Ambil semua data dari setiap tabel
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

      // 2. Susun data menjadi struktur yang dibutuhkan UI
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
      
      showToast('Data Cloud Sinkron!', 'success');

    } catch (err: any) {
      console.error('Fetch Failed:', err);
      showToast('Gagal memuat Cloud, periksa koneksi atau pengaturan database.', 'error');
      setClasses(INITIAL_CLASSES); // Fallback to initial data on error
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFromCloud();
    }
  }, [isAuthenticated, fetchFromCloud]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.user === auth.username && loginForm.pass === auth.password) {
      setIsAuthenticated(true);
    } else {
      showToast('Kredensial Salah!', 'error');
    }
  };

  const handleLogout = () => {
    if (window.confirm('Keluar sistem?')) {
      setIsAuthenticated(false);
      setClasses([]);
      setAttendance({});
      setActiveClassId(null);
    }
  };

  const handleStatusChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    if (isFutureDate(new Date(date)) || !supabase) return;

    // Optimistic UI update
    setAttendance(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [date]: status }
    }));
    
    // Sync to DB
    try {
      const { error } = await supabase.from('attendance_records').upsert(
        { student_id: studentId, record_date: date, status: status },
        { onConflict: 'student_id, record_date' }
      );
      if (error) throw error;
      setLastSync(new Date().toLocaleTimeString());
    } catch(err) {
      console.error("Sync attendance failed:", err);
      showToast('Gagal simpan absensi', 'error');
      // Optional: revert optimistic update
    }
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
    if (!activeClass || activeClass.students.length === 0) return null;
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
  }, [activeClass, reportDates, attendance]);

  const exportReportToExcel = () => {
    if (!activeClass) return;
    const period = reportTab === 'Weekly' ? 'Mingguan' : reportTab === 'Monthly' ? MONTHS_2026[activeMonth].name : 'Semester';
    const filename = `Rekap_${activeClass.name}_${period}.csv`;
    const dateHeaders = reportDates.map(d => formatDate(d));
    const headerRow = ["No", "Nama Siswa", ...dateHeaders, "H", "S", "I", "A", "%"];
    const rows = [
      headerRow,
      ...activeClass.students.map((s, idx) => {
        const stats = calculateStats(s.id, reportDates);
        const dailyStatus = reportDates.map(d => attendance[s.id]?.[formatDate(d)] || 'H');
        const total = stats.H + stats.S + stats.I + stats.A;
        const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
        return [(idx + 1).toString(), s.name, ...dailyStatus, stats.H.toString(), stats.S.toString(), stats.I.toString(), stats.A.toString(), percent.toString()];
      })
    ];
    const csvContent = rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    showToast('Rekap Diunduh!');
  };

  const handleAddOrEditClass = async () => {
    if (!adminFormData.className || !supabase) return;
    setIsSyncing(true);
    try {
      const payload = { name: adminFormData.className, schedule: adminFormData.schedule };
      const { error } = editingClass
        ? await supabase.from('classes').update(payload).eq('id', editingClass.id)
        : await supabase.from('classes').insert(payload);
      if (error) throw error;
      showToast(`Kelas ${editingClass ? 'diperbarui' : 'ditambahkan'}!`);
      await fetchFromCloud();
    } catch (err) {
      console.error("Save class failed:", err);
      showToast('Gagal menyimpan kelas', 'error');
    } finally {
      setIsSyncing(false);
      setShowClassModal(false);
      setEditingClass(null);
    }
  };
  
  const handleDeleteClass = async (classId: string) => {
    const classToDelete = classes.find(c => c.id === classId);
    if (!classToDelete || !supabase) return;
    if (window.confirm(`Yakin hapus kelas "${classToDelete.name}"? Semua data siswa & absensi terkait akan hilang.`)) {
      setIsSyncing(true);
      try {
        const { error } = await supabase.from('classes').delete().eq('id', classId);
        if (error) throw error;
        showToast('Kelas berhasil dihapus', 'info');
        await fetchFromCloud();
      } catch (err) {
        console.error("Delete class failed:", err);
        showToast('Gagal menghapus kelas', 'error');
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleAddOrEditStudent = async () => {
    if (!activeClassId || !adminFormData.studentName || !supabase) return;
    setIsSyncing(true);
    try {
        const payload = { class_id: activeClassId, name: adminFormData.studentName, nis: adminFormData.studentNis };
        const { error } = editingStudent
            ? await supabase.from('students').update(payload).eq('id', editingStudent.id)
            : await supabase.from('students').insert(payload);
        if (error) throw error;
        showToast(`Siswa ${editingStudent ? 'diperbarui' : 'ditambahkan'}!`);
        await fetchFromCloud();
    } catch (err) {
        console.error("Save student failed:", err);
        showToast('Gagal menyimpan siswa', 'error');
    } finally {
        setIsSyncing(false);
        setShowStudentModal(false);
        setEditingStudent(null);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!supabase || !window.confirm('Hapus siswa ini?')) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      showToast('Siswa dihapus', 'info');
      await fetchFromCloud();
    } catch(err) {
      console.error("Delete student failed:", err);
      showToast('Gagal menghapus siswa', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const getSubmittedCount = (assignment: Assignment) => Object.values(assignment.submissions || {}).filter(s => s.isSubmitted).length;

  const updateSubmission = async (assignmentId: string, studentId: string, field: keyof SubmissionData, value: any) => {
    // Optimistic UI update
    setClasses(prevClasses => prevClasses.map(c => {
        if (c.id === activeClassId) {
            const updatedAssignments = (c.assignments || []).map(a => {
                if (a.id === assignmentId) {
                    const updatedSubmissions = {
                        ...a.submissions,
                        [studentId]: {
                            ...(a.submissions[studentId] || { isSubmitted: false, score: '' }),
                            [field]: value
                        }
                    };
                    const updatedAssignment = { ...a, submissions: updatedSubmissions };
                    if (activeAssignment?.id === assignmentId) {
                        setActiveAssignment(updatedAssignment);
                    }
                    return updatedAssignment;
                }
                return a;
            });
            return { ...c, assignments: updatedAssignments };
        }
        return c;
    }));

    // Sync to DB
    if (!supabase) return;
    try {
        const currentSub = (activeAssignment?.submissions[studentId] || { isSubmitted: false, score: '' });
        const newSubData = { ...currentSub, [field]: value };
        const { error } = await supabase.from('submissions').upsert({
            assignment_id: assignmentId,
            student_id: studentId,
            is_submitted: newSubData.isSubmitted,
            score: newSubData.score
        }, { onConflict: 'assignment_id, student_id' });
        if (error) throw error;
        setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
        console.error("Update submission failed:", err);
        showToast('Gagal menyimpan nilai', 'error');
    }
  };

  const handleAddOrEditAssignment = async () => {
    if (!activeClassId || !adminFormData.assignTitle || !supabase) return;
    setIsSyncing(true);
    try {
        const payload = {
            class_id: activeClassId,
            title: adminFormData.assignTitle,
            description: adminFormData.assignDesc,
            due_date: adminFormData.assignDue
        };
        const { error } = editingAssignment
            ? await supabase.from('assignments').update(payload).eq('id', editingAssignment.id)
            : await supabase.from('assignments').insert(payload);
        if (error) throw error;
        showToast('Tugas disimpan!');
        await fetchFromCloud();
    } catch(err) {
        console.error("Save assignment failed:", err);
        showToast('Gagal menyimpan tugas', 'error');
    } finally {
        setIsSyncing(false);
        setShowAssignmentModal(false);
        setEditingAssignment(null);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!supabase || !window.confirm('Hapus tugas ini? Semua data nilai akan hilang.')) return;
    setIsSyncing(true);
    try {
        const { error } = await supabase.from('assignments').delete().eq('id', id);
        if (error) throw error;
        showToast('Tugas dihapus.', 'info');
        setActiveMenuId(null);
        await fetchFromCloud();
    } catch (err) {
        console.error("Delete assignment failed:", err);
        showToast('Gagal menghapus tugas', 'error');
    } finally {
        setIsSyncing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen login-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md glass-panel p-10 rounded-[2.5rem] shadow-2xl space-y-8 text-center">
          <div className="w-20 h-20 active-gradient rounded-3xl mx-auto flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Portal Digital</h1>
          <form onSubmit={handleLogin} className="space-y-6">
            <input type="text" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Username" />
            <input type="password" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Password" />
            <button type="submit" className="w-full active-gradient text-white font-black py-5 rounded-2xl uppercase tracking-widest transition-transform active:scale-95">Masuk Sistem</button>
          </form>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{school.name} - {school.year}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="mt-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Menghubungkan ke Cloud...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200" onClick={() => setActiveMenuId(null)}>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] space-y-3 w-full max-w-sm px-4">
        {notifications.map(n => (
          <div key={n.id} className="p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 bg-slate-900/90 border-white/5 text-white">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${n.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
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
              <h1 className="font-black text-white text-lg uppercase leading-none">{activeClass?.name || 'Pilih Kelas'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">{school.name}</p>
                <div className={`flex items-center gap-1.5`}>
                   <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-bounce' : 'bg-emerald-500'}`}></div>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">{isSyncing ? 'Menyimpan...' : (lastSync ? `Tersimpan ${lastSync}`: 'Tersimpan')}</span>
                </div>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="px-5 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl font-black text-[10px] uppercase transition-colors hover:bg-rose-500 hover:text-white">Keluar</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8 pb-32">
        <div className="no-print space-y-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {classes.map(c => (
              <button key={c.id} onClick={() => setActiveClassId(c.id)} className={`flex-none px-6 py-4 rounded-2xl font-black text-[10px] uppercase border transition-all ${activeClassId === c.id ? 'active-gradient border-transparent text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`}>
                {c.name}
              </button>
            ))}
             {classes.length === 0 && (
                <div className="w-full text-center py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 text-xs font-bold">
                    Tidak ada kelas. Silakan tambahkan kelas baru di menu Manajemen.
                </div>
            )}
          </div>
          <nav className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-[2.5rem] border border-white/5 shadow-2xl">
            {[
              { id: 'Daily', label: 'Presensi', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'Reports', label: 'Rekapitulasi', icon: 'M9 17v-2m3 2v-4m3 2v-6m-8-2h8a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z' },
              { id: 'Assignments', label: 'Tugas & Nilai', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { id: 'Admin', label: 'Manajemen', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
            ].map((t) => (
              <button key={t.id} onClick={() => setView(t.id as ViewType)} className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest transition-all ${view === t.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'text-slate-600 hover:text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={t.icon} /></svg>
                <span className="mobile-hide">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="view-transition">
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
                  <button onClick={() => setCurrentDate(getNextTeachingDate(currentDate, activeClass?.schedule || defaults.teachingDays, 'prev'))} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                  <button onClick={() => setCurrentDate(getNextTeachingDate(currentDate, activeClass?.schedule || defaults.teachingDays, 'next'))} className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
                </div>
              </div>
              <div className="space-y-3">
                {(activeClass?.students || []).map((s, idx) => {
                  const status = attendance[s.id]?.[formatDate(currentDate)] || 'H';
                  return (
                    <div key={s.id} className="dark-card p-5 rounded-[2rem] flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs">{idx + 1}</div>
                        <div>
                          <p className="font-black text-white text-xs uppercase leading-none group-hover:text-indigo-400">{s.name}</p>
                          <p className="text-[9px] font-bold text-slate-600">NIS: {s.nis}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(st => (
                          <button key={st} onClick={() => handleStatusChange(s.id, formatDate(currentDate), st)} className={`w-10 h-10 rounded-xl text-[10px] font-black border transition-all ${status === st ? DARK_STATUS_COLORS[st] + ' scale-110 shadow-lg' : 'bg-transparent border-transparent text-slate-700 hover:text-slate-500'}`}>{st}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'Reports' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 no-print">
                 <div className="flex gap-2 p-1.5 bg-slate-900 rounded-[1.5rem] border border-white/5">
                    {['Weekly', 'Monthly', 'Semester'].map(t => (
                      <button key={t} onClick={() => setReportTab(t as any)} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all ${reportTab === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>{t === 'Weekly' ? 'Mingguan' : t === 'Monthly' ? 'Bulanan' : 'Semester'}</button>
                    ))}
                 </div>
                 <div className="flex gap-3">
                   <button onClick={exportReportToExcel} className="px-6 py-4 bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 rounded-2xl font-black text-[11px] uppercase flex items-center gap-3 hover:bg-emerald-600 hover:text-white transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Excel
                   </button>
                   <button onClick={() => window.print()} className="px-8 py-4 active-gradient text-white rounded-2xl font-black text-[11px] uppercase flex items-center gap-3 shadow-2xl transition-transform active:scale-95">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Cetak
                   </button>
                 </div>
              </div>

              {reportTab === 'Monthly' && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-print">
                   {MONTHS_2026.map(m => (
                     <button key={m.value} onClick={() => setActiveMonth(m.value)} className={`flex-none px-6 py-3 rounded-2xl text-[10px] font-black uppercase border transition-all ${activeMonth === m.value ? MONTH_COLORS[m.value] : 'border-slate-800 text-slate-600 hover:border-slate-600'}`}>{m.name}</button>
                   ))}
                </div>
              )}

              {classSummary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
                   <div className="dark-card p-8 rounded-[2.5rem] bg-indigo-600/5 border-indigo-500/20">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-4">Efisiensi Kehadiran</p>
                      <span className="text-5xl font-black text-white">{classSummary.avg}%</span>
                   </div>
                   <div className="dark-card p-8 rounded-[2.5rem] bg-emerald-600/5 border-emerald-500/20">
                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-4">Siswa Teladan</p>
                      <span className="text-lg font-black text-white block truncate uppercase">{classSummary.best}</span>
                   </div>
                   <div className="dark-card p-8 rounded-[2.5rem] bg-rose-600/5 border-rose-500/20">
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-4">Ketidakhadiran</p>
                      <span className="text-5xl font-black text-white">{classSummary.absentRate}%</span>
                   </div>
                </div>
              )}

              <div className="dark-card rounded-[3.5rem] overflow-hidden shadow-2xl print:border-2 print:border-black print:rounded-none">
                 <div className="p-12 border-b border-white/5 text-center bg-slate-900/40 print:p-6 print:border-black">
                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter print:text-black print:text-2xl">Daftar Hadir Peserta Didik</h3>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black mt-4">
                       <span>Sekolah: <span className="text-white print:text-black font-extrabold">{school.name}</span></span>
                       <span>Kelas: <span className="text-white print:text-black font-extrabold">{activeClass?.name || '-'}</span></span>
                       <span>Periode: <span className="text-indigo-400 print:text-black font-extrabold">{reportTab === 'Weekly' ? 'Mingguan' : reportTab === 'Monthly' ? MONTHS_2026[activeMonth].name : school.periodName}</span></span>
                    </div>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse print:text-black">
                      <thead className="bg-slate-950/80 border-b border-white/5 print:bg-transparent print:border-black">
                        <tr>
                          <th className="p-6 font-black text-slate-500 uppercase w-12 text-center sticky left-0 bg-slate-950/80 z-20 print:bg-white print:text-black">No</th>
                          <th className="p-6 font-black text-slate-500 uppercase tracking-widest min-w-[200px] sticky left-12 bg-slate-950/80 z-20 print:bg-white print:text-black">Nama Peserta Didik</th>
                          {reportDates.map((d, i) => (
                            <th key={i} className={`p-4 text-center font-black border-l border-white/5 min-w-[50px] print:border-black print:text-black ${MONTH_COLORS[d.getMonth()]}`}>
                               <span className="block text-lg">{d.getDate()}</span>
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
                        {(activeClass?.students || []).map((s, idx) => {
                          const stats = calculateStats(s.id, reportDates);
                          const total = stats.H + stats.S + stats.I + stats.A;
                          const percent = total > 0 ? Math.round((stats.H / total) * 100) : 0;
                          return (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors group print:hover:bg-transparent">
                              <td className="p-6 text-center font-bold text-slate-600 sticky left-0 bg-[#0f172a] group-hover:bg-slate-800 transition-colors z-10 print:bg-white print:text-black">{idx + 1}</td>
                              <td className="p-6 font-black text-white uppercase tracking-tight sticky left-12 bg-[#0f172a] group-hover:text-indigo-400 group-hover:bg-slate-800 transition-colors z-10 print:bg-white print:text-black">{s.name}</td>
                              {reportDates.map((d, i) => {
                                 const status = attendance[s.id]?.[formatDate(d)] || 'H';
                                 return (
                                   <td key={i} className={`p-4 text-center border-l border-white/5 font-black text-xs print:border-black print:text-black ${isFutureDate(d) ? 'opacity-20' : ''}`}>
                                      <span className={status === 'H' ? 'text-emerald-500/40' : DARK_STATUS_COLORS[status].split(' ')[0]}>{status}</span>
                                   </td>
                                 );
                              })}
                              <td className="p-6 text-center font-bold text-emerald-500 bg-slate-950/30 border-l border-white/5 print:border-black">{stats.H}</td>
                              <td className="p-6 text-center font-bold text-blue-500 bg-slate-950/30 border-l border-white/5 print:border-black">{stats.S}</td>
                              <td className="p-6 text-center font-bold text-amber-500 bg-slate-950/30 border-l border-white/5 print:border-black">{stats.I}</td>
                              <td className="p-6 text-center font-bold text-rose-500 bg-slate-950/30 border-l border-white/5 print:border-black">{stats.A}</td>
                              <td className="p-6 text-center bg-indigo-500/5 border-l border-white/5 print:border-black">
                                 <span className="font-black text-indigo-400 text-sm">{percent}%</span>
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

          {view === 'Assignments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between no-print">
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Daftar Penugasan</h2>
                <button onClick={() => { setEditingAssignment(null); setAdminFormData({ ...adminFormData, assignTitle: '', assignDesc: '', assignDue: formatDate(new Date()) }); setShowAssignmentModal(true); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2 transition-transform active:scale-95">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  Buat Tugas
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(activeClass?.assignments || []).map(a => {
                  const subCount = getSubmittedCount(a);
                  const totalCount = activeClass?.students.length || 1;
                  const percent = Math.round((subCount / totalCount) * 100);
                  const isMenuOpen = activeMenuId === a.id;
                  return (
                    <div key={a.id} className="dark-card p-8 rounded-[2.5rem] space-y-6 relative overflow-visible group">
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
                        <div className="relative">
                           <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : a.id); }} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-500 hover:text-white transition-colors">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01" /></svg>
                           </button>
                           {isMenuOpen && (
                             <div className="absolute right-0 mt-3 w-44 glass-panel border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                <button onClick={(e) => { e.stopPropagation(); setEditingAssignment(a); setAdminFormData({ ...adminFormData, assignTitle: a.title, assignDesc: a.description || '', assignDue: a.dueDate }); setShowAssignmentModal(true); setActiveMenuId(null); }} className="w-full flex items-center gap-3 px-5 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-white hover:bg-white/5 transition-all text-left">Ubah Tugas</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(a.id); }} className="w-full flex items-center gap-3 px-5 py-4 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-500/10 transition-all border-t border-white/5 text-left">Hapus Tugas</button>
                             </div>
                           )}
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${percent}%` }}></div>
                      </div>
                      <button onClick={() => { setActiveAssignment(a); setShowGradingModal(true); }} className="w-full py-5 active-gradient text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-transform active:scale-[0.98]">Kelola & Isi Nilai</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'Admin' && (
            <div className="space-y-6">
              <div className="flex gap-4 p-1.5 bg-slate-900 rounded-[2rem] border border-white/5 overflow-x-auto scrollbar-hide">
                 {['Kelas', 'Siswa', 'Database'].map(t => (
                   <button key={t} onClick={() => setAdminTab(t as any)} className={`flex-none md:flex-1 px-6 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${adminTab === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>{t}</button>
                 ))}
              </div>
              
              {adminTab === 'Kelas' && (
                <div className="dark-card p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                   <div className="flex items-center justify-between">
                      <h3 className="font-black text-white uppercase tracking-tighter text-xl">Manajemen Kelas</h3>
                      <button onClick={() => { setEditingClass(null); setAdminFormData({ ...adminFormData, className: '', schedule: defaults.teachingDays }); setShowClassModal(true); }} className="px-6 py-3 active-gradient text-white rounded-xl font-black text-[10px] uppercase">Tambah Kelas</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {classes.map(c => (
                        <div key={c.id} className="p-6 bg-slate-950/50 border border-slate-800 rounded-[2.5rem] flex items-center justify-between group transition-all hover:border-indigo-500/50">
                           <div>
                              <p className="font-black text-white uppercase text-sm group-hover:text-indigo-400 transition-colors">{c.name}</p>
                              <p className="text-[9px] font-bold text-slate-600">{c.students.length} Siswa</p>
                           </div>
                           <div className="flex items-center gap-2">
                               <button onClick={() => { setEditingClass(c); setAdminFormData({...adminFormData, className: c.name, schedule: c.schedule || defaults.teachingDays}); setShowClassModal(true); }} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-colors">
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                               </button>
                               <button onClick={() => handleDeleteClass(c.id)} className="p-3 bg-slate-900 border border-slate-800 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              {adminTab === 'Siswa' && (
                <div className="dark-card p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
                   <div className="flex justify-between items-center">
                      <h3 className="font-black text-white uppercase tracking-tighter text-xl">Siswa - {activeClass?.name || 'Pilih Kelas'}</h3>
                      <button onClick={() => { setEditingStudent(null); setAdminFormData({ ...adminFormData, studentName: '', studentNis: '' }); setShowStudentModal(true); }} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase hover:bg-emerald-500" disabled={!activeClass}>Tambah Siswa</button>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left text-[10px]">
                        <thead className="bg-slate-950/50 border-b border-white/5">
                          <tr><th className="p-4 font-black text-slate-500 uppercase">Nama</th><th className="p-4 font-black text-slate-500 uppercase">NIS</th><th className="p-4 font-black text-slate-500 uppercase text-center">Aksi</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(activeClass?.students || []).map(s => (
                            <tr key={s.id} className="hover:bg-white/5">
                              <td className="p-4 font-black text-white uppercase">{s.name}</td>
                              <td className="p-4 text-slate-400">{s.nis}</td>
                              <td className="p-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => { setEditingStudent(s); setAdminFormData({ ...adminFormData, studentName: s.name, studentNis: s.nis }); setShowStudentModal(true); }} className="p-2 text-indigo-500 hover:text-indigo-400 transition-colors">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                                  </button>
                                  <button onClick={() => handleDeleteStudent(s.id)} className="p-2 text-rose-500 hover:text-rose-400 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="dark-card p-10 rounded-[3rem] space-y-8 flex flex-col items-center text-center">
                     <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-emerald-500">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                     </div>
                     <div>
                        <h4 className="text-xl font-black text-white uppercase mb-2">Penyimpanan Aktif</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                           Sistem terhubung dengan Supabase Cloud.<br/>
                           Semua perubahan disimpan secara real-time.
                        </p>
                     </div>
                      <button onClick={fetchFromCloud} className="w-full py-4 bg-slate-800 rounded-2xl text-xs font-bold uppercase border border-slate-700 hover:bg-slate-700">
                        Sinkronisasi Ulang Manual
                      </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      {showClassModal && (
          <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6" onClick={() => setShowClassModal(false)}>
            <div className="dark-card w-full max-w-lg p-8 rounded-[3.5rem] space-y-8" onClick={e => e.stopPropagation()}>
                <h4 className="text-2xl font-black text-white uppercase">{editingClass ? 'Edit Data Kelas' : 'Tambah Kelas Baru'}</h4>
                <div className="space-y-4">
                  <input type="text" value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Nama Kelas (Contoh: X.10)" />
                  <div>
                     <p className="text-sm font-bold text-slate-400 mb-2">Hari Mengajar</p>
                     <div className="flex gap-2">
                        {DAY_NAMES.slice(1,6).map((day, idx) => (
                           <button key={idx} onClick={() => {
                              const dayIndex = idx + 1;
                              const newSchedule = adminFormData.schedule.includes(dayIndex) ? adminFormData.schedule.filter(d => d !== dayIndex) : [...adminFormData.schedule, dayIndex];
                              setAdminFormData({...adminFormData, schedule: newSchedule });
                           }} className={`flex-1 py-3 rounded-xl text-xs font-black transition-colors ${adminFormData.schedule.includes(idx+1) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{day}</button>
                        ))}
                     </div>
                  </div>
                </div>
                <button onClick={handleAddOrEditClass} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] uppercase tracking-[0.2em] transition-transform active:scale-95">{editingClass ? 'Simpan Perubahan' : 'Tambahkan Kelas'}</button>
            </div>
          </div>
      )}
      {showStudentModal && (
          <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6" onClick={() => setShowStudentModal(false)}>
            <div className="dark-card w-full max-w-lg p-8 rounded-[3.5rem] space-y-8" onClick={e => e.stopPropagation()}>
                <h4 className="text-2xl font-black text-white uppercase">{editingStudent ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}</h4>
                <div className="space-y-4">
                  <input type="text" value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Nama Lengkap Siswa" />
                  <input type="text" value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Nomor Induk Siswa (NIS)" />
                </div>
                <button onClick={handleAddOrEditStudent} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] uppercase tracking-[0.2em] transition-transform active:scale-95">{editingStudent ? 'Simpan Perubahan' : 'Tambahkan Siswa'}</button>
            </div>
          </div>
      )}
      {showAssignmentModal && (
          <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6" onClick={() => setShowAssignmentModal(false)}>
            <div className="dark-card w-full max-w-lg p-8 rounded-[3.5rem] space-y-8" onClick={e => e.stopPropagation()}>
                <h4 className="text-2xl font-black text-white uppercase">{editingAssignment ? 'Edit Tugas' : 'Buat Tugas Baru'}</h4>
                <div className="space-y-4">
                  <input type="text" value={adminFormData.assignTitle} onChange={e => setAdminFormData({...adminFormData, assignTitle: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Judul Tugas" />
                  <textarea value={adminFormData.assignDesc} onChange={e => setAdminFormData({...adminFormData, assignDesc: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" placeholder="Deskripsi (Opsional)" rows={3}></textarea>
                  <input type="date" value={adminFormData.assignDue} onChange={e => setAdminFormData({...adminFormData, assignDue: e.target.value})} className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-indigo-500 font-bold" />
                </div>
                <button onClick={handleAddOrEditAssignment} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] uppercase tracking-[0.2em] transition-transform active:scale-95">{editingAssignment ? 'Simpan Perubahan' : 'Buat Tugas'}</button>
            </div>
          </div>
      )}
      {showGradingModal && activeAssignment && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6" onClick={() => setShowGradingModal(false)}>
          <div className="dark-card w-full max-w-4xl p-8 rounded-[3.5rem] space-y-8 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center">
               <h4 className="text-2xl font-black text-white uppercase">Penilaian: {activeAssignment.title}</h4>
               <button onClick={() => setShowGradingModal(false)} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
               {(activeClass?.students || []).map((s, idx) => {
                 const sub = activeAssignment.submissions[s.id] || { isSubmitted: false, score: '' };
                 return (
                   <div key={s.id} className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${sub.isSubmitted ? 'bg-emerald-600/5 border-emerald-500/20' : 'bg-slate-900/30 border-slate-800'}`}>
                      <div className="flex items-center gap-4">
                         <span className="text-[10px] font-black text-slate-700 w-6">{idx + 1}</span>
                         <p className={`font-black uppercase text-xs ${sub.isSubmitted ? 'text-emerald-400' : 'text-white'}`}>{s.name}</p>
                      </div>
                      <div className="flex items-center gap-6">
                         <button onClick={() => updateSubmission(activeAssignment.id, s.id, 'isSubmitted', !sub.isSubmitted)} className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${sub.isSubmitted ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-transparent hover:border-slate-600'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg></button>
                         <input type="text" value={sub.score} onChange={(e) => updateSubmission(activeAssignment.id, s.id, 'score', e.target.value)} placeholder="0" className="w-20 bg-slate-950 border border-slate-800 rounded-xl p-3 text-center text-sm font-black text-white outline-none focus:border-indigo-500" />
                      </div>
                   </div>
                 );
               })}
            </div>
            <button onClick={() => { setShowGradingModal(false); showToast('Penilaian Berhasil!'); }} className="w-full py-5 active-gradient text-white font-black rounded-[2rem] uppercase tracking-[0.2em] transition-transform active:scale-95">Tutup & Simpan</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
