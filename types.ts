
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
