
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

// Fixed Modal: Added explicit type definition for props and made footer optional with a default value.
// Also added conditional rendering for the footer element to avoid empty borders.
const Modal = ({ isOpen, onClose, title, children, footer = null, size = 'md' }: { isOpen: any; onClose: any; title: any; children: any; footer?: any; size?: string; }) => {
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
        {footer && (
          <footer className="flex justify-end p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl border-t border-slate-200 dark:border-slate-700">
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
        if (!adminSelectedClassId || !assembledClasses.find(c => c.id === adminSelectedClassId)) {
          setAdminSelectedClassId(assembledClasses[0].id);
        }
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

  const weeklyDates = useMemo(() => getWeekDates(currentDate, activeClass?.schedule), [currentDate, activeClass]);
  const monthlyDates = useMemo(() => getMonthDates(activeMonth, activeClass?.schedule), [activeMonth, activeClass]);
  const semesterDates = useMemo(() => getSemesterDates(activeSemester, activeClass?.schedule), [activeSemester, activeClass]);

  const handleExportAttendanceToExcel = useCallback(() => {
    if (!activeClass) return;
    if (reportTab === 'Semester') {
        const semesterMonths = activeSemester === 1 ? MONTHS_2026.slice(0, 6) : MONTHS_2026.slice(6, 12);
        const headers1 = ["No", "Nama Siswa"];
        const headers2 = ["", ""];
        semesterMonths.forEach(m => { headers1.push(m.name, "", "", ""); headers2.push("H", "S", "I", "A"); });
        headers1.push("TOTAL", "", "", "", "PERSENTASE");
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
                    monthTotals[status]++; semesterTotals[status]++; totalDays++;
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
        return;
    }
  }, [activeClass, attendance, reportTab, activeSemester, activeMonth]);

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
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Manajemen Data</h2>
        
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
            {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
                <button key={tab} onClick={() => setAdminTab(tab)} className={`px-4 py-2 font-semibold text-sm whitespace-nowrap ${adminTab === tab ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500'}`}>
                    {tab}
                </button>
            ))}
        </div>

        {adminTab === 'Kelas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Daftar Kelas</h3>
              <div className="flex gap-2">
                {selectedClassIds.length > 0 && (
                  <button onClick={() => handleBulkDelete('class')} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Hapus Massal ({selectedClassIds.length})</button>
                )}
                <button onClick={() => openAdminModal('class')} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">+ Tambah Kelas</button>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 w-10 border-b"><input type="checkbox" checked={selectedClassIds.length === classes.length && classes.length > 0} onChange={() => handleSelectAll('class', classes)} /></th>
                    <th className="px-4 py-3 text-left font-bold border-b">Nama Kelas</th>
                    <th className="px-4 py-3 text-right font-bold border-b">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleSelectOne('class', c.id)} /></td>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button onClick={() => openAdminModal('class', c)} className="text-indigo-600 hover:underline text-xs font-bold">Edit</button>
                        <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 hover:underline text-xs font-bold">Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === 'Siswa' && (
          <div className="space-y-4">
             <div className="flex justify-between items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Pilih Kelas:</span>
                <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-white dark:bg-slate-800 border rounded px-2 py-1 text-sm">
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                {selectedStudentIds.length > 0 && (
                  <button onClick={() => handleBulkDelete('student')} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Hapus Massal ({selectedStudentIds.length})</button>
                )}
                <button onClick={() => openAdminModal('student')} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">+ Tambah Siswa</button>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                        <th className="px-4 py-3 w-10"><input type="checkbox" checked={adminSelectedClass?.students && selectedStudentIds.length === adminSelectedClass.students.length} onChange={() => handleSelectAll('student', adminSelectedClass?.students || [])} /></th>
                        <th className="px-4 py-3 text-left font-bold">Nama</th><th className="px-4 py-3 text-left font-bold">NISN</th><th className="px-4 py-3 text-right font-bold">Aksi</th>
                    </tr></thead>
                    <tbody>
                        {adminSelectedClass?.students.map(s => (
                            <tr key={s.id} className="border-b hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleSelectOne('student', s.id)} /></td><td className="px-4 py-3">{s.name}</td><td className="px-4 py-3">{s.nisn}</td><td className="px-4 py-3 text-right space-x-2"><button onClick={() => openAdminModal('student', s)} className="text-indigo-600 font-bold text-xs">Edit</button><button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 font-bold text-xs">Hapus</button></td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

        {adminTab === 'Tugas' && (
          <div className="space-y-4">
             <div className="flex justify-between items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Pilih Kelas:</span>
                <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-white dark:bg-slate-800 border rounded px-2 py-1 text-sm">
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                {selectedAssignmentIds.length > 0 && (
                  <button onClick={() => handleBulkDelete('assignment')} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Hapus Massal ({selectedAssignmentIds.length})</button>
                )}
                <button onClick={() => openAdminModal('assignment')} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">+ Tambah Tugas</button>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                        <th className="px-4 py-3 w-10"><input type="checkbox" checked={adminSelectedClass?.assignments && selectedAssignmentIds.length === adminSelectedClass.assignments.length} onChange={() => handleSelectAll('assignment', adminSelectedClass?.assignments || [])} /></th>
                        <th className="px-4 py-3 text-left font-bold">Tugas</th><th className="px-4 py-3 text-left font-bold">Tenggat</th><th className="px-4 py-3 text-right font-bold">Aksi</th>
                    </tr></thead>
                    <tbody>
                        {adminSelectedClass?.assignments?.map(a => (
                            <tr key={a.id} className="border-b hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" checked={selectedAssignmentIds.includes(a.id)} onChange={() => toggleSelectOne('assignment', a.id)} /></td><td className="px-4 py-3">{a.title}</td><td className="px-4 py-3">{new Date(a.dueDate).toLocaleDateString('id-ID')}</td><td className="px-4 py-3 text-right space-x-2"><button onClick={() => openAdminModal('assignment', a)} className="text-indigo-600 font-bold text-xs">Edit</button><button onClick={() => handleDeleteItem('assignment', a.id)} className="text-rose-600 font-bold text-xs">Hapus</button></td></tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

        {adminTab === 'Database' && (
          <div className="p-10 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 text-center">
            <h3 className="text-xl font-bold mb-4">Integrasi Supabase Cloud</h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">Database Bapak saat ini terhubung dan aman. Semua perubahan akan disinkronkan secara otomatis.</p>
            <button onClick={handleManualSave} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform">Sinkronisasi Paksa</button>
          </div>
        )}
      </div>
    );
  };

  const DashboardView = () => {
    if (!activeClass) return <div className="p-6 text-slate-500 dark:text-slate-400">Pilih kelas untuk memulai.</div>;
    const dateStr = formatDate(currentDate);

    const handleSubmissionToggle = async (assignmentId: string, studentId: string, isSubmitted: boolean) => {
        if(!supabase) return;
        const { error } = await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, is_submitted: isSubmitted }, { onConflict: 'assignment_id, student_id' });
        if (error) { showToast('Gagal menyimpan status tugas', 'error'); } else { fetchFromCloud(); }
    };

    const handleScoreChange = async (assignmentId: string, studentId: string, score: string) => {
        if(!supabase) return;
        const { error } = await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, score: score, is_submitted: true }, { onConflict: 'assignment_id, student_id' });
        if (error) { showToast('Gagal menyimpan nilai', 'error'); } else { fetchFromCloud(); }
    };

    return (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition space-y-8">
            <div className="flex items-center justify-between mobile-stack gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{activeClass.name}</h2>
                    <p className="text-slate-500 font-medium">Panel Kendali Guru • {school.name}</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleManualSave} disabled={isSyncing} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-emerald-500 active:scale-95 transition-all flex items-center gap-2">
                        {isSyncing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        Simpan Perubahan
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Bagian Presensi */}
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border shadow-sm flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">Daftar Hadir</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <input 
                                    type="date" 
                                    value={dateStr} 
                                    onChange={(e) => setCurrentDate(new Date(e.target.value))}
                                    className="bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-2 py-1 text-sm font-bold text-indigo-600"
                                />
                                <span className="text-xs font-bold text-slate-400 uppercase">{DAY_NAMES[currentDate.getDay()]}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg></button>
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
                        {activeClass.students.map((student, idx) => {
                            const status = attendance[student.id]?.[dateStr] || 'H';
                            return (
                                <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-200 p-4 rounded-xl flex items-center justify-between group hover:border-indigo-300 transition-colors">
                                    <p className="font-bold text-slate-700 text-sm">{idx + 1}. {student.name}</p>
                                    <div className="flex gap-1.5">
                                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => (
                                            <button 
                                                key={s} 
                                                onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)}
                                                disabled={isFutureDate(currentDate)}
                                                className={`w-9 h-9 rounded-lg font-black text-xs transition-all ${status === s ? DARK_STATUS_COLORS[s] : 'bg-slate-100 text-slate-400 hover:bg-slate-200'} ${isFutureDate(currentDate) ? 'opacity-30' : ''}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Bagian Tugas */}
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border shadow-sm flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">Rekapan Tugas</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Daftar Nilai Siswa</p>
                        </div>
                        <button onClick={() => openAdminModal('assignment')} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100">+ Tugas Baru</button>
                    </div>

                    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                        {activeClass.assignments && activeClass.assignments.length > 0 ? (
                            activeClass.assignments.map(a => (
                                <div key={a.id} className="bg-white dark:bg-slate-800 border rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="font-black text-slate-900">{a.title}</h4>
                                            <p className="text-[10px] font-bold text-indigo-500 uppercase">Tenggat: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                        </div>
                                        <button onClick={() => openAdminModal('assignment', a)} className="text-slate-400 hover:text-indigo-600 p-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {activeClass.students.map((s, sIdx) => {
                                            const sub = a.submissions[s.id];
                                            const isSub = sub?.isSubmitted || false;
                                            return (
                                                <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-t border-slate-50">
                                                    <span className="text-slate-500 w-4">{sIdx + 1}</span>
                                                    <span className="flex-1 font-bold text-slate-700 truncate mx-2">{s.name}</span>
                                                    <div className="flex items-center gap-3">
                                                        <button 
                                                            onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)}
                                                            className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isSub ? 'bg-indigo-600 text-white' : 'bg-slate-100 border'}`}
                                                        >
                                                            {isSub && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
                                                        </button>
                                                        <input 
                                                            type="text" 
                                                            defaultValue={sub?.score || ''}
                                                            onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)}
                                                            disabled={!isSub}
                                                            placeholder="0"
                                                            className="w-10 bg-slate-50 border-none text-center rounded p-1 font-black text-indigo-700 disabled:opacity-30"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="bg-slate-50 border-2 border-dashed rounded-2xl p-10 text-center text-slate-400 font-bold">Belum ada tugas dibuat.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Tambah/Edit (Dipakai di Dashboard maupun Admin) - Moved footer buttons to the footer prop to resolve TS error */}
            <Modal 
              isOpen={!!showModal} 
              onClose={() => setShowModal(null)} 
              title={editingItem ? `Edit ${showModal}` : `Tambah ${showModal}`}
              footer={
                <div className="flex gap-2 w-full">
                  <button onClick={handleAdminSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-500">Simpan Data</button>
                  <button onClick={() => setShowModal(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold">Batal</button>
                </div>
              }
            >
                {showModal === 'class' && (
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase">Nama Kelas</label><input type="text" value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                    </div>
                )}
                {showModal === 'student' && (
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase">Nama Siswa</label><input type="text" value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase">NIS</label><input type="text" value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase">NISN</label><input type="text" value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                        </div>
                    </div>
                )}
                {showModal === 'assignment' && (
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase">Judul Tugas</label><input type="text" value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase">Tenggat Waktu</label><input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl" /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase">Deskripsi</label><textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full mt-1 bg-slate-50 border-none rounded-xl h-24" /></div>
                    </div>
                )}
            </Modal>
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
            <button onClick={handleExportAttendanceToExcel} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 transition-all">Simpan Laporan</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-200 dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-all">Cetak</button>
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

        <div className="hidden print-header text-center mb-8 border-b-2 border-black pb-4">
          <h2 className="text-xl font-bold">{school.name}</h2>
          <h3 className="text-lg font-bold">LAPORAN PRESENSI KELAS: {activeClass.name}</h3>
          <p className="uppercase text-sm">{reportTitle}</p>
        </div>

        <div className="overflow-auto flex-1 print:overflow-visible print:block">
          {reportTab === 'Semester' ? (
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-collapse text-[10px]">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 print:static">
                      <tr>
                        <th rowSpan={2} className="px-1 py-2 text-left text-[9px] font-bold text-slate-500 border">No</th>
                        <th rowSpan={2} className="px-2 py-2 text-left text-[9px] font-bold text-slate-500 border" style={{minWidth: '150px'}}>Nama Siswa</th>
                        {semesterMonths.map(m => <th key={m.value} colSpan={4} className="px-1 py-1 text-center font-bold border">{m.name.substring(0,3)}</th>)}
                        <th colSpan={4} className="px-1 py-1 text-center font-bold bg-slate-200 border">Total</th>
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

  const LoginScreen = ({ onLoginSuccess, showToast, authConfig, schoolConfig }) => {
    const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (loginForm.user === authConfig.username && loginForm.pass === authConfig.password) onLoginSuccess();
      else showToast('Username atau Password salah!', 'error');
    };
    return (
      <div className="min-h-screen w-full flex items-center justify-center login-bg p-4">
        <div className="w-full max-w-sm glass-panel rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8"><h1 className="text-3xl font-bold text-slate-900">{schoolConfig.name}</h1><p className="text-slate-500 mt-1">Presensi Digital {schoolConfig.year}</p></div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div><label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-widest">Username</label><input type="text" value={loginForm.user} onChange={e => setLoginForm(f => ({ ...f, user: e.target.value }))} className="w-full bg-white/50 border border-slate-300 rounded-xl px-3 py-2 shadow-sm" placeholder="admin"/></div>
            <div><label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-widest">Password</label><input type="password" value={loginForm.pass} onChange={e => setLoginForm(f => ({ ...f, pass: e.target.value }))} className="w-full bg-white/50 border border-slate-300 rounded-xl px-3 py-2 shadow-sm" placeholder="••••••••"/></div>
            <button type="submit" className="w-full active-gradient text-white font-black py-3 rounded-xl shadow-xl transition-transform active:scale-95">MASUK</button>
          </form>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 text-indigo-600 font-black animate-pulse">MEMUAT SISTEM...</div>;
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} showToast={showToast} authConfig={auth} schoolConfig={school} />;

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex relative print:block overflow-hidden">
      <nav className="w-64 glass-panel p-4 flex flex-col print-hide flex-shrink-0 border-r shadow-2xl z-20">
        <div className="mb-10 text-center">
            <h2 className="text-xl font-black text-indigo-600 tracking-tighter">{school.name}</h2>
            <div className="mt-1 h-1 w-10 bg-indigo-500 mx-auto rounded-full"></div>
        </div>
        <div className="flex flex-col gap-2">
            {MENU_ITEMS.map(m => (
                <button key={m.view} onClick={() => setView(m.view)} className={`px-4 py-3 text-left rounded-xl text-sm font-black transition-all ${view === m.view ? 'bg-indigo-600 text-white shadow-xl translate-x-1' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600'}`}>{m.label}</button>
            ))}
            <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
                <p className="text-[10px] font-black text-slate-400 mb-3 tracking-[0.2em] px-4">KELAS SAYA</p>
                <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  {classes.map(c => (
                      <button key={c.id} onClick={() => { setActiveClassId(c.id); setView('Dashboard'); }} className={`w-full px-4 py-3 text-left rounded-xl text-sm font-bold truncate transition-all ${activeClassId === c.id && view === 'Dashboard' ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'}`}>{c.name}</button>
                  ))}
                </div>
            </div>
        </div>
        <button onClick={toggleTheme} className="mt-auto p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">{theme === 'light' ? '🌙 Mode Gelap' : '☀️ Mode Terang'}</button>
      </nav>
      <main className="flex-1 flex flex-col overflow-hidden print:block relative">
        {view === 'Dashboard' && <DashboardView />}
        {view === 'Reports' && <ReportsView />}
        {view === 'Admin' && <AdminView />}
        {view === 'TaskReports' && <div className="p-10 text-center font-bold text-slate-400">Pilih Kelas di Samping untuk Melihat Dashboard Rekapan Tugas Lengkap.</div>}
      </main>
      <div className="fixed bottom-4 right-4 z-50 space-y-2 print-hide">
        {notifications.map(n => <div key={n.id} className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl text-xs font-black animate-fade-in-up flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>{n.message}</div>)}
      </div>
    </div>
  );
};

export default App;
