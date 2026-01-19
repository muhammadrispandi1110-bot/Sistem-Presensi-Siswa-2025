import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, HolidayRecord } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const STATUS_THEMES: Record<AttendanceStatus, { color: string, bg: string, border: string }> = {
  'H': { color: 'text-black', bg: 'bg-white', border: 'border-black' },
  'S': { color: 'text-black', bg: 'bg-white', border: 'border-black' },
  'I': { color: 'text-black', bg: 'bg-white', border: 'border-black' },
  'A': { color: 'text-black', bg: 'bg-white', border: 'border-black' }
};

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

const MENU_ITEMS: { view: ViewType; label: string; icon: string }[] = [
  { view: 'Dashboard', label: 'Dashboard', icon: '🏠' },
  { view: 'Reports', label: 'Laporan Presensi', icon: '📊' },
  { view: 'TaskReports', label: 'Rekap Tugas', icon: '📝' },
  { view: 'Admin', label: 'Admin Panel', icon: '⚙️' },
];

const Modal = ({ isOpen, onClose, title, children, footer = null, size = 'md' }: { isOpen: any; onClose: any; title: any; children?: any; footer?: any; size?: string; }) => {
  if (!isOpen) return null;
  const sizeClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 print-hide">
      <div className={`w-full ${sizeClass} bg-white flex flex-col view-transition border-4 border-black`}>
        <header className="flex items-center justify-between p-6 border-b-4 border-black">
          <h3 className="text-2xl font-black text-black uppercase tracking-tighter">{title}</h3>
          <button onClick={onClose} className="p-2 border-2 border-black text-black hover:bg-black hover:text-white transition-all font-black">X</button>
        </header>
        <main className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-black font-bold">{children}</main>
        {footer && (
          <footer className="flex justify-end p-6 bg-white border-t-4 border-black">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

// --- DASHBOARD VIEW ---

const DashboardView = ({ activeClass, currentDate, setCurrentDate, attendance, holidays, dateStr, school, isSyncing, savingItems, handleManualSave, handleAttendanceChange, handleHolidayToggle, handleSubmissionToggle, handleScoreChange, openAdminModal }: any) => {
  if (!activeClass) return <div className="p-20 text-center text-black font-black text-2xl uppercase">Memproses Data...</div>;
  const isHoliday = holidays.includes(dateStr);

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white">
        <div className="flex items-center justify-between mobile-stack gap-6 border-b-4 border-black pb-8">
            <div className="space-y-1">
                <h2 className="text-5xl font-black text-black tracking-tighter uppercase">{activeClass.name}</h2>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-black text-white text-xs font-black uppercase rounded tracking-widest">{school.name}</span>
                    <span className="text-black text-lg font-black uppercase underline decoration-4">🗓️ {DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</span>
                </div>
            </div>
            <button onClick={handleManualSave} disabled={isSyncing} className="bg-black text-white px-10 py-5 text-lg font-black hover:bg-white hover:text-black border-4 border-black transition-all flex items-center gap-4">
                {isSyncing ? 'SINKRONISASI...' : 'SIMPAN DATA SEKARANG'}
            </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
                { label: 'Siswa', val: activeClass.students.length, icon: '👥' },
                { label: 'Hadir', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'H' || !attendance[s.id]?.[dateStr]).length, icon: '✅' },
                { label: 'Sakit', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'S').length, icon: '🤒' },
                { label: 'Izin', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'I').length, icon: '✉️' },
                { label: 'Alpa', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'A').length, icon: '❌' },
            ].map(stat => (
                <div key={stat.label} className="bg-white p-6 border-4 border-black flex items-center gap-5">
                    <div className="w-14 h-14 bg-black text-white flex items-center justify-center text-2xl font-black">{stat.icon}</div>
                    <div>
                        <p className="text-xs font-black text-black uppercase tracking-widest leading-none">{stat.label}</p>
                        <p className="text-4xl font-black text-black leading-none mt-1">{stat.val}</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
            <div className="xl:col-span-2 space-y-8">
                <div className="flex items-center justify-between mobile-stack gap-4 bg-black text-white p-4">
                    <h3 className="text-xl font-black tracking-tight uppercase">Input Kehadiran Harian</h3>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleHolidayToggle(dateStr)} 
                        className={`px-4 py-2 text-xs font-black uppercase transition-all border-2 ${isHoliday ? 'bg-white text-black border-white' : 'bg-black text-white border-white hover:bg-white hover:text-black'}`}
                      >
                        {isHoliday ? '🏖️ HARI LIBUR' : '📅 SET LIBUR'}
                      </button>
                      <div className="flex items-center gap-2 bg-white text-black p-1 border-2 border-black">
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="px-2 font-black">←</button>
                          <input type="date" value={dateStr} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }} className="bg-transparent border-none text-xs font-black text-black w-28 text-center" />
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="px-2 font-black">→</button>
                      </div>
                    </div>
                </div>

                {isHoliday ? (
                  <div className="bg-white border-8 border-black border-double p-20 text-center space-y-6">
                    <div className="text-9xl">🏖️</div>
                    <h4 className="text-4xl font-black text-black uppercase tracking-tighter">HARI LIBUR TERDETEKSI</h4>
                    <p className="text-black font-black text-lg max-w-sm mx-auto">Sistem tidak menerima input presensi pada hari libur.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeClass.students.map((student: any, idx: number) => {
                        const status = attendance[student.id]?.[dateStr] || 'H';
                        const isSaving = savingItems.includes(`${student.id}-${dateStr}`);

                        return (
                            <div key={student.id} className="bg-white border-2 border-black p-5 flex items-center justify-between hover:bg-black/5 transition-all relative">
                                {isSaving && <div className="absolute top-2 right-2 w-2 h-2 bg-black rounded-full animate-ping"></div>}
                                <div className="flex items-center gap-4 truncate">
                                    <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-black text-sm">
                                        {idx + 1}
                                    </div>
                                    <div className="truncate">
                                        <p className="font-black text-black truncate uppercase text-sm leading-tight">{student.name}</p>
                                        <p className="text-[10px] font-black text-black opacity-60">NISN: {student.nisn || '-'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 bg-black p-1">
                                    {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => {
                                        const isActive = status === s;
                                        return (
                                            <button 
                                              key={s} 
                                              onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)} 
                                              className={`w-8 h-8 font-black text-xs transition-all border-2 ${isActive ? `bg-white text-black border-white` : 'bg-black text-white border-transparent hover:border-white'}`}
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
                )}
            </div>

            <div className="space-y-6">
                <h3 className="text-2xl font-black text-black uppercase border-b-4 border-black pb-2">Rekap Tugas Kelas</h3>
                <div className="space-y-6">
                    {activeClass.assignments?.map((a: any) => (
                        <div key={a.id} className="bg-white border-4 border-black p-6 space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex justify-between items-start border-b-2 border-black pb-2">
                                <div className="space-y-0.5">
                                    <h4 className="font-black text-black uppercase text-lg leading-tight">{a.title}</h4>
                                    <p className="text-xs font-black text-black opacity-60">TENGGAT: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                </div>
                                <button onClick={() => openAdminModal('assignment', a)} className="p-2 border-2 border-black text-black font-black text-xs hover:bg-black hover:text-white transition-all">⚙️</button>
                            </div>
                            <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                                {activeClass.students.map((s: any, idx: number) => {
                                    const sub = a.submissions[s.id];
                                    const isSub = sub?.isSubmitted || false;
                                    return (
                                        <div key={s.id} className="flex items-center justify-between border-b border-black/10 pb-2">
                                            <span className="text-xs font-black text-black truncate max-w-[150px] uppercase">{idx+1}. {s.name}</span>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                  type="text" 
                                                  defaultValue={sub?.score || ''} 
                                                  onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} 
                                                  className="w-12 bg-white border-2 border-black text-center font-black text-xs p-1 focus:bg-black focus:text-white" 
                                                  placeholder="0" 
                                                />
                                                <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-8 h-8 border-2 border-black flex items-center justify-center font-black ${isSub ? 'bg-black text-white' : 'bg-white text-black'}`}>
                                                  {isSub ? '✓' : ''}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};

// --- ADMIN VIEW ---

// Fixed: Removed undefined handleBulkDelete from props to fix "Cannot find name" error.
const AdminView = ({ classes, adminSelectedClassId, setAdminSelectedClassId, adminTab, setAdminTab, handleManualSave, handleSeedDatabase, handleExportData, handleImportData, openAdminModal, selectedClassIds, setSelectedClassIds, selectedStudentIds, setSelectedStudentIds, selectedAssignmentIds, setSelectedAssignmentIds, handleDeleteItem, isSyncing }: any) => {
  const adminSelectedClass = useMemo(() => classes.find((c:any) => c.id === adminSelectedClassId), [classes, adminSelectedClassId]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white">
      <div className="flex items-center justify-between border-b-4 border-black pb-8">
        <div>
          <h2 className="text-5xl font-black text-black uppercase tracking-tighter">ADMIN PANEL</h2>
          <p className="text-black font-extrabold text-sm uppercase opacity-70">Pengaturan Basis Data Cloud & Sekolah</p>
        </div>
        <button onClick={handleManualSave} disabled={isSyncing} className="bg-black text-white px-8 py-4 font-black hover:bg-white hover:text-black border-4 border-black transition-all">
          {isSyncing ? 'SINKRONISASI...' : 'REFRESH DATA CLOUD'}
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2">
          {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
              <button key={tab} onClick={() => setAdminTab(tab)} className={`px-10 py-4 text-sm font-black transition-all border-4 border-black uppercase ${adminTab === tab ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/5'}`}>
                  {tab}
              </button>
          ))}
      </div>

      <div className="bg-white border-4 border-black p-8">
          {adminTab === 'Kelas' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-black text-white p-4">
                <h3 className="text-xl font-black uppercase">Manajemen Kelas</h3>
                <div className="flex gap-2">
                  <button onClick={() => openAdminModal('class')} className="bg-white text-black px-6 py-2 text-xs font-black uppercase border-2 border-white hover:bg-black hover:text-white transition-all">+ KELAS BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full border-collapse">
                  <thead className="bg-white text-black"><tr>
                      <th className="p-4 text-center w-12 border-2 border-black font-black">#</th>
                      <th className="p-4 text-left border-2 border-black font-black uppercase text-xs tracking-widest">NAMA KELAS</th>
                      <th className="p-4 text-left border-2 border-black font-black uppercase text-xs tracking-widest">HARI MENGAJAR</th>
                      <th className="p-4 text-right border-2 border-black font-black uppercase text-xs tracking-widest">TINDAKAN</th>
                  </tr></thead>
                  <tbody>{classes.map((c:any) => (
                      <tr key={c.id} className="hover:bg-black/5 border-2 border-black">
                        <td className="p-4 text-center border-2 border-black"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => {}} className="w-6 h-6 accent-black" /></td>
                        <td className="p-4 font-black text-black border-2 border-black uppercase">{c.name}</td>
                        <td className="p-4 text-black font-black text-xs border-2 border-black uppercase">{c.schedule?.sort().map((d:number) => DAY_NAMES[d].substring(0, 3)).join(', ')}</td>
                        <td className="p-4 text-right space-x-4 border-2 border-black">
                          <button onClick={() => openAdminModal('class', c)} className="text-black font-black text-xs uppercase underline underline-offset-4">EDIT</button>
                          <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 font-black text-xs uppercase underline underline-offset-4">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}
          
          {adminTab === 'Siswa' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-black text-white p-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-xl font-black uppercase">Daftar Siswa</h3>
                  <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-white border-2 border-white text-black px-4 py-1 text-xs font-black outline-none uppercase">
                    {classes.map((c:any) => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
                  </select>
                </div>
                <button onClick={() => openAdminModal('student')} className="bg-white text-black px-6 py-2 text-xs font-black uppercase border-2 border-white hover:bg-black hover:text-white transition-all">+ TAMBAH SISWA</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full border-collapse">
                  <thead><tr className="bg-white text-black font-black">
                      <th className="p-4 border-2 border-black text-center w-12">#</th>
                      <th className="p-4 border-2 border-black text-left uppercase text-xs">NAMA LENGKAP PESERTA DIDIK</th>
                      <th className="p-4 border-2 border-black text-left uppercase text-xs">NISN / NIS</th>
                      <th className="p-4 border-2 border-black text-right uppercase text-xs">AKSI</th>
                  </tr></thead>
                  <tbody>{adminSelectedClass?.students.map((s:any, idx:number) => (
                      <tr key={s.id} className="hover:bg-black/5 border-2 border-black">
                        <td className="p-4 border-2 border-black text-center font-black">{idx + 1}</td>
                        <td className="p-4 border-2 border-black font-black text-black uppercase">{s.name}</td>
                        <td className="p-4 border-2 border-black text-black font-black text-xs uppercase">{s.nisn} / {s.nis}</td>
                        <td className="p-4 border-2 border-black text-right space-x-4">
                          <button onClick={() => openAdminModal('student', s)} className="text-black font-black text-xs uppercase underline">EDIT</button>
                          <button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 font-black text-xs uppercase underline">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}

          {adminTab === 'Database' && (
              <div className="py-10 text-center space-y-12">
                <div className="w-24 h-24 bg-black text-white flex items-center justify-center mx-auto text-4xl font-black border-8 border-double border-white shadow-[0_0_0_4px_black]">SQL</div>
                <div className="space-y-2">
                  <h3 className="text-4xl font-black text-black uppercase tracking-tighter">PENGELOLAAN DATA CLOUD</h3>
                  <p className="text-black font-black max-w-lg mx-auto text-sm opacity-60 uppercase">Pencadangan dan Pemulihan Sistem Presensi SMAN 11 Makassar</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto px-4">
                  <div className="bg-white p-8 border-4 border-black space-y-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-xs font-black text-black uppercase tracking-widest border-b-2 border-black pb-2">KONTROL DATABASE</p>
                    <div className="space-y-4">
                      <button onClick={handleManualSave} disabled={isSyncing} className="w-full bg-black text-white px-6 py-4 font-black hover:bg-white hover:text-black border-4 border-black transition-all uppercase text-sm">Refresh Koneksi Cloud</button>
                      <button onClick={handleSeedDatabase} disabled={isSyncing} className="w-full bg-white text-black border-4 border-black px-6 py-4 font-black hover:bg-black hover:text-white transition-all uppercase text-sm">Isi Data Bawaan Sistem</button>
                    </div>
                  </div>

                  <div className="bg-black p-8 border-4 border-black space-y-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,0.2)]">
                    <p className="text-xs font-black text-white uppercase tracking-widest border-b-2 border-white pb-2">BACKUP & RECOVERY</p>
                    <div className="space-y-4">
                      <button onClick={handleExportData} className="w-full bg-white text-black px-6 py-4 font-black hover:bg-black hover:text-white border-4 border-white transition-all uppercase text-sm">📥 Export Database Ke JSON</button>
                      <button onClick={() => fileInputRef.current?.click()} className="w-full bg-black text-white border-4 border-white px-6 py-4 font-black hover:bg-white hover:text-black transition-all uppercase text-sm">📤 Import Database Dari JSON</button>
                      <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportData(file); e.target.value = ''; }} accept=".json" className="hidden" />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t-4 border-black max-w-lg mx-auto">
                  <button onClick={() => window.confirm('Hapus seluruh data cloud?') && handleDeleteItem('all', '0')} className="bg-rose-600 text-white px-8 py-3 font-black uppercase text-xs hover:bg-rose-700 transition-all border-2 border-black">⚠️ KOSONGKAN DATABASE CLOUD</button>
                </div>
              </div>
          )}
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [savingItems, setSavingItems] = useState<string[]>([]);
  const [activeSemester, setActiveSemester] = useState<1 | 2>(1);

  const { database, school, defaults } = APP_CONFIG;
  const supabase = useMemo(() => database.url && database.anonKey ? createClient(database.url, database.anonKey) : null, [database.url, database.anonKey]);

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [holidays, setHolidays] = useState<HolidayRecord>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('Dashboard');
  const [reportTab, setReportTab] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Semester'>('Daily');
  const [adminTab, setAdminTab] = useState<'Kelas' | 'Siswa' | 'Tugas' | 'Database'>('Kelas');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date(defaults.startYear, defaults.startMonth, 1);
    d.setHours(0,0,0,0);
    return d;
  });
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

  const fetchFromCloud = useCallback(async (isSilent = false) => {
    if (!supabase) { 
      if (!isSilent) showToast("MODE OFFLINE: Data tersimpan di browser.", "info");
      setClasses(INITIAL_CLASSES); 
      setIsLoading(false); 
      return; 
    }
    if (!isSilent && classes.length === 0) setIsLoading(true);
    try {
      const { data: clData } = await supabase.from('classes').select('*').order('name');
      const { data: stData } = await supabase.from('students').select('*');
      const { data: asData } = await supabase.from('assignments').select('*').order('due_date');
      const { data: sbData } = await supabase.from('submissions').select('*');
      const { data: atData } = await supabase.from('attendance_records').select('*');
      const { data: hlData } = await supabase.from('holidays').select('holiday_date');

      const assembledClasses = (clData || []).map(c => {
        const classStudents = (stData || []).filter(s => s.class_id === c.id);
        const classAssignments = (asData || []).filter(a => a.class_id === c.id).map(a => {
            const assignmentSubmissions: { [studentId: string]: SubmissionData } = {};
            classStudents.forEach(student => {
              const submission = (sbData || []).find(s => s.student_id === student.id && s.assignment_id === a.id);
              assignmentSubmissions[student.id] = { isSubmitted: submission?.is_submitted || false, score: submission?.score || '' };
            });
            return { id: a.id, title: a.title, description: a.description, dueDate: a.due_date, submissions: assignmentSubmissions };
        });
        return { id: c.id, name: c.name, students: classStudents, assignments: classAssignments, schedule: c.schedule };
      });

      const reconstructedAttendance: AttendanceRecord = {};
      (atData || []).forEach(rec => {
        if (!reconstructedAttendance[rec.student_id]) reconstructedAttendance[rec.student_id] = {};
        reconstructedAttendance[rec.student_id][rec.record_date] = rec.status as AttendanceStatus;
      });

      setClasses(assembledClasses);
      setAttendance(reconstructedAttendance);
      setHolidays((hlData || []).map(h => h.holiday_date));

      if (assembledClasses.length > 0) {
        if (!activeClassId) setActiveClassId(assembledClasses[0].id);
        if (!adminSelectedClassId) setAdminSelectedClassId(assembledClasses[0].id);
      }
    } catch (err: any) {
      showToast('Gagal sinkronisasi data cloud.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId, adminSelectedClassId, classes.length, showToast]);

  useEffect(() => { if (isAuthenticated) fetchFromCloud(); else setIsLoading(false); }, [isAuthenticated, fetchFromCloud]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);

  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    if (holidays.includes(date)) return;
    setAttendance(prev => ({ ...prev, [studentId]: { ...prev[studentId], [date]: status } }));
    if (!supabase) return;
    try { await supabase.from('attendance_records').upsert({ student_id: studentId, record_date: date, status }, { onConflict: 'student_id, record_date' }); } catch (err) {}
  };

  const handleManualSave = async () => {
    if (!supabase) { showToast("Data tersimpan sementara.", "info"); return; }
    setIsSyncing(true);
    try {
      const payload: any[] = [];
      Object.keys(attendance).forEach(sId => { Object.keys(attendance[sId]).forEach(d => { payload.push({ student_id: sId, record_date: d, status: attendance[sId][d] }); }); });
      if (payload.length > 0) await supabase.from('attendance_records').upsert(payload, { onConflict: 'student_id, record_date' });
      await fetchFromCloud(true);
      showToast('DATABASE CLOUD BERHASIL DIPERBARUI.', 'success');
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, 'error');
    } finally { setIsSyncing(false); }
  };

  const handleExportData = async () => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      const { data: cl } = await supabase.from('classes').select('*');
      const { data: st } = await supabase.from('students').select('*');
      const { data: as } = await supabase.from('assignments').select('*');
      const { data: sb } = await supabase.from('submissions').select('*');
      const { data: at } = await supabase.from('attendance_records').select('*');
      const { data: hl } = await supabase.from('holidays').select('*');

      const fullBackup = { metadata: { exportDate: new Date().toISOString(), school: school.name }, data: { classes: cl || [], students: st || [], assignments: as || [], submissions: sb || [], attendance_records: at || [], holidays: hl || [] } };
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `backup_sman11_${formatDate(new Date())}.json`;
      link.click();
      showToast("DATA BACKUP BERHASIL DIUNDUH.", "success");
    } catch (err: any) { showToast(`Error: ${err.message}`, "error"); } finally { setIsSyncing(false); }
  };

  const handleImportData = async (file: File) => {
    if (!supabase) return;
    if (!window.confirm("Aksi ini akan menimpa data Cloud. Lanjutkan?")) return;
    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.data.classes.length > 0) await supabase.from('classes').upsert(json.data.classes);
        if (json.data.students.length > 0) await supabase.from('students').upsert(json.data.students);
        if (json.data.assignments.length > 0) await supabase.from('assignments').upsert(json.data.assignments);
        if (json.data.submissions.length > 0) await supabase.from('submissions').upsert(json.data.submissions);
        if (json.data.attendance_records.length > 0) await supabase.from('attendance_records').upsert(json.data.attendance_records);
        if (json.data.holidays.length > 0) await supabase.from('holidays').upsert(json.data.holidays);
        showToast("DATA BERHASIL DIPULIHKAN.", "success");
        await fetchFromCloud(true);
      } catch (err: any) { showToast(`Impor Gagal: ${err.message}`, "error"); } finally { setIsSyncing(false); }
    };
    reader.readAsText(file);
  };

  const handleSeedDatabase = async () => {
    if (!supabase) return;
    if (!window.confirm("Isi database cloud dengan daftar siswa awal?")) return;
    setIsSyncing(true);
    try {
      for (const cls of INITIAL_CLASSES) {
        const { data: cData } = await supabase.from('classes').upsert({ name: cls.name, schedule: cls.schedule || [1,2,3,4,5] }).select();
        const cId = cData?.[0].id;
        if (cId) {
          const studentPayload = cls.students.map(s => ({ class_id: cId, name: s.name, nis: s.nis, nisn: s.nisn }));
          await supabase.from('students').upsert(studentPayload);
        }
      }
      showToast("DATA AWAL TELAH DIMUAT KE CLOUD.", "success");
      await fetchFromCloud(true);
    } catch (err: any) { showToast(`Gagal: ${err.message}`, "error"); } finally { setIsSyncing(false); }
  };

  const handleHolidayToggle = async (date: string) => {
    const isNowHoliday = !holidays.includes(date);
    if (isNowHoliday) setHolidays(prev => [...prev, date]);
    else setHolidays(prev => prev.filter(d => d !== date));
    if (!supabase) return;
    try {
      if (isNowHoliday) await supabase.from('holidays').insert({ holiday_date: date });
      else await supabase.from('holidays').delete().eq('holiday_date', date);
      showToast(isNowHoliday ? 'HARI LIBUR DITANDAI.' : 'LIBUR DIBATALKAN.', 'info');
    } catch (err) { showToast('Gagal update hari libur.', 'error'); }
  };

  const openAdminModal = useCallback((type: 'class' | 'student' | 'assignment', item: any = null) => {
    setEditingItem(item);
    if (item) {
        if (type === 'class') setAdminFormData({ ...adminFormData, className: item.name, schedule: item.schedule || defaults.teachingDays });
        else if (type === 'student') setAdminFormData({ ...adminFormData, studentName: item.name, studentNis: item.nis, studentNisn: item.nisn });
        else if (type === 'assignment') setAdminFormData({ ...adminFormData, assignmentTitle: item.title, assignmentDesc: item.description, assignmentDueDate: item.dueDate });
    } else {
        setAdminFormData({ className: '', schedule: defaults.teachingDays, studentName: '', studentNis: '', studentNisn: '', assignmentTitle: '', assignmentDesc: '', assignmentDueDate: formatDate(new Date()) });
    }
    setShowModal(type);
  }, [adminFormData, defaults.teachingDays]);

  const handleAdminSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSyncing(true);
    try {
      if (showModal === 'class') {
        const payload = { name: adminFormData.className, schedule: adminFormData.schedule };
        editingItem ? await supabase.from('classes').update(payload).eq('id', editingItem.id) : await supabase.from('classes').insert(payload);
      } else if (showModal === 'student') {
        const payload = { name: adminFormData.studentName, nis: adminFormData.studentNis, nisn: adminFormData.studentNisn, class_id: adminSelectedClassId };
        editingItem ? await supabase.from('students').update(payload).eq('id', editingItem.id) : await supabase.from('students').insert(payload);
      } else if (showModal === 'assignment') {
        const payload = { title: adminFormData.assignmentTitle, description: adminFormData.assignmentDesc, due_date: adminFormData.assignmentDueDate, class_id: adminSelectedClassId || activeClassId };
        editingItem ? await supabase.from('assignments').update(payload).eq('id', editingItem.id) : await supabase.from('assignments').insert(payload);
      }
      showToast('DATA BERHASIL DISIMPAN.', 'success');
      setShowModal(null); await fetchFromCloud(true); 
    } catch (err: any) { showToast(`Kesalahan: ${err.message}`, 'error'); } finally { setIsSyncing(false); }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment' | 'all', id: string) => {
    if (!supabase || !window.confirm(`Hapus data ini?`)) return;
    setIsSyncing(true);
    try {
      if (type === 'all') { await supabase.from('attendance_records').delete().neq('status', 'X'); showToast("DATABASE KOSONG.", "info"); } 
      else { const t = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments'; await supabase.from(t).delete().eq('id', id); showToast('DATA TERHAPUS.', 'info'); }
      await fetchFromCloud(true);
    } catch (err: any) { showToast(`Gagal: ${err.message}`, 'error'); } finally { setIsSyncing(false); }
  };

  const handleSubmissionToggle = async (assignmentId: string, studentId: string, isSubmitted: boolean) => {
      if(!supabase) return;
      try { await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, is_submitted: isSubmitted }, { onConflict: 'assignment_id, student_id' }); } catch (err) {}
      await fetchFromCloud(true);
  };
  
  const handleScoreChange = async (assignmentId: string, studentId: string, score: string) => {
      if(!supabase) return;
      try { await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, score, is_submitted: true }, { onConflict: 'assignment_id, student_id' }); } catch (err) {}
      await fetchFromCloud(true);
  };

  // --- REPORT VIEWS ---
  const ReportsView = () => {
    if (!activeClass) return <div className="p-20 text-center text-black font-black uppercase text-2xl">Laporan Memuat...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    
    return (
      <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden bg-white print-scroll-reset">
        <div className="flex items-center justify-between mb-8 print-hide">
          <div className="space-y-1">
            <h2 className="text-5xl font-black text-black tracking-tighter uppercase">Laporan Presensi Siswa</h2>
            <p className="text-black font-black text-lg uppercase underline decoration-4 underline-offset-4">Kelas: {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-black text-white px-10 py-5 font-black border-4 border-black hover:bg-white hover:text-black transition-all">CETAK LAPORAN</button>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b-4 border-black mb-6 gap-4 print-hide">
          <div className="flex gap-4">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`pb-3 text-xs font-black transition-all relative ${reportTab === tab ? 'text-black font-black' : 'text-black/30 hover:text-black'}`}>
                    {tab === 'Daily' ? 'Harian' : tab === 'Weekly' ? 'Mingguan' : tab === 'Monthly' ? 'Bulanan' : 'Semester'}
                    {reportTab === tab && <div className="absolute bottom-[-4px] left-0 right-0 h-[4px] bg-black"></div>}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pb-3">
              {(reportTab === 'Daily' || reportTab === 'Weekly') && (
                  <div className="flex items-center gap-2 bg-white p-1 border-2 border-black">
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - (reportTab === 'Daily' ? 1 : 7)); setCurrentDate(d); }} className="px-2 font-black">←</button>
                      <span className="text-xs font-black uppercase tracking-widest">{formatDate(currentDate)}</span>
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + (reportTab === 'Daily' ? 1 : 7)); setCurrentDate(d); }} className="px-2 font-black">→</button>
                  </div>
              )}
              {reportTab === 'Monthly' && (
                  <select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-white border-2 border-black px-4 py-1.5 text-xs font-black outline-none uppercase">
                      {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name.toUpperCase()}</option>)}
                  </select>
              )}
          </div>
        </div>

        <div className="overflow-auto flex-1 border-4 border-black print-scroll-reset bg-white">
          <table className="min-w-full text-sm border-collapse">
            <thead className="text-black border-b-4 border-black font-black uppercase">
                <tr>
                    <th className="px-4 py-4 text-left border-2 border-black text-[10px]">No</th>
                    <th className="px-6 py-4 text-left border-2 border-black min-w-[200px] text-[10px]">Nama Peserta Didik</th>
                    {dates.map(d => (<th key={formatDate(d)} className="px-2 py-4 text-center border border-black/20 text-[10px]">{d.getDate()}</th>))}
                    <th className="px-3 py-4 text-center border-2 border-black text-[10px] bg-black/5">H</th>
                    <th className="px-3 py-4 text-center border-2 border-black text-[10px] bg-black/5">S</th>
                    <th className="px-3 py-4 text-center border-2 border-black text-[10px] bg-black/5">I</th>
                    <th className="px-3 py-4 text-center border-2 border-black text-[10px] bg-black/5">A</th>
                </tr>
            </thead>
            <tbody className="font-black">
                {activeClass.students.map((student, idx) => {
                  const rowAttendance = dates.map(d => attendance[student.id]?.[formatDate(d)] || 'H');
                  const stats = { H: rowAttendance.filter(s => s === 'H').length, S: rowAttendance.filter(s => s === 'S').length, I: rowAttendance.filter(s => s === 'I').length, A: rowAttendance.filter(s => s === 'A').length };
                  return (
                    <tr key={student.id} className="hover:bg-black/5 transition-colors border-b border-black">
                      <td className="px-4 py-3 text-left border-r-2 border-black">{idx + 1}</td>
                      <td className="px-6 py-3 border-r-2 border-black uppercase text-xs truncate max-w-[300px]">{student.name}</td>
                      {dates.map(d => {
                        const s = attendance[student.id]?.[formatDate(d)] || 'H';
                        return <td key={formatDate(d)} className="border-r border-black/10 text-center text-[10px]">{s}</td>;
                      })}
                      <td className="px-3 py-3 text-center border-l-2 border-black bg-black/5">{stats.H}</td>
                      <td className="px-3 py-3 text-center border-l border-black bg-black/5">{stats.S}</td>
                      <td className="px-3 py-3 text-center border-l border-black bg-black/5">{stats.I}</td>
                      <td className="px-3 py-3 text-center border-l border-black bg-black/5">{stats.A}</td>
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
    if (!activeClass) return null;
    return (
      <div className="flex-1 p-6 sm:p-10 overflow-y-auto space-y-8 bg-white">
        <div className="flex justify-between items-center border-b-4 border-black pb-8">
          <h2 className="text-5xl font-black text-black uppercase tracking-tighter">Rekap Nilai Tugas & Ujian</h2>
          <button onClick={() => window.print()} className="bg-black text-white px-10 py-5 font-black border-4 border-black hover:bg-white hover:text-black transition-all">CETAK REKAPITULASI</button>
        </div>
        <div className="bg-white border-4 border-black overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-black text-white border-b-4 border-black font-black uppercase">
              <tr>
                <th className="p-6 text-left w-12 border-2 border-white text-[10px]">No</th>
                <th className="p-6 text-left border-2 border-white text-[10px] tracking-widest">Nama Peserta Didik</th>
                {activeClass.assignments?.map(a => (
                  <th key={a.id} className="p-6 text-center border-2 border-white text-[10px] tracking-widest">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-black text-black">
              {activeClass.students.map((s, idx) => (
                <tr key={s.id} className="hover:bg-black/5 border-b-2 border-black">
                  <td className="p-6 border-r-2 border-black text-center">{idx + 1}</td>
                  <td className="p-6 border-r-2 border-black uppercase text-xs">{s.name}</td>
                  {activeClass.assignments?.map(a => (
                    <td key={a.id} className="p-6 text-center border-r-2 border-black">
                      {a.submissions[s.id]?.score || (a.submissions[s.id]?.isSubmitted ? '✓' : '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // --- RENDER ---

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <form onSubmit={(e: any) => {
          e.preventDefault();
          const target = e.target;
          if (target.username.value === APP_CONFIG.auth.username && target.password.value === APP_CONFIG.auth.password) { setIsAuthenticated(true); } else { showToast("AKSES DITOLAK: LOGIN SALAH!", "error"); }
        }} className="max-w-md w-full bg-white p-12 border-8 border-black shadow-[20px_20px_0px_0px_rgba(0,0,0,1)] space-y-10">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-black text-white rounded-none mx-auto flex items-center justify-center text-5xl font-black">S11</div>
            <h2 className="text-4xl font-black text-black uppercase tracking-tighter">Akses Guru</h2>
            <p className="text-black font-black text-sm uppercase opacity-60">SMAN 11 MAKASSAR</p>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
               <label className="text-xs font-black uppercase px-1">Username Pengguna</label>
               <input name="username" type="text" className="w-full bg-white border-4 border-black p-4 font-black outline-none focus:bg-black focus:text-white transition-all uppercase" required />
            </div>
            <div className="space-y-2">
               <label className="text-xs font-black uppercase px-1">Password Keamanan</label>
               <input name="password" type="password" className="w-full bg-white border-4 border-black p-4 font-black outline-none focus:bg-black focus:text-white transition-all" required />
            </div>
          </div>
          <button type="submit" className="w-full bg-black text-white py-6 font-black text-xl shadow-xl hover:bg-white hover:text-black border-4 border-black transition-all uppercase tracking-widest">Login Sistem</button>
        </form>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen bg-white flex flex-col items-center justify-center space-y-6">
    <div className="w-24 h-24 border-8 border-black border-t-transparent animate-spin"></div>
    <div className="text-black font-black tracking-widest text-2xl uppercase">Menghubungkan Cloud...</div>
  </div>;

  return (
    <div className={`min-h-screen flex bg-white font-sans text-black`}>
      <nav className="w-80 bg-white border-r-8 border-black p-8 flex flex-col gap-12 print-hide shrink-0">
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-black text-white flex items-center justify-center text-3xl font-black">11</div>
            <div>
              <h1 className="font-black text-lg text-black uppercase leading-none tracking-tighter">Presensi Digital</h1>
              <p className="text-[10px] font-black text-black opacity-60 uppercase tracking-widest mt-1">SMAN 11 MAKASSAR</p>
            </div>
          </div>
          <div className="pt-4 space-y-3">
             <label className="text-[10px] font-black text-black uppercase tracking-widest px-2 block underline decoration-2">Pilih Kelas Aktif</label>
             <select value={activeClassId || ''} onChange={e => setActiveClassId(e.target.value)} className="w-full bg-white border-4 border-black p-4 text-xs font-black outline-none hover:bg-black hover:text-white transition-all uppercase">
               {classes.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
             </select>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {MENU_ITEMS.map(item => (
            <button key={item.view} onClick={() => setView(item.view)} className={`w-full flex items-center gap-5 px-6 py-4 font-black text-sm transition-all border-4 ${view === item.view ? 'bg-black text-white border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]' : 'text-black border-transparent hover:border-black'}`}>
              <span className="text-2xl">{item.icon}</span> {item.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="pt-8 border-t-4 border-black">
          <button onClick={() => setIsAuthenticated(false)} className="w-full bg-white text-black font-black text-xs uppercase tracking-widest py-4 border-4 border-black hover:bg-black hover:text-white transition-all">Log Keluar</button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {view === 'Dashboard' && (
          <DashboardView activeClass={activeClass} currentDate={currentDate} setCurrentDate={setCurrentDate} attendance={attendance} holidays={holidays} dateStr={dateStr} school={school} isSyncing={isSyncing} savingItems={savingItems} handleManualSave={handleManualSave} handleAttendanceChange={handleAttendanceChange} handleHolidayToggle={handleHolidayToggle} handleSubmissionToggle={handleSubmissionToggle} handleScoreChange={handleScoreChange} openAdminModal={openAdminModal} />
        )}
        {view === 'Reports' && <ReportsView />}
        {view === 'TaskReports' && <TaskReportsView />}
        {view === 'Admin' && (
          <AdminView classes={classes} adminSelectedClassId={adminSelectedClassId} setAdminSelectedClassId={setAdminSelectedClassId} adminTab={adminTab} setAdminTab={setAdminTab} handleManualSave={handleManualSave} handleSeedDatabase={handleSeedDatabase} handleExportData={handleExportData} handleImportData={handleImportData} openAdminModal={openAdminModal} selectedClassIds={selectedClassIds} setSelectedClassIds={setSelectedClassIds} selectedStudentIds={selectedStudentIds} setSelectedStudentIds={setSelectedStudentIds} selectedAssignmentIds={selectedAssignmentIds} setSelectedAssignmentIds={setSelectedAssignmentIds} handleDeleteItem={handleDeleteItem} isSyncing={isSyncing} />
        )}
      </main>

      <Modal isOpen={!!showModal} onClose={() => setShowModal(null)} title={editingItem ? `Edit ${showModal}` : `Tambah ${showModal}`} footer={<button form="admin-form" type="submit" className="bg-black text-white px-12 py-5 font-black border-4 border-black hover:bg-white hover:text-black transition-all uppercase tracking-widest">Simpan Data</button>}>
        <form id="admin-form" onSubmit={handleAdminSave} className="space-y-6">
          {showModal === 'class' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase px-2 text-black">Nama Identitas Kelas</label>
                <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="MISAL: X.9" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase px-2 text-black underline decoration-2">Jadwal Mengajar (Hari)</label>
                <div className="flex flex-wrap gap-2 p-1">
                  {[1,2,3,4,5].map(d => (
                    <button key={d} type="button" onClick={() => { const newSched = adminFormData.schedule.includes(d) ? adminFormData.schedule.filter(s => s !== d) : [...adminFormData.schedule, d]; setAdminFormData({...adminFormData, schedule: newSched}); }} className={`w-12 h-12 font-black text-sm transition-all border-4 ${adminFormData.schedule.includes(d) ? 'bg-black text-white border-black' : 'bg-white text-black border-black/20 hover:border-black'}`}>{DAY_NAMES[d].substring(0, 1)}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {showModal === 'student' && (
            <div className="space-y-5">
               <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="NAMA LENGKAP SISWA" required />
               <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="NOMOR INDUK SISWA (NIS)" />
               <input value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="NOMOR INDUK SISWA NASIONAL (NISN)" />
            </div>
          )}
          {showModal === 'assignment' && (
            <div className="space-y-5">
               <input value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="JUDUL TUGAS" required />
               <textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none uppercase" placeholder="KETERANGAN TUGAS..." rows={3} />
               <div className="space-y-2">
                 <label className="text-xs font-black uppercase px-2">Tenggat Waktu</label>
                 <input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full bg-white border-4 border-black p-5 font-black outline-none" required />
               </div>
            </div>
          )}
        </form>
      </Modal>

      <div className="fixed bottom-10 right-10 z-[100] space-y-4 pointer-events-none">
        {notifications.map(n => <div key={n.id} className={`px-10 py-5 border-8 border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] flex items-center gap-6 animate-slide-up pointer-events-auto bg-white`}><span className="font-black text-sm uppercase tracking-widest text-black">{n.message}</span></div>)}
      </div>
    </div>
  );
};

export default App;