/**
 * Kattankudy Central College — Official Institutional Configuration
 * Centralized school profile and identity baseline for SkoolSys 2.0 MVP.
 *
 * Source: Ministry of Education (MOE) Sri Lanka Census No. 14145
 * National School Baseline (1AB) • Batticaloa Central Educational Zone
 */

export interface SchoolProfile {
  name: string;
  nameTamil: string;
  secondaryTitle: string;
  systemTitle: string;
  systemVersion: string;
  type: string;
  censusNo: string;
  crestUrl: string;
  address: {
    line1: string;
    line2: string;
    district: string;
    province: string;
    country: string;
    full: string;
  };
  zone: string;
  division: string;
  supportedGrades: string;
  academicStructure: {
    junior: string;
    ol: string;
    al: string;
  };
  medium: string;
  studentCategory: string;
  studentCategoryNote: string;
  principalName: string;
  principalSpellingNote: string;
  emblemStatus: 'pending' | 'verified';
  emblemPendingNote: string;
  demoResultNotice: string;
}

export const SCHOOL_PROFILE: SchoolProfile = {
  name: 'Kattankudy Central College',
  nameTamil: 'காத்தான்குடி மத்திய கல்லூரி',
  secondaryTitle: 'National School — Kattankudy',
  systemTitle: 'SkoolSys 2.0 — School Management System',
  systemVersion: '2.0.0-mvp',
  type: 'National School, 1AB',
  censusNo: '14145',
  crestUrl: '/school-logo.jpg',
  address: {
    line1: 'No. 322, Beach Road',
    line2: 'New Kattankudy 06',
    district: 'Batticaloa District',
    province: 'Eastern Province',
    country: 'Sri Lanka',
    full: 'No. 322, Beach Road, New Kattankudy 06, Batticaloa District, Eastern Province, Sri Lanka.'
  },
  zone: 'Batticaloa Central',
  division: 'Kattankudy',
  supportedGrades: 'Grades 6–13',
  academicStructure: {
    junior: 'Grades 6–9: Junior Secondary',
    ol: 'Grades 10–11: G.C.E. Ordinary Level',
    al: 'Grades 12–13: G.C.E. Advanced Level (Science, Commerce, Arts, Technology)'
  },
  medium: 'Tamil / English',
  studentCategory: 'Boys',
  studentCategoryNote:
    'Ministry of Education records classify Kattankudy Central College as Boys. The demonstration population reflects this classification. Admissions policy should be formally reconfirmed with school leadership before production data import.',
  principalName: 'Mr. A. L. M. Sabry',
  principalSpellingNote:
    'Exact formal spelling of the Principal’s name (e.g. A. L. M. Sabry / A. L. Sabry / L. M. Sabri) requires formal school confirmation prior to issuing official external correspondence.',
  emblemStatus: 'verified',
  emblemPendingNote:
    'Official school crest verified from Kattankudy Central College administration archives. Original circular composition with gold ribbon, Tamil lettering, crescent and star.',
  demoResultNotice: 'DEMONSTRATION — NOT AN OFFICIAL SCHOOL RESULT'
};
