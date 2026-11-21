const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('server/skoolsys.db');

console.log('--- TIMETABLE SETTINGS ---');
console.log(db.prepare('SELECT * FROM timetable_settings').all());

console.log('--- SCHOOL PERIODS SCHEMA ---');
console.log(db.prepare('PRAGMA table_info(school_periods)').all());

console.log('--- SCHOOL PERIODS ROWS ---');
console.log(db.prepare('SELECT * FROM school_periods ORDER BY period_number').all());

console.log('--- DATABASE ENTITY COUNTS ---');
console.log({
  students: db.prepare('SELECT COUNT(*) as c FROM students').get().c,
  classes: db.prepare('SELECT COUNT(*) as c FROM classes').get().c,
  sections: db.prepare('SELECT COUNT(*) as c FROM sections').get().c,
  assignments: db.prepare('SELECT COUNT(*) as c FROM teacher_assignments').get().c,
  attendance_sessions: db.prepare('SELECT COUNT(*) as c FROM attendance_sessions').get().c,
  attendance_records: db.prepare('SELECT COUNT(*) as c FROM attendance_records').get().c,
  users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  audit_logs: db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c
});

db.close();
