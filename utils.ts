
export const MONTHS_2026 = [
  { name: 'Januari', value: 0, days: 31 },
  { name: 'Februari', value: 1, days: 28 },
  { name: 'Maret', value: 2, days: 31 },
  { name: 'April', value: 3, days: 30 },
  { name: 'Mei', value: 4, days: 31 },
  { name: 'Juni', value: 5, days: 30 },
];

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
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

  // Jika jadwal tidak ada, gunakan default Senin-Jumat (1,2,3,4,5)
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
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(baseDate.getFullYear(), baseDate.getMonth(), diff);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  return getDatesInRange(monday, friday, schedule);
};

export const getSemesterDates = (schedule?: number[]): Date[] => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 30);
  return getDatesInRange(start, end, schedule);
};

export const getNextTeachingDate = (date: Date, schedule: number[], direction: 'next' | 'prev'): Date => {
  const activeDays = schedule && schedule.length > 0 ? schedule : [1, 2, 3, 4, 5];
  let checkDate = new Date(date);
  
  // Maksimal cari dalam 7 hari untuk menghindari infinite loop
  for (let i = 0; i < 7; i++) {
    checkDate.setDate(checkDate.getDate() + (direction === 'next' ? 1 : -1));
    if (activeDays.includes(checkDate.getDay())) {
      return checkDate;
    }
  }
  return date;
};
