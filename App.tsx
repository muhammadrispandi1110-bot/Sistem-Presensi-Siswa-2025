
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const STATUS_THEMES: Record<AttendanceStatus, { color: string, bg: string, border: string }> = {
  'H': { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20' },
  'S': { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/20' },
  'I': { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
  'A': { color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/20' }
};

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

const MENU_ITEMS: { view: ViewType; label: string; icon: string }[] = [
  { view: 'Admin', label: 'Admin Panel', icon: '⚙️' },
  { view: 'Reports', label: 'Laporan Presensi', icon: '📊' },
  { view: 'TaskReports', label: 'Rekap Tugas', icon: '📝' },
];

const Modal = ({ isOpen, onClose, title, children, footer = null, size = 'md' }: { isOpen: any; onClose: any; title: any; children?: any; footer?: any; size?: string; }) => {
  if (!isOpen) return null;
  const sizeClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 print-hide backdrop-blur-sm">
      <div className={`w-full ${sizeClass} bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl flex flex-col view-transition border border-white/20 dark:border-slate-700`}>
        <header className="flex items-center justify-between p-7 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2.5 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <main className="p-7 space-y-6 max-h-[70vh] overflow-y-auto">{children}</main>
        {footer && (
          <footer className="flex justify-end p-7 bg-slate-50 dark:bg-slate-900/40 rounded-b-[32px] border-t border-slate-100 dark:border-slate-700">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeSemester, setActiveSemester] = useState<1 | 2>(1);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) return localStorage.getItem('theme') as 'light' | 'dark';
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'dark' ? 'light' : 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const { database, auth, school, defaults } = APP_CONFIG;
  const supabase = useMemo(() => database.url && database.anonKey ? createClient(database.url, database.anonKey) : null, [database.url, database.anonKey]);

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('Dashboard');
  const [reportTab, setReportTab] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Semester'>('Daily');
  const [adminTab, setAdminTab] = useState<'Kelas' | 'Siswa' | 'Tugas' | 'Database'>('Kelas');
  const [currentDate, setCurrentDate] = useState(new Date(defaults.startYear, defaults.startMonth, 1));
  const [activeMonth, setActiveMonth] = useState(defaults.startMonth);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showModal, setShowModal] = useState<'class' | 'student' | 'assignment' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [adminSelectedClassId, setAdminSelectedClassId] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  const [adminFormData, setAdminFormData] = useState({ 
    className: '', schedule: defaults.teachingDays,
    studentName: '', studentNis: '', studentNisn: '',
    assignmentTitle: '', assignmentDesc: '', assignmentDueDate: ''
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!supabase) { setClasses(INITIAL_CLASSES); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('name');
      const { data: studentsData } = await supabase.from('students').select('*');
      const { data: assignmentsData } = await supabase.from('assignments').select('*').order('due_date');
      const { data: submissionsData } = await supabase.from('submissions').select('*');
      const { data: attendanceData } = await supabase.from('attendance_records').select('*');

      const assembledClasses = (classesData || []).map(c => {
        const classStudents = (studentsData || []).filter(s => s.class_id === c.id);
        const classAssignments = (assignmentsData || []).filter(a => a.class_id === c.id).map(a => {
            const assignmentSubmissions: { [studentId: string]: SubmissionData } = {};
            classStudents.forEach(student => {
              const submission = (submissionsData || []).find(s => s.student_id === student.id && s.assignment_id === a.id);
              assignmentSubmissions[student.id] = { isSubmitted: submission?.is_submitted || false, score: submission?.score || '' };
            });
            return { id: a.id, title: a.title, description: a.description, dueDate: a.due_date, submissions: assignmentSubmissions };
        });
        return { id: c.id, name: c.name, students: classStudents, assignments: classAssignments, schedule: c.schedule };
      });

      const reconstructedAttendance: AttendanceRecord = {};
      (attendanceData || []).forEach(rec => {
        if (!reconstructedAttendance[rec.student_id]) reconstructedAttendance[rec.student_id] = {};
        reconstructedAttendance[rec.student_id][rec.record_date] = rec.status as AttendanceStatus;
      });

      setClasses(assembledClasses);
      setAttendance(reconstructedAttendance);
      if (assembledClasses.length > 0) {
        if (!activeClassId) setActiveClassId(assembledClasses[0].id);
        if (!adminSelectedClassId) setAdminSelectedClassId(assembledClasses[0].id);
      }
    } catch (err: any) {
      showToast('Gagal memuat data dari cloud.', 'error');
      setClasses(INITIAL_CLASSES);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId, adminSelectedClassId, showToast]);

  useEffect(() => { if (isAuthenticated) fetchFromCloud(); else setIsLoading(false); }, [isAuthenticated, fetchFromCloud]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);

  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    const updated = { ...attendance, [studentId]: { ...attendance[studentId], [date]: status } };
    setAttendance(updated);
    if (!supabase) return;
    await supabase.from('attendance_records').upsert({ student_id: studentId, record_date: date, status }, { onConflict: 'student_id, record_date' });
  };

  const handleManualSave = async () => {
    setIsSyncing(true);
    await fetchFromCloud();
    showToast('Sinkronisasi cloud berhasil diselesaikan!', 'success');
    setIsSyncing(false);
  };

  const openAdminModal = (type: 'class' | 'student' | 'assignment', item: any = null) => {
    setEditingItem(item);
    if (item) {
        if (type === 'class') setAdminFormData({ ...adminFormData, className: item.name, schedule: item.schedule || defaults.teachingDays });
        else if (type === 'student') setAdminFormData({ ...adminFormData, studentName: item.name, studentNis: item.nis, studentNisn: item.nisn });
        else if (type === 'assignment') setAdminFormData({ ...adminFormData, assignmentTitle: item.title, assignmentDesc: item.description, assignmentDueDate: item.dueDate });
    } else {
        // Fix duplicate studentNis property in object literal
        setAdminFormData({ className: '', schedule: defaults.teachingDays, studentName: '', studentNis: '', studentNisn: '', assignmentTitle: '', assignmentDesc: '', assignmentDueDate: '' });
    }
    setShowModal(type);
  };

  const handleAdminSave = async () => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      let error;
      if (showModal === 'class') {
        const payload = { name: adminFormData.className, schedule: adminFormData.schedule };
        ({ error } = editingItem ? await supabase.from('classes').update(payload).eq('id', editingItem.id) : await supabase.from('classes').insert(payload));
      } else if (showModal === 'student') {
        const payload = { name: adminFormData.studentName, nis: adminFormData.studentNis, nisn: adminFormData.studentNisn, class_id: adminSelectedClassId };
        ({ error } = editingItem ? await supabase.from('students').update(payload).eq('id', editingItem.id) : await supabase.from('students').insert(payload));
      } else if (showModal === 'assignment') {
        const payload = { title: adminFormData.assignmentTitle, description: adminFormData.assignmentDesc, due_date: adminFormData.assignmentDueDate, class_id: adminSelectedClassId || activeClassId };
        ({ error } = editingItem ? await supabase.from('assignments').update(payload).eq('id', editingItem.id) : await supabase.from('assignments').insert(payload));
      }
      if (error) throw error;
      showToast('Perubahan berhasil disimpan ke database.', 'success');
      setShowModal(null);
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Kesalahan: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment', id: string) => {
    if (!supabase || !window.confirm(`Hapus ${type} ini secara permanen?`)) return;
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      showToast('Item berhasil dihapus.', 'info');
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menghapus: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const ids = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (!supabase || ids.length === 0 || !window.confirm(`Hapus ${ids.length} item terpilih?`)) return;
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
      showToast(`${ids.length} item dihapus secara massal.`, 'info');
      if (type === 'class') setSelectedClassIds([]);
      if (type === 'student') setSelectedStudentIds([]);
      if (type === 'assignment') setSelectedAssignmentIds([]);
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const AdminView = () => {
    const adminSelectedClass = useMemo(() => classes.find(c => c.id === adminSelectedClassId), [classes, adminSelectedClassId]);
    const handleSelectAll = (type: 'class' | 'student' | 'assignment', list: any[]) => {
      const ids = list.map(item => item.id);
      if (type === 'class') setSelectedClassIds(selectedClassIds.length === ids.length ? [] : ids);
      else if (type === 'student') setSelectedStudentIds(selectedStudentIds.length === ids.length ? [] : ids);
      else if (type === 'assignment') setSelectedAssignmentIds(selectedAssignmentIds.length === ids.length ? [] : ids);
    };
    const toggleSelectOne = (type: 'class' | 'student' | 'assignment', id: string) => {
      if (type === 'class') setSelectedClassIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
      else if (type === 'student') setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
      else if (type === 'assignment') setSelectedAssignmentIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    return (
      <div className="flex-1 p-6 sm:p-12 overflow-y-auto view-transition space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Admin Panel</h2>
            <p className="text-slate-500 font-medium">Pengelolaan Basis Data SMAN 11</p>
          </div>
          <button onClick={handleManualSave} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border dark:border-slate-700 px-6 py-3.5 rounded-2xl text-sm font-bold shadow-sm hover:shadow-md transition-all">Sinkronisasi</button>
        </div>
        
        <div className="flex gap-2 p-1.5 bg-slate-200/50 dark:bg-slate-800/50 rounded-2xl w-fit">
            {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
                <button key={tab} onClick={() => setAdminTab(tab)} className={`px-8 py-3 rounded-xl text-sm font-black transition-all ${adminTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
                    {tab}
                </button>
            ))}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-[40px] border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-200/40 dark:shadow-none overflow-hidden p-8 sm:p-10">
            {adminTab === 'Kelas' && (
              <div className="space-y-8">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black tracking-tight">Daftar Kelas</h3>
                  <div className="flex gap-3">
                    {selectedClassIds.length > 0 && <button onClick={() => handleBulkDelete('class')} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus ({selectedClassIds.length})</button>}
                    <button onClick={() => openAdminModal('class')} className="bg-indigo-600 text-white px-7 py-3.5 rounded-2xl text-xs font-black shadow-lg shadow-indigo-100">+ Kelas Baru</button>
                  </div>
                </div>
                <div className="overflow-x-auto"><table className="w-full">
                    <thead className="text-slate-400 border-b dark:border-slate-700"><tr>
                        <th className="pb-4 text-center"><input type="checkbox" checked={selectedClassIds.length === classes.length && classes.length > 0} onChange={() => handleSelectAll('class', classes)} className="w-5 h-5 rounded-lg" /></th>
                        <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Nama Kelas</th>
                        <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">Aksi</th>
                    </tr></thead>
                    <tbody className="divide-y dark:divide-slate-700">{classes.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="py-5 text-center"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleSelectOne('class', c.id)} className="w-5 h-5 rounded-lg" /></td>
                          <td className="py-5 font-bold text-slate-800 dark:text-slate-200">{c.name}</td>
                          <td className="py-5 text-right space-x-6">
                            <button onClick={() => openAdminModal('class', c)} className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase hover:underline">Edit</button>
                            <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 dark:text-rose-400 font-black text-xs uppercase hover:underline">Hapus</button>
                          </td>
                        </tr>
                    ))}</tbody>
                </table></div>
              </div>
            )}
            {adminTab === 'Siswa' && (
              <div className="space-y-8">
                <div className="flex justify-between items-center mobile-stack gap-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-2xl font-black tracking-tight">Data Siswa</h3>
                    <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-black text-indigo-600">
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    {selectedStudentIds.length > 0 && <button onClick={() => handleBulkDelete('student')} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus ({selectedStudentIds.length})</button>}
                    <button onClick={() => openAdminModal('student')} className="bg-indigo-600 text-white px-7 py-3.5 rounded-2xl text-xs font-black">+ Siswa</button>
                  </div>
                </div>
                <div className="overflow-x-auto"><table className="w-full">
                    <thead className="text-slate-400 border-b dark:border-slate-700"><tr>
                        <th className="pb-4 text-center"><input type="checkbox" checked={adminSelectedClass?.students && selectedStudentIds.length === adminSelectedClass.students.length} onChange={() => handleSelectAll('student', adminSelectedClass?.students || [])} className="w-5 h-5 rounded-lg" /></th>
                        <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Nama Lengkap</th>
                        <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">NISN</th>
                        <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">Aksi</th>
                    </tr></thead>
                    <tbody className="divide-y dark:divide-slate-700">{adminSelectedClass?.students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="py-5 text-center"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleSelectOne('student', s.id)} className="w-5 h-5 rounded-lg" /></td>
                          <td className="py-5 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                          <td className="py-5 text-slate-500 font-medium">{s.nisn}</td>
                          <td className="py-5 text-right space-x-6">
                            <button onClick={() => openAdminModal('student', s)} className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase">Edit</button>
                            <button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 dark:text-rose-400 font-black text-xs uppercase">Hapus</button>
                          </td>
                        </tr>
                    ))}</tbody>
                </table></div>
              </div>
            )}
            {adminTab === 'Database' && (
                <div className="py-20 text-center space-y-6">
                  <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">🌐</div>
                  <div><h3 className="text-3xl font-black tracking-tight">Cloud Database Connected</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">Sistem tersambung ke Supabase. Seluruh data presensi dan nilai tersimpan secara aman di pusat data cloud Bapak.</p></div>
                  <button onClick={handleManualSave} className="bg-indigo-600 text-white px-12 py-5 rounded-[24px] font-black hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-indigo-100">Sync Data Manual</button>
                </div>
            )}
        </div>

        <Modal isOpen={!!showModal} onClose={() => setShowModal(null)} title={editingItem ? `Edit ${showModal}` : `Tambah ${showModal}`} footer={<div className="flex gap-4 w-full"><button onClick={handleAdminSave} className="flex-1 active-gradient text-white py-4.5 rounded-[24px] font-black shadow-lg">SIMPAN</button><button onClick={() => setShowModal(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-4.5 rounded-[24px] font-black">BATAL</button></div>}>
            {showModal === 'class' && (
                <div className="space-y-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nama Kelas</label><input type="text" value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full mt-2 bg-slate-100 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold" placeholder="Contoh: X.9" /></div></div>
            )}
            {showModal === 'student' && (
                <div className="space-y-6">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nama Lengkap</label><input type="text" value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full mt-2 bg-slate-100 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">NIS</label><input type="text" value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full mt-2 bg-slate-100 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold" /></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">NISN</label><input type="text" value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full mt-2 bg-slate-100 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold" /></div>
                    </div>
                </div>
            )}
        </Modal>
      </div>
    );
  };

  const DashboardView = () => {
    if (!activeClass) return <div className="p-20 text-center text-slate-400 font-bold animate-pulse">Menghubungkan ke Kelas...</div>;
    const handleSubmissionToggle = async (assignmentId: string, studentId: string, isSubmitted: boolean) => {
        if(!supabase) return;
        await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, is_submitted: isSubmitted }, { onConflict: 'assignment_id, student_id' });
        fetchFromCloud();
    };
    const handleScoreChange = async (assignmentId: string, studentId: string, score: string) => {
        if(!supabase) return;
        await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, score: score, is_submitted: true }, { onConflict: 'assignment_id, student_id' });
        fetchFromCloud();
    };

    return (
        <div className="flex-1 p-6 sm:p-12 overflow-y-auto view-transition space-y-12 bg-slate-50/40 dark:bg-transparent">
            <div className="flex items-center justify-between mobile-stack gap-8">
                <div className="space-y-2">
                    <h2 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">{activeClass.name}</h2>
                    <div className="flex items-center gap-4">
                        <span className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-full tracking-widest">{school.name}</span>
                        <span className="text-slate-500 text-sm font-bold flex items-center gap-2">🗓️ {DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</span>
                    </div>
                </div>
                <button onClick={handleManualSave} disabled={isSyncing} className="active-gradient text-white px-10 py-5 rounded-[24px] text-sm font-black shadow-2xl transition-all active:scale-95 flex items-center gap-3 min-w-[200px] justify-center">
                    <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                    {isSyncing ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
                {[
                    { label: 'Siswa', val: activeClass.students.length, icon: '👥', color: 'slate' },
                    { label: 'Hadir', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'H' || !attendance[s.id]?.[dateStr]).length, icon: '✅', color: 'emerald' },
                    { label: 'Sakit', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'S').length, icon: '🤒', color: 'blue' },
                    { label: 'Izin', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'I').length, icon: '✉️', color: 'amber' },
                    { label: 'Alpa', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'A').length, icon: '❌', color: 'rose' },
                ].map(stat => (
                    <div key={stat.label} className="bg-white dark:bg-slate-800 p-6 rounded-[32px] border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl bg-${stat.color}-50 dark:bg-${stat.color}-500/10 flex items-center justify-center text-2xl`}>{stat.icon}</div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{stat.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                <div className="xl:col-span-2 space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">Presensi Hari Ini</h3>
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-2xl shadow-sm border dark:border-slate-700">
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">←</button>
                            <input type="date" value={dateStr} onChange={(e) => setCurrentDate(new Date(e.target.value))} className="bg-transparent border-none text-[11px] font-black text-indigo-600 dark:text-indigo-400 w-28 text-center" />
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">→</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {activeClass.students.map((student, idx) => {
                            const status = attendance[student.id]?.[dateStr] || 'H';
                            const theme = STATUS_THEMES[status];
                            return (
                                <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-6 rounded-[32px] flex items-center justify-between shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group">
                                    <div className="flex items-center gap-5 truncate">
                                        <div className={`w-12 h-12 rounded-2xl ${theme.bg} ${theme.color} flex items-center justify-center font-black text-sm border ${theme.border}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="truncate">
                                            <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{student.name}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">NISN: {student.nisn || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-[20px] ml-4">
                                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => {
                                            const isActive = status === s;
                                            return (
                                                <button key={s} onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)} className={`status-btn w-9 h-9 rounded-xl font-black text-xs transition-all ${isActive ? `${STATUS_THEMES[s].bg} ${STATUS_THEMES[s].color} shadow-sm border ${STATUS_THEMES[s].border}` : 'text-slate-300 hover:bg-white dark:hover:bg-slate-700'}`}>
                                                    {s}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-8">
                    <h3 className="text-2xl font-black tracking-tight px-2">Tugas & Nilai</h3>
                    <div className="space-y-6">
                        {activeClass.assignments?.map(a => {
                            const subCount = Object.values(a.submissions).filter((s: any) => s.isSubmitted).length;
                            return (
                                <div key={a.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[36px] p-8 shadow-sm space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <h4 className="font-black text-slate-900 dark:text-white leading-tight text-lg">{a.title}</h4>
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Tenggat: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                        </div>
                                        <button onClick={() => openAdminModal('assignment', a)} className="p-3 text-slate-300 hover:text-indigo-600 transition-colors">⚙️</button>
                                    </div>
                                    <div className="space-y-4 max-h-64 overflow-y-auto pr-3 custom-scrollbar">
                                        {activeClass.students.map((s, idx) => {
                                            const sub = a.submissions[s.id];
                                            const isSub = sub?.isSubmitted || false;
                                            return (
                                                <div key={s.id} className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{idx+1}. {s.name}</span>
                                                    <div className="flex items-center gap-3">
                                                        <input type="text" defaultValue={sub?.score || ''} onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} disabled={!isSub} className="w-12 bg-slate-50 dark:bg-slate-900 border-none text-center rounded-xl p-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 disabled:opacity-20" placeholder="--" />
                                                        <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isSub ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-300'}`}>✓</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const ReportsView = () => {
    if (!activeClass) return <div className="p-20 text-center text-slate-400 font-bold">Laporan Memuat...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    const semesterMonths = activeSemester === 1 ? MONTHS_2026.slice(0, 6) : MONTHS_2026.slice(6, 12);
    
    const getPrintRekapLabel = () => {
        if (reportTab === 'Daily') return `Rekapan Tanggal: ${currentDate.toLocaleDateString('id-ID')}`;
        if (reportTab === 'Weekly') return `Rekapan Minggu: ${dates[0].toLocaleDateString('id-ID')} - ${dates[dates.length-1].toLocaleDateString('id-ID')}`;
        if (reportTab === 'Monthly') return `Rekapan Bulan: ${MONTHS_2026.find(m => m.value === activeMonth)?.name} 2026`;
        return `Rekapan Semester: ${activeSemester} (Tahun Pelajaran ${school.year})`;
    };

    return (
      <div className="flex-1 p-6 sm:p-12 flex flex-col overflow-hidden bg-white dark:bg-slate-900 print-scroll-reset">
        <div className="flex items-center justify-between mb-10 print-hide">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight">Laporan Presensi</h2>
            <p className="text-slate-500 font-medium">Rekapitulasi Kehadiran Kelas {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-10 py-4.5 rounded-[24px] text-sm font-black shadow-xl hover:scale-105 active:scale-95 transition-all">Cetak Laporan</button>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b dark:border-slate-800 mb-10 gap-6 print-hide">
          <div className="flex gap-8">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`pb-5 text-sm font-black transition-all relative ${reportTab === tab ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    {tab === 'Daily' ? 'Harian' : tab === 'Weekly' ? 'Mingguan' : tab === 'Monthly' ? 'Bulanan' : 'Semester'}
                    {reportTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-indigo-600 rounded-full"></div>}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-4 pb-4">
              {(reportTab === 'Daily' || reportTab === 'Weekly') && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl shadow-sm border dark:border-slate-700">
                      <button 
                          onClick={() => {
                              if (reportTab === 'Daily') setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'));
                              else {
                                  const d = new Date(currentDate);
                                  d.setDate(d.getDate() - 7);
                                  setCurrentDate(d);
                              }
                          }} 
                          className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all"
                      >
                          ←
                      </button>
                      <input 
                          type="date" 
                          value={formatDate(currentDate)} 
                          onChange={(e) => setCurrentDate(new Date(e.target.value))} 
                          className="bg-transparent border-none text-[11px] font-black text-indigo-600 dark:text-indigo-400 w-28 text-center" 
                      />
                      <button 
                          onClick={() => {
                              if (reportTab === 'Daily') setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'));
                              else {
                                  const d = new Date(currentDate);
                                  d.setDate(d.getDate() + 7);
                                  setCurrentDate(d);
                              }
                          }} 
                          className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all"
                      >
                          →
                      </button>
                  </div>
              )}
              {reportTab === 'Monthly' && (
                  <select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-bold text-indigo-600">
                      {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                  </select>
              )}
              {reportTab === 'Semester' && (
                  <select value={activeSemester} onChange={e => setActiveSemester(parseInt(e.target.value) as 1 | 2)} className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-bold text-indigo-600">
                      <option value={1}>Semester 1 (Jan-Jun)</option><option value={2}>Semester 2 (Jul-Des)</option>
                  </select>
              )}
          </div>
        </div>

        <div className="hidden print:block text-center mb-8 border-b-2 border-black pb-4">
          <h2 className="text-xl font-black uppercase tracking-tight">{school.name}</h2>
          <h3 className="text-lg font-bold uppercase">LAPORAN PRESENSI KELAS {activeClass.name}</h3>
          <p className="text-sm font-semibold">{getPrintRekapLabel()}</p>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar border dark:border-slate-700 rounded-[40px] p-6 print-scroll-reset">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400 border-b dark:border-slate-700">
                {reportTab === 'Semester' ? (
                  <>
                    <tr>
                      <th rowSpan={2} className="px-4 py-6 text-left border-r dark:border-slate-700">No</th>
                      <th rowSpan={2} className="px-6 py-6 text-left border-r dark:border-slate-700 min-w-[200px]">Nama Siswa</th>
                      {semesterMonths.map(m => <th key={m.value} colSpan={4} className="px-2 py-4 text-center border-r dark:border-slate-700">{m.name.substring(0,3)}</th>)}
                      <th colSpan={4} className="px-4 py-4 text-center bg-slate-50 dark:bg-slate-800">Total</th>
                      <th rowSpan={2} className="px-4 py-6 text-center text-indigo-600">%</th>
                    </tr>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                      {semesterMonths.map(m => (<React.Fragment key={m.value}><th className="border text-[8px] p-1">H</th><th className="border text-[8px] p-1">S</th><th className="border text-[8px] p-1">I</th><th className="border text-[8px] p-1">A</th></React.Fragment>))}
                      <th className="border text-[8px] p-1">H</th><th className="border text-[8px] p-1">S</th><th className="border text-[8px] p-1">I</th><th className="border text-[8px] p-1">A</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="px-4 py-6 text-left border-r dark:border-slate-700">No</th>
                    <th className="px-6 py-6 text-left border-r dark:border-slate-700 min-w-[240px]">Siswa</th>
                    {dates.map(d => (<th key={d.toISOString()} className="px-2 py-6 text-center border-r dark:border-slate-700 text-[10px] font-black">{d.getDate()}</th>))}
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">H</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">S</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">I</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">A</th>
                    <th className="px-6 py-6 text-center text-indigo-600">%</th>
                  </tr>
                )}
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
                {activeClass.students.map((s, idx) => {
                  const t = { H: 0, S: 0, I: 0, A: 0, T: 0 };
                  dates.forEach(d => { const st = attendance[s.id]?.[formatDate(d)] || 'H'; t[st]++; t.T++; });
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-4 text-slate-400 font-bold border-r dark:border-slate-700">{idx + 1}</td>
                      <td className="px-6 py-4 font-bold border-r dark:border-slate-700">{s.name}</td>
                      {reportTab !== 'Semester' && dates.map(d => {
                        const status = attendance[s.id]?.[formatDate(d)] || 'H';
                        return (<td key={formatDate(d)} className={`px-2 py-4 text-center text-[10px] font-black border-r dark:border-slate-700 ${STATUS_THEMES[status].color}`}>{status}</td>);
                      })}
                      <td className="px-3 py-4 text-center font-black bg-slate-50/50 dark:bg-slate-800/20">{t.H}</td>
                      <td className="px-3 py-4 text-center font-black bg-slate-50/50 dark:bg-slate-800/20 text-blue-500">{t.S}</td>
                      <td className="px-3 py-4 text-center font-black bg-slate-50/50 dark:bg-slate-800/20 text-amber-500">{t.I}</td>
                      <td className="px-3 py-4 text-center font-black bg-slate-50/50 dark:bg-slate-800/20 text-rose-500">{t.A}</td>
                      <td className="px-6 py-4 text-center font-black text-indigo-600">{t.T > 0 ? ((t.H / t.T) * 100).toFixed(0) : 0}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const TaskReportsView = () => {
    if (!activeClass) return <div className="p-20 text-center text-slate-400 font-bold">Laporan Memuat...</div>;
    const assignments = activeClass.assignments || [];
    return (
      <div className="flex-1 p-6 sm:p-12 flex flex-col overflow-hidden bg-white dark:bg-slate-900 print-scroll-reset">
        <div className="flex items-center justify-between mb-10 print-hide">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight">Rekap Nilai Tugas</h2>
            <p className="text-slate-500 font-medium">Kumulatif seluruh tugas {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-indigo-600 text-white px-10 py-4.5 rounded-[24px] text-sm font-black shadow-xl">Cetak Rekap Tugas</button>
        </div>

        <div className="hidden print:block text-center mb-8 border-b-2 border-black pb-4">
          <h2 className="text-xl font-black uppercase tracking-tight">{school.name}</h2>
          <h3 className="text-lg font-bold uppercase">LAPORAN REKAP NILAI TUGAS KELAS {activeClass.name}</h3>
          <p className="text-sm font-semibold">Rekapan Kumulatif: Tahun Pelajaran {school.year}</p>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar border dark:border-slate-700 rounded-[40px] p-6 print-scroll-reset">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400 border-b dark:border-slate-700">
              <tr>
                <th className="px-4 py-6 text-left border-r dark:border-slate-700">No</th>
                <th className="px-6 py-6 text-left border-r dark:border-slate-700 min-w-[240px]">Nama Peserta Didik</th>
                {assignments.map((a, i) => (
                  <th key={a.id} className="px-4 py-6 text-center border-r dark:border-slate-700 text-[10px] font-black uppercase tracking-widest">Tugas {i+1}</th>
                ))}
                <th className="px-8 py-6 text-center text-indigo-600 font-black">RATA-RATA</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {activeClass.students.map((s, idx) => {
                let total = 0, count = 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-4 text-slate-400 font-bold border-r dark:border-slate-700">{idx + 1}</td>
                    <td className="px-6 py-4 font-bold border-r dark:border-slate-700">{s.name}</td>
                    {assignments.map(a => {
                      const score = parseFloat(a.submissions[s.id]?.score || '0');
                      if(score > 0) { total += score; count++; }
                      return <td key={a.id} className="px-4 py-4 text-center font-bold border-r dark:border-slate-700 text-slate-500">{a.submissions[s.id]?.score || '-'}</td>;
                    })}
                    <td className="px-8 py-4 text-center font-black text-indigo-600 text-lg">{count > 0 ? (total/count).toFixed(1) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-900"><div className="text-center space-y-8"><div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="text-indigo-400 font-black tracking-[0.3em] text-[10px] uppercase animate-pulse">SMAN 11 MAKASSAR • LOADING SYSTEM</p></div></div>;
  if (!isAuthenticated) return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 login-mesh">
      <div className="w-full max-w-md glass-card rounded-[48px] p-12 shadow-2xl space-y-12">
        <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-indigo-600 rounded-[28px] flex items-center justify-center text-white text-3xl font-black mx-auto shadow-xl shadow-indigo-200">11</div>
            <div><h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">Login.</h1>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-1">Portal Guru Digital SMAN 11 Makassar</p></div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); if(d.get('u') === auth.username && d.get('p') === auth.password) setIsAuthenticated(true); else showToast('Username atau password salah!', 'error'); }} className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Username</label><input name="u" type="text" className="w-full bg-slate-100 dark:bg-slate-900/50 border-none rounded-[20px] p-5 font-bold shadow-inner" placeholder="admin" required /></div>
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Password</label><input name="p" type="password" className="w-full bg-slate-100 dark:bg-slate-900/50 border-none rounded-[20px] p-5 font-bold shadow-inner" placeholder="••••••••" required /></div>
          <button type="submit" className="w-full active-gradient text-white font-black py-5 rounded-[24px] shadow-2xl transition-all active:scale-95 text-sm tracking-widest">MASUK KE SISTEM</button>
        </form>
        <p className="text-center text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">© 2026 SMAN 11 Makassar • Digital Presence</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen text-slate-800 dark:text-slate-200 flex relative overflow-hidden print-scroll-reset bg-slate-50 dark:bg-[#020617]">
      <nav className="w-80 bg-white dark:bg-[#020617] p-10 flex flex-col flex-shrink-0 border-r dark:border-slate-800 z-20 print-hide">
        <div className="mb-16 flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-[22px] flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-100 dark:shadow-none">11</div>
            <div><h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">SMAN 11</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PRESENSI GURU</p></div>
        </div>
        <div className="flex flex-col gap-3">
            {MENU_ITEMS.map(m => (
                <button key={m.view} onClick={() => setView(m.view)} className={`flex items-center gap-5 px-6 py-4.5 rounded-[24px] text-sm font-black transition-all ${view === m.view ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-100 dark:shadow-none translate-x-2' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'}`}>
                    <span className="text-xl">{m.icon}</span>{m.label}
                </button>
            ))}
            <div className="mt-12 pt-8 border-t dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 mb-6 tracking-widest px-4 uppercase">KONTROL KELAS</p>
                <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  {classes.map(c => (
                      <button key={c.id} onClick={() => { setActiveClassId(c.id); setView('Dashboard'); }} className={`w-full px-6 py-4.5 text-left rounded-[20px] text-[11px] font-black transition-all truncate ${activeClassId === c.id && view === 'Dashboard' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>{c.name}</button>
                  ))}
                </div>
            </div>
        </div>
        <div className="mt-auto pt-8 border-t dark:border-slate-800 space-y-6">
            <button onClick={toggleTheme} className="w-full flex items-center justify-center gap-3 py-4 bg-slate-50 dark:bg-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">{theme === 'light' ? '🌙 Gelap' : '☀️ Terang'}</button>
            <p className="text-[9px] text-center font-black text-slate-400 tracking-widest uppercase opacity-50">V.2.0.26 Stable</p>
        </div>
      </nav>
      <main className="flex-1 flex flex-col overflow-hidden print-scroll-reset relative">
        {view === 'Dashboard' && <DashboardView />}
        {view === 'Reports' && <ReportsView />}
        {view === 'Admin' && <AdminView />}
        {view === 'TaskReports' && <TaskReportsView />}
      </main>
      <div className="fixed bottom-10 right-10 z-50 space-y-4 print-hide pointer-events-none">
        {notifications.map(n => <div key={n.id} className="bg-slate-900/95 dark:bg-white text-white dark:text-slate-900 px-10 py-5 rounded-[28px] shadow-2xl text-xs font-black animate-fade-in-up flex items-center gap-5 border border-white/10 dark:border-black/10 pointer-events-auto"><div className={`w-3 h-3 rounded-full ${n.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>{n.message}</div>)}
      </div>
    </div>
  );
};

export default App;
