
export type AttendanceStatus = 'H' | 'A' | 'S' | 'I';

export interface Student {
  id: string;
  nis: string;
  nisn: string;
  name: string;
}

export interface SubmissionData {
  isSubmitted: boolean;
  score: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  submissions: { [studentId: string]: SubmissionData };
}

export interface ClassData {
  id: string;
  name: string;
  students: Student[];
  assignments?: Assignment[];
  schedule?: number[]; // 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat
}

export interface AttendanceRecord {
  [studentId: string]: {
    [date: string]: AttendanceStatus;
  };
}

export type ViewType = 'Daily' | 'Reports' | 'Assignments' | 'Admin';

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  'H': 'Hadir',
  'S': 'Sakit',
  'I': 'Izin',
  'A': 'Alpa'
};

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
