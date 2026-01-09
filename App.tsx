
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

  useEffect(() => {
    setSelectedStudentIds([]);
    setSelectedAssignmentIds([]);
  }, [adminSelectedClassId]);

  const [adminFormData, setAdminFormData] = useState({ 
    className: '', 
    schedule: defaults.teachingDays,
    studentName: '', 
    studentNis: '',
    studentNisn: '',
    assignmentTitle: '',
    assignmentDesc: '',
    assignmentDueDate: '',
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
          const firstClassId = assembledClasses[0].id;
          setActiveClassId(firstClassId);
          setView('Dashboard');
        }
        if (!adminSelectedClassId || !assembledClasses.find(c => c.id === adminSelectedClassId)) setAdminSelectedClassId(assembledClasses[0].id);
      } else {
        setActiveClassId(null);
        setAdminSelectedClassId(null);
      }
      
    } catch (err: any) {
      console.error('Fetch Failed:', err);
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
  
  const seedInitialData = useCallback(async () => {
    if (!supabase || !window.confirm('Yakin ingin mengisi database dengan data awal? Lakukan ini hanya jika database Anda kosong.')) return;

    setIsSyncing(true); showToast('Memulai proses seeding...', 'info');
    try {
        for (const initialClass of INITIAL_CLASSES) {
            const { data: newClass, error: classError } = await supabase.from('classes').insert({ name: initialClass.name, schedule: initialClass.schedule || defaults.teachingDays }).select('id').single();
            if (classError) throw classError;
            if (initialClass.students?.length) {
                const studentsToInsert = initialClass.students.map(s => ({ class_id: newClass.id, name: s.name, nis: s.nis, nisn: s.nisn }));
                const { error: studentError } = await supabase.from('students').insert(studentsToInsert);
                if (studentError) throw studentError;
            }
        }
        showToast('Seeding data awal berhasil!', 'success');
        await fetchFromCloud();
    } catch (err: any) {
      showToast(`Proses seeding gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [supabase, showToast, fetchFromCloud, defaults.teachingDays]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  
  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    const updated = { ...attendance, [studentId]: { ...attendance[studentId], [date]: status } };
    setAttendance(updated);
    if (!supabase) return;
    await supabase.from('attendance_records').upsert({ student_id: studentId, record_date: date, status }, { onConflict: 'student_id, record_date' });
  };
  
  const openModal = (type: 'class' | 'student' | 'assignment', item: ClassData | Student | Assignment | null = null) => {
    setEditingItem(item);
    if (item) {
      if (type === 'class') {
        const c = item as ClassData;
        setAdminFormData(f => ({ ...f, className: c.name, schedule: c.schedule || defaults.teachingDays }));
      } else if (type === 'student') {
        const s = item as Student;
        setAdminFormData(f => ({ ...f, studentName: s.name, studentNis: s.nis, studentNisn: s.nisn }));
      } else if (type === 'assignment') {
        const a = item as Assignment;
        setAdminFormData(f => ({ ...f, assignmentTitle: a.title, assignmentDesc: a.description, assignmentDueDate: a.dueDate }));
      }
    } else {
      setAdminFormData({ className: '', schedule: defaults.teachingDays, studentName: '', studentNis: '', studentNisn: '', assignmentTitle: '', assignmentDesc: '', assignmentDueDate: '' });
    }
    setShowModal(type);
  };

  const handleSave = async () => {
    if (!supabase) return showToast('Database tidak terhubung.', 'error');
    
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
        const payload = { title: adminFormData.assignmentTitle, description: adminFormData.assignmentDesc, due_date: adminFormData.assignmentDueDate, class_id: adminSelectedClassId };
        ({ error } = editingItem ? await supabase.from('assignments').update(payload).eq('id', editingItem.id) : await supabase.from('assignments').insert(payload));
      }
      
      if (error) throw error;
      showToast(`Data ${showModal} berhasil disimpan!`, 'success');
      setShowModal(null);
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menyimpan: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (type: 'class' | 'student' | 'assignment', id: string) => {
    if (!supabase || !window.confirm(`Apakah Anda yakin ingin menghapus ${type} ini? Tindakan ini tidak dapat dibatalkan.`)) return;
    
    setIsSyncing(true);
    try {
      const fromTable = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(fromTable).delete().eq('id', id);
      if (error) throw error;
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} berhasil dihapus.`, 'success');
      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menghapus: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const selectedIds = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (selectedIds.length === 0 || !supabase) return;

    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} item terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;

    setIsSyncing(true);
    try {
      const fromTable = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(fromTable).delete().in('id', selectedIds);
      if (error) throw error;
      
      showToast(`${selectedIds.length} item berhasil dihapus.`, 'success');
      if (type === 'class') setSelectedClassIds([]);
      if (type === 'student') setSelectedStudentIds([]);
      if (type === 'assignment') setSelectedAssignmentIds([]);

      await fetchFromCloud();
    } catch (err: any) {
      showToast(`Gagal menghapus: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleFileParse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: any[] = XLSX.utils.sheet_to_json(worksheet);
            
            const students: ParsedStudent[] = json.map(row => ({
                name: String(row.nama || '').trim(),
                nis: String(row.nis || '').trim(),
                nisn: String(row.nisn || '').trim(),
            })).filter(s => s.name); 
            if(students.length === 0){
                showToast('File tidak mengandung data siswa atau format kolom salah. Gunakan kolom: nama, nis, nisn.', 'error');
                return;
            }
            setParsedStudents(students);
        } catch (error) {
            showToast('Gagal memproses file. Pastikan format file benar.', 'error');
            console.error(error);
        }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkSave = async () => {
    if (!supabase || !adminSelectedClassId || parsedStudents.length === 0) {
        showToast('Tidak ada data siswa untuk diunggah atau kelas belum dipilih.', 'error');
        return;
    }
    setIsSyncing(true);
    try {
        const studentsToInsert = parsedStudents.map(s => ({ ...s, class_id: adminSelectedClassId }));
        const { error } = await supabase.from('students').insert(studentsToInsert);
        if (error) throw error;

        showToast(`${parsedStudents.length} siswa berhasil diunggah!`, 'success');
        await fetchFromCloud();
        setShowBulkUploadModal(false);
        setParsedStudents([]);
        setUploadFileName('');
        if(fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
        showToast(`Gagal mengunggah massal: ${err.message}`, 'error');
    } finally {
        setIsSyncing(false);
    }
  };

  const downloadTemplate = () => {
    const headers = "nama,nis,nisn";
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "template_unggah_siswa.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const weeklyDates = useMemo(() => getWeekDates(currentDate, activeClass?.schedule), [currentDate, activeClass]);
  const monthlyDates = useMemo(() => getMonthDates(activeMonth, activeClass?.schedule), [activeMonth, activeClass]);
  const semesterDates = useMemo(() => getSemesterDates(activeClass?.schedule), [activeClass]);

  const handleExportAttendanceToExcel = useCallback(() => {
    if (!activeClass) return;

    const dates = reportTab === 'Daily' ? [currentDate] :
                  reportTab === 'Weekly' ? weeklyDates :
                  reportTab === 'Monthly' ? monthlyDates :
                  semesterDates;
                  
    const dateHeaders = dates.map(d => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    });

    const headers = ["No", "Nama Siswa", ...dateHeaders, "H", "S", "I", "A"];
    
    const data = activeClass.students.map((student, index) => {
      const totals = { 'H': 0, 'S': 0, 'I': 0, 'A': 0 };
      const statusRow = dates.map(d => {
        const status = attendance[student.id]?.[formatDate(d)] || 'H';
        totals[status]++;
        return status;
      });
      return [index + 1, student.name, ...statusRow, totals.H, totals.S, totals.I, totals.A];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Presensi");
    
    const formatDateForFilename = (d: Date) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    const reportTypeName = reportTab === 'Daily' ? `Harian_${formatDateForFilename(currentDate)}` :
                           reportTab === 'Weekly' ? `Mingguan_${formatDateForFilename(weeklyDates[0])}` :
                           reportTab === 'Monthly' ? `Bulanan_${MONTHS_2026[activeMonth].name}` : 'Semester';
    
    const fileName = `Laporan_Presensi_${activeClass.name.replace(/ /g, '_')}_${reportTypeName}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('Laporan berhasil disimpan dan diunduh!');
  }, [activeClass, attendance, reportTab, currentDate, weeklyDates, monthlyDates, semesterDates, activeMonth, showToast]);

  const handleExportTasksToExcel = useCallback(() => {
    if (!activeClass || !activeClass.assignments || activeClass.assignments.length === 0) return;

    const assignments = activeClass.assignments;
    const headers = ["No", "Nama Siswa", ...assignments.map(a => a.title)];
    
    const data = activeClass.students.map((student, index) => {
      const scores = assignments.map(a => a.submissions[student.id]?.score || '-');
      return [index + 1, student.name, ...scores];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Nilas Tugas");
    
    const fileName = `Rekap_Tugas_${activeClass.name.replace(/ /g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('Rekap tugas berhasil disimpan!');
  }, [activeClass, showToast]);
  
  const AdminView = () => {
    const adminSelectedClass = useMemo(() => classes.find(c => c.id === adminSelectedClassId), [classes, adminSelectedClassId]);
    
    const handleSelectAll = (type: 'class' | 'student' | 'assignment') => {
        if (type === 'class') {
            if (selectedClassIds.length === classes.length) setSelectedClassIds([]);
            else setSelectedClassIds(classes.map(c => c.id));
        } else if (type === 'student') {
            if (!adminSelectedClass) return;
            if (selectedStudentIds.length === adminSelectedClass.students.length) setSelectedStudentIds([]);
            else setSelectedStudentIds(adminSelectedClass.students.map(s => s.id));
        } else if (type === 'assignment') {
            if (!adminSelectedClass?.assignments) return;
            if (selectedAssignmentIds.length === adminSelectedClass.assignments.length) setSelectedAssignmentIds([]);
            else setSelectedAssignmentIds(adminSelectedClass.assignments.map(a => a.id));
        }
    };

    const handleSelectOne = (type: 'class' | 'student' | 'assignment', id: string) => {
        const updater = (prev: string[]) => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
        if (type === 'class') setSelectedClassIds(updater);
        else if (type === 'student') setSelectedStudentIds(updater);
        else if (type === 'assignment') setSelectedAssignmentIds(updater);
    };

    return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Manajemen & Pengaturan</h2>
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
                <button key={tab} onClick={() => setAdminTab(tab)} className={`px-4 py-2 font-semibold text-sm ${adminTab === tab ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    {tab}
                </button>
            ))}
        </div>
        
        {adminTab === 'Kelas' && (
            <div>
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Daftar Kelas</h3>
                    <div className="flex items-center gap-2">
                        {selectedClassIds.length > 0 && ( <button onClick={() => handleBulkDelete('class')} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500">Hapus Terpilih ({selectedClassIds.length})</button> )}
                        <button onClick={() => openModal('class')} className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">Tambah Kelas</button>
                    </div>
                </div>
                <div className="content-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                     <table className="min-w-full">
                        <thead className="border-b border-slate-200 dark:border-slate-700">
                           <tr>
                                <th className="py-2 px-3 w-10">
                                    <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent"
                                        checked={selectedClassIds.length === classes.length && classes.length > 0}
                                        ref={el => { if (el) el.indeterminate = selectedClassIds.length > 0 && selectedClassIds.length < classes.length }}
                                        onChange={() => handleSelectAll('class')}
                                    />
                                </th>
                                <th className="py-2 pr-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Nama Kelas</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Jadwal (Hari)</th>
                                <th className="py-2 pl-4 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">Aksi</th>
                           </tr>
                        </thead>
                        <tbody>
                            {classes.map(c => (
                            <tr key={c.id} className="border-t border-slate-100 dark:border-slate-900">
                                <td className="py-3 px-3">
                                    <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent" checked={selectedClassIds.includes(c.id)} onChange={() => handleSelectOne('class', c.id)} />
                                </td>
                                <td className="py-3 pr-4 text-slate-800 dark:text-slate-200 font-medium">{c.name}</td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{c.schedule?.map(d => DAY_NAMES[d].slice(0,3)).join(', ') || 'N/A'}</td>
                                <td className="py-3 pl-4 text-right space-x-2">
                                    <button onClick={() => openModal('class', c)} className="px-3 py-1 text-xs rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600">Edit</button>
                                    <button onClick={() => handleDelete('class', c.id)} className="px-3 py-1 text-xs rounded-md bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-700">Hapus</button>
                                </td>
                            </tr>
                            ))}
                        </tbody>
                     </table>
                </div>
            </div>
        )}

        {adminTab === 'Siswa' && (
            <div>
                 <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
                     <div className="flex-1 min-w-[200px]">
                        <label htmlFor="class-selector" className="text-sm font-medium text-slate-600 dark:text-slate-400 block mb-1">Pilih Kelas</label>
                        <select id="class-selector" value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                            <option value="" disabled>-- Pilih Kelas --</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="self-end flex gap-2">
                        {selectedStudentIds.length > 0 && (<button onClick={() => handleBulkDelete('student')} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500">Hapus Terpilih ({selectedStudentIds.length})</button> )}
                       <button onClick={() => openModal('student')} disabled={!adminSelectedClassId} className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                          Tambah Siswa
                        </button>
                        <button onClick={() => setShowBulkUploadModal(true)} disabled={!adminSelectedClassId} className="flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50">
                          Unggah Massal
                        </button>
                    </div>
                </div>
                <div className="content-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <table className="min-w-full">
                        <thead className="border-b border-slate-200 dark:border-slate-700"><tr>
                            <th className="py-2 px-3 w-10">
                                <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent" disabled={!adminSelectedClass || adminSelectedClass.students.length === 0}
                                    checked={adminSelectedClass ? selectedStudentIds.length === adminSelectedClass.students.length && adminSelectedClass.students.length > 0 : false}
                                    ref={el => { if (el && adminSelectedClass) el.indeterminate = selectedStudentIds.length > 0 && selectedStudentIds.length < adminSelectedClass.students.length }}
                                    onChange={() => handleSelectAll('student')} />
                            </th>
                            <th className="py-2 pr-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Nama Siswa</th><th className="py-2 px-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">NIS</th><th className="py-2 pl-4 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">Aksi</th></tr></thead>
                        <tbody>
                            {adminSelectedClass?.students.map(s => (
                            <tr key={s.id} className="border-t border-slate-100 dark:border-slate-900">
                                <td className="py-3 px-3">
                                    <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent" checked={selectedStudentIds.includes(s.id)} onChange={() => handleSelectOne('student', s.id)} />
                                </td>
                                <td className="py-3 pr-4 text-slate-800 dark:text-slate-200 font-medium">{s.name}</td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{s.nis}</td>
                                <td className="py-3 pl-4 text-right space-x-2">
                                    <button onClick={() => openModal('student', s)} className="px-3 py-1 text-xs rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600">Edit</button>
                                    <button onClick={() => handleDelete('student', s.id)} className="px-3 py-1 text-xs rounded-md bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-700">Hapus</button>
                                </td>
                            </tr>))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {adminTab === 'Tugas' && (
            <div>
                 <div className="flex justify-between items-center mb-4 gap-4">
                     <div className="flex-1">
                        <label htmlFor="class-selector-tugas" className="text-sm font-medium text-slate-600 dark:text-slate-400 block mb-1">Pilih Kelas</label>
                        <select id="class-selector-tugas" value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                            <option value="" disabled>-- Pilih Kelas --</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="self-end flex items-center gap-2">
                       {selectedAssignmentIds.length > 0 && (<button onClick={() => handleBulkDelete('assignment')} className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500">Hapus Terpilih ({selectedAssignmentIds.length})</button> )}
                       <button onClick={() => openModal('assignment')} disabled={!adminSelectedClassId} className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                          Tambah Tugas
                        </button>
                    </div>
                </div>
                <div className="content-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <table className="min-w-full">
                        <thead className="border-b border-slate-200 dark:border-slate-700"><tr>
                            <th className="py-2 px-3 w-10">
                                <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent" disabled={!adminSelectedClass || !adminSelectedClass.assignments || adminSelectedClass.assignments.length === 0}
                                    checked={adminSelectedClass?.assignments ? selectedAssignmentIds.length === adminSelectedClass.assignments.length && adminSelectedClass.assignments.length > 0 : false}
                                    ref={el => { if (el && adminSelectedClass?.assignments) el.indeterminate = selectedAssignmentIds.length > 0 && selectedAssignmentIds.length < adminSelectedClass.assignments.length }}
                                    onChange={() => handleSelectAll('assignment')} />
                            </th>
                            <th className="py-2 pr-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Judul Tugas</th><th className="py-2 px-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Batas Waktu</th><th className="py-2 pl-4 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">Aksi</th></tr></thead>
                        <tbody>
                            {adminSelectedClass?.assignments?.map(a => (
                            <tr key={a.id} className="border-t border-slate-100 dark:border-slate-900">
                                <td className="py-3 px-3">
                                    <input type="checkbox" className="rounded border-slate-400 dark:border-slate-600 bg-transparent" checked={selectedAssignmentIds.includes(a.id)} onChange={() => handleSelectOne('assignment', a.id)} />
                                </td>
                                <td className="py-3 pr-4 text-slate-800 dark:text-slate-200 font-medium">{a.title}</td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{new Date(a.dueDate).toLocaleDateString('id-ID')}</td>
                                <td className="py-3 pl-4 text-right space-x-2">
                                    <button onClick={() => openModal('assignment', a)} className="px-3 py-1 text-xs rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600">Edit</button>
                                    <button onClick={() => handleDelete('assignment', a.id)} className="px-3 py-1 text-xs rounded-md bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-700">Hapus</button>
                                </td>
                            </tr>))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {adminTab === 'Database' && (
             <div className="space-y-6">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">Status Koneksi Database</h3>
                    <div className={`p-4 rounded-lg border ${supabase ? 'bg-emerald-50 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-500/30' : 'bg-rose-50 dark:bg-rose-900/50 border-rose-200 dark:border-rose-500/30'}`}>
                    {supabase ? (
                        <div className="flex items-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><div><p className="font-semibold text-emerald-800 dark:text-emerald-300">Terhubung ke Supabase Cloud</p><p className="text-sm text-slate-600 dark:text-slate-400">Aplikasi berhasil terhubung ke database.</p></div></div>
                    ) : (
                        <div className="flex items-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><div><p className="font-semibold text-rose-800 dark:text-rose-300">Konfigurasi Database Belum Lengkap</p><p className="text-sm text-slate-600 dark:text-slate-400">Aplikasi berjalan dalam mode lokal (tanpa database).</p></div></div>
                    )}
                    </div>
                </div>
                {supabase && classes.length === 0 && !isLoading && (
                    <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">Isi Data Awal</h3>
                    <div className="p-4 rounded-lg border bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><p className="text-slate-600 dark:text-slate-300 mb-4">Database Anda kosong. Klik untuk mengisi data awal.</p>
                        <button onClick={seedInitialData} disabled={isSyncing} className="w-full justify-center flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                        {isSyncing ? (<svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A8 8 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm6-10a1 1 0 011-1h2a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" /><path d="M4 5a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2-2V5z" /></svg>)}
                        {isSyncing ? 'Memproses...' : 'Isi Database Dengan Data Awal'}
                        </button>
                    </div></div>
                )}
            </div>
        )}
    </div>
    )
  }

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
    }

    return (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto view-transition">
            <div className="mb-6 flex items-center justify-between mobile-stack gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Kelas: {activeClass.name}</h2>
                    <p className="text-slate-500 dark:text-slate-400">Kelola presensi dan tugas harian di satu tempat.</p>
                </div>
                <button onClick={handleManualSave} disabled={isSyncing} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50">
                    {isSyncing ? (
                         <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A8 8 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    )}
                    Simpan Perubahan
                </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                <div className="lg:w-1/2 w-full flex flex-col gap-4">
                    <div className="flex items-center justify-between mobile-stack gap-4">
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex-1">
                            <h3 className="text-md font-bold text-slate-900 dark:text-white">Presensi Harian</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200">Hari Ini</button>
                            <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
                        {activeClass.students.map((student, idx) => {
                            const status = attendance[student.id]?.[dateStr] || 'H';
                            return (
                                <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg flex items-center justify-between flex-wrap gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-[150px]">
                                        <span className="text-slate-500 dark:text-slate-400 w-6 text-center text-sm">{idx + 1}.</span>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate text-sm">{student.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => (<button key={s} onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)} disabled={isFutureDate(currentDate)} className={`h-8 w-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${status === s ? DARK_STATUS_COLORS[s] : 'bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'} ${isFutureDate(currentDate) ? 'opacity-50 cursor-not-allowed' : ''}`}>{s}</button>))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="lg:w-1/2 w-full flex flex-col gap-4">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-md font-bold text-slate-900 dark:text-white">Manajemen Tugas</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Status pengumpulan tugas kelas</p>
                    </div>
                     <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
                        {activeClass.assignments && activeClass.assignments.length > 0 ? (
                            activeClass.assignments.map(a => (
                                <div key={a.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                                    <div className="border-b border-slate-200 dark:border-slate-700 pb-3 mb-3">
                                        <h4 className="font-bold text-slate-900 dark:text-white">{a.title}</h4>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Tenggat: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full">
                                            <thead><tr><th className="py-1 pr-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 w-8">No</th><th className="py-1 px-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Nama</th><th className="py-1 px-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Status</th><th className="py-1 pl-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Nilai</th></tr></thead>
                                            <tbody>
                                                {activeClass.students.map((s, idx) => {
                                                    const sub = a.submissions[s.id]; const isSub = sub?.isSubmitted || false;
                                                    return (
                                                      <tr key={s.id} className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                                        <td className="py-1.5 pr-2 text-slate-500 dark:text-slate-400 text-xs">{idx + 1}.</td>
                                                        <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200 font-medium text-xs truncate max-w-[100px]">{s.name}</td>
                                                        <td className="py-1.5 px-2 text-center">
                                                            <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-5 h-5 mx-auto flex items-center justify-center rounded transition-colors ${isSub ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-transparent border border-slate-300 dark:border-slate-500'}`}>
                                                                {isSub && (<svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)}
                                                            </button>
                                                        </td>
                                                        <td className="py-1 pl-2 text-center">
                                                            <input type="text" defaultValue={sub?.score || ''} onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} disabled={!isSub} placeholder={isSub ? '...' : '–'} className="w-12 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs text-center disabled:opacity-50"/>
                                                        </td>
                                                      </tr>)
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        ) : (<div className="text-center text-slate-500 py-10"><p>Belum ada tugas untuk kelas ini.</p></div>)}
                    </div>
                </div>
            </div>
        </div>
    )
  }
  
  const ReportsView = () => {
    if (!activeClass) return <div className="p-6 text-slate-500 dark:text-slate-400">Pilih kelas untuk melihat laporan.</div>;
    
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
          const status = attendance[s.id]?.[formatDate(d)];
          if (status) classTotals[s.id][status]++; else classTotals[s.id]['H']++;
          classTotals[s.id]['T']++;
        });
      });
      return classTotals;
    }, [activeClass.students, dates, attendance]);

    const reportTitle = useMemo(() => {
        if (reportTab === 'Daily') return `HARIAN: ${currentDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}`;
        if (reportTab === 'Weekly') return `MINGGUAN (MULAI ${weeklyDates[0]?.toLocaleDateString('id-ID') || ''})`;
        if (reportTab === 'Monthly') return `BULANAN: ${MONTHS_2026[activeMonth].name}`;
        return `SEMESTER`;
    }, [reportTab, currentDate, weeklyDates, activeMonth]);

    return (
      <div className="flex-1 p-4 sm:p-6 flex flex-col overflow-hidden view-transition print:block print:overflow-visible">
        <div className="flex items-center justify-between mb-6 mobile-stack gap-4 print-hide">
          <div><h2 className="text-2xl font-bold text-slate-900 dark:text-white">Laporan Kehadiran</h2><p className="text-slate-500 dark:text-slate-400">Rekapitulasi Presensi {activeClass.name}</p></div>
          <div className="flex gap-2">
            <button onClick={handleExportAttendanceToExcel} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 hover:-translate-y-0.5 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6 11a1 1 0 011-1h2V6a1 1 0 112 0v4h2a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                Simpan Laporan
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-200 dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h6a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7V9h6v3z" clipRule="evenodd" /></svg>
                Cetak
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 mb-4 print-hide">
          <div className="flex">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (<button key={tab} onClick={() => setReportTab(tab)} className={`px-4 py-2 font-semibold text-sm ${reportTab === tab ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 dark:text-slate-400'}`}>{tab.replace('Daily', 'Harian').replace('Weekly', 'Mingguan').replace('Monthly', 'Bulanan')}</button>))}
          </div>
          {reportTab === 'Daily' && (
            <div className="flex items-center gap-2">
                <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200">Hari Ini</button>
                <button onClick={() => setCurrentDate(d => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
            </div>
          )}
          {reportTab === 'Weekly' && (<div className="flex items-center gap-2"><button onClick={() => setCurrentDate(d => new Date(d.setDate(d.getDate() - 7)))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg></button><span className="text-sm text-slate-500 dark:text-slate-400">Navigasi Minggu</span><button onClick={() => setCurrentDate(d => new Date(d.setDate(d.getDate() + 7)))} className="p-2 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button></div>)}
          {reportTab === 'Monthly' && (<select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200">{MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}</select>)}
        </div>

        <div className="hidden print-header">
          <h2>{school.name}</h2>
          <h3>LAPORAN PRESENSI KELAS: {activeClass.name}</h3>
          <p>REKAPAN {reportTitle}</p>
        </div>

        <div className="overflow-auto flex-1 print:overflow-visible print:block">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 print:static">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-10">No</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase" style={{minWidth: '200px'}}>Nama Siswa</th>
                {dates.map(d => (<th key={d.toISOString()} className="px-2 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase"><div>{DAY_NAMES[d.getDay()].substring(0,3)}</div><div>{d.getDate()}</div></th>))}
                {(['H', 'S', 'I', 'A'] as const).map(s => <th key={s} className="px-2 py-3 text-center text-xs font-bold uppercase w-12 text-slate-600 dark:text-slate-300">{s}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeClass.students.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors print:break-inside-avoid"><td className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{idx + 1}</td><td className="px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</td>
                  {dates.map(d => { const dateStr = formatDate(d); const status = attendance[s.id]?.[dateStr] || 'H'; return (<td key={dateStr} className={`px-2 py-2 text-center text-sm font-semibold ${status === 'H' ? 'text-emerald-700 dark:text-emerald-400' : status === 'S' ? 'text-blue-700 dark:text-blue-400' : status === 'I' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>{status}</td>) })}
                  {(['H', 'S', 'I', 'A'] as const).map(st => <td key={st} className="px-2 py-2 text-center text-sm font-bold text-slate-700 dark:text-slate-300">{totals[s.id][st]}</td>)}
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const TaskReportView = () => {
    if (!activeClass) return <div className="p-6 text-slate-500 dark:text-slate-400">Pilih kelas untuk melihat rekap tugas.</div>;
    
    const assignments = activeClass.assignments || [];

    return (
      <div className="flex-1 p-4 sm:p-6 flex flex-col overflow-hidden view-transition print:block print:overflow-visible">
        <div className="flex items-center justify-between mb-6 mobile-stack gap-4 print-hide">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Rekapitulasi Nilai Tugas</h2>
            <p className="text-slate-500 dark:text-slate-400">Laporan Nilai untuk Kelas {activeClass.name}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportTasksToExcel} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500 hover:-translate-y-0.5 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6 11a1 1 0 011-1h2V6a1 1 0 112 0v4h2a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                Simpan Rekap Nilai
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-200 dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h6a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7V9h6v3z" clipRule="evenodd" /></svg>
                Cetak
            </button>
          </div>
        </div>
        
        <div className="hidden print-header">
          <h2>{school.name}</h2>
          <h3>REKAPITULASI NILAI TUGAS KELAS: {activeClass.name}</h3>
          <p>PERIODE {school.periodName} {school.year}</p>
        </div>

        {assignments.length > 0 ? (
          <div className="overflow-auto flex-1 print:overflow-visible print:block">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 print:static">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-10">No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase" style={{minWidth: '200px'}}>Nama Siswa</th>
                  {assignments.map(a => (
                    <th key={a.id} className="px-2 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-24 truncate" title={a.title}>
                      {a.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeClass.students.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors print:break-inside-avoid">
                    <td className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</td>
                    {assignments.map(a => {
                      const score = a.submissions[s.id]?.score || '-';
                      return (
                        <td key={a.id} className="px-2 py-2 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {score}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-slate-500 py-10">
            <p>Belum ada tugas yang dibuat untuk kelas ini.</p>
          </div>
        )}
      </div>
    );
  }

  const ThemeToggle = ({ theme, toggleTheme }) => (
    <button onClick={toggleTheme} className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-md text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Toggle theme">
        {theme === 'light' ? ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" clipRule="evenodd" /></svg>)}
        <span>{theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}</span>
    </button>
  );

  const NotificationArea = () => (<div className="fixed bottom-4 right-4 z-50 space-y-2 print-hide">{notifications.map(n => (<div key={n.id} className={`px-4 py-2 rounded-md text-sm font-semibold text-white shadow-lg view-transition transform translate-y-0 opacity-100 ${n.type === 'success' ? 'bg-emerald-600' : n.type === 'error' ? 'bg-rose-600' : 'bg-blue-600'}`}>{n.message}</div>))}</div>)
  
  if (isLoading) return <div className="min-h-screen w-full flex items-center justify-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900">Memuat Aplikasi...</div>;
  if (!isAuthenticated) return <><LoginScreen onLoginSuccess={() => { setIsAuthenticated(true); setIsLoading(true); }} showToast={showToast} authConfig={auth} schoolConfig={school}/><NotificationArea /></>;

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex relative md:static print:block print:h-auto print:bg-white">
      {isSidebarOpen && (<div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-20 md:hidden print:hidden"></div>)}
      <nav className={`fixed inset-y-0 left-0 z-30 w-64 glass-panel flex-shrink-0 p-4 flex flex-col overflow-y-auto print-hide transform transition-transform md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex-shrink-0">
          <div className="flex justify-between items-center"><h2 className="text-xl font-bold px-2 text-slate-800 dark:text-slate-100">{school.name}</h2><button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <div className="pt-4"><h3 className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-2">Menu</h3>
              {MENU_ITEMS.map(({ view: v, label }) => (
              <button key={v} onClick={() => { setView(v); setIsSidebarOpen(false); }} className={`w-full text-left px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-3 nav-link ${view === v ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white active' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
                  {label}
              </button>
          ))}</div>
          <div className="pt-4 space-y-1"><h3 className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kelas</h3>{classes.map(c => (
            <div key={c.id}>
              <button onClick={() => setExpandedClassId(prevId => prevId === c.id ? null : c.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex justify-between items-center ${activeClassId === c.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
                <span className="truncate">{c.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${ expandedClassId === c.id ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              </button>
              {expandedClassId === c.id && (
                <div className="pl-4 pt-1 space-y-1">
                  <button onClick={() => { setActiveClassId(c.id); setView('Dashboard'); setIsSidebarOpen(false); }} className={`w-full text-left pl-8 pr-3 py-2 rounded-md text-sm font-medium truncate ${activeClassId === c.id && view === 'Dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>
                    Dashboard
                  </button>
                </div>
              )}
            </div>
            ))}<p className="px-3 text-sm text-slate-500">{classes.length === 0 && "Belum ada kelas."}</p></div>
        </div>
        <div className="mt-auto pt-4">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        </div>
      </nav>
      <main className="flex-1 flex flex-col overflow-hidden print:block print:overflow-visible print:static">
        <header className="md:hidden flex items-center justify-between p-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 print-hide sticky top-0 z-10"><button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 dark:text-slate-300"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button><h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{activeClass?.name || school.name}</h2><div className="w-8"></div></header>
        {view === 'Dashboard' && <DashboardView />}
        {view === 'Reports' && <ReportsView />}
        {view === 'TaskReports' && <TaskReportView />}
        {view === 'Admin' && <AdminView />}
      </main>
      <NotificationArea />
    </div>
  );
};

export default App;
