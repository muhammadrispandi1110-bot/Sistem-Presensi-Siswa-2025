
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, HolidayRecord } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

const STATUS_THEMES: Record<AttendanceStatus, { color: string, bg: string, border: string }> = {
  'H': { color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'S': { color: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200' },
  'I': { color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
  'A': { color: 'text-rose-800', bg: 'bg-rose-50', border: 'border-rose-200' }
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 print-hide backdrop-blur-sm">
      <div className={`w-full ${sizeClass} bg-white rounded-2xl shadow-2xl flex flex-col view-transition border-2 border-black`}>
        <header className="flex items-center justify-between p-6 border-b-2 border-black">
          <h3 className="text-xl font-extrabold text-black tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-black hover:bg-black hover:text-white transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <main className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-black font-medium">{children}</main>
        {footer && (
          <footer className="flex justify-end p-6 bg-slate-50 rounded-b-2xl border-t-2 border-black">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

// --- DASHBOARD VIEW ---

const DashboardView = ({ activeClass, currentDate, setCurrentDate, attendance, holidays, dateStr, school, isSyncing, savingItems, handleManualSave, handleAttendanceChange, handleHolidayToggle, handleSubmissionToggle, handleScoreChange, openAdminModal }: any) => {
  if (!activeClass) return <div className="p-20 text-center text-black font-black animate-pulse text-2xl">MENGAMBIL DATA...</div>;

  const isHoliday = holidays.includes(dateStr);

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white">
        <div className="flex items-center justify-between mobile-stack gap-6">
            <div className="space-y-1">
                <h2 className="text-4xl font-black text-black tracking-tighter">{activeClass.name}</h2>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-black text-white text-[10px] font-black uppercase rounded tracking-widest">{school.name}</span>
                    <span className="text-black text-sm font-bold">🗓️ {DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</span>
                </div>
            </div>
            <button onClick={handleManualSave} disabled={isSyncing} className="bg-black text-white px-8 py-4 rounded-xl text-sm font-black shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 border-2 border-black">
                <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {isSyncing ? 'MENYIMPAN...' : 'SIMPAN DATA'}
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
                <div key={stat.label} className="bg-white p-5 rounded-2xl border-2 border-black shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center text-xl font-bold">{stat.icon}</div>
                    <div>
                        <p className="text-[10px] font-black text-black uppercase tracking-widest">{stat.label}</p>
                        <p className="text-2xl font-black text-black leading-none mt-0.5">{stat.val}</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
            <div className="xl:col-span-2 space-y-6">
                <div className="flex items-center justify-between mobile-stack gap-4">
                    <h3 className="text-2xl font-black tracking-tight text-black uppercase">DAFTAR HADIR SISWA</h3>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleHolidayToggle(dateStr)} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border-2 ${isHoliday ? 'bg-black text-white border-black' : 'bg-white text-black border-black hover:bg-black hover:text-white'}`}
                      >
                        {isHoliday ? '🏖️ HARI LIBUR' : '📅 TANDAI LIBUR'}
                      </button>
                      <div className="flex items-center gap-2 bg-white p-1 rounded-lg border-2 border-black">
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-1.5 hover:bg-black hover:text-white rounded transition-all font-bold">←</button>
                          <input 
                            type="date" 
                            value={dateStr} 
                            onChange={(e) => {
                              const [y, m, d] = e.target.value.split('-').map(Number);
                              const newDate = new Date(y, m - 1, d);
                              newDate.setHours(0,0,0,0);
                              setCurrentDate(newDate);
                            }} 
                            className="bg-transparent border-none text-[11px] font-black text-black w-28 text-center" 
                          />
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-1.5 hover:bg-black hover:text-white rounded transition-all font-bold">→</button>
                      </div>
                    </div>
                </div>

                {isHoliday ? (
                  <div className="bg-white border-4 border-black border-dotted p-16 rounded-[40px] text-center space-y-4">
                    <div className="text-7xl animate-bounce">🏖️</div>
                    <h4 className="text-3xl font-black text-black uppercase">LIBUR NASIONAL / SEKOLAH</h4>
                    <p className="text-black font-bold max-w-sm mx-auto opacity-70">Tidak ada penginputan presensi di hari libur. Laporan semester akan otomatis menyesuaikan.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeClass.students.map((student: any, idx: number) => {
                        const status = attendance[student.id]?.[dateStr] || 'H';
                        const theme = STATUS_THEMES[status];
                        const isSaving = savingItems.includes(`${student.id}-${dateStr}`);

                        return (
                            <div key={student.id} className="bg-white border-2 border-black p-5 rounded-2xl flex items-center justify-between hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all group relative">
                                {isSaving && <div className="absolute top-2 right-2 w-2 h-2 bg-black rounded-full animate-ping"></div>}
                                <div className="flex items-center gap-4 truncate">
                                    <div className={`w-10 h-10 rounded-lg bg-black text-white flex items-center justify-center font-black text-xs`}>
                                        {idx + 1}
                                    </div>
                                    <div className="truncate">
                                        <p className="font-extrabold text-black truncate leading-tight uppercase text-sm">{student.name}</p>
                                        <p className="text-[9px] font-black text-black opacity-60 uppercase tracking-tighter">NISN: {student.nisn || '-'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 bg-black/5 p-1 rounded-lg ml-3">
                                    {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => {
                                        const isActive = status === s;
                                        return (
                                            <button 
                                              key={s} 
                                              onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)} 
                                              className={`status-btn w-8 h-8 rounded font-black text-xs transition-all border-2 ${isActive ? `bg-black text-white border-black` : 'bg-white text-black border-transparent hover:border-black'}`}
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
                <h3 className="text-2xl font-black tracking-tight text-black uppercase">TUGAS & NILAI</h3>
                <div className="space-y-5">
                    {activeClass.assignments?.map((a: any) => {
                        return (
                            <div key={a.id} className="bg-white border-2 border-black rounded-2xl p-6 shadow-sm space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-0.5">
                                        <h4 className="font-black text-black leading-tight text-lg uppercase">{a.title}</h4>
                                        <p className="text-[10px] font-black text-black opacity-60 uppercase tracking-widest">DEADLINE: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                    </div>
                                    <button onClick={() => openAdminModal('assignment', a)} className="p-2 text-black hover:bg-black hover:text-white rounded-lg transition-colors border border-black">⚙️</button>
                                </div>
                                <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                    {activeClass.students.map((s: any, idx: number) => {
                                        const sub = a.submissions[s.id];
                                        const isSub = sub?.isSubmitted || false;
                                        const itemKey = `score-${a.id}-${s.id}`;
                                        const isSaving = savingItems.includes(itemKey);

                                        return (
                                            <div key={s.id} className="flex items-center justify-between border-b border-black/5 pb-2">
                                                <div className="flex items-center gap-2 truncate">
                                                  <span className="text-[11px] font-black text-black truncate max-w-[130px]">{idx+1}. {s.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                      type="text" 
                                                      defaultValue={sub?.score || ''} 
                                                      onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} 
                                                      className="w-10 bg-white border-2 border-black text-center rounded p-1 text-[10px] font-black text-black focus:bg-black focus:text-white transition-all" 
                                                      placeholder="--" 
                                                    />
                                                    <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-7 h-7 rounded border-2 border-black flex items-center justify-center transition-all ${isSub ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/10'}`}>
                                                      {isSub ? '✓' : ''}
                                                    </button>
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

// --- ADMIN VIEW ---

const AdminView = ({ classes, adminSelectedClassId, setAdminSelectedClassId, adminTab, setAdminTab, handleManualSave, handleSeedDatabase, handleExportData, handleImportData, openAdminModal, selectedClassIds, setSelectedClassIds, selectedStudentIds, setSelectedStudentIds, selectedAssignmentIds, setSelectedAssignmentIds, handleDeleteItem, handleBulkDelete, isSyncing }: any) => {
  const adminSelectedClass = useMemo(() => classes.find((c:any) => c.id === adminSelectedClassId), [classes, adminSelectedClassId]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectAll = (type: 'class' | 'student' | 'assignment', list: any[]) => {
    const ids = list.map(item => item.id);
    if (type === 'class') setSelectedClassIds(selectedClassIds.length === ids.length ? [] : ids);
    else if (type === 'student') setSelectedStudentIds(selectedStudentIds.length === ids.length ? [] : ids);
    else if (type === 'assignment') setSelectedAssignmentIds(selectedAssignmentIds.length === ids.length ? [] : ids);
  };

  const toggleSelectOne = (type: 'class' | 'student' | 'assignment', id: string) => {
    if (type === 'class') setSelectedClassIds((prev:any) => prev.includes(id) ? prev.filter((i:any) => i !== id) : [...prev, id]);
    else if (type === 'student') setSelectedStudentIds((prev:any) => prev.includes(id) ? prev.filter((i:any) => i !== id) : [...prev, id]);
    else if (type === 'assignment') setSelectedAssignmentIds((prev:any) => prev.includes(id) ? prev.filter((i:any) => i !== id) : [...prev, id]);
  };

  const getDayLabels = (schedule: number[] = []) => {
    if (!schedule || schedule.length === 0) return '-';
    return schedule.sort().map(d => DAY_NAMES[d].substring(0, 1)).join(', ');
  };

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-black tracking-tighter uppercase">ADMIN PANEL</h2>
          <p className="text-black font-bold text-sm opacity-60">PENGELOLAAN DATABASE SISTEM</p>
        </div>
        <button onClick={handleManualSave} disabled={isSyncing} className="bg-white text-black border-2 border-black px-6 py-3 rounded-xl text-sm font-black hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {isSyncing ? 'SINKRON...' : 'REFRESH DATA'}
        </button>
      </div>
      
      <div className="flex gap-2 p-1.5 bg-black/5 rounded-xl w-fit border-2 border-black">
          {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
              <button key={tab} onClick={() => setAdminTab(tab)} className={`px-6 py-2.5 rounded-lg text-xs font-black transition-all ${adminTab === tab ? 'bg-black text-white' : 'text-black hover:bg-black/10'}`}>
                  {tab.toUpperCase()}
              </button>
          ))}
      </div>

      <div className="bg-white rounded-2xl border-2 border-black overflow-hidden p-8">
          {adminTab === 'Kelas' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-black uppercase">Daftar Kelas</h3>
                <div className="flex gap-2">
                  {selectedClassIds.length > 0 && <button onClick={() => handleBulkDelete('class')} className="bg-rose-600 text-white px-5 py-2 rounded-lg text-[10px] font-black uppercase">HAPUS ({selectedClassIds.length})</button>}
                  <button onClick={() => openAdminModal('class')} className="bg-black text-white px-6 py-3 rounded-lg text-[10px] font-black uppercase">+ KELAS BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full">
                  <thead className="text-black border-b-2 border-black"><tr>
                      <th className="pb-4 text-center w-12"><input type="checkbox" checked={selectedClassIds.length === classes.length && classes.length > 0} onChange={() => handleSelectAll('class', classes)} className="w-5 h-5 accent-black" /></th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">NAMA KELAS</th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">JADWAL</th>
                      <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">AKSI</th>
                  </tr></thead>
                  <tbody className="divide-y divide-black/10">{classes.map((c:any) => (
                      <tr key={c.id} className="hover:bg-black/5 transition-colors">
                        <td className="py-4 text-center"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleSelectOne('class', c.id)} className="w-5 h-5 accent-black" /></td>
                        <td className="py-4 font-black text-black">{c.name}</td>
                        <td className="py-4 text-black font-bold text-xs uppercase tracking-widest">{getDayLabels(c.schedule)}</td>
                        <td className="py-4 text-right space-x-4">
                          <button onClick={() => openAdminModal('class', c)} className="text-black font-black text-[10px] uppercase hover:underline">EDIT</button>
                          <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 font-black text-[10px] uppercase hover:underline">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}
          {adminTab === 'Siswa' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mobile-stack gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-black uppercase">Data Siswa</h3>
                  <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-white border-2 border-black rounded-lg px-3 py-1.5 text-xs font-black text-black outline-none">
                    {classes.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {selectedStudentIds.length > 0 && <button onClick={() => handleBulkDelete('student')} className="bg-rose-600 text-white px-5 py-2 rounded-lg text-[10px] font-black uppercase">HAPUS ({selectedStudentIds.length})</button>}
                  <button onClick={() => openAdminModal('student')} className="bg-black text-white px-6 py-3 rounded-lg text-[10px] font-black uppercase">+ SISWA BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full">
                  <thead className="text-black border-b-2 border-black"><tr>
                      <th className="pb-4 text-center w-12"><input type="checkbox" checked={adminSelectedClass?.students && selectedStudentIds.length === adminSelectedClass.students.length} onChange={() => handleSelectAll('student', adminSelectedClass?.students || [])} className="w-5 h-5 accent-black" /></th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">NAMA LENGKAP</th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">NISN</th>
                      <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">AKSI</th>
                  </tr></thead>
                  <tbody className="divide-y divide-black/10">{adminSelectedClass?.students.map((s:any) => (
                      <tr key={s.id} className="hover:bg-black/5 transition-colors">
                        <td className="py-4 text-center"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleSelectOne('student', s.id)} className="w-5 h-5 accent-black" /></td>
                        <td className="py-4 font-black text-black">{s.name}</td>
                        <td className="py-4 text-black font-bold text-xs">{s.nisn}</td>
                        <td className="py-4 text-right space-x-4">
                          <button onClick={() => openAdminModal('student', s)} className="text-black font-black text-[10px] uppercase">EDIT</button>
                          <button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 font-black text-[10px] uppercase">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}
          {adminTab === 'Database' && (
              <div className="py-10 text-center space-y-10">
                <div className="w-20 h-20 bg-black text-white rounded-2xl flex items-center justify-center mx-auto text-3xl font-black border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">DB</div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-black uppercase tracking-tighter">PENGELOLAAN BASIS DATA</h3>
                  <p className="text-black font-bold max-w-md mx-auto text-sm opacity-60">Amankan data Bapak dengan melakukan backup berkala ke file JSON.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto px-4">
                  <div className="bg-white p-8 rounded-2xl border-2 border-black space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-[10px] font-black text-black uppercase tracking-widest">SINKRONISASI CLOUD</p>
                    <button onClick={handleManualSave} disabled={isSyncing} className="w-full bg-black text-white px-6 py-4 rounded-xl font-black hover:bg-white hover:text-black border-2 border-black transition-all">
                      {isSyncing ? 'PROSES...' : 'REFRESH DATA'}
                    </button>
                    <button onClick={handleSeedDatabase} disabled={isSyncing} className="w-full bg-white text-black border-2 border-black px-6 py-4 rounded-xl font-black hover:bg-black hover:text-white transition-all">
                      ISI DATA BAWAAN
                    </button>
                  </div>

                  <div className="bg-black p-8 rounded-2xl border-2 border-black space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">BACKUP & RESTORE</p>
                    <button onClick={handleExportData} className="w-full bg-white text-black px-6 py-4 rounded-xl font-black hover:bg-black hover:text-white border-2 border-white transition-all">
                      📥 EXPORT KE JSON
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full bg-black text-white border-2 border-white px-6 py-4 rounded-xl font-black hover:bg-white hover:text-black transition-all">
                      📤 IMPORT DARI JSON
                    </button>
                    <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportData(file); e.target.value = ''; }} accept=".json" className="hidden" />
                  </div>
                </div>

                <div className="pt-8 border-t-2 border-black/10 max-w-lg mx-auto">
                  <button onClick={() => window.confirm('Hapus seluruh data cloud?') && handleDeleteItem('all', '0')} className="text-rose-600 font-black uppercase text-xs hover:underline tracking-widest">⚠️ KOSONGKAN DATABASE CLOUD</button>
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
  const [theme, setTheme] = useState<'light'>('light');

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
      if (!isSilent) showToast("MODE OFFLINE: Data hanya disimpan sementara di browser.", "info");
      setClasses(INITIAL_CLASSES); 
      setIsLoading(false); 
      return; 
    }
    
    if (!isSilent && classes.length === 0) setIsLoading(true);
    
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('name');
      const { data: studentsData } = await supabase.from('students').select('*');
      const { data: assignmentsData } = await supabase.from('assignments').select('*').order('due_date');
      const { data: submissionsData } = await supabase.from('submissions').select('*');
      const { data: attendanceData } = await supabase.from('attendance_records').select('*');
      const { data: holidaysData } = await supabase.from('holidays').select('holiday_date');

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
      setHolidays((holidaysData || []).map(h => h.holiday_date));

      if (assembledClasses.length > 0) {
        if (!activeClassId) setActiveClassId(assembledClasses[0].id);
        if (!adminSelectedClassId) setAdminSelectedClassId(assembledClasses[0].id);
      }
    } catch (err: any) {
      showToast('GAGAL SYNC CLOUD.', 'error');
      if (classes.length === 0) setClasses(INITIAL_CLASSES);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeClassId, adminSelectedClassId, classes.length, showToast]);

  useEffect(() => { if (isAuthenticated) fetchFromCloud(); else setIsLoading(false); }, [isAuthenticated, fetchFromCloud]);

  const activeClass = useMemo(() => classes.find(c => c.id === activeClassId), [classes, activeClassId]);
  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);

  const handleAttendanceChange = async (studentId: string, date: string, status: AttendanceStatus) => {
    if (holidays.includes(date)) return;
    const itemKey = `${studentId}-${date}`;
    
    setAttendance(prev => ({ 
      ...prev, 
      [studentId]: { ...prev[studentId], [date]: status } 
    }));
    
    if (!supabase) return;
    setSavingItems(prev => [...prev, itemKey]);
    try {
      await supabase.from('attendance_records').upsert({ student_id: studentId, record_date: date, status }, { onConflict: 'student_id, record_date' });
    } catch (err: any) {
      showToast(`GAGAL DATABASE: ${err.message}`, 'error');
    } finally {
      setSavingItems(prev => prev.filter(k => k !== itemKey));
    }
  };

  const handleManualSave = async () => {
    if (!supabase) {
      showToast("Data tersimpan di browser (Offline).", "info");
      return;
    }
    setIsSyncing(true);
    try {
      const payload: any[] = [];
      Object.keys(attendance).forEach(sId => {
        Object.keys(attendance[sId]).forEach(d => {
          payload.push({ student_id: sId, record_date: d, status: attendance[sId][d] });
        });
      });
      if (payload.length > 0) await supabase.from('attendance_records').upsert(payload, { onConflict: 'student_id, record_date' });
      await fetchFromCloud(true);
      showToast('DATA BERHASIL DI-AMANKAN DI CLOUD.', 'success');
    } catch (err: any) {
      showToast(`SYNC GAGAL: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportData = async () => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      const { data: classes } = await supabase.from('classes').select('*');
      const { data: students } = await supabase.from('students').select('*');
      const { data: assignments } = await supabase.from('assignments').select('*');
      const { data: submissions } = await supabase.from('submissions').select('*');
      const { data: attendance } = await supabase.from('attendance_records').select('*');
      const { data: holidays } = await supabase.from('holidays').select('*');

      const fullBackup = {
        metadata: { exportDate: new Date().toISOString(), school: school.name },
        data: { classes: classes || [], students: students || [], assignments: assignments || [], submissions: submissions || [], attendance_records: attendance || [], holidays: holidays || [] }
      };

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_presensi_digital.json`;
      link.click();
      showToast("FILE CADANGAN BERHASIL DIUNDUH.", "success");
    } catch (err: any) {
      showToast(`EKSPOR GAGAL: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportData = async (file: File) => {
    if (!supabase) return;
    if (!window.confirm("Restore akan menimpa data yang ada di cloud. Lanjutkan?")) return;
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
        showToast("RESTORE DATA BERHASIL.", "success");
        await fetchFromCloud(true);
      } catch (err: any) {
        showToast(`IMPOR GAGAL: ${err.message}`, "error");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSeedDatabase = async () => {
    if (!supabase) return;
    if (!window.confirm("Isi database cloud dengan daftar siswa awal?")) return;
    setIsSyncing(true);
    try {
      for (const cls of INITIAL_CLASSES) {
        const { data: cData, error: cErr } = await supabase.from('classes').upsert({ name: cls.name, schedule: cls.schedule || [1,2,3,4,5] }).select();
        const cId = cData?.[0].id;
        if (cId) {
          const studentPayload = cls.students.map(s => ({ class_id: cId, name: s.name, nis: s.nis, nisn: s.nisn }));
          await supabase.from('students').upsert(studentPayload);
        }
      }
      showToast("DATA AWAL BERHASIL DIISI.", "success");
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`GAGAL: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
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
    } catch (err) {
      showToast('GAGAL UPDATE HARI LIBUR.', 'error');
    }
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
      showToast('DATA TERSIMPAN.', 'success');
      setShowModal(null);
      await fetchFromCloud(true); 
    } catch (err: any) {
      showToast(`KESALAHAN: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment' | 'all', id: string) => {
    if (!supabase || !window.confirm(`Hapus data ini selamanya?`)) return;
    setIsSyncing(true);
    try {
      if (type === 'all') {
        await supabase.from('attendance_records').delete().neq('status', 'X');
        showToast("DATABASE DIBERSIHKAN.", "info");
      } else {
        const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
        await supabase.from(table).delete().eq('id', id);
        showToast('DATA TERHAPUS.', 'info');
      }
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`GAGAL: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const ids = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (!supabase || ids.length === 0 || !window.confirm(`Hapus ${ids.length} data?`)) return;
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      await supabase.from(table).delete().in('id', ids);
      showToast('PENGHAPUSAN BERHASIL.', 'info');
      setSelectedClassIds([]); setSelectedStudentIds([]); setSelectedAssignmentIds([]);
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`GAGAL: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
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
    if (!activeClass) return <div className="p-20 text-center text-black font-black uppercase text-2xl">MEMUAT LAPORAN...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    
    return (
      <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden bg-white print-scroll-reset">
        <div className="flex items-center justify-between mb-8 print-hide">
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-black tracking-tighter uppercase">REKAPITULASI PRESENSI</h2>
            <p className="text-black font-bold opacity-60">KELAS: {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-black text-white px-8 py-4 rounded-xl text-sm font-black shadow-xl hover:scale-105 transition-all">CETAK LAPORAN</button>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-black mb-8 gap-4 print-hide">
          <div className="flex gap-4">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`pb-3 text-xs font-black transition-all relative ${reportTab === tab ? 'text-black' : 'text-black/40 hover:text-black'}`}>
                    {tab === 'Daily' ? 'HARIAN' : tab === 'Weekly' ? 'MINGGUAN' : tab === 'Monthly' ? 'BULANAN' : 'SEMESTER'}
                    {reportTab === tab && <div className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-black"></div>}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pb-3">
              {(reportTab === 'Daily' || reportTab === 'Weekly') && (
                  <div className="flex items-center gap-2 bg-white p-1 rounded-lg border-2 border-black">
                      <button onClick={() => { if (reportTab === 'Daily') setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev')); else { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }}} className="px-2 font-bold">←</button>
                      <span className="text-[11px] font-black">{formatDate(currentDate)}</span>
                      <button onClick={() => { if (reportTab === 'Daily') setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next')); else { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }}} className="px-2 font-bold">→</button>
                  </div>
              )}
              {reportTab === 'Monthly' && (
                  <select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-white border-2 border-black rounded-lg px-3 py-1.5 text-xs font-black outline-none">
                      {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name.toUpperCase()}</option>)}
                  </select>
              )}
          </div>
        </div>

        <div className="overflow-auto flex-1 border-2 border-black rounded-2xl print-scroll-reset bg-white">
          <table className="min-w-full text-sm">
            <thead className="text-black border-b-2 border-black">
                <tr>
                    <th className="px-4 py-4 text-left border-r-2 border-black font-black uppercase text-[10px]">No</th>
                    <th className="px-6 py-4 text-left border-r-2 border-black min-w-[200px] font-black uppercase text-[10px]">Nama Peserta Didik</th>
                    {dates.map(d => (<th key={formatDate(d)} className="px-2 py-4 text-center border-r border-black/20 text-[10px] font-black">{d.getDate()}</th>))}
                    <th className="px-3 py-4 text-center bg-black/5 font-black text-[10px]">H</th>
                    <th className="px-3 py-4 text-center bg-black/5 font-black text-[10px]">S</th>
                    <th className="px-3 py-4 text-center bg-black/5 font-black text-[10px]">I</th>
                    <th className="px-3 py-4 text-center bg-black/5 font-black text-[10px]">A</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-black/20">
                {activeClass.students.map((student, idx) => {
                  const rowAttendance = dates.map(d => attendance[student.id]?.[formatDate(d)] || 'H');
                  const stats = { H: rowAttendance.filter(s => s === 'H').length, S: rowAttendance.filter(s => s === 'S').length, I: rowAttendance.filter(s => s === 'I').length, A: rowAttendance.filter(s => s === 'A').length };
                  return (
                    <tr key={student.id} className="hover:bg-black/5 transition-colors">
                      <td className="px-4 py-3 text-left font-black border-r-2 border-black/10">{idx + 1}</td>
                      <td className="px-6 py-3 font-extrabold text-black uppercase border-r-2 border-black/10">{student.name}</td>
                      {dates.map(d => {
                        const status = attendance[student.id]?.[formatDate(d)] || 'H';
                        return <td key={formatDate(d)} className={`border-r border-black/10 text-center font-black text-[10px] ${status === 'H' ? 'text-emerald-700' : status === 'S' ? 'text-blue-700' : status === 'I' ? 'text-amber-700' : 'text-rose-700'}`}>{status}</td>;
                      })}
                      <td className="px-3 py-3 text-center bg-black/5 font-black">{stats.H}</td>
                      <td className="px-3 py-3 text-center bg-black/5 font-black text-blue-700">{stats.S}</td>
                      <td className="px-3 py-3 text-center bg-black/5 font-black text-amber-700">{stats.I}</td>
                      <td className="px-3 py-3 text-center bg-black/5 font-black text-rose-700">{stats.A}</td>
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
        <div className="flex justify-between items-center">
          <h2 className="text-4xl font-black text-black tracking-tighter uppercase">REKAP NILAI TUGAS</h2>
          <button onClick={() => window.print()} className="bg-black text-white px-8 py-3 rounded-xl font-black shadow-xl">CETAK</button>
        </div>
        <div className="bg-white rounded-2xl border-2 border-black overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/5 border-b-2 border-black">
              <tr>
                <th className="p-6 text-left w-12 font-black uppercase text-[10px]">No</th>
                <th className="p-6 text-left font-black uppercase text-[10px] tracking-widest">Nama Peserta Didik</th>
                {activeClass.assignments?.map(a => (
                  <th key={a.id} className="p-6 text-center text-[10px] font-black uppercase tracking-widest">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/20">
              {activeClass.students.map((s, idx) => (
                <tr key={s.id} className="hover:bg-black/5">
                  <td className="p-6 font-black">{idx + 1}</td>
                  <td className="p-6 font-extrabold uppercase">{s.name}</td>
                  {activeClass.assignments?.map(a => (
                    <td key={a.id} className="p-6 text-center font-black text-black">
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
          if (target.username.value === APP_CONFIG.auth.username && target.password.value === APP_CONFIG.auth.password) {
            setIsAuthenticated(true);
          } else {
            showToast("DATA LOGIN SALAH!", "error");
          }
        }} className="max-w-md w-full bg-white p-10 rounded-[40px] border-4 border-black shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] space-y-8">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-black rounded-2xl mx-auto flex items-center justify-center text-white text-3xl font-black border-2 border-black shadow-lg">S11</div>
            <h2 className="text-3xl font-black text-black uppercase tracking-tighter">AKSES GURU</h2>
            <p className="text-black font-bold text-sm opacity-60">SMAN 11 MAKASSAR</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
               <label className="text-[10px] font-black uppercase px-2">Username</label>
               <input name="username" type="text" className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none focus:bg-black focus:text-white transition-all" required />
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-black uppercase px-2">Password</label>
               <input name="password" type="password" className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none focus:bg-black focus:text-white transition-all" required />
            </div>
          </div>
          <button type="submit" className="w-full bg-black text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest">MASUK SISTEM</button>
        </form>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen bg-white flex flex-col items-center justify-center space-y-4">
    <div className="w-16 h-16 border-8 border-black border-t-transparent rounded-full animate-spin"></div>
    <div className="text-black font-black tracking-widest text-lg uppercase">Sinkronisasi Cloud...</div>
  </div>;

  return (
    <div className={`min-h-screen flex bg-white font-sans text-black`}>
      {/* SIDEBAR */}
      <nav className="w-72 bg-white border-r-4 border-black p-8 flex flex-col gap-10 print-hide shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-black text-xl">11</div>
            <div>
              <h1 className="font-black text-sm text-black uppercase leading-tight">PRESENSI GURU</h1>
              <p className="text-[9px] font-bold text-black opacity-60 uppercase tracking-widest">SMAN 11 MKS</p>
            </div>
          </div>
          <div className="pt-4 space-y-2">
             <label className="text-[9px] font-black text-black uppercase tracking-widest px-2 block">KOLOM KELAS</label>
             <select 
               value={activeClassId || ''} 
               onChange={e => setActiveClassId(e.target.value)}
               className="w-full bg-white border-2 border-black rounded-xl p-3 text-xs font-black outline-none hover:bg-black hover:text-white transition-all"
             >
               {classes.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
             </select>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {MENU_ITEMS.map(item => (
            <button 
              key={item.view} 
              onClick={() => setView(item.view)} 
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl font-black text-xs transition-all border-2 ${view === item.view ? 'bg-black text-white border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]' : 'text-black border-transparent hover:border-black'}`}
            >
              <span className="text-lg">{item.icon}</span> {item.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t-2 border-black">
          <button onClick={() => setIsAuthenticated(false)} className="w-full bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest py-3 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg">KELUAR SISTEM</button>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {view === 'Dashboard' && (
          <DashboardView 
            activeClass={activeClass} currentDate={currentDate} setCurrentDate={setCurrentDate} 
            attendance={attendance} holidays={holidays} dateStr={dateStr} school={school} 
            isSyncing={isSyncing} savingItems={savingItems} handleManualSave={handleManualSave} 
            handleAttendanceChange={handleAttendanceChange} handleHolidayToggle={handleHolidayToggle} 
            handleSubmissionToggle={handleSubmissionToggle} handleScoreChange={handleScoreChange} 
            openAdminModal={openAdminModal} 
          />
        )}
        {view === 'Reports' && <ReportsView />}
        {view === 'TaskReports' && <TaskReportsView />}
        {view === 'Admin' && (
          <AdminView 
            classes={classes} adminSelectedClassId={adminSelectedClassId} setAdminSelectedClassId={setAdminSelectedClassId} 
            adminTab={adminTab} setAdminTab={setAdminTab} handleManualSave={handleManualSave} handleSeedDatabase={handleSeedDatabase} 
            handleExportData={handleExportData} handleImportData={handleImportData} openAdminModal={openAdminModal} 
            selectedClassIds={selectedClassIds} setSelectedClassIds={setSelectedClassIds} 
            selectedStudentIds={selectedStudentIds} setSelectedStudentIds={setSelectedStudentIds} 
            selectedAssignmentIds={selectedAssignmentIds} setSelectedAssignmentIds={setSelectedAssignmentIds} 
            handleDeleteItem={handleDeleteItem} handleBulkDelete={handleBulkDelete} isSyncing={isSyncing} 
          />
        )}
      </main>

      {/* MODALS */}
      <Modal 
        isOpen={!!showModal} 
        onClose={() => setShowModal(null)} 
        title={editingItem ? `EDIT ${showModal.toUpperCase()}` : `TAMBAH ${showModal.toUpperCase()}`}
        footer={<button form="admin-form" type="submit" className="bg-black text-white px-10 py-4 rounded-xl font-black shadow-xl hover:scale-105 transition-all uppercase tracking-widest">SIMPAN PERUBAHAN</button>}
      >
        <form id="admin-form" onSubmit={handleAdminSave} className="space-y-5">
          {showModal === 'class' && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase px-2">Nama Kelas</label>
                <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="MISAL: X.9" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase px-2 text-black">Pilih Hari Mengajar</label>
                <div className="flex gap-2 p-1">
                  {[1,2,3,4,5].map(d => (
                    <button key={d} type="button" onClick={() => {
                      const newSched = adminFormData.schedule.includes(d) ? adminFormData.schedule.filter(s => s !== d) : [...adminFormData.schedule, d];
                      setAdminFormData({...adminFormData, schedule: newSched});
                    }} className={`w-10 h-10 rounded-lg font-black text-xs transition-all border-2 ${adminFormData.schedule.includes(d) ? 'bg-black text-white border-black' : 'bg-white text-black border-black/20 hover:border-black'}`}>
                      {DAY_NAMES[d].substring(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {showModal === 'student' && (
            <div className="space-y-4">
               <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="NAMA LENGKAP SISWA" required />
               <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="NIS" />
               <input value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="NISN" />
            </div>
          )}
          {showModal === 'assignment' && (
            <div className="space-y-4">
               <input value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="JUDUL TUGAS" required />
               <textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" placeholder="DESKRIPSI TUGAS..." rows={3} />
               <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase px-2">TENGGAT WAKTU</label>
                 <input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full bg-white border-2 border-black rounded-xl p-4 font-black outline-none" required />
               </div>
            </div>
          )}
        </form>
      </Modal>

      {/* TOASTS */}
      <div className="fixed bottom-8 right-8 z-[100] space-y-3 pointer-events-none">
        {notifications.map(n => <div key={n.id} className={`px-6 py-4 rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-2 border-black flex items-center gap-4 animate-slide-up pointer-events-auto bg-white`}><span className="font-black text-xs uppercase tracking-widest text-black">{n.message}</span></div>)}
      </div>
    </div>
  );
};

export default App;
