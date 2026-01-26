
export const MONTHS_2026 = [
  { name: 'Januari', value: 0, days: 31 },
  { name: 'Februari', value: 1, days: 28 },
  { name: 'Maret', value: 2, days: 31 },
  { name: 'April', value: 3, days: 30 },
  { name: 'Mei', value: 4, days: 31 },
  { name: 'Juni', value: 5, days: 30 },
  { name: 'Juli', value: 6, days: 31 },
  { name: 'Agustus', value: 7, days: 31 },
  { name: 'September', value: 8, days: 30 },
  { name: 'Oktober', value: 9, days: 31 },
  { name: 'November', value: 10, days: 30 },
  { name: 'Desember', value: 11, days: 31 },
];

/**
 * Mengubah objek Date menjadi string format YYYY-MM-DD menggunakan waktu lokal.
 */
export const formatDate = (date: Date): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isFutureDate = (date: Date): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check > today;
};

export const getDatesInRange = (startDate: Date, endDate: Date, schedule?: number[]): Date[] => {
  const dates = [];
  let currentDate = new Date(startDate);
  currentDate.setHours(0,0,0,0);
  const lastDate = new Date(endDate);
  lastDate.setHours(0,0,0,0);

  const activeDays = schedule && schedule.length > 0 ? schedule : [1, 2, 3, 4, 5];

  while (currentDate <= lastDate) {
    const dayOfWeek = currentDate.getDay();
    if (activeDays.includes(dayOfWeek)) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

export const getMonthDates = (monthIndex: number, schedule?: number[]): Date[] => {
  const startDate = new Date(2026, monthIndex, 1);
  const endDate = new Date(2026, monthIndex + 1, 0);
  return getDatesInRange(startDate, endDate, schedule);
};

export const getWeekDates = (baseDate: Date, schedule?: number[]): Date[] => {
  const d = new Date(baseDate);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return getDatesInRange(monday, friday, schedule);
};

/**
 * Semester 1 (Ganjil): Juli (6) - Desember (11)
 * Semester 2 (Genap): Januari (0) - Juni (5)
 */
export const getSemesterDates = (semester: number = 1, schedule?: number[]): Date[] => {
  const startMonth = semester === 1 ? 6 : 0;
  const endMonth = semester === 1 ? 11 : 5;
  const start = new Date(2026, startMonth, 1);
  const end = new Date(2026, endMonth + 1, 0);
  return getDatesInRange(start, end, schedule);
};

export const getNextTeachingDate = (date: Date, schedule: number[], direction: 'next' | 'prev'): Date => {
  const activeDays = schedule && schedule.length > 0 ? schedule : [1, 2, 3, 4, 5];
  let checkDate = new Date(date);
  checkDate.setHours(0,0,0,0);
  
  for (let i = 0; i < 7; i++) {
    checkDate.setDate(checkDate.getDate() + (direction === 'next' ? 1 : -1));
    if (activeDays.includes(checkDate.getDay())) {
      return checkDate;
    }
  }
  return date;
};
