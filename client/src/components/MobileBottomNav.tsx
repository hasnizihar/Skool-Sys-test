import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  GraduationCap,
  Activity,
  Menu
} from 'lucide-react';
import { MVP_CONFIG } from '../config/mvpConfig';
import './mobileBottomNav.css';

interface MobileBottomNavProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenMore: () => void;
  user: any;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onNavigate,
  onOpenMore,
  user
}) => {
  const isAdmin = user?.role === 'admin';
  const isSectionHead = user?.role === 'section_head' || isAdmin;
  const isClassTeacher = user?.role === 'class_teacher' || isAdmin;
  const attendanceTarget = isClassTeacher ? 'mobile-attendance' : 'attendance-reports';
  const isAttendanceActive = currentTab === 'attendance' || currentTab === 'mobile-attendance' || currentTab === 'attendance-reports';
  const statusTarget = isSectionHead ? 'mobile-classroom-status' : 'classroom-status';
  const isStatusActive = currentTab === 'classroom-status' || currentTab === 'mobile-classroom-status';

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <button
        type="button"
        className={`mobile-nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => onNavigate('dashboard')}
        aria-current={currentTab === 'dashboard' ? 'page' : undefined}
      >
        <LayoutDashboard size={20} aria-hidden="true" />
        <span>Home</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${currentTab === 'students' ? 'active' : ''}`}
        onClick={() => onNavigate('students')}
        aria-current={currentTab === 'students' ? 'page' : undefined}
      >
        <Users size={20} aria-hidden="true" />
        <span>Students</span>
      </button>

      <button
        type="button"
        className={`mobile-nav-btn ${isAttendanceActive ? 'active' : ''}`}
        onClick={() => onNavigate(attendanceTarget)}
        aria-current={isAttendanceActive ? 'page' : undefined}
      >
        <CalendarCheck size={20} aria-hidden="true" />
        <span>Register</span>
      </button>

      {MVP_CONFIG.ENABLE_EXAM_MARKS_NAV ? (
        <button
          type="button"
          className={`mobile-nav-btn ${currentTab === 'marks' ? 'active' : ''}`}
          onClick={() => onNavigate('marks')}
          aria-current={currentTab === 'marks' ? 'page' : undefined}
        >
          <GraduationCap size={20} aria-hidden="true" />
          <span>Marks</span>
        </button>
      ) : (
        <button
          type="button"
          className={`mobile-nav-btn ${isStatusActive ? 'active' : ''}`}
          onClick={() => onNavigate(statusTarget)}
          aria-current={isStatusActive ? 'page' : undefined}
        >
          <Activity size={20} aria-hidden="true" />
          <span>Live Status</span>
        </button>
      )}

      <button
        type="button"
        className={`mobile-nav-btn ${['admin', 'audit', 'teachers', 'sections'].includes(currentTab) ? 'active' : ''}`}
        onClick={onOpenMore}
        aria-label="More navigation options"
      >
        <Menu size={20} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
};
