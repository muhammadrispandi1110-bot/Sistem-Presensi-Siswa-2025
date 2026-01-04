
export type AttendanceStatus = 'H' | 'A' | 'S' | 'I';

export interface Student {
  id: string;
  nis: string;
  nisn: string;
  name: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
}

export interface ClassData {
  id: string;
  name: string;
  students: Student[];
}

export interface AttendanceRecord {
  [studentId: string]: {
    [date: string]: AttendanceStatus;
  };
}

export type ViewType = 'Daily' | 'Weekly' | 'Monthly' | 'Semester' | 'Custom' | 'Assignments';

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  'H': 'Hadir',
  'S': 'Sakit',
  'I': 'Izin',
  'A': 'Alpa'
};
