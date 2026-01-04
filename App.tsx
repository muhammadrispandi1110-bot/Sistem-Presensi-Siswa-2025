
import React, { useState, useEffect, useRef } from 'react';
import { CLASSES } from './constants';
import { AttendanceRecord, AttendanceStatus, ViewType, STATUS_LABELS, Student, Assignment } from './types';
import { MONTHS_2026, formatDate, getMonthDates, getWeekDates, getSemesterDates, getDatesInRange, isFutureDate } from './utils';

const DARK_STATUS_COLORS: Record<AttendanceStatus, string> = {
  'H': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 print-label-h',
  'S': 'text-blue-400 bg-blue-500/10 border-blue-500/30 print-label-s',
  'I': 'text-amber-400 bg-amber-500/10 border-amber-500/30 print-label-i',
  'A': 'text-rose-400 bg-rose-500/10 border-rose-500/30 print-label-a'
};

const PieChart: React.FC<{ stats: Record<string, number>, size?: number, isPrint?: boolean }> = ({ stats, size = 120, isPrint }) => {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="text-slate-500 italic text-[10px] py-4 text-center">Data kosong</div>;

  let cumulativePercent = 0;
  const colors: Record<string, string> = { H: '#10b981', S: '#3b82f6', I: '#f59e0b', A: '#f43f5e' };

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  const slices = Object.entries(stats).map(([key, value]) => {
    if (value === 0) return null;
    const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
    cumulativePercent += value / total;
    const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
    const largeArcFlag = value / total > 0.5 ? 1 : 0;
    const pathData = [`M ${startX} ${startY}`, `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, `L 0 0`].join(' ');
    return <path key={key} d={pathData} fill={colors[key]} stroke={isPrint ? "#fff" : "#0f172a"} strokeWidth="0.02" />;
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="-1.1 -1.1 2.2 2.2" className={`transform -rotate-90 ${!isPrint ? 'drop-shadow-lg' : ''}`}>
          {slices}
        </svg>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {Object.entries(stats).map(([key, val]) => (
          val > 0 && (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[key] }}></span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isPrint ? 'text-black' : 'text-slate-400'}`}>
                {key}: {val}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeClassId, setActiveClassId] = useState(CLASSES[0].id);
  const [view, setView] = useState<ViewType>('Daily');
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1));
  const [activeMonth, setActiveMonth] = useState(0);
  const [customRange, setCustomRange] = useState({ start: '2026-01-01', end: '2026-01-31' });
  const [isCompact, setIsCompact] = useState(false);
  const [showSaveMsg, setShowSaveMsg] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [lastSync, setLastSync] = useState<string>(() => localStorage.getItem('last_sync') || '-');

  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>(() => {
    const saved = localStorage.getItem('assignments_v1');
    return saved ? JSON.parse(saved) : {};
  });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [newAssign, setNewAssign] = useState({ title: '', desc: '', date: '' });
  
  const [attendance, setAttendance] = useState<AttendanceRecord>(() => {
    const saved = localStorage.getItem('attendance_v5');
    return saved ? JSON.parse(saved) : {};
  });

  const teacherName = "Muhammad Rispandi, S.Pd., Gr.";
  const schoolName = "SMA Negeri 11 Makassar";
  const subjectName = "Matematika";

  useEffect(() => {
    localStorage.setItem('attendance_v5', JSON.stringify(attendance));
    localStorage.setItem('assignments_v1', JSON.stringify(assignments));
  }, [attendance, assignments]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeClass = CLASSES.find(c => c.id === activeClassId)!;

  const handleStatusChange = (studentId: string, date: string, status: AttendanceStatus) => {
    if (isFutureDate(new Date(date))) return;
    setAttendance(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [date]: status }
    }));
  };

  const markAllHadir = () => {
    const dateStr = formatDate(currentDate);
    const newBatch: AttendanceRecord = { ...attendance };
    activeClass.students.forEach(s => {
      if (!newBatch[s.id]) newBatch[s.id] = {};
      newBatch[s.id][dateStr] = 'H';
    });
    setAttendance(newBatch);
    handleSave();
  };

  const handleSave = () => {
    localStorage.setItem('attendance_v5', JSON.stringify(attendance));
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    setLastSync(now);
    localStorage.setItem('last_sync', now);
    setShowSaveMsg(true);
    setTimeout(() => setShowSaveMsg(false), 2000);
  };

  const addAssignment = () => {
    if (!newAssign.title || !newAssign.date) return;
    const assign: Assignment = {
      id: Date.now().toString(),
      title: newAssign.title,
      description: newAssign.desc,
      dueDate: newAssign.date
    };
    setAssignments(prev => ({
      ...prev,
      [activeClassId]: [...(prev[activeClassId] || []), assign]
    }));
    setNewAssign({ title: '', desc: '', date: '' });
    setShowAssignModal(false);
  };

  const deleteAssignment = (id: string) => {
    setAssignments(prev => ({
      ...prev,
      [activeClassId]: prev[activeClassId].filter(a => a.id !== id)
    }));
  };

  const calculateStats = (studentId: string, dates: Date[]) => {
    const stats = { H: 0, S: 0, I: 0, A: 0 };
    dates.forEach(d => {
      const dateStr = formatDate(d);
      const status = attendance[studentId]?.[dateStr] || 'H';
      stats[status]++;
    });
    return stats;
  };

  const getClassStats = (dates: Date[]) => {
    const classStats = { H: 0, S: 0, I: 0, A: 0 };
    activeClass.students.forEach(s => {
      const sStats = calculateStats(s.id, dates);
      classStats.H += sStats.H;
      classStats.S += sStats.S;
      classStats.I += sStats.I;
      classStats.A += sStats.A;
    });
    return classStats;
  };

  const handlePrint = () => {
    document.title = `Laporan_Presensi_${activeClass.name}_${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}`;
    window.print();
    setShowExportMenu(false);
  };

  const handleExcelExport = () => {
    let dates: Date[] = [];
    if (view === 'Weekly') dates = getWeekDates(currentDate);
    else if (view === 'Monthly') dates = getMonthDates(activeMonth);
    else if (view === 'Semester') dates = getSemesterDates();
    else if (view === 'Custom') dates = getDatesInRange(new Date(customRange.start), new Date(customRange.end));
    else dates = [currentDate];

    const period = view === 'Daily' ? formatDate(currentDate) : 
                   view === 'Monthly' ? MONTHS_2026[activeMonth].name : 
                   view === 'Custom' ? `${customRange.start} s.d. ${customRange.end}` : view;

    let tableHeaders = dates.map(d => `<th style="background-color: #f3f4f6; border: 1px solid #000; text-align: center; font-weight: bold; width: 35px; height: 30px;">${d.getDate()}</th>`).join('');
    
    let tableRows = activeClass.students.map((s, idx) => {
      const stats = calculateStats(s.id, dates);
      const dateStatusCells = dates.map(d => {
        const st = attendance[s.id]?.[formatDate(d)] || 'H';
        let color = '#000000';
        if (st === 'S') color = '#2563eb';
        if (st === 'I') color = '#d97706';
        if (st === 'A') color = '#dc2626';
        if (st === 'H') color = '#059669';
        return `<td style="border: 1px solid #000; text-align: center; color: ${color}; font-weight: bold;">${st}</td>`;
      }).join('');

      return `<tr>
        <td style="border: 1px solid #000; text-align: center;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 0 5px;">${s.name.toUpperCase()}</td>
        <td style="border: 1px solid #000; text-align: center; mso-number-format:'\\@';">${s.nis}</td>
        <td style="border: 1px solid #000; text-align: center; mso-number-format:'\\@';">${s.nisn}</td>
        ${dateStatusCells}
        <td style="border: 1px solid #000; text-align: center; font-weight: bold; background-color: #d1fae5; color: #065f46;">${stats.H}</td>
        <td style="border: 1px solid #000; text-align: center; font-weight: bold; background-color: #dbeafe; color: #1e40af;">${stats.S}</td>
        <td style="border: 1px solid #000; text-align: center; font-weight: bold; background-color: #fef3c7; color: #92400e;">${stats.I}</td>
        <td style="border: 1px solid #000; text-align: center; font-weight: bold; background-color: #fee2e2; color: #991b1b;">${stats.A}</td>
      </tr>`;
    }).join('');

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          .header { text-align: center; font-family: 'Arial', sans-serif; }
          .title { font-size: 16pt; font-weight: bold; text-decoration: underline; }
          .school { font-size: 14pt; font-weight: bold; margin-bottom: 10px; }
          table { border-collapse: collapse; font-family: 'Arial', sans-serif; font-size: 10pt; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">REKAPITULASI PRESENSI PESERTA DIDIK</div>
          <div class="school">${schoolName.toUpperCase()}</div>
          <p>Mata Pelajaran: ${subjectName} | Kelas: ${activeClass.name} | Periode: ${period} 2026</p>
          <p>Guru Pengampu: <b>${teacherName}</b></p>
        </div>
        <br/>
        <table border="1">
          <thead>
            <tr>
              <th rowspan="2" style="background-color: #e5e7eb; border: 1px solid #000; width: 40px; height: 50px;">NO</th>
              <th rowspan="2" style="background-color: #e5e7eb; border: 1px solid #000; min-width: 250px;">NAMA LENGKAP SISWA</th>
              <th rowspan="2" style="background-color: #e5e7eb; border: 1px solid #000; width: 100px;">NIS</th>
              <th rowspan="2" style="background-color: #e5e7eb; border: 1px solid #000; width: 100px;">NISN</th>
              <th colspan="${dates.length}" style="background-color: #e5e7eb; border: 1px solid #000; height: 25px;">TANGGAL KEHADIRAN</th>
              <th colspan="4" style="background-color: #e5e7eb; border: 1px solid #000;">TOTAL REKAP</th>
            </tr>
            <tr>
              ${tableHeaders}
              <th style="background-color: #059669; color: white; border: 1px solid #000; width: 40px;">H</th>
              <th style="background-color: #2563eb; color: white; border: 1px solid #000; width: 40px;">S</th>
              <th style="background-color: #d97706; color: white; border: 1px solid #000; width: 40px;">I</th>
              <th style="background-color: #dc2626; color: white; border: 1px solid #000; width: 40px;">A</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <br/><br/>
        <table style="width: 100%; border: none;">
          <tr>
            <td colspan="4" style="border: none; font-weight: bold;">Mengetahui,</td>
            <td colspan="${dates.length}" style="border: none;"></td>
            <td colspan="4" style="border: none; text-align: center; font-weight: bold;">Makassar, ${new Date().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}</td>
          </tr>
          <tr>
            <td colspan="4" style="border: none;">Kepala Sekolah,</td>
            <td colspan="${dates.length}" style="border: none;"></td>
            <td colspan="4" style="border: none; text-align: center;">Guru Mata Pelajaran,</td>
          </tr>
          <tr><td colspan="10" style="height: 60px; border: none;"></td></tr>
          <tr>
            <td colspan="4" style="border: none; font-weight: bold; text-decoration: underline;">NAMA KEPALA SEKOLAH, M.Pd.</td>
            <td colspan="${dates.length}" style="border: none;"></td>
            <td colspan="4" style="border: none; text-align: center; font-weight: bold; text-decoration: underline;">${teacherName.toUpperCase()}</td>
          </tr>
          <tr>
            <td colspan="4" style="border: none;">NIP. 19700101 200001 1 001</td>
            <td colspan="${dates.length}" style="border: none;"></td>
            <td colspan="4" style="border: none; text-align: center;">NIP. 19800101 201001 2 001</td>
          </tr>
        </table>
        <br/>
        <p style="font-size: 8pt; color: #666;">Dicetak melalui Sistem Presensi Digital pada ${new Date().toLocaleString('id-ID')}</p>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Presensi_${activeClass.name}_Matematika_${formatDate(new Date())}.xls`;
    a.click();
    setShowExportMenu(false);
  };

  return (
    <div className={`min-h-screen bg-[#020617] text-slate-200 selection:bg-indigo-500/30 ${isCompact ? 'compact-mode' : ''}`}>
      {/* Save Notification */}
      {showSaveMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-10 py-4 rounded-2xl shadow-2xl flex items-center gap-4 font-black text-xs uppercase animate-bounce border border-white/20">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
          Basis Data Berhasil Disinkronkan
        </div>
      )}

      <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-10">
        
        {/* Dashboard Branding Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 no-print view-transition">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-indigo-600/20 text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-500/20">Portal Akademik Digital</span>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Semester Genap 2026</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-tight">{teacherName}</h1>
            <p className="text-slate-400 font-bold text-sm tracking-wide flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" /></svg>
              {schoolName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <button 
              onClick={() => setIsCompact(!isCompact)}
              className={`flex-1 lg:flex-none px-6 py-4 rounded-2xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-3 border shadow-xl ${isCompact ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" /></svg>
              {isCompact ? 'Standard' : 'Compact'}
            </button>
            
            <div className="relative flex-1 lg:flex-none" ref={exportMenuRef}>
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="w-full lg:w-auto px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-500 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4" /></svg>
                Ekspor Data
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.8)] z-[200] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-4 bg-slate-800/50 border-b border-slate-800 text-[9px] font-black uppercase text-slate-500 tracking-widest text-center">Format Dokumen</div>
                  <button onClick={handlePrint} className="w-full text-left px-6 py-5 text-[11px] font-black uppercase tracking-widest text-slate-300 hover:bg-indigo-600 hover:text-white flex items-center gap-4 transition-all group">
                    <div className="p-2 bg-rose-500/10 rounded-lg group-hover:bg-white/20"><svg className="w-5 h-5 text-rose-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
                    Simpan Format PDF
                  </button>
                  <button onClick={handleExcelExport} className="w-full text-left px-6 py-5 text-[11px] font-black uppercase tracking-widest text-slate-300 hover:bg-emerald-600 hover:text-white flex items-center gap-4 transition-all group">
                    <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-white/20"><svg className="w-5 h-5 text-emerald-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4M4 4h16v16H4V4z" /></svg></div>
                    Format MS Excel
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 items-end">
              <button onClick={handleSave} className="w-full lg:w-auto px-10 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase hover:bg-indigo-100 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3" /></svg>
                Sync Database
              </button>
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mr-2">Terakhir: {lastSync}</span>
            </div>
          </div>
        </header>

        {/* Global Selectors */}
        <section className="space-y-6 no-print view-transition" style={{animationDelay: '0.1s'}}>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 px-1">Ganti Target Kelas</p>
            <div className="swipe-container">
              {CLASSES.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => { setActiveClassId(c.id); setSelectedStudent(null); }}
                  className={`swipe-item px-10 py-5 rounded-3xl font-black text-xs transition-all border ${activeClassId === c.id ? 'active-gradient text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 px-1">Navigasi Laporan & Visual</p>
            <div className="swipe-container">
              {[
                {id: 'Daily', label: 'Absensi Harian', icon: 'M8 7V3m8 4V3m-9 8h10'},
                {id: 'Assignments', label: 'Manajemen Tugas', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'},
                {id: 'Weekly', label: 'Rekap Mingguan', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6'},
                {id: 'Monthly', label: 'Rekap Bulanan', icon: 'M13 16h-1v-4h-1m1-4h.01'},
                {id: 'Semester', label: 'Rekap Semester', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10'},
                {id: 'Custom', label: 'Filter Tanggal', icon: 'M8 7V3m8 4V3m-9 8h10'}
              ].map(item => (
                <button 
                  key={item.id} 
                  onClick={() => { setView(item.id as ViewType); setSelectedStudent(null); }}
                  className={`swipe-item px-10 py-5 rounded-3xl font-black text-xs transition-all border flex items-center gap-3 ${view === item.id && !selectedStudent ? 'active-gradient text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                >
                  <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} /></svg>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* View Content */}
        <main className="view-transition" key={`${activeClassId}-${view}-${selectedStudent?.id}`} style={{animationDelay: '0.2s'}}>
          {selectedStudent ? (
            <div className="space-y-10 animate-fade-in">
              <button onClick={() => setSelectedStudent(null)} className="no-print flex items-center gap-3 text-slate-500 hover:text-white font-black text-xs transition-all hover:-translate-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Kembali ke Target Kelas
              </button>
              
              <div className="dark-card p-8 md:p-14 rounded-[4rem] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
                  <div className="w-40 h-40 md:w-56 md:h-56 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[3.5rem] flex items-center justify-center text-white text-6xl md:text-8xl font-black shadow-3xl rotate-3 group-hover:rotate-0 transition-transform duration-500 uppercase">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div className="text-center md:text-left space-y-5">
                    <div>
                      <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none uppercase">{selectedStudent.name}</h2>
                      <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-6">
                        <span className="px-5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-2xl text-[10px] font-black text-indigo-400 uppercase tracking-widest">NIS: {selectedStudent.nis}</span>
                        <span className="px-5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest">NISN: {selectedStudent.nisn}</span>
                        <span className="px-5 py-2.5 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl text-[10px] font-black text-indigo-300 uppercase tracking-widest">{activeClass.name}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-20 relative z-10">
                  <div className="space-y-8">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-3">
                      <span className="w-10 h-px bg-slate-800"></span> 
                      Akumulasi Semester Genap 2026
                    </h4>
                    <div className="grid grid-cols-2 gap-6">
                      {['Hadir', 'Sakit', 'Izin', 'Alpa'].map((label, idx) => {
                        const char = label.charAt(0) as AttendanceStatus;
                        const stats = calculateStats(selectedStudent.id, getSemesterDates());
                        const colors = ['text-emerald-400', 'text-blue-400', 'text-amber-400', 'text-rose-400'];
                        return (
                          <div key={idx} className="bg-slate-900/40 p-8 rounded-[3rem] border border-slate-800/50 hover:border-slate-700 transition-all hover:translate-y-[-5px] group/item shadow-inner">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{label}</p>
                            <p className={`text-5xl font-black ${colors[idx]}`}>{stats[char]}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-slate-900/20 p-12 rounded-[4rem] border border-slate-800/40 flex flex-col items-center justify-center shadow-inner h-full">
                    <PieChart stats={calculateStats(selectedStudent.id, getSemesterDates())} size={280} />
                  </div>
                </div>
              </div>
            </div>
          ) : view === 'Assignments' ? (
            <div className="space-y-8 animate-fade-in">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-4 uppercase">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Tugas Aktif: {activeClass.name}
                </h3>
                <button onClick={() => setShowAssignModal(true)} className="px-7 py-3.5 bg-indigo-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-indigo-500 shadow-2xl shadow-indigo-900/30 transition-all flex items-center gap-2 active:scale-95">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                  Buat Tugas Baru
                </button>
              </div>

              {showAssignModal && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
                  <div className="dark-card w-full max-w-lg p-10 rounded-[4rem] space-y-8 animate-in zoom-in-95 duration-200 border-indigo-500/30 shadow-[0_40px_100px_rgba(79,70,229,0.2)]">
                    <h4 className="text-2xl font-black text-white uppercase tracking-tight text-center">Formulir Tugas Baru</h4>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Judul Materi / Tugas</label>
                        <input value={newAssign.title} onChange={e => setNewAssign({...newAssign, title: e.target.value})} type="text" placeholder="Misal: Persamaan Trigonometri" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:ring-4 focus:ring-indigo-500/20 font-bold transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Deskripsi Tugas</label>
                        <textarea value={newAssign.desc} onChange={e => setNewAssign({...newAssign, desc: e.target.value})} placeholder="Petunjuk pengerjaan..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white outline-none h-32 focus:ring-4 focus:ring-indigo-500/20 font-bold transition-all resize-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Batas Pengumpulan</label>
                        <input value={newAssign.date} onChange={e => setNewAssign({...newAssign, date: e.target.value})} type="date" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white outline-none focus:ring-4 focus:ring-indigo-500/20 font-black" />
                      </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => setShowAssignModal(false)} className="flex-1 px-4 py-4 bg-slate-900 text-slate-400 font-black rounded-2xl text-[10px] uppercase border border-slate-800 hover:bg-slate-800 transition-all">Batal</button>
                      <button onClick={addAssignment} className="flex-1 px-4 py-4 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl hover:bg-indigo-500 transition-all">Simpan Tugas</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(assignments[activeClassId] || []).length === 0 ? (
                  <div className="col-span-full py-28 text-center bg-slate-900/30 rounded-[4rem] border border-dashed border-slate-800 flex flex-col items-center justify-center space-y-4">
                    <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800 shadow-inner">
                      <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <p className="text-slate-600 font-black uppercase tracking-[0.4em] text-[10px]">Daftar Tugas Kosong</p>
                  </div>
                ) : (
                  assignments[activeClassId].map(a => (
                    <div key={a.id} className="dark-card p-9 rounded-[3.5rem] space-y-5 hover:border-indigo-500/40 transition-all group relative overflow-hidden bg-gradient-to-br from-[#0f172a] to-[#020617]">
                      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                         <button onClick={() => deleteAssignment(a.id)} className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-xl"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                      <h5 className="text-2xl font-black text-white tracking-tighter leading-tight pr-10 uppercase">{a.title}</h5>
                      <p className="text-slate-500 text-xs leading-relaxed line-clamp-4 min-h-[5rem] font-medium">{a.description}</p>
                      <div className="pt-8 flex items-center justify-between border-t border-slate-800/40">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-3">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Deadline: {a.dueDate}
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in">
              {view === 'Daily' ? (
                <div className="dark-card rounded-[4rem] overflow-hidden">
                  <div className="p-10 md:p-14 border-b border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-12 bg-slate-900/30 no-print">
                    <div className="flex items-center gap-10">
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d); }} className="p-6 bg-slate-950 rounded-[2rem] text-slate-500 hover:bg-indigo-600 hover:text-white transition-all shadow-3xl active:scale-90 border border-slate-800/50 group"><svg className="w-8 h-8 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M15 19l-7-7 7-7" /></svg></button>
                      <div className="text-center min-w-[300px]">
                        <span className="block text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em] mb-4">Perekaman Presensi</span>
                        <span className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase whitespace-nowrap">{currentDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d); }} className="p-6 bg-slate-950 rounded-[2rem] text-slate-500 hover:bg-indigo-600 hover:text-white transition-all shadow-3xl active:scale-90 border border-slate-800/50 group"><svg className="w-8 h-8 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                    <div className="flex items-center gap-5">
                      {!isFutureDate(currentDate) && (
                        <button onClick={markAllHadir} className="px-9 py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-[11px] uppercase shadow-2xl shadow-emerald-900/40 hover:bg-emerald-500 transition-all flex items-center gap-4 active:scale-95">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                          Tandai Semua Hadir
                        </button>
                      )}
                      {isFutureDate(currentDate) ? (
                        <div className="px-12 py-5 bg-rose-500/10 border border-rose-500/30 rounded-[2.5rem] text-[11px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-4">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 15v2m0-8v6m-5 2h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Terkunci Otomatis
                        </div>
                      ) : (
                        <div className="px-12 py-5 bg-emerald-500/10 border border-emerald-500/30 rounded-[2.5rem] text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-4">
                           <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></div>
                           Mode Input Aktif
                        </div>
                      )}
                    </div>
                  </div>

                  {(currentDate.getDay() === 0 || currentDate.getDay() === 6) ? (
                    <div className="p-56 text-center bg-slate-900/20">
                      <div className="w-32 h-32 bg-slate-950 rounded-[3.5rem] flex items-center justify-center mx-auto mb-14 text-slate-800 shadow-3xl ring-1 ring-slate-800"><svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                      <h3 className="text-4xl font-black text-slate-600 uppercase tracking-[0.6em] mb-4">Akhir Pekan</h3>
                      <p className="text-slate-700 font-black mt-2 text-lg uppercase tracking-[0.3em]">Sabtu & Minggu: Tidak ada perkuliahan</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto relative">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900/60 text-[11px] font-black uppercase text-slate-500 tracking-[0.4em] border-b border-slate-800/60">
                            <th className="px-16 py-12 w-24">NO</th>
                            <th className="px-10 py-12 name-cell-sticky">SISWA TERDAFTAR</th>
                            <th className="px-10 py-12 text-center">KONFIRMASI KEHADIRAN</th>
                            <th className="px-16 py-12 text-right no-print">AKSI</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {activeClass.students.map((s, idx) => (
                            <tr key={s.id} className="hover:bg-indigo-600/[0.03] transition-all group">
                              <td className="px-16 py-10 text-slate-600 font-black text-sm">{idx + 1}</td>
                              <td className="px-10 py-10 name-cell-sticky">
                                <div className="flex items-center gap-8">
                                  <div className="w-16 h-16 bg-slate-950 rounded-3xl flex items-center justify-center text-slate-500 font-black text-lg uppercase group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner ring-1 ring-slate-800/50">
                                    {s.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-200 group-hover:text-indigo-400 transition-colors text-lg uppercase tracking-tight leading-none mb-2">{s.name}</p>
                                    {!isCompact && <p className="text-[11px] font-black text-slate-600 tracking-[0.25em] uppercase">NIS: {s.nis} • NISN: {s.nisn}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-10 py-10">
                                <div className={`flex items-center justify-center bg-slate-950/60 p-2.5 rounded-[1.75rem] border border-slate-800/80 no-print max-w-max mx-auto ${isFutureDate(currentDate) ? 'opacity-20 pointer-events-none' : ''} shadow-inner`}>
                                  {(['H', 'S', 'I', 'A'] as AttendanceStatus[]).map((st) => (
                                    <button
                                      key={st}
                                      onClick={() => handleStatusChange(s.id, formatDate(currentDate), st)}
                                      className={`attendance-btn w-14 h-14 md:w-16 md:h-16 rounded-[1.25rem] flex items-center justify-center text-[13px] font-black transition-all border ${
                                        (attendance[s.id]?.[formatDate(currentDate)] || 'H') === st 
                                          ? `${DARK_STATUS_COLORS[st]} active scale-110 z-10 shadow-2xl` 
                                          : 'bg-transparent border-transparent text-slate-700 hover:text-slate-400 hover:bg-white/5 active:scale-90'
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-16 py-10 text-right no-print">
                                <button onClick={() => setSelectedStudent(s)} className="p-6 text-slate-700 hover:text-indigo-400 transition-all hover:bg-indigo-600/10 rounded-3xl ring-1 ring-slate-800/40 group/btn shadow-xl"><svg className="w-8 h-8 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-12">
                  {/* Stats Summary Widgets */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-10 no-print">
                    {[
                      {label: 'Hadir', char: 'H', color: 'emerald'},
                      {label: 'Sakit', char: 'S', color: 'blue'},
                      {label: 'Izin', char: 'I', color: 'amber'},
                      {label: 'Alpa', char: 'A', color: 'rose'}
                    ].map((item, idx) => {
                      let dates: Date[] = [];
                      if (view === 'Weekly') dates = getWeekDates(currentDate);
                      else if (view === 'Monthly') dates = getMonthDates(activeMonth);
                      else if (view === 'Semester') dates = getSemesterDates();
                      else if (view === 'Custom') dates = getDatesInRange(new Date(customRange.start), new Date(customRange.end));

                      const stats = getClassStats(dates);
                      const colorMap = {
                        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-emerald-900/20',
                        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30 shadow-blue-900/20',
                        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-amber-900/20',
                        rose: 'text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-rose-900/20'
                      };
                      return (
                        <div key={idx} className={`p-12 rounded-[4rem] border ${colorMap[item.color as keyof typeof colorMap]} shadow-2xl relative overflow-hidden group`}>
                           <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform"><svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
                           <p className="text-[12px] font-black uppercase tracking-[0.25em] mb-4 opacity-60">{item.label}</p>
                           <p className="text-6xl md:text-7xl font-black tracking-tighter">{stats[item.char as AttendanceStatus]}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="dark-card rounded-[4rem] overflow-hidden relative shadow-3xl">
                    {view === 'Monthly' && (
                      <div className="p-14 border-b border-slate-800/50 bg-slate-900/30 no-print flex flex-wrap items-center gap-8">
                        <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em]">Target Bulan:</p>
                        <div className="flex flex-wrap gap-4">
                          {MONTHS_2026.map((m) => (
                            <button 
                              key={m.value}
                              onClick={() => setActiveMonth(m.value)}
                              className={`px-8 py-4 rounded-[1.5rem] text-[11px] font-black transition-all ${activeMonth === m.value ? 'bg-indigo-600 text-white shadow-3xl scale-110 active-gradient border-transparent' : 'bg-slate-950 text-slate-600 hover:text-slate-300 border border-slate-800'}`}
                            >
                              {m.name.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {view === 'Custom' && (
                      <div className="p-14 border-b border-slate-800/50 bg-slate-900/30 no-print flex flex-wrap items-end gap-16">
                        <div className="space-y-5">
                          <label className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">Rentang Awal</label>
                          <input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-white outline-none focus:ring-4 focus:ring-indigo-500/30 font-black text-sm transition-all" />
                        </div>
                        <div className="space-y-5">
                          <label className="text-[12px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">Rentang Akhir</label>
                          <input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-white outline-none focus:ring-4 focus:ring-indigo-500/30 font-black text-sm transition-all" />
                        </div>
                        <div className="bg-indigo-600/10 border border-indigo-500/20 p-6 rounded-3xl mb-1">
                           <p className="text-[11px] text-indigo-400 font-black uppercase tracking-widest leading-relaxed">Sistem Secara Otomatis<br/>Mengecualikan Hari Libur</p>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto relative attendance-table-container">
                      {/* Profesional Laporan PDF Layout */}
                      <div className="print-only hidden p-14 border-b-[6px] border-double border-black mb-14">
                        <div className="flex items-center justify-between">
                            <div className="w-32 h-32 bg-slate-200 rounded-3xl flex items-center justify-center border-4 border-black font-black text-[16px] text-center p-3 uppercase leading-tight">SMA 11<br/>MAKASSAR</div>
                            <div className="text-center flex-1 mx-14">
                                <h4 className="text-[18px] font-bold leading-tight uppercase tracking-widest">Pemerintah Provinsi Sulawesi Selatan</h4>
                                <h4 className="text-[20px] font-bold leading-tight uppercase tracking-widest">Dinas Pendidikan</h4>
                                <h2 className="text-[38px] font-black leading-tight uppercase mt-3 tracking-tighter">SMA NEGERI 11 MAKASSAR</h2>
                                <p className="text-[14px] font-bold leading-relaxed mt-3 uppercase tracking-[0.1em]">Jl. Mappaoudang No. 28, Kec. Mariso, Kota Makassar, Sulawesi Selatan</p>
                                <p className="text-[12px] font-semibold leading-relaxed italic opacity-80">Telp: (0411) 123456 | Website: www.sman11makassar.sch.id | NPSN: 40307338</p>
                            </div>
                            <div className="w-32"></div>
                        </div>
                      </div>

                      <div className="print-only hidden text-center mb-14 px-10">
                        <h2 className="text-[24px] font-black uppercase tracking-tight leading-none mb-4 underline underline-offset-[12px] decoration-4">LAPORAN REKAPITULASI PRESENSI SISWA</h2>
                        <div className="flex justify-center gap-12 mt-10">
                           <h3 className="text-[16px] font-bold text-slate-800 uppercase tracking-[0.4em]">MAPEL: {subjectName}</h3>
                           <h3 className="text-[16px] font-bold text-slate-800 uppercase tracking-[0.4em]">KELAS: {activeClass.name}</h3>
                        </div>
                        <p className="text-[13px] font-black text-slate-800 mt-10 uppercase tracking-[0.3em]">GURU MATA PELAJARAN: <b>{teacherName.toUpperCase()}</b></p>
                      </div>

                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-slate-500 font-black uppercase text-[11px] tracking-[0.35em] border-b border-slate-800">
                            <th className="p-10 border border-slate-800 w-24 text-center">NO</th>
                            <th className="p-10 border border-slate-800 name-cell-sticky text-left min-w-[340px]">NAMA LENGKAP PESERTA DIDIK</th>
                            {(view === 'Weekly' ? getWeekDates(currentDate) : view === 'Monthly' ? getMonthDates(activeMonth) : view === 'Semester' ? getSemesterDates() : getDatesInRange(new Date(customRange.start), new Date(customRange.end))).map((d, i) => (
                              <th key={i} className="p-3 border border-slate-800 text-center w-12 md:w-14">{d.getDate()}</th>
                            ))}
                            <th className="p-6 border border-slate-800 bg-emerald-600/10 text-emerald-500 font-black text-[13px]">H</th>
                            <th className="p-6 border border-slate-800 bg-blue-600/10 text-blue-400 font-black text-[13px]">S</th>
                            <th className="p-6 border border-slate-800 bg-amber-600/10 text-amber-500 font-black text-[13px]">I</th>
                            <th className="p-6 border border-slate-800 bg-rose-600/10 text-rose-500 font-black text-[13px]">A</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                          {activeClass.students.map((s, idx) => {
                            const dates = view === 'Weekly' ? getWeekDates(currentDate) : view === 'Monthly' ? getMonthDates(activeMonth) : view === 'Semester' ? getSemesterDates() : getDatesInRange(new Date(customRange.start), new Date(customRange.end));
                            const stats = calculateStats(s.id, dates);
                            return (
                              <tr key={s.id} className="hover:bg-indigo-600/[0.025] transition-all group">
                                <td className="p-5 text-center text-slate-600 border border-slate-800/40 text-[12px] font-black">{idx + 1}</td>
                                <td className="p-5 font-black text-slate-200 name-cell-sticky border border-slate-800/40 text-[13px] group-hover:text-indigo-400 transition-colors uppercase tracking-tight leading-tight">{s.name}</td>
                                {dates.map((d, i) => {
                                  const status = attendance[s.id]?.[formatDate(d)];
                                  const colorClass = status ? DARK_STATUS_COLORS[status].split(' ')[0] : 'text-slate-800/20';
                                  return <td key={i} className={`p-3 text-center font-black text-[12px] border border-slate-800/40 ${colorClass}`}>{status || '·'}</td>;
                                })}
                                <td className="p-5 text-center font-black text-emerald-500 border border-slate-800/40 bg-emerald-500/5 print-label-h text-[13px]">{stats.H}</td>
                                <td className="p-5 text-center font-black text-blue-400 border border-slate-800/40 bg-blue-500/5 print-label-s text-[13px]">{stats.S}</td>
                                <td className="p-5 text-center font-black text-amber-500 border border-slate-800/40 bg-amber-500/5 print-label-i text-[13px]">{stats.I}</td>
                                <td className="p-5 text-center font-black text-rose-500 border border-slate-800/40 bg-rose-500/5 print-label-a text-[13px]">{stats.A}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Tanda Tangan Formal PDF */}
                      <div className="print-only hidden mt-32 flex justify-between px-28">
                        <div className="w-[420px] text-center">
                          <p className="mb-36 uppercase font-bold text-[12pt] leading-relaxed tracking-wider">Mengetahui,<br/>Kepala SMA Negeri 11 Makassar</p>
                          <div className="border-b-[3pt] border-black w-full mx-auto pb-3 font-black text-[14pt] uppercase leading-tight tracking-tight">NAMA KEPALA SEKOLAH, M.Pd.<br/><span className="text-[11pt] font-bold tracking-widest">NIP. 19700101 200001 1 001</span></div>
                        </div>
                        <div className="w-[450px] text-center">
                          <p className="mb-36 uppercase font-bold text-[12pt] leading-relaxed tracking-wider">Makassar, {new Date().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}).toUpperCase()}<br/>Guru Mata Pelajaran</p>
                          <div className="border-b-[3pt] border-black w-full mx-auto pb-3 font-black text-[14pt] uppercase leading-tight tracking-tight">{teacherName.toUpperCase()}<br/><span className="text-[11pt] font-bold tracking-widest">NIP. 19800101 201001 2 001</span></div>
                        </div>
                      </div>
                      
                      <div className="print-only hidden mt-20 text-center opacity-40">
                         <p className="text-[10px] font-black uppercase tracking-[0.5em]">Dokumen ini dicetak otomatis pada {new Date().toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Legend Dashboard Footer */}
        <footer className="mt-28 p-16 bg-slate-900/40 rounded-[5rem] border border-slate-800/60 no-print shadow-3xl">
          <h4 className="text-[12px] font-black text-slate-600 uppercase tracking-[0.6em] mb-16 flex items-center gap-8">
            <span className="w-24 h-px bg-indigo-500/30"></span>
            Glosarium & Status Koneksi
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-10 group">
                <span className={`w-24 h-24 flex items-center justify-center rounded-[3rem] font-black border-2 transition-all transform group-hover:scale-110 group-hover:rotate-12 group-hover:shadow-2xl ${DARK_STATUS_COLORS[key as AttendanceStatus]}`}>{key}</span>
                <div>
                  <span className="text-slate-100 text-2xl font-black uppercase block leading-none">{label}</span>
                  <span className="text-slate-600 text-[12px] font-black mt-4 block tracking-[0.3em] uppercase italic">Pilihan: {key}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-28 pt-16 border-t border-slate-800/40 flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
               <div className="w-20 h-20 bg-indigo-600/20 rounded-[2.5rem] flex items-center justify-center border border-indigo-500/40 shadow-2xl relative group cursor-pointer">
                  <div className="absolute inset-0 bg-indigo-500 opacity-0 group-hover:opacity-20 transition-opacity rounded-[2.5rem] animate-ping"></div>
                  <svg className="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
               </div>
               <div>
                  <p className="text-[13px] font-black text-slate-200 uppercase tracking-[0.3em] leading-none mb-3">Mathematics Academic System</p>
                  <p className="text-[11px] text-slate-600 font-bold uppercase tracking-[0.25em]">© 2026 Integrated Information System — {schoolName}</p>
               </div>
            </div>
            <div className="flex items-center gap-10">
               <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.7)] animate-pulse border-2 border-emerald-500/30"></div>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Sistem Sinkron</span>
               </div>
               <span className="w-px h-10 bg-slate-800/60"></span>
               <div className="flex flex-col items-end">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] italic">V5.5.0 STABLE</span>
                  <span className="text-[9px] font-bold text-slate-700 uppercase tracking-widest mt-1">Enterprise Architecture</span>
               </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
