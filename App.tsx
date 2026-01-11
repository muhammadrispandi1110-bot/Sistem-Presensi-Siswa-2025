
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, STATUS_LABELS } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const STATUS_THEMES: Record<AttendanceStatus, { color: string, bg: string, border: string, ring: string }> = {
  'H': { color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30', ring: 'ring-emerald-500/20' },
  'S': { color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', ring: 'ring-blue-500/20' },
  'I': { color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', ring: 'ring-amber-500/20' },
  'A': { color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/30', ring: 'ring-rose-500/20' }
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

type Theme = 'light' | 'dark';

const Modal = ({ isOpen, onClose, title, children, footer = null, size = 'md' }: { isOpen: any; onClose: any; title: any; children?: any; footer?: any; size?: string; }) => {
  if (!isOpen) return null;
  const sizeClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-slate-900/80 dark:bg-black/80 z-50 flex items-center justify-center p-4 print-hide backdrop-blur-sm">
      <div className={`w-full ${sizeClass} bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col view-transition border border-white/20`}>
        <header className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <main className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">{children}</main>
        {footer && (
          <footer className="flex justify-end p-5 bg-slate-50/50 dark:bg-slate-900/50 rounded-b-2xl border-t border-slate-100 dark:border-slate-700">
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
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) return localStorage.getItem('theme') as Theme;
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
  const [editingItem, setEditingItem] = useState<ClassData | Student | Assignment | null>(null);
  const [adminSelectedClassId, setAdminSelectedClassId] = useState<string | null>(null);
  
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);

  const [adminFormData, setAdminFormData] = useState({ 
    className: '', 
    schedule: defaults.teachingDays,
    studentName: '', studentNis: '', studentNisn: '',
    assignmentTitle: '', assignmentDesc: '', assignmentDueDate: ''
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
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
            return { ...a, submissions: assignmentSubmissions };
        });
        return { ...c, id: c.id, students: classStudents, assignments: classAssignments };
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
      showToast('Gagal memuat data cloud.', 'error');
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
    showToast('Seluruh data berhasil disimpan dan disinkronkan ke cloud!');
    setIsSyncing(false);
  };

  const openAdminModal = (type: 'class' | 'student' | 'assignment', item: any = null) => {
    setEditingItem(item);
    if (item) {
        if (type === 'class') setAdminFormData({ ...adminFormData, className: item.name, schedule: item.schedule || defaults.teachingDays });
        else if (type === 'student') setAdminFormData({ ...adminFormData, studentName: item.name, studentNis: item.nis, studentNisn: item.nisn });
        else if (type === 'assignment') setAdminFormData({ ...adminFormData, assignmentTitle: item.title, assignmentDesc: item.description, assignmentDueDate: item.dueDate });
    } else {
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
      showToast('Data berhasil disimpan.');
      setShowModal(null);
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment', id: string) => {
    if (!supabase || !window.confirm(`Yakin ingin menghapus ${type} ini?`)) return;
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      showToast(`${type} berhasil dihapus.`);
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menghapus: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const ids = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (!supabase || ids.length === 0 || !window.confirm(`Yakin ingin menghapus ${ids.length} item terpilih?`)) return;
    
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
      
      showToast(`${ids.length} item berhasil dihapus secara massal.`);
      if (type === 'class') setSelectedClassIds([]);
      if (type === 'student') setSelectedStudentIds([]);
      if (type === 'assignment') setSelectedAssignmentIds([]);
      
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menghapus massal: ${err.message}`, 'error');
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
      <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-8 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Admin Console</h2>
            <p className="text-slate-500 font-medium">Manajemen Infrastruktur Data Sekolah</p>
          </div>
          <button onClick={handleManualSave} disabled={isSyncing} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-black shadow-lg">Refresh Sync</button>
        </div>
        
        <div className="flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 w-fit">
            {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
                <button key={tab} onClick={() => setAdminTab(tab)} className={`px-6 py-3 rounded-xl text-sm font-bold transition-all ${adminTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                    {tab}
                </button>
            ))}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden p-6">
            {adminTab === 'Kelas' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black">Daftar Semua Kelas</h3>
                  <div className="flex gap-3">
                    {selectedClassIds.length > 0 && (
                      <button onClick={() => handleBulkDelete('class')} className="bg-rose-100 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black border border-rose-200">Hapus Terpilih ({selectedClassIds.length})</button>
                    )}
                    <button onClick={() => openAdminModal('class')} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black shadow-lg shadow-indigo-100">+ Tambah Kelas</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-4 w-10 text-center border-b"><input type="checkbox" checked={selectedClassIds.length === classes.length && classes.length > 0} onChange={() => handleSelectAll('class', classes)} className="w-4 h-4 rounded" /></th>
                        <th className="px-6 py-4 text-left font-black uppercase tracking-widest text-[10px] border-b">Nama Kelas</th>
                        <th className="px-6 py-4 text-right font-black uppercase tracking-widest text-[10px] border-b">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 border-b last:border-0 transition-colors">
                          <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleSelectOne('class', c.id)} className="w-4 h-4 rounded" /></td>
                          <td className="px-6 py-4 font-bold">{c.name}</td>
                          <td className="px-6 py-4 text-right space-x-4">
                            <button onClick={() => openAdminModal('class', c)} className="text-indigo-600 font-black text-xs uppercase">Edit</button>
                            <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 font-black text-xs uppercase">Hapus</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'Siswa' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mobile-stack gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-black">Data Siswa</h3>
                    <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-black text-indigo-600">
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    {selectedStudentIds.length > 0 && (
                      <button onClick={() => handleBulkDelete('student')} className="bg-rose-100 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus Terpilih ({selectedStudentIds.length})</button>
                    )}
                    <button onClick={() => openAdminModal('student')} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black">+ Siswa Baru</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-4 w-10 text-center border-b"><input type="checkbox" checked={adminSelectedClass?.students && selectedStudentIds.length === adminSelectedClass.students.length} onChange={() => handleSelectAll('student', adminSelectedClass?.students || [])} className="w-4 h-4 rounded" /></th>
                        <th className="px-6 py-4 text-left font-black uppercase text-[10px] border-b">Nama</th>
                        <th className="px-6 py-4 text-left font-black uppercase text-[10px] border-b">NISN</th>
                        <th className="px-6 py-4 text-right font-black uppercase text-[10px] border-b">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminSelectedClass?.students.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 border-b last:border-0 transition-colors">
                          <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleSelectOne('student', s.id)} className="w-4 h-4 rounded" /></td>
                          <td className="px-6 py-4 font-bold">{s.name}</td>
                          <td className="px-6 py-4 text-slate-500 font-medium">{s.nisn}</td>
                          <td className="px-6 py-4 text-right space-x-4">
                            <button onClick={() => openAdminModal('student', s)} className="text-indigo-600 font-black text-xs uppercase">Edit</button>
                            <button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 font-black text-xs uppercase">Hapus</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'Tugas' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mobile-stack gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xl font-black">Daftar Tugas</h3>
                    <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-black text-indigo-600">
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    {selectedAssignmentIds.length > 0 && (
                      <button onClick={() => handleBulkDelete('assignment')} className="bg-rose-100 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus Terpilih ({selectedAssignmentIds.length})</button>
                    )}
                    <button onClick={() => openAdminModal('assignment')} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black">+ Tugas Baru</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-4 w-10 text-center border-b"><input type="checkbox" checked={adminSelectedClass?.assignments && selectedAssignmentIds.length === adminSelectedClass.assignments.length} onChange={() => handleSelectAll('assignment', adminSelectedClass?.assignments || [])} className="w-4 h-4 rounded" /></th>
                        <th className="px-6 py-4 text-left font-black uppercase text-[10px] border-b">Tugas</th>
                        <th className="px-6 py-4 text-left font-black uppercase text-[10px] border-b">Tenggat</th>
                        <th className="px-6 py-4 text-right font-black uppercase text-[10px] border-b">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminSelectedClass?.assignments?.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 border-b last:border-0 transition-colors">
                          <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedAssignmentIds.includes(a.id)} onChange={() => toggleSelectOne('assignment', a.id)} className="w-4 h-4 rounded" /></td>
                          <td className="px-6 py-4 font-bold">{a.title}</td>
                          <td className="px-6 py-4 font-medium text-slate-500">{new Date(a.dueDate).toLocaleDateString('id-ID')}</td>
                          <td className="px-6 py-4 text-right space-x-4">
                            <button onClick={() => openAdminModal('assignment', a)} className="text-indigo-600 font-black text-xs uppercase">Edit</button>
                            <button onClick={() => handleDeleteItem('assignment', a.id)} className="text-rose-600 font-black text-xs uppercase">Hapus</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'Database' && (
                <div className="p-12 text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto text-3xl">📡</div>
                  <h3 className="text-2xl font-black">Sinkronisasi Cloud Aktif</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">Database Supabase Bapak berfungsi dengan baik. Semua data tersimpan secara real-time di server cloud.</p>
                  <button onClick={handleManualSave} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black hover:scale-105 transition-all shadow-xl shadow-indigo-200">Refresh Data Sekarang</button>
                </div>
            )}
        </div>

        <Modal isOpen={!!showModal} onClose={() => setShowModal(null)} title={editingItem ? `Edit ${showModal === 'class' ? 'Kelas' : showModal === 'student' ? 'Siswa' : 'Tugas'}` : `Tambah ${showModal === 'class' ? 'Kelas' : showModal === 'student' ? 'Siswa' : 'Tugas'}`} footer={<div className="flex gap-3 w-full"><button onClick={handleAdminSave} className="flex-1 active-gradient text-white py-4 rounded-2xl font-black shadow-lg">SIMPAN DATA</button><button onClick={() => setShowModal(null)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black">BATAL</button></div>}>
            {showModal === 'class' && (
                <div className="space-y-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Kelas</label><input type="text" value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" placeholder="Misal: X.9" /></div></div>
            )}
            {showModal === 'student' && (
                <div className="space-y-5">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Lengkap</label><input type="text" value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NIS</label><input type="text" value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" /></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NISN</label><input type="text" value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" /></div>
                    </div>
                </div>
            )}
            {showModal === 'assignment' && (
                <div className="space-y-5">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Judul Tugas</label><input type="text" value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tenggat Waktu</label><input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deskripsi (Opsional)</label><textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full mt-2 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-4 font-bold h-24" /></div>
                </div>
            )}
        </Modal>
      </div>
    );
  };

  const DashboardView = () => {
    if (!activeClass) return <div className="p-12 text-center text-slate-400 font-bold">Memuat Dashboard Kelas...</div>;

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
        <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-slate-50/50 dark:bg-slate-900/50">
            {/* Greeting & Header */}
            <div className="flex items-center justify-between mobile-stack gap-6">
                <div className="space-y-1">
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{activeClass.name}</h2>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase rounded-full tracking-widest">{school.name}</span>
                        <span className="text-slate-400 text-sm font-bold">{DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleManualSave} disabled={isSyncing} className="active-gradient text-white px-8 py-4 rounded-2xl text-sm font-black shadow-2xl transition-all active:scale-95 flex items-center gap-2 min-w-[160px] justify-center">
                        <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        {isSyncing ? 'Menyimpan...' : 'Simpan Data'}
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Siswa', val: activeClass.students.length, color: 'text-slate-600', bg: 'bg-slate-100', icon: '👥' },
                    { label: 'Hadir', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'H' || !attendance[s.id]?.[dateStr]).length, color: 'text-emerald-600', bg: 'bg-emerald-100', icon: '✅' },
                    { label: 'Sakit', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'S').length, color: 'text-blue-600', bg: 'bg-blue-100', icon: '🤒' },
                    { label: 'Izin', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'I').length, color: 'text-amber-600', bg: 'bg-amber-100', icon: '✉️' },
                    { label: 'Alpa', val: activeClass.students.filter(s => attendance[s.id]?.[dateStr] === 'A').length, color: 'text-rose-600', bg: 'bg-rose-100', icon: '❌' },
                ].map(stat => (
                    <div key={stat.label} className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
                        <div className={`w-12 h-12 ${stat.bg} dark:bg-slate-700 rounded-2xl flex items-center justify-center text-xl`}>{stat.icon}</div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className={`text-2xl font-black ${stat.color} dark:text-white`}>{stat.val}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                {/* Main Attendance Section */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                            <span className="w-2 h-8 bg-indigo-500 rounded-full"></span>
                            Daftar Presensi Harian
                        </h3>
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-1 rounded-2xl shadow-sm border">
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg></button>
                            <input type="date" value={dateStr} onChange={(e) => setCurrentDate(new Date(e.target.value))} className="bg-transparent border-none text-xs font-black text-indigo-600 dark:text-indigo-400 p-1 w-32 text-center" />
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeClass.students.map((student, idx) => {
                            const status = attendance[student.id]?.[dateStr] || 'H';
                            const theme = STATUS_THEMES[status];
                            return (
                                <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 rounded-3xl flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className={`w-10 h-10 rounded-2xl ${theme.bg} flex-shrink-0 flex items-center justify-center font-black text-sm ${theme.color}`}>
                                            {student.name.substring(0, 1)}
                                        </div>
                                        <div className="truncate">
                                            <p className="text-xs font-black text-slate-400 uppercase tracking-tighter">No. {idx + 1}</p>
                                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{student.name}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-2xl ml-4">
                                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => {
                                            const sTheme = STATUS_THEMES[s];
                                            const isActive = status === s;
                                            return (
                                                <button 
                                                    key={s} 
                                                    onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)}
                                                    className={`w-9 h-9 rounded-xl font-black text-xs transition-all ${isActive ? `${sTheme.bg} ${sTheme.color} shadow-sm scale-110` : 'text-slate-300 hover:text-slate-500 hover:bg-white dark:hover:bg-slate-700'}`}
                                                >
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

                {/* Task/Assignment Sidebar */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-black tracking-tight">Tugas Kelas</h3>
                        <button onClick={() => openAdminModal('assignment')} className="text-indigo-600 text-xs font-black hover:underline">+ Tambah</button>
                    </div>

                    <div className="space-y-6">
                        {activeClass.assignments && activeClass.assignments.length > 0 ? (
                            activeClass.assignments.map(a => {
                                const submittedCount = Object.values(a.submissions).filter((s: any) => s.isSubmitted).length;
                                const progress = Math.round((submittedCount / activeClass.students.length) * 100);
                                return (
                                    <div key={a.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-6 shadow-sm space-y-5">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-black text-slate-900 dark:text-white leading-tight">{a.title}</h4>
                                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Hingga {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                            </div>
                                            <button onClick={() => openAdminModal('assignment', a)} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                                <span>Pengumpulan</span>
                                                <span>{submittedCount}/{activeClass.students.length} Siswa</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                            {activeClass.students.map((s, sIdx) => {
                                                const sub = a.submissions[s.id];
                                                const isSub = sub?.isSubmitted || false;
                                                return (
                                                    <div key={s.id} className="flex items-center justify-between group/row">
                                                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{sIdx+1}. {s.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <input type="text" defaultValue={sub?.score || ''} onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} disabled={!isSub} placeholder="Nilai" className="w-10 bg-slate-50 dark:bg-slate-900 border-none text-center rounded-lg p-1 text-[10px] font-black text-indigo-600 disabled:opacity-20" />
                                                            <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${isSub ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-300'}`}>
                                                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="bg-slate-50 dark:bg-slate-900/50 border-2 border-dashed rounded-3xl p-12 text-center">
                                <p className="text-slate-400 font-bold">Belum ada tugas</p>
                                <button onClick={() => openAdminModal('assignment')} className="mt-4 text-indigo-600 font-black text-xs">Buat Tugas Pertama</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const ReportsView = () => {
    if (!activeClass) return <div className="p-12 text-center text-slate-400 font-bold">Memuat Laporan...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    const semesterMonths = activeSemester === 1 ? MONTHS_2026.slice(0, 6) : MONTHS_2026.slice(6, 12);
    const reportTitle = reportTab === 'Semester' ? `REKAPAN SEMESTER ${activeSemester} (${activeSemester === 1 ? 'JAN-JUN' : 'JUL-DES'})` : `LAPORAN PRESENSI ${reportTab.toUpperCase()}`;

    return (
      <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden bg-white dark:bg-slate-900 print:block">
        <div className="flex items-center justify-between mb-8 print-hide">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">Laporan Presensi</h2>
            <p className="text-slate-500 font-medium">Rekap data kehadiran Kelas {activeClass.name}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-sm font-black shadow-xl">Cetak Laporan</button>
          </div>
        </div>
        
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 mb-6 print-hide">
          <div className="flex gap-6">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`pb-4 text-sm font-bold transition-all relative ${reportTab === tab ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    {tab === 'Daily' ? 'Harian' : tab === 'Weekly' ? 'Mingguan' : tab === 'Monthly' ? 'Bulanan' : 'Semester'}
                    {reportTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 rounded-full"></div>}
                </button>
            ))}
          </div>
          <div className="flex gap-3 pb-2">
              {(reportTab === 'Daily' || reportTab === 'Weekly') && (
                  <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Tanggal:</span>
                      <input 
                          type="date" 
                          value={formatDate(currentDate)} 
                          onChange={(e) => setCurrentDate(new Date(e.target.value))}
                          className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                  </div>
              )}
              {reportTab === 'Semester' && (
                  <select value={activeSemester} onChange={e => setActiveSemester(parseInt(e.target.value) as 1 | 2)} className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-bold">
                      <option value={1}>Semester 1 (Jan-Jun)</option><option value={2}>Semester 2 (Jul-Des)</option>
                  </select>
              )}
              {reportTab === 'Monthly' && (
                  <select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-bold">
                      {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                  </select>
              )}
          </div>
        </div>

        <div className="hidden print-header text-center mb-10 border-b-4 border-slate-900 pb-6">
          <h2 className="text-2xl font-black">{school.name}</h2>
          <h3 className="text-xl font-bold">REKAPAN KEHADIRAN SISWA - {activeClass.name}</h3>
          <p className="font-black text-sm">{reportTitle}</p>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar print:overflow-visible">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 print:static">
                {reportTab === 'Semester' ? (
                  <>
                    <tr>
                      <th rowSpan={2} className="px-4 py-4 text-left text-[10px] font-black text-slate-400 uppercase border">No</th>
                      <th rowSpan={2} className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase border min-w-[200px]">Nama Siswa</th>
                      {semesterMonths.map(m => <th key={m.value} colSpan={4} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase border">{m.name.substring(0,3)}</th>)}
                      <th colSpan={4} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase border bg-slate-100">Total</th>
                      <th rowSpan={2} className="px-2 py-4 text-center text-[10px] font-black text-indigo-600 uppercase border">%</th>
                    </tr>
                    <tr className="bg-slate-50">
                      {semesterMonths.map(m => (<React.Fragment key={m.value}><th className="border text-[9px] p-1">H</th><th className="border text-[9px] p-1">S</th><th className="border text-[9px] p-1">I</th><th className="border text-[9px] p-1">A</th></React.Fragment>))}
                      <th className="border text-[9px] p-1 bg-slate-100">H</th><th className="border text-[9px] p-1 bg-slate-100">S</th><th className="border text-[9px] p-1 bg-slate-100">I</th><th className="border text-[9px] p-1 bg-slate-100">A</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="px-4 py-5 text-left text-[10px] font-black text-slate-400 uppercase border">No</th>
                    <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase border min-w-[200px]">Nama Siswa</th>
                    {dates.map(d => (<th key={d.toISOString()} className="px-2 py-5 text-center text-[10px] font-black text-slate-400 uppercase border"><div>{DAY_NAMES[d.getDay()].substring(0,3)}</div><div>{d.getDate()}</div></th>))}
                    <th className="px-2 py-5 text-center text-[10px] font-black text-slate-400 uppercase border bg-slate-50">H</th>
                    <th className="px-2 py-5 text-center text-[10px] font-black text-slate-400 uppercase border bg-slate-50">S</th>
                    <th className="px-2 py-5 text-center text-[10px] font-black text-slate-400 uppercase border bg-slate-50">I</th>
                    <th className="px-2 py-5 text-center text-[10px] font-black text-slate-400 uppercase border bg-slate-50">A</th>
                    <th className="px-4 py-5 text-center text-[10px] font-black text-indigo-600 uppercase border">%</th>
                  </tr>
                )}
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {activeClass.students.map((s, idx) => {
                  if (reportTab === 'Semester') {
                    const semTotals = { H: 0, S: 0, I: 0, A: 0 };
                    let semDays = 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-400 border">{idx + 1}</td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 border">{s.name}</td>
                        {semesterMonths.map(m => {
                          const mDates = getMonthDates(m.value, activeClass.schedule);
                          const mTotals = { H: 0, S: 0, I: 0, A: 0 };
                          mDates.forEach(d => {
                            const status = attendance[s.id]?.[formatDate(d)] || 'H';
                            mTotals[status]++; semTotals[status]++; semDays++;
                          });
                          return (<React.Fragment key={m.value}><td className="text-center border text-[10px]">{mTotals.H || '-'}</td><td className="text-center border text-[10px] text-blue-500">{mTotals.S || '-'}</td><td className="text-center border text-[10px] text-amber-500">{mTotals.I || '-'}</td><td className="text-center border text-[10px] text-rose-500">{mTotals.A || '-'}</td></React.Fragment>);
                        })}
                        <td className="text-center border text-[10px] font-black bg-slate-50">{semTotals.H}</td><td className="text-center border text-[10px] font-black bg-slate-50">{semTotals.S}</td><td className="text-center border text-[10px] font-black bg-slate-50">{semTotals.I}</td><td className="text-center border text-[10px] font-black bg-slate-50">{semTotals.A}</td>
                        <td className="text-center border text-xs font-black text-indigo-600">{semDays > 0 ? ((semTotals.H / semDays) * 100).toFixed(0) : 0}%</td>
                      </tr>
                    );
                  }
                  const t = { H: 0, S: 0, I: 0, A: 0, T: 0 };
                  dates.forEach(d => { const st = attendance[s.id]?.[formatDate(d)] || 'H'; t[st]++; t.T++; });
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-bold text-slate-400 border">{idx + 1}</td>
                      <td className="px-6 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 border">{s.name}</td>
                      {dates.map(d => {
                        const status = attendance[s.id]?.[formatDate(d)] || 'H';
                        return (<td key={formatDate(d)} className={`px-2 py-3 text-center text-[10px] font-black border ${status === 'H' ? 'text-emerald-600' : 'text-rose-600'}`}>{status}</td>);
                      })}
                      <td className="px-2 py-3 text-center text-xs font-bold border bg-slate-50">{t.H}</td><td className="px-2 py-3 text-center text-xs font-bold border bg-slate-50">{t.S}</td><td className="px-2 py-3 text-center text-xs font-bold border bg-slate-50">{t.I}</td><td className="px-2 py-3 text-center text-xs font-bold border bg-slate-50">{t.A}</td>
                      <td className="px-4 py-3 text-center text-xs font-black text-indigo-600 border">{t.T > 0 ? ((t.H / t.T) * 100).toFixed(1) : 0}%</td>
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
    if (!activeClass) return <div className="p-12 text-center text-slate-400 font-bold">Memuat Rekap Tugas...</div>;
    const assignments = activeClass.assignments || [];
    
    return (
      <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden bg-white dark:bg-slate-900 print:block">
        <div className="flex items-center justify-between mb-8 print-hide">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight">Rekap Tugas Kelas</h2>
            <p className="text-slate-500 font-medium">Monitoring nilai kumulatif seluruh tugas {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-sm font-black shadow-xl hover:scale-105 transition-transform active:scale-95">Cetak Rekap Nilai</button>
        </div>

        <div className="hidden print-header text-center mb-10 border-b-4 border-slate-900 pb-6">
          <h2 className="text-2xl font-black">{school.name}</h2>
          <h3 className="text-xl font-bold">REKAPITULASI NILAI TUGAS - {activeClass.name}</h3>
          <p className="font-black text-sm">TAHUN PELAJARAN {school.year}</p>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar border rounded-3xl print:overflow-visible print:border-none">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 print:static">
              <tr>
                <th className="px-4 py-6 text-left text-[10px] font-black text-slate-400 uppercase border">No</th>
                <th className="px-6 py-6 text-left text-[10px] font-black text-slate-400 uppercase border min-w-[200px]">Nama Peserta Didik</th>
                {assignments.map((a, i) => (
                  <th key={a.id} className="px-4 py-6 text-center text-[10px] font-black text-slate-400 uppercase border max-w-[120px]">
                    <div className="truncate" title={a.title}>Tugas {i+1}</div>
                  </th>
                ))}
                <th className="px-6 py-6 text-center text-[10px] font-black text-indigo-600 uppercase border bg-indigo-50 dark:bg-indigo-900/20">Rata-Rata</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {activeClass.students.map((s, idx) => {
                let totalScore = 0;
                let taskCount = 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-4 text-xs font-bold text-slate-400 border text-center">{idx + 1}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-800 dark:text-slate-200 border">{s.name}</td>
                    {assignments.map(a => {
                      const submission = a.submissions[s.id];
                      const scoreStr = (submission?.isSubmitted && submission.score) ? submission.score : '-';
                      const scoreNum = parseFloat(scoreStr);
                      if (!isNaN(scoreNum)) {
                        totalScore += scoreNum;
                        taskCount++;
                      }
                      return (
                        <td key={a.id} className="px-4 py-4 text-center text-xs font-bold border text-slate-600 dark:text-slate-400">
                          {scoreStr}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-center text-sm font-black text-indigo-600 border bg-indigo-50/30 dark:bg-indigo-900/10">
                      {taskCount > 0 ? (totalScore / taskCount).toFixed(1) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="mt-8 px-6 print-hide">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Keterangan Judul Tugas:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {assignments.map((a, i) => (
                    <div key={a.id} className="flex gap-3 items-center">
                        <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center text-[10px] font-black">{i+1}</span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{a.title}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-900"><div className="text-center space-y-6"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="text-indigo-400 font-black tracking-widest text-sm animate-pulse">SMAN 11 MAKASSAR • DIGITAL PRESENCE</p></div></div>;
  if (!isAuthenticated) return (
    <div className="min-h-screen w-full flex items-center justify-center login-bg p-4">
      <div className="w-full max-w-sm bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-[40px] p-10 shadow-2xl border border-white/20">
        <div className="text-center mb-10 space-y-2">
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Login.</h1>
            <p className="text-slate-500 font-bold text-sm">Masuk ke Portal Guru Digital {school.year}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); if(d.get('u') === auth.username && d.get('p') === auth.password) setIsAuthenticated(true); else showToast('Akses Ditolak!', 'error'); }} className="space-y-6">
          <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Username</label><input name="u" type="text" className="w-full bg-slate-50/50 dark:bg-slate-800/50 border-none rounded-2xl p-4 font-bold shadow-inner" placeholder="admin" required /></div>
          <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Password</label><input name="p" type="password" className="w-full bg-slate-50/50 dark:bg-slate-800/50 border-none rounded-2xl p-4 font-bold shadow-inner" placeholder="••••••••" required /></div>
          <button type="submit" className="w-full active-gradient text-white font-black py-4 rounded-2xl shadow-xl transition-transform active:scale-95 text-sm">LOGIN SISTEM</button>
        </form>
        <p className="text-center mt-8 text-[10px] text-slate-400 font-bold uppercase tracking-widest">© 2026 SMAN 11 Makassar</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-slate-955 text-slate-800 dark:text-slate-200 flex relative overflow-hidden print:block">
      <nav className="w-72 bg-white dark:bg-slate-900 p-6 flex flex-col flex-shrink-0 border-r border-slate-100 dark:border-slate-800 z-20 print-hide">
        <div className="mb-12 flex items-center gap-4 px-2">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl font-black">11</div>
            <div><h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">SMAN 11</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Presensi Digital</p></div>
        </div>
        <div className="flex flex-col gap-2">
            {MENU_ITEMS.map(m => (
                <button key={m.view} onClick={() => setView(m.view)} className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-bold transition-all ${view === m.view ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 dark:shadow-none translate-x-1' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    <span className="text-lg">{m.icon}</span>{m.label}
                </button>
            ))}
            <div className="mt-10 pt-6 border-t border-slate-50 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 mb-4 tracking-[0.2em] px-5 uppercase">Kelas Bapak</p>
                <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  {classes.map(c => (
                      <button key={c.id} onClick={() => { setActiveClassId(c.id); setView('Dashboard'); }} className={`w-full px-5 py-4 text-left rounded-2xl text-xs font-black transition-all truncate ${activeClassId === c.id && view === 'Dashboard' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{c.name}</button>
                  ))}
                </div>
            </div>
        </div>
        <div className="mt-auto space-y-4">
            <button onClick={toggleTheme} className="w-full flex items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">{theme === 'light' ? '🌙 Gelap' : '☀️ Terang'}</button>
            <p className="text-[9px] text-center font-bold text-slate-300 uppercase tracking-widest">V.2.0.26 Stable</p>
        </div>
      </nav>
      <main className="flex-1 flex flex-col overflow-hidden print:block relative">
        {view === 'Dashboard' && <DashboardView />}
        {view === 'Reports' && <ReportsView />}
        {view === 'Admin' && <AdminView />}
        {view === 'TaskReports' && <TaskReportsView />}
      </main>
      <div className="fixed bottom-6 right-6 z-50 space-y-3 print-hide">
        {notifications.map(n => <div key={n.id} className="bg-slate-900/90 dark:bg-white/90 backdrop-blur-md text-white dark:text-slate-900 px-8 py-4 rounded-3xl shadow-2xl text-xs font-black animate-fade-in-up flex items-center gap-4 border border-white/10 dark:border-black/10"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>{n.message}</div>)}
      </div>
    </div>
  );
};

export default App;
