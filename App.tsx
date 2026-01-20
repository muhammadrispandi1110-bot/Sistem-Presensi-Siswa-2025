
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config.ts';
import { CLASSES as INITIAL_CLASSES } from './constants.tsx';
import { AttendanceRecord, AttendanceStatus, ViewType, Student, ClassData, Assignment, SubmissionData, DAY_NAMES, HolidayRecord } from './types.ts';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, isFutureDate, getNextTeachingDate } from './utils.ts';

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
    <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 print-hide backdrop-blur-sm">
      <div className={`w-full ${sizeClass} bg-white dark:bg-black flex flex-col view-transition border-4 border-black dark:border-white`}>
        <header className="flex items-center justify-between p-6 border-b-4 border-black dark:border-white">
          <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter">{title}</h3>
          <button onClick={onClose} className="p-2 border-2 border-black dark:border-white text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all font-black">X</button>
        </header>
        <main className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-black dark:text-white font-bold">{children}</main>
        {footer && (
          <footer className="flex justify-end p-6 bg-white dark:bg-black border-t-4 border-black dark:border-white">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

// --- DASHBOARD VIEW ---
const DashboardView = ({ activeClass, currentDate, setCurrentDate, attendance, holidays, dateStr, school, isSyncing, savingItems, handleManualSave, handleAttendanceChange, handleHolidayToggle, handleSubmissionToggle, handleScoreChange, openAdminModal }: any) => {
  if (!activeClass) return <div className="p-20 text-center text-black dark:text-white font-black text-2xl uppercase">Memproses Data...</div>;
  const isHoliday = holidays.includes(dateStr);

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white dark:bg-black">
        <div className="flex items-center justify-between mobile-stack gap-6 border-b-4 border-black dark:border-white pb-8">
            <div className="space-y-1">
                <h2 className="text-5xl font-black text-black dark:text-white tracking-tighter uppercase">{activeClass.name}</h2>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase rounded tracking-widest">{school.name}</span>
                    <span className="text-black dark:text-white text-lg font-black uppercase underline decoration-4 underline-offset-4">🗓️ {DAY_NAMES[currentDate.getDay()]}, {currentDate.toLocaleDateString('id-ID')}</span>
                </div>
            </div>
            <button onClick={handleManualSave} disabled={isSyncing} className="bg-black text-white dark:bg-white dark:text-black px-10 py-5 text-lg font-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border-4 border-black dark:border-white transition-all flex items-center gap-4">
                {isSyncing ? 'SINKRONISASI...' : 'SIMPAN DATA'}
            </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
                { label: 'Siswa', val: activeClass.students.length, icon: '👥' },
                { label: 'Hadir', val: isHoliday ? 0 : activeClass.students.filter((s:any) => (attendance[s.id]?.[dateStr] === 'H' || !attendance[s.id]?.[dateStr])).length, icon: '✅' },
                { label: 'Sakit', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'S').length, icon: '🤒' },
                { label: 'Izin', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'I').length, icon: '✉️' },
                { label: 'Alpa', val: isHoliday ? 0 : activeClass.students.filter((s:any) => attendance[s.id]?.[dateStr] === 'A').length, icon: '❌' },
            ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-black p-6 border-4 border-black dark:border-white flex items-center gap-5">
                    <div className="w-14 h-14 bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-2xl font-black">{stat.icon}</div>
                    <div>
                        <p className="text-xs font-black text-black dark:text-white uppercase tracking-widest leading-none">{stat.label}</p>
                        <p className="text-4xl font-black text-black dark:text-white leading-none mt-1">{stat.val}</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
            <div className="xl:col-span-2 space-y-8">
                <div className="flex items-center justify-between mobile-stack gap-4 bg-black dark:bg-white text-white dark:text-black p-4 border-4 border-black dark:border-white">
                    <h3 className="text-xl font-black tracking-tight uppercase">Input Kehadiran</h3>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleHolidayToggle(dateStr)} 
                        className={`px-4 py-2 text-xs font-black uppercase transition-all border-2 ${isHoliday ? 'bg-white dark:bg-black text-black dark:text-white border-white dark:border-black' : 'bg-black dark:bg-white text-white dark:text-black border-white dark:border-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white'}`}
                      >
                        {isHoliday ? '🏖️ LIBUR' : '📅 SET LIBUR'}
                      </button>
                      <div className="flex items-center gap-2 bg-white dark:bg-black text-black dark:text-white p-1 border-2 border-black dark:border-white">
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'prev'))} className="px-2 font-black">←</button>
                          <input type="date" value={dateStr} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); setCurrentDate(new Date(y, m - 1, d)); }} className="bg-transparent border-none text-xs font-black text-black dark:text-white w-28 text-center outline-none" />
                          <button onClick={() => setCurrentDate((d:any) => getNextTeachingDate(d, activeClass.schedule || [], 'next'))} className="px-2 font-black">→</button>
                      </div>
                    </div>
                </div>

                {isHoliday ? (
                  <div className="bg-white dark:bg-black border-8 border-black dark:border-white border-double p-20 text-center space-y-6">
                    <div className="text-9xl">🏖️</div>
                    <h4 className="text-4xl font-black text-black dark:text-white uppercase tracking-tighter">HARI LIBUR</h4>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeClass.students.map((student: any, idx: number) => {
                        const status = attendance[student.id]?.[dateStr] || 'H';
                        const isSaving = savingItems.includes(`${student.id}-${dateStr}`);

                        return (
                            <div key={student.id} className="bg-white dark:bg-black border-2 border-black dark:border-white p-5 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-all relative">
                                {isSaving && <div className="absolute top-2 right-2 w-2 h-2 bg-black dark:bg-white rounded-full animate-ping"></div>}
                                <div className="flex items-center gap-4 truncate">
                                    <div className="w-10 h-10 bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-black text-sm border-2 border-black dark:border-white">
                                        {idx + 1}
                                    </div>
                                    <div className="truncate">
                                        <p className="font-black text-black dark:text-white truncate uppercase text-sm leading-tight">{student.name}</p>
                                        <p className="text-[10px] font-black text-black dark:text-white opacity-60">NISN: {student.nisn || '-'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 bg-black dark:bg-white p-1 border border-black dark:border-white">
                                    {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map(s => {
                                        const isActive = status === s;
                                        return (
                                            <button 
                                              key={s} 
                                              onClick={() => !isFutureDate(currentDate) && handleAttendanceChange(student.id, dateStr, s)} 
                                              className={`w-8 h-8 font-black text-xs transition-all border-2 ${isActive ? `bg-white dark:bg-black text-black dark:text-white border-white dark:border-black` : 'bg-black dark:bg-white text-white dark:text-black border-transparent hover:border-white dark:hover:border-black'}`}
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
                <h3 className="text-2xl font-black text-black dark:text-white uppercase border-b-4 border-black dark:border-white pb-2">Tugas & Nilai</h3>
                <div className="space-y-6">
                    {activeClass.assignments?.map((a: any) => (
                        <div key={a.id} className="bg-white dark:bg-black border-4 border-black dark:border-white p-6 space-y-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
                            <div className="flex justify-between items-start border-b-2 border-black dark:border-white pb-2">
                                <div className="space-y-0.5">
                                    <h4 className="font-black text-black dark:text-white uppercase text-lg leading-tight">{a.title}</h4>
                                    <p className="text-xs font-black text-black dark:text-white opacity-60 uppercase">DUE: {new Date(a.dueDate).toLocaleDateString('id-ID')}</p>
                                </div>
                                <button onClick={() => openAdminModal('assignment', a)} className="p-2 border-2 border-black dark:border-white text-black dark:text-white font-black text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">⚙️</button>
                            </div>
                            <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                                {activeClass.students.map((s: any, idx: number) => {
                                    const sub = a.submissions[s.id];
                                    const isSub = sub?.isSubmitted || false;
                                    return (
                                        <div key={s.id} className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2">
                                            <span className="text-[10px] font-black text-black dark:text-white truncate max-w-[150px] uppercase">{idx+1}. {s.name}</span>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                  type="text" 
                                                  defaultValue={sub?.score || ''} 
                                                  onBlur={(e) => handleScoreChange(a.id, s.id, e.target.value)} 
                                                  className="w-12 bg-white dark:bg-black border-2 border-black dark:border-white text-center font-black text-xs p-1 focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black transition-all text-black dark:text-white" 
                                                  placeholder="0" 
                                                />
                                                <button onClick={() => handleSubmissionToggle(a.id, s.id, !isSub)} className={`w-8 h-8 border-2 border-black dark:border-white flex items-center justify-center font-black ${isSub ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-black text-black dark:text-white'}`}>
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
const AdminView = ({ classes, adminSelectedClassId, setAdminSelectedClassId, adminTab, setAdminTab, handleManualSave, handleSeedDatabase, handleExportData, handleImportData, openAdminModal, selectedClassIds, setSelectedClassIds, selectedStudentIds, setSelectedStudentIds, selectedAssignmentIds, setSelectedAssignmentIds, handleDeleteItem, handleBulkDelete, isSyncing }: any) => {
  const adminSelectedClass = useMemo(() => classes.find((c:any) => c.id === adminSelectedClassId), [classes, adminSelectedClassId]);
  const allAssignments = useMemo(() => classes.flatMap((c:any) => (c.assignments || []).map((a:any) => ({...a, className: c.name, classId: c.id }))), [classes]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 p-6 sm:p-10 overflow-y-auto view-transition space-y-10 bg-white dark:bg-black">
      <div className="flex items-center justify-between border-b-4 border-black dark:border-white pb-8">
        <div>
          <h2 className="text-5xl font-black text-black dark:text-white uppercase tracking-tighter">ADMIN PANEL</h2>
          <p className="text-black dark:text-white font-extrabold text-sm uppercase opacity-70">SMAN 11 Makassar System</p>
        </div>
        <button onClick={handleManualSave} disabled={isSyncing} className="bg-black text-white dark:bg-white dark:text-black px-8 py-4 font-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border-4 border-black dark:border-white transition-all uppercase">
          {isSyncing ? 'SYNK...' : 'REFRESH DATA'}
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2">
          {(['Kelas', 'Siswa', 'Tugas', 'Database'] as const).map(tab => (
              <button key={tab} onClick={() => setAdminTab(tab)} className={`px-10 py-4 text-sm font-black transition-all border-4 border-black dark:border-white uppercase ${adminTab === tab ? 'bg-black text-white dark:bg-white dark:text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]' : 'bg-white dark:bg-black text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}>
                  {tab}
              </button>
          ))}
      </div>

      <div className="bg-white dark:bg-black border-4 border-black dark:border-white p-8">
          {adminTab === 'Kelas' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-black dark:bg-white text-white dark:text-black p-4 border-b-4 border-black dark:border-white">
                <h3 className="text-xl font-black uppercase">Manajemen Kelas</h3>
                <div className="flex gap-2">
                   {selectedClassIds.length > 0 && <button onClick={() => handleBulkDelete('class')} className="bg-rose-600 text-white px-4 py-2 text-xs font-black uppercase border-2 border-black">Hapus ({selectedClassIds.length})</button>}
                  <button onClick={() => openAdminModal('class')} className="bg-white dark:bg-black text-black dark:text-white px-6 py-2 text-xs font-black uppercase border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">+ BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full border-collapse">
                  <thead className="bg-white dark:bg-black text-black dark:text-white"><tr>
                      <th className="p-4 text-center w-12 border-2 border-black dark:border-white font-black">#</th>
                      <th className="p-4 text-left border-2 border-black dark:border-white font-black uppercase text-xs">KELAS</th>
                      <th className="p-4 text-left border-2 border-black dark:border-white font-black uppercase text-xs">JADWAL</th>
                      <th className="p-4 text-right border-2 border-black dark:border-white font-black uppercase text-xs">AKSI</th>
                  </tr></thead>
                  <tbody>{classes.map((c:any) => (
                      <tr key={c.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="p-4 text-center border-2 border-black dark:border-white"><input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => setSelectedClassIds((prev:any) => prev.includes(c.id) ? prev.filter((i:any) => i !== c.id) : [...prev, c.id])} className="w-6 h-6 accent-black" /></td>
                        <td className="p-4 font-black text-black dark:text-white border-2 border-black dark:border-white uppercase">{c.name}</td>
                        <td className="p-4 text-black dark:text-white font-black text-[10px] border-2 border-black dark:border-white uppercase">{c.schedule?.sort().map((d:number) => DAY_NAMES[d].substring(0, 3)).join(', ')}</td>
                        <td className="p-4 text-right space-x-4 border-2 border-black dark:border-white">
                          <button onClick={() => openAdminModal('class', c)} className="text-black dark:text-white font-black text-xs uppercase underline">EDIT</button>
                          <button onClick={() => handleDeleteItem('class', c.id)} className="text-rose-600 font-black text-xs uppercase underline">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}
          
          {adminTab === 'Siswa' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-black dark:bg-white text-white dark:text-black p-4 border-b-4 border-black dark:border-white">
                <div className="flex items-center gap-4">
                  <h3 className="text-xl font-black uppercase">Siswa</h3>
                  <select value={adminSelectedClassId || ''} onChange={e => setAdminSelectedClassId(e.target.value)} className="bg-white dark:bg-black border-2 border-black dark:border-white text-black dark:text-white px-4 py-1 text-xs font-black outline-none uppercase">
                    {classes.map((c:any) => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {selectedStudentIds.length > 0 && <button onClick={() => handleBulkDelete('student')} className="bg-rose-600 text-white px-4 py-2 text-xs font-black uppercase border-2 border-black">Hapus ({selectedStudentIds.length})</button>}
                  <button onClick={() => openAdminModal('student')} className="bg-white dark:bg-black text-black dark:text-white px-6 py-2 text-xs font-black uppercase border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">+ BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full border-collapse">
                  <thead><tr className="bg-white dark:bg-black text-black dark:text-white font-black">
                      <th className="p-4 border-2 border-black dark:border-white text-center w-12">#</th>
                      <th className="p-4 border-2 border-black dark:border-white text-left uppercase text-xs">NAMA SISWA</th>
                      <th className="p-4 border-2 border-black dark:border-white text-left uppercase text-xs">NISN / NIS</th>
                      <th className="p-4 border-2 border-black dark:border-white text-right uppercase text-xs">AKSI</th>
                  </tr></thead>
                  <tbody className="text-black dark:text-white">{adminSelectedClass?.students.map((s:any, idx:number) => (
                      <tr key={s.id} className="hover:bg-black/5 dark:hover:bg-white/5 border-2 border-black dark:border-white">
                        <td className="p-4 border-2 border-black dark:border-white text-center"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => setSelectedStudentIds((prev:any) => prev.includes(s.id) ? prev.filter((i:any) => i !== s.id) : [...prev, s.id])} className="w-6 h-6 accent-black" /></td>
                        <td className="p-4 border-2 border-black dark:border-white font-black uppercase text-xs">{s.name}</td>
                        <td className="p-4 border-2 border-black dark:border-white font-black text-[10px] uppercase">{s.nisn} / {s.nis}</td>
                        <td className="p-4 border-2 border-black dark:border-white text-right space-x-4">
                          <button onClick={() => openAdminModal('student', s)} className="text-black dark:text-white font-black text-xs uppercase underline">EDIT</button>
                          <button onClick={() => handleDeleteItem('student', s.id)} className="text-rose-600 font-black text-xs uppercase underline">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}

          {adminTab === 'Tugas' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-black dark:bg-white text-white dark:text-black p-4 border-b-4 border-black dark:border-white">
                <h3 className="text-xl font-black uppercase">Manajemen Tugas</h3>
                <div className="flex gap-2">
                  {selectedAssignmentIds.length > 0 && <button onClick={() => handleBulkDelete('assignment')} className="bg-rose-600 text-white px-4 py-2 text-xs font-black uppercase border-2 border-black">Hapus ({selectedAssignmentIds.length})</button>}
                  <button onClick={() => openAdminModal('assignment')} className="bg-white dark:bg-black text-black dark:text-white px-6 py-2 text-xs font-black uppercase border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">+ BARU</button>
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full border-collapse">
                  <thead className="bg-white dark:bg-black text-black dark:text-white"><tr>
                      <th className="p-4 text-center w-12 border-2 border-black dark:border-white font-black">#</th>
                      <th className="p-4 text-left border-2 border-black dark:border-white font-black uppercase text-xs">JUDUL TUGAS</th>
                      <th className="p-4 text-left border-2 border-black dark:border-white font-black uppercase text-xs">KELAS</th>
                      <th className="p-4 text-left border-2 border-black dark:border-white font-black uppercase text-xs">TENGGAT</th>
                      <th className="p-4 text-right border-2 border-black dark:border-white font-black uppercase text-xs">AKSI</th>
                  </tr></thead>
                  <tbody>{allAssignments.map((a:any) => (
                      <tr key={a.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="p-4 text-center border-2 border-black dark:border-white"><input type="checkbox" checked={selectedAssignmentIds.includes(a.id)} onChange={() => setSelectedAssignmentIds((prev:any) => prev.includes(a.id) ? prev.filter((i:any) => i !== a.id) : [...prev, a.id])} className="w-6 h-6 accent-black" /></td>
                        <td className="p-4 font-black text-black dark:text-white border-2 border-black dark:border-white uppercase">{a.title}</td>
                        <td className="p-4 font-black text-black dark:text-white border-2 border-black dark:border-white uppercase text-xs">{a.className}</td>
                        <td className="p-4 font-black text-black dark:text-white border-2 border-black dark:border-white uppercase text-xs">{new Date(a.dueDate).toLocaleDateString('id-ID')}</td>
                        <td className="p-4 text-right space-x-4 border-2 border-black dark:border-white">
                          <button onClick={() => openAdminModal('assignment', a)} className="text-black dark:text-white font-black text-xs uppercase underline">EDIT</button>
                          <button onClick={() => handleDeleteItem('assignment', a.id)} className="text-rose-600 font-black text-xs uppercase underline">HAPUS</button>
                        </td>
                      </tr>
                  ))}</tbody>
              </table></div>
            </div>
          )}

          {adminTab === 'Database' && (
              <div className="py-10 text-center space-y-12">
                <div className="w-24 h-24 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center mx-auto text-4xl font-black border-4 border-black dark:border-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] dark:shadow-[10px_10px_0px_0px_rgba(255,255,255,1)]">SQL</div>
                <div className="space-y-2">
                  <h3 className="text-4xl font-black text-black dark:text-white uppercase tracking-tighter">DATA CLOUD</h3>
                  <p className="text-black dark:text-white font-black max-w-lg mx-auto text-sm opacity-60 uppercase">Manajemen Keamanan Data SMAN 11</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto px-4">
                  <div className="bg-white dark:bg-black p-8 border-4 border-black dark:border-white space-y-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] dark:shadow-[10px_10px_0px_0px_rgba(255,255,255,1)]">
                    <p className="text-xs font-black text-black dark:text-white uppercase tracking-widest border-b-2 border-black dark:border-white pb-2">KONTROL</p>
                    <div className="space-y-4">
                      <button onClick={handleManualSave} disabled={isSyncing} className="w-full bg-black text-white dark:bg-white dark:text-black px-6 py-4 font-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border-4 border-black dark:border-white transition-all uppercase text-sm">Refresh Cloud</button>
                      <button onClick={handleSeedDatabase} disabled={isSyncing} className="w-full bg-white dark:bg-black text-black dark:text-white border-4 border-black dark:border-white px-6 py-4 font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all uppercase text-sm">Muat Data Awal</button>
                    </div>
                  </div>

                  <div className="bg-black dark:bg-white p-8 border-4 border-black dark:border-white space-y-6 shadow-[10px_10px_0px_0px_rgba(255,255,255,0.2)] dark:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.2)]">
                    <p className="text-xs font-black text-white dark:text-black uppercase tracking-widest border-b-2 border-white dark:border-black pb-2">BACKUP</p>
                    <div className="space-y-4">
                      <button onClick={handleExportData} className="w-full bg-white dark:bg-black text-black dark:text-white px-6 py-4 font-black border-4 border-white dark:border-black transition-all uppercase text-sm">📥 Export ke JSON</button>
                      <button onClick={() => fileInputRef.current?.click()} className="w-full bg-black dark:bg-white text-white dark:text-black border-4 border-white dark:border-black transition-all uppercase text-sm">📤 Import dari JSON</button>
                      <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportData(file); e.target.value = ''; }} accept=".json" className="hidden" />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t-4 border-black dark:border-white max-w-lg mx-auto">
                  <button onClick={() => window.confirm('Hapus seluruh data cloud?') && handleDeleteItem('all', '0')} className="bg-rose-600 text-white px-8 py-3 font-black uppercase text-xs hover:bg-rose-700 transition-all border-2 border-black dark:border-white">⚠️ KOSONGKAN DATABASE</button>
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
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') { root.classList.add('dark'); } 
    else { root.classList.remove('dark'); }
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
    assignmentTitle: '', assignmentDesc: '', assignmentDueDate: '', assignmentClassId: ''
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const fetchFromCloud = useCallback(async (isSilent = false) => {
    if (!supabase) { 
      if (!isSilent) showToast("MODE OFFLINE: Local data aktif.", "info");
      setClasses(INITIAL_CLASSES); setIsLoading(false); return; 
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
      showToast('Cloud Sync Error.', 'error');
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
    if (!supabase) { showToast("Local save aktif.", "info"); return; }
    setIsSyncing(true);
    try {
      const payload: any[] = [];
      Object.keys(attendance).forEach(sId => { Object.keys(attendance[sId]).forEach(d => { payload.push({ student_id: sId, record_date: d, status: attendance[sId][d] }); }); });
      if (payload.length > 0) await supabase.from('attendance_records').upsert(payload, { onConflict: 'student_id, record_date' });
      await fetchFromCloud(true);
      showToast('DATA CLOUD UPDATE.', 'success');
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
      showToast("BACKUP SIAP.", "success");
    } catch (err: any) { showToast(`Error: ${err.message}`, "error"); } finally { setIsSyncing(false); }
  };

  const handleImportData = async (file: File) => {
    if (!supabase) return;
    if (!window.confirm("Overwrite cloud data?")) return;
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
        showToast("RESTORE BERHASIL.", "success");
        await fetchFromCloud(true);
      } catch (err: any) { showToast(`Gagal: ${err.message}`, "error"); } finally { setIsSyncing(false); }
    };
    reader.readAsText(file);
  };

  const handleSeedDatabase = async () => {
    if (!supabase) return;
    if (!window.confirm("Muat data awal?")) return;
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
      showToast("DATA MUAT.", "success");
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
      showToast(isNowHoliday ? 'LIBUR SET.' : 'LIBUR BATAL.', 'info');
    } catch (err) { showToast('Gagal.', 'error'); }
  };

  const openAdminModal = useCallback((type: 'class' | 'student' | 'assignment', item: any = null) => {
    setEditingItem(item);
    if (item) {
        if (type === 'class') setAdminFormData({ ...adminFormData, className: item.name, schedule: item.schedule || defaults.teachingDays });
        else if (type === 'student') setAdminFormData({ ...adminFormData, studentName: item.name, studentNis: item.nis, studentNisn: item.nisn });
        else if (type === 'assignment') setAdminFormData({ ...adminFormData, assignmentTitle: item.title, assignmentDesc: item.description, assignmentDueDate: item.dueDate, assignmentClassId: item.classId });
    } else {
        setAdminFormData({ className: '', schedule: defaults.teachingDays, studentName: '', studentNis: '', studentNisn: '', assignmentTitle: '', assignmentDesc: '', assignmentDueDate: formatDate(new Date()), assignmentClassId: adminSelectedClassId || (classes[0]?.id || '') });
    }
    setShowModal(type);
  }, [adminFormData, defaults.teachingDays, adminSelectedClassId, classes]);

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
        const payload = { title: adminFormData.assignmentTitle, description: adminFormData.assignmentDesc, due_date: adminFormData.assignmentDueDate, class_id: adminFormData.assignmentClassId };
        editingItem ? await supabase.from('assignments').update(payload).eq('id', editingItem.id) : await supabase.from('assignments').insert(payload);
      }
      showToast('SAVED.', 'success');
      setShowModal(null); await fetchFromCloud(true); 
    } catch (err: any) { showToast(`Error: ${err.message}`, 'error'); } finally { setIsSyncing(false); }
  };

  const handleDeleteItem = async (type: 'class' | 'student' | 'assignment' | 'all', id: string) => {
    if (!supabase || !window.confirm(`Hapus?`)) return;
    setIsSyncing(true);
    try {
      if (type === 'all') { await supabase.from('attendance_records').delete().neq('status', 'X'); showToast("CLEAR.", "info"); } 
      else { const t = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments'; await supabase.from(t).delete().eq('id', id); showToast('DELETED.', 'info'); }
      await fetchFromCloud(true);
    } catch (err: any) { showToast(`Error: ${err.message}`, 'error'); } finally { setIsSyncing(false); }
  };

  const handleBulkDelete = async (type: 'class' | 'student' | 'assignment') => {
    const ids = type === 'class' ? selectedClassIds : type === 'student' ? selectedStudentIds : selectedAssignmentIds;
    if (!supabase || ids.length === 0 || !window.confirm(`Hapus ${ids.length} data?`)) return;
    setIsSyncing(true);
    try {
      const t = type === 'class' ? 'classes' : type === 'student' ? 'students' : 'assignments';
      await supabase.from(t).delete().in('id', ids);
      showToast('BERHASIL.', 'info');
      if (type === 'class') setSelectedClassIds([]);
      else if (type === 'student') setSelectedStudentIds([]);
      else if (type === 'assignment') setSelectedAssignmentIds([]);
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

  const getReportDateRange = (tab: 'Daily' | 'Weekly' | 'Monthly' | 'Semester', currentDate: Date, activeMonth: number, activeSemester: 1 | 2): string => {
      switch (tab) {
          case 'Daily':
              return `Tanggal: ${currentDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
          case 'Weekly':
              const weekDates = getWeekDates(currentDate, activeClass?.schedule);
              if (weekDates.length === 0) return "Periode: -";
              const start = weekDates[0];
              const end = weekDates[weekDates.length - 1];
              return `Periode: ${start.toLocaleDateString('id-ID')} s/d ${end.toLocaleDateString('id-ID')}`;
          case 'Monthly':
              return `Bulan: ${MONTHS_2026[activeMonth].name} ${defaults.startYear}`;
          case 'Semester':
              return `Semester: ${school.semester} (T.A. ${school.year}/${parseInt(school.year) + 1})`;
          default:
              return '';
      }
  };

  // --- REPORT VIEWS ---
  const ReportsView = () => {
    if (!activeClass) return <div className="p-20 text-center text-black dark:text-white font-black uppercase text-2xl">Laporan Memuat...</div>;
    const dates = reportTab === 'Daily' ? [currentDate] : reportTab === 'Weekly' ? getWeekDates(currentDate, activeClass.schedule) : reportTab === 'Monthly' ? getMonthDates(activeMonth, activeClass.schedule) : getSemesterDates(activeSemester, activeClass.schedule);
    const dateRange = getReportDateRange(reportTab, currentDate, activeMonth, activeSemester);
    const reportTitle = `Laporan Presensi ${activeClass.name}`;
    
    return (
      <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-hidden bg-white dark:bg-black print-container">
        <div className="print-only print-header">
            <h1 className="text-2xl font-black uppercase tracking-widest">{school.name}</h1>
            <h2 className="text-xl font-bold uppercase mt-2">{reportTitle}</h2>
            <p className="text-sm font-semibold mt-1">{dateRange}</p>
        </div>

        <div className="flex items-center justify-between mb-8 print-hide">
          <div className="space-y-1">
            <h2 className="text-5xl font-black text-black dark:text-white tracking-tighter uppercase">Rekap Presensi</h2>
            <p className="text-black dark:text-white font-black text-lg uppercase underline decoration-4 underline-offset-4 decoration-black dark:decoration-white">Kelas: {activeClass.name}</p>
          </div>
          <button onClick={() => window.print()} className="bg-black text-white dark:bg-white dark:text-black px-10 py-5 font-black border-4 border-black dark:border-white hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all">CETAK LAPORAN</button>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b-4 border-black dark:border-white mb-6 gap-4 print-hide">
          <div className="flex gap-4">
            {(['Daily', 'Weekly', 'Monthly', 'Semester'] as const).map(tab => (
                <button key={tab} onClick={() => setReportTab(tab)} className={`pb-3 text-xs font-black transition-all relative ${reportTab === tab ? 'text-black dark:text-white font-black' : 'text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white'}`}>
                    {tab === 'Daily' ? 'Harian' : tab === 'Weekly' ? 'Mingguan' : tab === 'Monthly' ? 'Bulanan' : 'Semester'}
                    {reportTab === tab && <div className="absolute bottom-[-4px] left-0 right-0 h-[4px] bg-black dark:bg-white"></div>}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pb-3">
              {(reportTab === 'Daily' || reportTab === 'Weekly') && (
                  <div className="flex items-center gap-2 bg-white dark:bg-black p-1 border-2 border-black dark:border-white">
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - (reportTab === 'Daily' ? 1 : 7)); setCurrentDate(d); }} className="px-2 font-black">←</button>
                      <span className="text-xs font-black uppercase tracking-widest">{formatDate(currentDate)}</span>
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + (reportTab === 'Daily' ? 1 : 7)); setCurrentDate(d); }} className="px-2 font-black">→</button>
                  </div>
              )}
              {reportTab === 'Monthly' && (
                  <select value={activeMonth} onChange={e => setActiveMonth(parseInt(e.target.value))} className="bg-white dark:bg-black border-2 border-black dark:border-white px-4 py-1.5 text-xs font-black outline-none uppercase text-black dark:text-white">
                      {MONTHS_2026.map(m => <option key={m.value} value={m.value}>{m.name.toUpperCase()}</option>)}
                  </select>
              )}
          </div>
        </div>

        <div className="overflow-auto flex-1 border-4 border-black dark:border-white bg-white dark:bg-black print-table-container">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-white/5 text-black dark:text-white border-b-4 border-black dark:border-white font-black uppercase">
                <tr>
                    <th className="px-4 py-4 text-left border-2 border-black dark:border-white text-[10px]">No</th>
                    <th className="px-6 py-4 text-left border-2 border-black dark:border-white min-w-[200px] text-[10px]">Siswa</th>
                    {dates.map(d => (<th key={formatDate(d)} className="px-2 py-4 text-center border border-black/20 dark:border-white/20 text-[10px]">{d.getDate()}</th>))}
                    <th className="px-3 py-4 text-center border-2 border-black dark:border-white text-[10px] bg-gray-100 dark:bg-white/10">H</th>
                    <th className="px-3 py-4 text-center border-2 border-black dark:border-white text-[10px] bg-gray-100 dark:bg-white/10">S</th>
                    <th className="px-3 py-4 text-center border-2 border-black dark:border-white text-[10px] bg-gray-100 dark:bg-white/10">I</th>
                    <th className="px-3 py-4 text-center border-2 border-black dark:border-white text-[10px] bg-gray-100 dark:bg-white/10">A</th>
                </tr>
            </thead>
            <tbody className="font-black text-black dark:text-white">
                {activeClass.students.map((student, idx) => {
                  const rowAttendance = dates.map(d => {
                    const dStr = formatDate(d);
                    if (holidays.includes(dStr)) return 'LIBUR';
                    return attendance[student.id]?.[dStr] || 'H';
                  });
                  const stats = { 
                    H: rowAttendance.filter(s => s === 'H').length, 
                    S: rowAttendance.filter(s => s === 'S').length, 
                    I: rowAttendance.filter(s => s === 'I').length, 
                    A: rowAttendance.filter(s => s === 'A').length 
                  };
                  return (
                    <tr key={student.id} className="odd:bg-gray-50/50 dark:odd:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border-b border-black/20 dark:border-white/20">
                      <td className="px-4 py-3 text-left border-r-2 border-black dark:border-white">{idx + 1}</td>
                      <td className="px-6 py-3 border-r-2 border-black dark:border-white uppercase text-[10px] truncate max-w-[300px]">{student.name}</td>
                      {dates.map(d => {
                        const dStr = formatDate(d);
                        const isHoliday = holidays.includes(dStr);
                        const status = isHoliday ? (reportTab === 'Daily' ? 'LIBUR' : 'L') : (attendance[student.id]?.[dStr] || 'H');
                        return (
                          <td 
                            key={dStr} 
                            className={`border-r border-black/10 dark:border-white/10 text-center text-[10px] ${isHoliday ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 font-extrabold' : ''}`}
                          >
                            {status}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center border-l-2 border-black dark:border-white bg-gray-100 dark:bg-white/10 font-bold">{stats.H}</td>
                      <td className="px-3 py-3 text-center border-l border-black/20 dark:border-white/20 bg-gray-100 dark:bg-white/10 font-bold">{stats.S}</td>
                      <td className="px-3 py-3 text-center border-l border-black/20 dark:border-white/20 bg-gray-100 dark:bg-white/10 font-bold">{stats.I}</td>
                      <td className="px-3 py-3 text-center border-l border-black/20 dark:border-white/20 bg-gray-100 dark:bg-white/10 font-bold">{stats.A}</td>
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
    const reportTitle = `Rekap Nilai & Tugas ${activeClass.name}`;
    const dateRange = `Tahun Ajaran ${school.year} / Semester ${school.semester}`;

    return (
      <div className="flex-1 p-6 sm:p-10 overflow-y-auto space-y-8 bg-white dark:bg-black print-container">
        <div className="print-only print-header">
            <h1 className="text-2xl font-black uppercase tracking-widest">{school.name}</h1>
            <h2 className="text-xl font-bold uppercase mt-2">{reportTitle}</h2>
            <p className="text-sm font-semibold mt-1">{dateRange}</p>
        </div>

        <div className="flex justify-between items-center border-b-4 border-black dark:border-white pb-8 print-hide">
          <h2 className="text-5xl font-black text-black dark:text-white uppercase tracking-tighter">Rekap Nilai</h2>
          <button onClick={() => window.print()} className="bg-black text-white dark:bg-white dark:text-black px-10 py-5 font-black border-4 border-black dark:border-white hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all uppercase">CETAK</button>
        </div>
        <div className="bg-white dark:bg-black border-4 border-black dark:border-white overflow-hidden print-table-container">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-black dark:bg-white text-white dark:text-black border-b-4 border-black dark:border-white font-black uppercase">
              <tr>
                <th className="p-6 text-left w-12 border-2 border-white dark:border-black text-[10px]">No</th>
                <th className="p-6 text-left border-2 border-white dark:border-black text-[10px] tracking-widest">Siswa</th>
                {activeClass.assignments?.map(a => (
                  <th key={a.id} className="p-6 text-center border-2 border-white dark:border-black text-[10px] tracking-widest">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-black text-black dark:text-white">
              {activeClass.students.map((s, idx) => (
                <tr key={s.id} className="odd:bg-gray-50/50 dark:odd:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border-b-2 border-black/20 dark:border-white/20">
                  <td className="p-6 border-r-2 border-black dark:border-white text-center">{idx + 1}</td>
                  <td className="p-6 border-r-2 border-black dark:border-white uppercase text-xs">{s.name}</td>
                  {activeClass.assignments?.map(a => (
                    <td key={a.id} className="p-6 text-center border-r-2 border-black dark:border-white">
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-6 transition-colors">
        <form onSubmit={(e: any) => {
          e.preventDefault();
          const target = e.target;
          if (target.username.value === APP_CONFIG.auth.username && target.password.value === APP_CONFIG.auth.password) { setIsAuthenticated(true); } else { showToast("SALAH!", "error"); }
        }} className="max-w-md w-full bg-white dark:bg-black p-12 border-8 border-black dark:border-white shadow-[20px_20px_0px_0px_rgba(0,0,0,1)] dark:shadow-[20px_20px_0px_0px_rgba(255,255,255,1)] space-y-10">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-5xl font-black">11</div>
            <h2 className="text-4xl font-black text-black dark:text-white uppercase tracking-tighter">Login</h2>
            <p className="text-black dark:text-white font-black text-sm uppercase opacity-60">SMAN 11 MKS</p>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
               <label className="text-xs font-black uppercase px-1 text-black dark:text-white">User</label>
               <input name="username" type="text" className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-4 font-black outline-none focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black transition-all uppercase text-black dark:text-white" required />
            </div>
            <div className="space-y-2">
               <label className="text-xs font-black uppercase px-1 text-black dark:text-white">Pass</label>
               <input name="password" type="password" className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-4 font-black outline-none focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black transition-all text-black dark:text-white" required />
            </div>
          </div>
          <button type="submit" className="w-full bg-black text-white dark:bg-white dark:text-black py-6 font-black text-xl border-4 border-black dark:border-white transition-all uppercase tracking-widest">Login</button>
        </form>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center space-y-6 transition-colors">
    <div className="w-24 h-24 border-8 border-black dark:border-white border-t-transparent dark:border-t-transparent animate-spin"></div>
    <div className="text-black dark:text-white font-black tracking-widest text-2xl uppercase">SYNC...</div>
  </div>;

  return (
    <div className={`min-h-screen flex bg-white dark:bg-black font-sans text-black dark:text-white transition-colors`}>
      <nav className="w-80 bg-white dark:bg-black border-r-8 border-black dark:border-white p-8 flex flex-col gap-12 print-hide shrink-0 transition-colors">
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-3xl font-black">11</div>
            <div>
              <h1 className="font-black text-lg text-black dark:text-white uppercase leading-none tracking-tighter">SMAN 11 MKS</h1>
              <p className="text-[10px] font-black text-black dark:text-white opacity-60 uppercase tracking-widest mt-1">PRESENSI DIGITAL</p>
            </div>
          </div>
          <div className="pt-4 space-y-3">
             <label className="text-[10px] font-black text-black dark:text-white uppercase tracking-widest px-2 block">Pilih Kelas</label>
             <select value={activeClassId || ''} onChange={e => setActiveClassId(e.target.value)} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-4 text-xs font-black outline-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all uppercase text-black dark:text-white">
               {classes.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
             </select>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {MENU_ITEMS.map(item => (
            <button key={item.view} onClick={() => setView(item.view)} className={`w-full flex items-center gap-5 px-6 py-4 font-black text-sm transition-all border-4 ${view === item.view ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)]' : 'text-black dark:text-white border-transparent hover:border-black dark:hover:border-white'}`}>
              <span className="text-2xl">{item.icon}</span> {item.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="pt-8 border-t-4 border-black dark:border-white space-y-4">
          <button onClick={toggleTheme} className="w-full bg-white dark:bg-black text-black dark:text-white font-black text-[10px] uppercase tracking-widest py-3 border-4 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
            {theme === 'light' ? '🌙 GELAP' : '☀️ TERANG'}
          </button>
          <button onClick={() => setIsAuthenticated(false)} className="w-full bg-white dark:bg-black text-black dark:text-white font-black text-[10px] uppercase tracking-widest py-3 border-4 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">Log Out</button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col h-screen overflow-hidden print:overflow-visible print:h-auto">
        {view === 'Dashboard' && (
          <DashboardView activeClass={activeClass} currentDate={currentDate} setCurrentDate={setCurrentDate} attendance={attendance} holidays={holidays} dateStr={dateStr} school={school} isSyncing={isSyncing} savingItems={savingItems} handleManualSave={handleManualSave} handleAttendanceChange={handleAttendanceChange} handleHolidayToggle={handleHolidayToggle} handleSubmissionToggle={handleSubmissionToggle} handleScoreChange={handleScoreChange} openAdminModal={openAdminModal} />
        )}
        {view === 'Reports' && <ReportsView />}
        {view === 'TaskReports' && <TaskReportsView />}
        {view === 'Admin' && (
          <AdminView classes={classes} adminSelectedClassId={adminSelectedClassId} setAdminSelectedClassId={setAdminSelectedClassId} adminTab={adminTab} setAdminTab={setAdminTab} handleManualSave={handleManualSave} handleSeedDatabase={handleSeedDatabase} handleExportData={handleExportData} handleImportData={handleImportData} openAdminModal={openAdminModal} selectedClassIds={selectedClassIds} setSelectedClassIds={setSelectedClassIds} selectedStudentIds={selectedStudentIds} setSelectedStudentIds={setSelectedStudentIds} selectedAssignmentIds={selectedAssignmentIds} setSelectedAssignmentIds={setSelectedAssignmentIds} handleDeleteItem={handleDeleteItem} handleBulkDelete={handleBulkDelete} isSyncing={isSyncing} />
        )}
      </main>

      <Modal isOpen={!!showModal} onClose={() => setShowModal(null)} title={editingItem ? `Edit` : `Tambah`} footer={<button form="admin-form" type="submit" className="bg-black dark:bg-white text-white dark:text-black px-12 py-5 font-black border-4 border-black dark:border-white hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all uppercase tracking-widest">Simpan</button>}>
        <form id="admin-form" onSubmit={handleAdminSave} className="space-y-6">
          {showModal === 'class' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-black dark:text-white">Nama Kelas</label>
                <input value={adminFormData.className} onChange={e => setAdminFormData({...adminFormData, className: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-black dark:text-white">Hari</label>
                <div className="flex flex-wrap gap-2 p-1">
                  {[1,2,3,4,5].map(d => (
                    <button key={d} type="button" onClick={() => { const newSched = adminFormData.schedule.includes(d) ? adminFormData.schedule.filter(s => s !== d) : [...adminFormData.schedule, d]; setAdminFormData({...adminFormData, schedule: newSched}); }} className={`w-12 h-12 font-black text-sm transition-all border-4 ${adminFormData.schedule.includes(d) ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'bg-white dark:bg-black text-black dark:text-white border-black/20 dark:border-white/20 hover:border-black dark:hover:border-white'}`}>{DAY_NAMES[d].substring(0, 1)}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          {showModal === 'student' && (
            <div className="space-y-5">
               <input value={adminFormData.studentName} onChange={e => setAdminFormData({...adminFormData, studentName: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" placeholder="NAMA LENGKAP" required />
               <input value={adminFormData.studentNis} onChange={e => setAdminFormData({...adminFormData, studentNis: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" placeholder="NIS" />
               <input value={adminFormData.studentNisn} onChange={e => setAdminFormData({...adminFormData, studentNisn: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" placeholder="NISN" />
            </div>
          )}
          {showModal === 'assignment' && (
            <div className="space-y-5">
               <input value={adminFormData.assignmentTitle} onChange={e => setAdminFormData({...adminFormData, assignmentTitle: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" placeholder="JUDUL TUGAS" required />
               <textarea value={adminFormData.assignmentDesc} onChange={e => setAdminFormData({...adminFormData, assignmentDesc: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" placeholder="INFO..." rows={3} />
               <div className="space-y-2">
                 <label className="text-xs font-black uppercase text-black dark:text-white">Kelas</label>
                 <select value={adminFormData.assignmentClassId} onChange={e => setAdminFormData({...adminFormData, assignmentClassId: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none uppercase text-black dark:text-white" required>
                    {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name.toUpperCase()}</option>)}
                 </select>
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black uppercase text-black dark:text-white">Deadline</label>
                 <input type="date" value={adminFormData.assignmentDueDate} onChange={e => setAdminFormData({...adminFormData, assignmentDueDate: e.target.value})} className="w-full bg-white dark:bg-black border-4 border-black dark:border-white p-5 font-black outline-none text-black dark:text-white" required />
               </div>
            </div>
          )}
        </form>
      </Modal>

      <div className="fixed bottom-10 right-10 z-[100] space-y-4 pointer-events-none print:hidden">
        {notifications.map(n => <div key={n.id} className={`px-10 py-5 border-8 border-black dark:border-white shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] dark:shadow-[10px_10px_0px_0px_rgba(255,255,255,1)] flex items-center gap-6 animate-slide-up pointer-events-auto bg-white dark:bg-black transition-all`}><span className="font-black text-sm uppercase tracking-widest text-black dark:text-white">{n.message}</span></div>)}
      </div>
    </div>
  );
};

export default App;
