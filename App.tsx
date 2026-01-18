
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, HolidayRecord } from './types.ts';
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
  { view: 'Dashboard', label: 'Dashboard', icon: '🏠' },
  { view: 'Reports', label: 'Laporan Presensi', icon: '📊' },
  { view: 'TaskReports', label: 'Rekap Tugas', icon: '📝' },
  { view: 'Admin', label: 'Admin Panel', icon: '⚙️' },
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

// --- DASHBOARD VIEW ---

const DashboardView = ({ activeClass, currentDate, setCurrentDate, attendance, holidays, dateStr, school, isSyncing, savingItems, handleManualSave, handleAttendanceChange, handleHolidayToggle, handleSubmissionToggle, handleScoreChange, openAdminModal }: any) => {
  if (!activeClass) return <div className="p-20 text-center text-slate-400 font-bold animate-pulse">Menghubungkan ke Kelas...</div>;

  const isHoliday = holidays.includes(dateStr);

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
                <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {isSyncing ? 'Sedang Menyimpan...' : 'Simpan & Sinkron'}
            </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            {[
                { label: 'Siswa', val: activeClass.students.length, icon: '👥', color: 'slate' },
                { label: 'Hadir', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'H' || !attendance[s.id]?.[dateStr]).length, icon: '✅', color: 'emerald' },
                { label: 'Sakit', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'S').length, icon: '🤒', color: 'blue' },
                { label: 'Izin', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'I').length, icon: '✉️', color: 'amber' },
                { label: 'Alpa', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'A').length, icon: '❌', color: 'rose' },
            ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-slate-800 p-6 rounded-[32px] border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-2xl`}>{stat.icon}</div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{stat.val}</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
            <div className="xl:col-span-2 space-y-8">
                <div className="flex items-center justify-between px-2 mobile-stack gap-4">
                    <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">Presensi Hari Ini</h3>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => handleHolidayToggle(dateStr)} 
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isHoliday ? 'bg-rose-500 text-white shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-500 border dark:border-slate-700'}`}
                      >
                        {isHoliday ? '🏖️ HARI LIBUR' : '📅 TANDAI LIBUR'}
                      </button>
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-2xl shadow-sm border dark:border-slate-700">
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">←</button>
                          <input 
                            type="date" 
                            value={dateStr} 
                            onChange={(e) => {
                              const [y, m, d] = e.target.value.split('-').map(Number);
                              const newDate = new Date(y, m - 1, d);
                              newDate.setHours(0,0,0,0);
                              setCurrentDate(newDate);
                            }} 
                            className="bg-transparent border-none text-[11px] font-black text-indigo-600 dark:text-indigo-400 w-28 text-center" 
                          />
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all">→</button>
                      </div>
                    </div>
                </div>

                {isHoliday ? (
                  <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-rose-200 dark:border-rose-900/30 p-20 rounded-[48px] text-center space-y-4">
                    <div className="text-6xl animate-bounce">🏖️</div>
                    <h4 className="text-3xl font-black text-slate-900 dark:text-white">Hari Ini Adalah Libur</h4>
                    <p className="text-slate-500 max-w-sm mx-auto">Input presensi dinonaktifkan. Hari ini tidak akan dihitung dalam rekapan akhir semester.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {activeClass.students.map((student: any, idx: number) => {
                        const status = attendance[student.id]?.[dateStr] || 'H';
                        const theme = STATUS_THEMES[status];
                        const isSaving = savingItems.includes(`${student.id}-${dateStr}`);

                        return (
                            <div key={student.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-6 rounded-[32px] flex items-center justify-between shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group relative">
                                {isSaving && (
                                  <div className="absolute top-2 right-2">
                                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></div>
                                  </div>
                                )}
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
                )}
            </div>

            <div className="space-y-8">
                <h3 className="text-2xl font-black tracking-tight px-2">Tugas & Nilai</h3>
                <div className="space-y-6">
                    {activeClass.assignments?.map((a: any) => {
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
                                    {activeClass.students.map((s: any, idx: number) => {
                                        const sub = a.submissions[s.id];
                                        const isSub = sub?.isSubmitted || false;
                                        const itemKey = `score-${a.id}-${s.id}`;
                                        const isSaving = savingItems.includes(itemKey);

                                        return (
                                            <div key={s.id} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 truncate">
                                                  {isSaving && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>}
                                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{idx+1}. {s.name}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                      type="text" 
                                                      defaultValue={sub?.score || ''} 
                                                      onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} 
                                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                      disabled={!isSub} 
                                                      className="w-12 bg-slate-50 dark:bg-slate-900 border-none text-center rounded-xl p-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 disabled:opacity-20" 
                                                      placeholder="--" 
                                                    />
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
    <div className="flex-1 p-6 sm:p-12 overflow-y-auto view-transition space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Admin Panel</h2>
          <p className="text-slate-500 font-medium">Pengelolaan Basis Data SMAN 11</p>
        </div>
        <button onClick={handleManualSave} disabled={isSyncing} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border dark:border-slate-700 px-6 py-3.5 rounded-2xl text-sm font-bold shadow-sm hover:shadow-md transition-all">
          {isSyncing ? 'Sinkronisasi...' : 'Refresh Data'}
        </button>
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
                      <th className="pb-4 text-center w-12"><input type="checkbox" checked={selectedClassIds.length === classes.length && classes.length > 0} onChange={() => handleSelectAll('class', classes)} className="w-5 h-5 rounded-lg" /></th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Nama Kelas</th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Jadwal</th>
                      <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">Aksi</th>
                  </tr></thead>
                  <tbody className="divide-y dark:divide-slate-700">{classes.map((c:any) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-5 text-center"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleSelectOne('class', c.id)} className="w-5 h-5 rounded-lg" /></td>
                        <td className="py-5 font-bold text-slate-800 dark:text-slate-200">{c.name}</td>
                        <td className="py-5 text-slate-500 font-bold text-xs uppercase tracking-widest">{getDayLabels(c.schedule)}</td>
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
                    {classes.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  {selectedStudentIds.length > 0 && <button onClick={() => handleBulkDelete('student')} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus ({selectedStudentIds.length})</button>}
                  <button onClick={() => openAdminModal('student')} className="bg-indigo-600 text-white px-7 py-3.5 rounded-2xl text-xs font-black">+ Siswa</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full">
                  <thead className="text-slate-400 border-b dark:border-slate-700"><tr>
                      <th className="pb-4 text-center w-12"><input type="checkbox" checked={adminSelectedClass?.students && selectedStudentIds.length === adminSelectedClass.students.length} onChange={() => handleSelectAll('student', adminSelectedClass?.students || [])} className="w-5 h-5 rounded-lg" /></th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Nama Lengkap</th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">NISN</th>
                      <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">Aksi</th>
                  </tr></thead>
                  <tbody className="divide-y dark:divide-slate-700">{adminSelectedClass?.students.map((s:any) => (
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
          {adminTab === 'Tugas' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center mobile-stack gap-6">
                <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black tracking-tight">Pengelolaan Tugas</h3>
                  <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-black text-indigo-600">
                    {classes.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  {selectedAssignmentIds.length > 0 && <button onClick={() => handleBulkDelete('assignment')} className="bg-rose-50 text-rose-600 px-6 py-3 rounded-2xl text-xs font-black">Hapus ({selectedAssignmentIds.length})</button>}
                  <button onClick={() => openAdminModal('assignment')} className="bg-indigo-600 text-white px-7 py-3.5 rounded-2xl text-xs font-black">+ Tugas Baru</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full">
                  <thead className="text-slate-400 border-b dark:border-slate-700"><tr>
                      <th className="pb-4 text-center w-12"><input type="checkbox" checked={adminSelectedClass?.assignments && selectedAssignmentIds.length === adminSelectedClass.assignments.length} onChange={() => handleSelectAll('assignment', adminSelectedClass?.assignments || [])} className="w-5 h-5 rounded-lg" /></th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Judul Tugas</th>
                      <th className="pb-4 text-left font-black uppercase text-[10px] tracking-widest">Tenggat</th>
                      <th className="pb-4 text-right font-black uppercase text-[10px] tracking-widest">Aksi</th>
                  </tr></thead>
                  <tbody className="divide-y dark:divide-slate-700">{adminSelectedClass?.assignments?.map((a:any) => (
                      <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-5 text-center"><input type="checkbox" checked={selectedAssignmentIds.includes(a.id)} onChange={() => toggleSelectOne('assignment', a.id)} className="w-5 h-5 rounded-lg" /></td>
                        <td className="py-5 font-bold text-slate-800 dark:text-slate-200">{a.title}</td>
                        <td className="py-5 text-slate-500 font-medium">{new Date(a.dueDate).toLocaleDateString('id-ID')}</td>
                        <td className="py-5 text-right space-x-6">
                          <button onClick={() => openAdminModal('assignment', a)} className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase">Edit</button>
                          <button onClick={() => handleDeleteItem('assignment', a.id)} className="text-rose-600 dark:text-rose-400 font-black text-xs uppercase">Hapus</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}
          {adminTab === 'Database' && (
              <div className="py-12 sm:py-20 text-center space-y-12">
                <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">🌐</div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black tracking-tight">Pengaturan Cloud Database</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">Kelola data di Supabase untuk sinkronisasi antar perangkat dan keamanan data.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto px-4">
                  {/* Cloud Section */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-8 rounded-[40px] border dark:border-slate-800 space-y-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operasi Cloud</p>
                    <div className="flex flex-col gap-3">
                      <button onClick={handleManualSave} disabled={isSyncing} className="w-full bg-white dark:bg-slate-800 text-indigo-600 border border-indigo-100 dark:border-slate-700 px-6 py-4 rounded-2xl font-black hover:bg-indigo-50 transition-all flex items-center justify-center gap-3 shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Refresh Data
                      </button>
                      <button onClick={handleSeedDatabase} disabled={isSyncing} className="w-full bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-indigo-100 dark:shadow-none">
                        Isi Data Awal
                      </button>
                    </div>
                  </div>

                  {/* Backup Section */}
                  <div className="bg-indigo-600 p-8 rounded-[40px] text-white space-y-6 shadow-2xl shadow-indigo-200 dark:shadow-none">
                    <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">Backup & Restore</p>
                    <div className="flex flex-col gap-3">
                      <button onClick={handleExportData} disabled={isSyncing} className="w-full bg-white text-indigo-600 px-6 py-4 rounded-2xl font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
                        📥 Backup Seluruh Data
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} disabled={isSyncing} className="w-full bg-indigo-500/50 text-white border border-white/20 px-6 py-4 rounded-2xl font-black hover:bg-indigo-500/70 transition-all flex items-center justify-center gap-3">
                        📤 Restore Dari File
                      </button>
                      <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportData(file); e.target.value = ''; }} accept=".json" className="hidden" />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t dark:border-slate-800 max-w-lg mx-auto">
                  <p className="text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest mb-4">Zona Berbahaya</p>
                  <button onClick={() => window.confirm('Hapus seluruh data?') && handleDeleteItem('all', '0')} className="text-rose-500 font-bold hover:underline transition-all hover:text-rose-600">Hapus Seluruh Database Cloud</button>
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
      if (!isSilent) showToast("API Key Supabase belum diatur. Gunakan mode offline.", "info");
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
      showToast('Gagal memuat data cloud.', 'error');
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
      const { error } = await supabase.from('attendance_records').upsert(
        { student_id: studentId, record_date: date, status }, 
        { onConflict: 'student_id, record_date' }
      );
      if (error) throw error;
    } catch (err: any) {
      showToast(`Database: ${err.message}`, 'error');
    } finally {
      setSavingItems(prev => prev.filter(k => k !== itemKey));
    }
  };

  const handleManualSave = async () => {
    if (!supabase) {
      showToast("Gagal Simpan: API Key Supabase belum dikonfigurasi.", "error");
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

      if (payload.length > 0) {
        await supabase.from('attendance_records').upsert(payload, { onConflict: 'student_id, record_date' });
      }

      await fetchFromCloud(true);
      showToast('Berhasil disinkronkan ke Cloud.', 'success');
    } catch (err: any) {
      showToast(`Sinkronisasi Gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportData = async () => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      // Ambil data dari semua tabel
      const { data: classes } = await supabase.from('classes').select('*');
      const { data: students } = await supabase.from('students').select('*');
      const { data: assignments } = await supabase.from('assignments').select('*');
      const { data: submissions } = await supabase.from('submissions').select('*');
      const { data: attendance } = await supabase.from('attendance_records').select('*');
      const { data: holidays } = await supabase.from('holidays').select('*');

      const fullBackup = {
        metadata: {
          exportDate: new Date().toISOString(),
          school: school.name,
          version: "2.0"
        },
        data: {
          classes: classes || [],
          students: students || [],
          assignments: assignments || [],
          submissions: submissions || [],
          attendance_records: attendance || [],
          holidays: holidays || []
        }
      };

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_sman11_${formatDate(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("File backup berhasil diunduh.", "success");
    } catch (err: any) {
      showToast(`Gagal backup: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportData = async (file: File) => {
    if (!supabase) return;
    if (!window.confirm("Restore akan menimpa data yang ada. Lanjutkan?")) return;
    
    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.data || !json.data.classes) throw new Error("Format file backup tidak valid.");

        // Urutan restore penting untuk relasi foreign key
        // 1. Classes
        if (json.data.classes.length > 0) await supabase.from('classes').upsert(json.data.classes);
        // 2. Students & Assignments
        if (json.data.students.length > 0) await supabase.from('students').upsert(json.data.students);
        if (json.data.assignments.length > 0) await supabase.from('assignments').upsert(json.data.assignments);
        // 3. Submissions & Attendance & Holidays
        if (json.data.submissions.length > 0) await supabase.from('submissions').upsert(json.data.submissions);
        if (json.data.attendance_records.length > 0) await supabase.from('attendance_records').upsert(json.data.attendance_records);
        if (json.data.holidays.length > 0) await supabase.from('holidays').upsert(json.data.holidays);

        showToast("Restore data berhasil diselesaikan.", "success");
        await fetchFromCloud(true);
      } catch (err: any) {
        showToast(`Restore Gagal: ${err.message}`, "error");
      } finally {
        setIsSyncing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSeedDatabase = async () => {
    if (!supabase) return;
    if (!window.confirm("Isi database dengan data kelas & siswa awal?")) return;
    setIsSyncing(true);
    try {
      for (const cls of INITIAL_CLASSES) {
        const { data: cData, error: cErr } = await supabase.from('classes').upsert({ name: cls.name, schedule: cls.schedule || [1,2,3,4,5] }).select();
        if (cErr) throw cErr;
        const cId = cData[0].id;
        const studentPayload = cls.students.map(s => ({ class_id: cId, name: s.name, nis: s.nis, nisn: s.nisn }));
        const { error: sErr } = await supabase.from('students').upsert(studentPayload);
        if (sErr) throw sErr;
      }
      showToast("Data awal berhasil diisi ke Cloud.", "success");
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleHolidayToggle = async (date: string) => {
    const isNowHoliday = !holidays.includes(date);
    if (isNowHoliday) setHolidays(prev => [...prev, date]);
    else setHolidays(prev => prev.filter(d => d !== date));

    if (!supabase) return;
    setIsSyncing(true);
    try {
      if (isNowHoliday) await supabase.from('holidays').insert({ holiday_date: date });
      else await supabase.from('holidays').delete().eq('holiday_date', date);
      showToast(isNowHoliday ? 'Hari ditandai libur.' : 'Status libur dihapus.', 'info');
    } catch (err) {
      showToast('Gagal menyimpan status libur.', 'error');
    } finally {
      setIsSyncing(false);
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
      showToast('Data berhasil disimpan.', 'success');
      setShowModal(null);
      await fetchFromCloud(true); 
    } catch (err: any) {
      showToast(`Kesalahan: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment' | 'all', id: string) => {
    if (!supabase || !window.confirm(`Hapus ${type} ini?`)) return;
    setIsSyncing(true);
    try {
      if (type === 'all') {
        await supabase.from('attendance_records').delete().neq('status', 'X');
        await supabase.from('submissions').delete().neq('score', 'X');
        await supabase.from('holidays').delete().neq('id', '0');
        showToast("Database dibersihkan.", "info");
      } else {
        const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        showToast('Terhapus.', 'info');
      }
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const ids = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (!supabase || ids.length === 0 || !window.confirm(`Hapus ${ids.length} item?`)) return;
    setIsSyncing(true);
    try {
      const table = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
      showToast('Berhasil dihapus massal.', 'info');
      if (type === 'class') setSelectedClassIds([]);
      if (type === 'student') setSelectedStudentIds([]);
      if (type === 'assignment') setSelectedAssignmentIds([]);
      await fetchFromCloud(true);
    } catch (err: any) {
      showToast(`Gagal: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const updateLocalSubmission = (assignmentId: string, studentId: string, data: Partial<SubmissionData>) => {
    setClasses(prevClasses => prevClasses.map(cls => ({
      ...cls,
      assignments: cls.assignments?.map(asgn => {
        if (asgn.id === assignmentId) {
          return {
            ...asgn,
            submissions: {
              ...asgn.submissions,
              [studentId]: { ...asgn.submissions[studentId], ...data }
            }
          };
        }
        return asgn;
      })
    })));
  };

  const handleSubmissionToggle = async (assignmentId: string, studentId: string, isSubmitted: boolean) => {
      const itemKey = `sub-${assignmentId}-${studentId}`;
      updateLocalSubmission(assignmentId, studentId, { isSubmitted });
      if(!supabase) return;
      setSavingItems(prev => [...prev, itemKey]);
      try {
        await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, is_submitted: isSubmitted }, { onConflict: 'assignment_id, student_id' });
      } catch (err) {
        showToast('Gagal simpan status tugas.', 'error');
      } finally {
        setSavingItems(prev => prev.filter(k => k !== itemKey));
      }
  };
  
  const handleScoreChange = async (assignmentId: string, studentId: string, score: string) => {
      const itemKey = `score-${assignmentId}-${studentId}`;
      updateLocalSubmission(assignmentId, studentId, { score, isSubmitted: true });
      if(!supabase) return;
      setSavingItems(prev => [...prev, itemKey]);
      try {
        await supabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: studentId, score: score, is_submitted: true }, { onConflict: 'assignment_id, student_id' });
      } catch (err) {
        showToast('Gagal simpan nilai.', 'error');
      } finally {
        setSavingItems(prev => prev.filter(k => k !== itemKey));
      }
  };

  // --- REPORT VIEWS ---
  const ReportsView = () => {
    if (!activeClass) return <div className="p-20 text-center text-slate-400 font-bold">Laporan Memuat...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    
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
                      <button onClick={() => { if (reportTab === 'Daily') setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev')); else { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }}} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all">←</button>
                      <input type="date" value={formatDate(currentDate)} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }} className="bg-transparent border-none text-[11px] font-black text-indigo-600 dark:text-indigo-400 w-28 text-center" />
                      <button onClick={() => { if (reportTab === 'Daily') setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next')); else { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }}} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all">→</button>
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

        <div className="overflow-auto flex-1 custom-scrollbar border dark:border-slate-700 rounded-[40px] p-6 print-scroll-reset">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400 border-b dark:border-slate-700">
                {reportTab === 'Semester' ? (
                  <>
                    <tr>
                      <th rowSpan={2} className="px-4 py-6 text-left border-r dark:border-slate-700">No</th>
                      <th rowSpan={2} className="px-6 py-6 text-left border-r dark:border-slate-700 min-w-[200px]">Nama Siswa</th>
                      {MONTHS_2026.filter(m => activeSemester === 1 ? m.value < 6 : m.value >= 6).map(m => <th key={m.value} colSpan={4} className="px-2 py-4 text-center border-r dark:border-slate-700">{m.name.substring(0,3)}</th>)}
                      <th colSpan={4} className="px-4 py-4 text-center bg-slate-50 dark:bg-slate-800">Total</th>
                      <th rowSpan={2} className="px-4 py-6 text-center text-indigo-600">%</th>
                    </tr>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                      {MONTHS_2026.filter(m => activeSemester === 1 ? m.value < 6 : m.value >= 6).map(m => (<React.Fragment key={m.value}><th className="border text-[8px] p-1">H</th><th className="border text-[8px] p-1">S</th><th className="border text-[8px] p-1">I</th><th className="border text-[8px] p-1">A</th></React.Fragment>))}
                      <th className="border text-[8px] p-1">H</th><th className="border text-[8px] p-1">S</th><th className="border text-[8px] p-1">I</th><th className="border text-[8px] p-1">A</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="px-4 py-6 text-left border-r dark:border-slate-700">No</th>
                    <th className="px-6 py-6 text-left border-r dark:border-slate-700 min-w-[240px]">Siswa</th>
                    {dates.map(d => (<th key={formatDate(d)} className="px-2 py-6 text-center border-r dark:border-slate-700 text-[10px] font-black">{d.getDate()}</th>))}
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">H</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">S</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">I</th>
                    <th className="px-3 py-6 text-center bg-slate-50 dark:bg-slate-800">A</th>
                  </tr>
                )}
            </thead>
            <tbody>
                {activeClass.students.map((student, idx) => {
                  const rowAttendance = dates.map(d => attendance[student.id]?.[formatDate(d)] || 'H');
                  const stats = {
                    H: rowAttendance.filter(s => s === 'H').length,
                    S: rowAttendance.filter(s => s === 'S').length,
                    I: rowAttendance.filter(s => s === 'I').length,
                    A: rowAttendance.filter(s => s === 'A').length,
                  };
                  const total = dates.length;
                  const percentage = total > 0 ? Math.round((stats.H / total) * 100) : 0;

                  return (
                    <tr key={student.id} className="border-b dark:border-slate-800 hover:bg-slate-50/30 dark:hover:bg-slate-800/20">
                      <td className="px-4 py-4 text-left font-bold">{idx + 1}</td>
                      <td className="px-6 py-4 font-bold">{student.name}</td>
                      {reportTab === 'Semester' ? (
                        <>
                          {MONTHS_2026.filter(m => activeSemester === 1 ? m.value < 6 : m.value >= 6).map(m => {
                            const monthDates = getMonthDates(m.value, activeClass.schedule);
                            const mStats = {
                              H: monthDates.filter(d => (attendance[student.id]?.[formatDate(d)] || 'H') === 'H').length,
                              S: monthDates.filter(d => attendance[student.id]?.[formatDate(d)] === 'S').length,
                              I: monthDates.filter(d => attendance[student.id]?.[formatDate(d)] === 'I').length,
                              A: monthDates.filter(d => attendance[student.id]?.[formatDate(d)] === 'A').length,
                            };
                            return (<React.Fragment key={m.value}><td className="border text-[9px] text-center p-1">{mStats.H}</td><td className="border text-[9px] text-center p-1">{mStats.S}</td><td className="border text-[9px] text-center p-1">{mStats.I}</td><td className="border text-[9px] text-center p-1">{mStats.A}</td></React.Fragment>);
                          })}
                          <td className="border bg-slate-50 dark:bg-slate-800 text-center font-bold">{stats.H}</td>
                          <td className="border bg-slate-50 dark:bg-slate-800 text-center font-bold">{stats.S}</td>
                          <td className="border bg-slate-50 dark:bg-slate-800 text-center font-bold">{stats.I}</td>
                          <td className="border bg-slate-50 dark:bg-slate-800 text-center font-bold">{stats.A}</td>
                          <td className="px-4 py-4 text-center font-black text-indigo-600">{percentage}%</td>
                        </>
                      ) : (
                        <>
                          {dates.map(d => {
                            const status = attendance[student.id]?.[formatDate(d)] || 'H';
                            return <td key={formatDate(d)} className={`border text-center font-black text-[10px] ${STATUS_THEMES[status as AttendanceStatus]?.color}`}>{status}</td>;
                          })}
                          <td className="px-3 py-4 text-center bg-slate-50 dark:bg-slate-800 font-bold">{stats.H}</td>
                          <td className="px-3 py-4 text-center bg-slate-50 dark:bg-slate-800 font-bold text-blue-600">{stats.S}</td>
                          <td className="px-3 py-4 text-center bg-slate-50 dark:bg-slate-800 font-bold text-amber-600">{stats.I}</td>
                          <td className="px-3 py-4 text-center bg-slate-50 dark:bg-slate-800 font-bold text-rose-600">{stats.A}</td>
                        </>
                      )}
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
      <div className="flex-1 p-6 sm:p-12 overflow-y-auto space-y-10">
        <div className="flex justify-between items-center">
          <h2 className="text-4xl font-black tracking-tight">Rekap Nilai Tugas</h2>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold">Cetak</button>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-[40px] border border-slate-100 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b dark:border-slate-700">
              <tr>
                <th className="p-6 text-left w-12">No</th>
                <th className="p-6 text-left">Siswa</th>
                {activeClass.assignments?.map(a => (
                  <th key={a.id} className="p-6 text-center text-[10px] font-black uppercase tracking-widest">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-700">
              {activeClass.students.map((s, idx) => (
                <tr key={s.id}>
                  <td className="p-6 font-bold">{idx + 1}</td>
                  <td className="p-6 font-bold">{s.name}</td>
                  {activeClass.assignments?.map(a => (
                    <td key={a.id} className="p-6 text-center font-black text-indigo-600">
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={(e: any) => {
          e.preventDefault();
          const target = e.target;
          if (target.username.value === APP_CONFIG.auth.username && target.password.value === APP_CONFIG.auth.password) {
            setIsAuthenticated(true);
          } else {
            showToast("Username atau Password salah!", "error");
          }
        }} className="max-w-md w-full bg-white dark:bg-slate-900 p-12 rounded-[48px] shadow-2xl border dark:border-slate-800 space-y-10">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white text-3xl font-black shadow-xl">S1</div>
            <h2 className="text-3xl font-black tracking-tight">Login Guru</h2>
            <p className="text-slate-500 font-bold">SMAN 11 MAKASSAR</p>
          </div>
          <div className="space-y-4">
            <input name="username" type="text" placeholder="Username" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-5 font-bold outline-indigo-500" required />
            <input name="password" type="password" placeholder="Password" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-5 font-bold outline-indigo-500" required />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:scale-105 transition-all">Masuk</button>
        </form>
        <div className="fixed bottom-8 right-8 z-[100] space-y-3">
          {notifications.map(n => <div key={n.id} className={`p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-slide-up ${n.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}><span className="font-black text-sm">{n.message}</span></div>)}
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center text-slate-400 font-black tracking-widest animate-pulse">MEMUAT BASIS DATA...</div>;

  return (
    <div className={`min-h-screen flex ${theme === 'dark' ? 'dark' : ''} bg-white dark:bg-slate-950 font-sans`}>
      {/* SIDEBAR */}
      <nav className="w-80 bg-slate-50 dark:bg-slate-900/50 border-r dark:border-slate-800 p-8 flex flex-col gap-10 print-hide shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">S1</div>
            <div>
              <h1 className="font-black text-sm tracking-tight text-slate-900 dark:text-white uppercase leading-tight">Presensi Guru</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{school.name}</p>
            </div>
          </div>
          <select 
            value={activeClassId || ''} 
            onChange={e => setActiveClassId(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl p-4 text-xs font-black shadow-sm outline-indigo-500"
          >
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex-1 space-y-2">
          {MENU_ITEMS.map(item => (
            <button 
              key={item.view} 
              onClick={() => setView(item.view)} 
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-black text-sm transition-all ${view === item.view ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-600'}`}
            >
              <span className="text-lg">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t dark:border-slate-800">
          <button onClick={toggleTheme} className="w-full p-4 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm shadow-sm">
            {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
          <button onClick={() => setIsAuthenticated(false)} className="w-full text-rose-500 font-black text-xs uppercase tracking-widest py-2 hover:underline">Logout</button>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {view === 'Dashboard' && (
          <DashboardView 
            activeClass={activeClass} 
            currentDate={currentDate} 
            setCurrentDate={setCurrentDate} 
            attendance={attendance} 
            holidays={holidays} 
            dateStr={dateStr} 
            school={school} 
            isSyncing={isSyncing} 
            savingItems={savingItems} 
            handleManualSave={handleManualSave} 
            handleAttendanceChange={handleAttendanceChange} 
            handleHolidayToggle={handleHolidayToggle} 
            handleSubmissionToggle={handleSubmissionToggle} 
            handleScoreChange={handleScoreChange} 
            openAdminModal={openAdminModal} 
          />
        )}
        {view === 'Reports' && <ReportsView />}
        {view === 'TaskReports' && <TaskReportsView />}
        {view === 'Admin' && (
          <AdminView 
            classes={classes} 
            adminSelectedClassId={adminSelectedClassId} 
            setAdminSelectedClassId={setAdminSelectedClassId} 
            adminTab={adminTab} 
            setAdminTab={setAdminTab} 
            handleManualSave={handleManualSave} 
            handleSeedDatabase={handleSeedDatabase} 
            handleExportData={handleExportData}
            handleImportData={handleImportData}
            openAdminModal={openAdminModal} 
            selectedClassIds={selectedClassIds} 
            setSelectedClassIds={setSelectedClassIds} 
            selectedStudentIds={selectedStudentIds} 
            setSelectedStudentIds={setSelectedStudentIds} 
            selectedAssignmentIds={selectedAssignmentIds} 
            setSelectedAssignmentIds={setSelectedAssignmentIds} 
            handleDeleteItem={handleDeleteItem} 
            handleBulkDelete={handleBulkDelete} 
            isSyncing={isSyncing} 
          />
        )}
      </main>

      {/* MODALS */}
      <Modal 
        isOpen={!!showModal} 
        onClose={() => setShowModal(null)} 
        title={editingItem ? `Edit ${showModal}` : `Tambah ${showModal}`}
        footer={<button form="admin-form" type="submit" className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all">Simpan Perubahan</button>}
      >
        <form id="admin-form" onSubmit={handleAdminSave} className="space-y-5">
          {showModal === 'class' && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nama Kelas</label>
                <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="Contoh: X.9" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Jadwal Hari</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(d => (
                    <button key={d} type="button" onClick={() => {
                      const newSched = adminFormData.schedule.includes(d) ? adminFormData.schedule.filter(s => s !== d) : [...adminFormData.schedule, d];
                      setAdminFormData({...adminFormData, schedule: newSched});
                    }} className={`w-11 h-11 rounded-xl font-black text-xs transition-all ${adminFormData.schedule.includes(d) ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                      {DAY_NAMES[d].substring(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {showModal === 'student' && (
            <div className="space-y-4">
               <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="Nama Lengkap" required />
               <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="NIS" />
               <input value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="NISN" />
            </div>
          )}
          {showModal === 'assignment' && (
            <div className="space-y-4">
               <input value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="Judul Tugas" required />
               <textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" placeholder="Deskripsi Tugas..." rows={3} />
               <input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl p-5 font-bold outline-indigo-500" required />
            </div>
          )}
        </form>
      </Modal>

      {/* TOASTS */}
      <div className="fixed bottom-8 right-8 z-[100] space-y-3 pointer-events-none">
        {notifications.map(n => <div key={n.id} className={`p-5 rounded-3xl shadow-2xl flex items-center gap-4 animate-slide-up pointer-events-auto ${n.type === 'error' ? 'bg-rose-600 text-white' : n.type === 'info' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}><span className="font-black text-sm">{n.message}</span></div>)}
      </div>
    </div>
  );
};

export default App;
