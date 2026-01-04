
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

export const getDatesInRange = (startDate: Date, endDate: Date): Date[] => {
  const dates = [];
  let currentDate = new Date(startDate);
  currentDate.setHours(0,0,0,0);
  const lastDate = new Date(endDate);
  lastDate.setHours(0,0,0,0);

  while (currentDate <= lastDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

export const getMonthDates = (monthIndex: number): Date[] => {
  const startDate = new Date(2026, monthIndex, 1);
  const endDate = new Date(2026, monthIndex + 1, 0);
  return getDatesInRange(startDate, endDate);
};

export const getWeekDates = (baseDate: Date): Date[] => {
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(baseDate.getFullYear(), baseDate.getMonth(), diff);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
};

export const getSemesterDates = (): Date[] => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 30);
  return getDatesInRange(start, end);
};
