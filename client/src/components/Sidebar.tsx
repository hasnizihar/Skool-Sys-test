import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  GraduationCap,
  ShieldCheck,
  History,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  Smartphone,
  UserCheck,
  Layers,
  School
} from 'lucide-react';
import { MVP_CONFIG } from '../config/mvpConfig';
import './sidebar.css';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const isAdmin = user?.role === 'admin';
  const isClassTeacher = user?.role === 'class_teacher' || isAdmin;
  const isSectionHead = user?.role === 'section_head' || isAdmin;

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNav = (tab: string) => {
    setCurrentTab(tab);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  const navClass = (tab: string) => `nav-item ${currentTab === tab ? 'active' : ''}`;

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          aria-label="Close sidebar overlay"
          className="sidebar-backdrop"
        />
      )}

      <aside
        id="app-sidebar"
        className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''} ${isOpen ? 'open' : ''}`}
        aria-label="Main Navigation"
      >
        <div className="sidebar-header">
          <div className="brand-wrapper" title="Kattankudy Central College">
            <div className="brand-logo-container">
              <img
                src="/kcc-logo.png"
                alt="Kattankudy Central College Emblem"
                className="brand-logo-img"
              />
            </div>
            <div className="brand-info">
              <h2>Kattankudy Central College</h2>
              <p>National School — Kattankudy</p>
            </div>
          </div>

          {/* Desktop Collapse Toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="sidebar-collapse-toggle"
              aria-expanded={!isCollapsed}
              aria-controls="app-sidebar"
              aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight size={16} strokeWidth={2.2} /> : <ChevronLeft size={16} strokeWidth={2.2} />}
            </button>
          )}

          {/* Mobile Close Button */}
          {isOpen && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-icon sidebar-mobile-close"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <nav className="nav-links" aria-label="Primary Navigation">
          {/* SECTION 1: OVERVIEW */}
          <div className="nav-section-title">Overview</div>

          <button
            type="button"
            className={navClass('dashboard')}
            onClick={() => handleNav('dashboard')}
            aria-current={currentTab === 'dashboard' ? 'page' : undefined}
            data-tooltip="Dashboard"
            title={isCollapsed ? 'Dashboard' : undefined}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            <span className="nav-item-label">Dashboard</span>
          </button>

          <button
            type="button"
            className={navClass('classroom-status')}
            onClick={() => handleNav('classroom-status')}
            aria-current={currentTab === 'classroom-status' ? 'page' : undefined}
            data-tooltip="Classroom Status"
            title={isCollapsed ? 'Classroom Status' : undefined}
          >
            <Activity size={18} aria-hidden="true" />
            <span className="nav-item-label">Classroom Status</span>
          </button>

          {isSectionHead && (
            <button
              type="button"
              className={navClass('mobile-classroom-status')}
              onClick={() => handleNav('mobile-classroom-status')}
              aria-current={currentTab === 'mobile-classroom-status' ? 'page' : undefined}
              data-tooltip="Section Walkthrough"
              title={isCollapsed ? 'Section Walkthrough' : undefined}
            >
              <Smartphone size={18} aria-hidden="true" />
              <span className="nav-item-label">Section Walkthrough</span>
            </button>
          )}

          {/* SECTION 2: ATTENDANCE */}
          <div className="nav-section-title">Attendance</div>

          {isClassTeacher && (
            <>
              <button
                type="button"
                className={navClass('attendance')}
                onClick={() => handleNav('attendance')}
                aria-current={currentTab === 'attendance' ? 'page' : undefined}
                data-tooltip="Take Attendance"
                title={isCollapsed ? 'Take Attendance' : undefined}
              >
                <CalendarCheck size={18} aria-hidden="true" />
                <span className="nav-item-label">Student Attendance</span>
              </button>

              <button
                type="button"
                className={navClass('mobile-attendance')}
                onClick={() => handleNav('mobile-attendance')}
                aria-current={currentTab === 'mobile-attendance' ? 'page' : undefined}
                data-tooltip="Mobile Roll-Call"
                title={isCollapsed ? 'Mobile Roll-Call' : undefined}
              >
                <UserCheck size={18} aria-hidden="true" />
                <span className="nav-item-label">Mobile Roll-Call</span>
              </button>
            </>
          )}

          <button
            type="button"
            className={navClass('attendance-reports')}
            onClick={() => handleNav('attendance-reports')}
            aria-current={currentTab === 'attendance-reports' ? 'page' : undefined}
            data-tooltip="Attendance Reports"
            title={isCollapsed ? 'Attendance Reports' : undefined}
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
            <span className="nav-item-label">Attendance Reports</span>
          </button>

          {MVP_CONFIG.ENABLE_EXAM_MARKS_NAV && (
            <button
              type="button"
              className={navClass('marks')}
              onClick={() => handleNav('marks')}
              aria-current={currentTab === 'marks' ? 'page' : undefined}
              data-tooltip="Marks Management"
              title={isCollapsed ? 'Marks Management' : undefined}
            >
              <GraduationCap size={18} aria-hidden="true" />
              <span className="nav-item-label">Marks Management</span>
            </button>
          )}

          {/* SECTION 3: PEOPLE & STRUCTURE */}
          <div className="nav-section-title">People & Structure</div>

          <button
            type="button"
            className={navClass('students')}
            onClick={() => handleNav('students')}
            aria-current={currentTab === 'students' ? 'page' : undefined}
            data-tooltip="Student Records"
            title={isCollapsed ? 'Student Records' : undefined}
          >
            <Users size={18} aria-hidden="true" />
            <span className="nav-item-label">Students</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className={navClass('teachers')}
              onClick={() => handleNav('teachers')}
              aria-current={currentTab === 'teachers' ? 'page' : undefined}
              data-tooltip="Teaching Faculty"
              title={isCollapsed ? 'Teaching Faculty' : undefined}
            >
              <School size={18} aria-hidden="true" />
              <span className="nav-item-label">Teachers</span>
            </button>
          )}

          {(isAdmin || isSectionHead) && (
            <button
              type="button"
              className={navClass('sections')}
              onClick={() => handleNav('sections')}
              aria-current={currentTab === 'sections' ? 'page' : undefined}
              data-tooltip="Sections & Classes"
              title={isCollapsed ? 'Sections & Classes' : undefined}
            >
              <Layers size={18} aria-hidden="true" />
              <span className="nav-item-label">Sections & Classes</span>
            </button>
          )}

          {/* SECTION 4: ADMINISTRATION (Admin Only) */}
          {isAdmin && (
            <>
              <div className="nav-section-title">Administration</div>

              <button
                type="button"
                className={navClass('admin')}
                onClick={() => handleNav('admin')}
                aria-current={currentTab === 'admin' ? 'page' : undefined}
                data-tooltip="User & Role Management"
                title={isCollapsed ? 'User & Role Management' : undefined}
              >
                <ShieldCheck size={18} aria-hidden="true" />
                <span className="nav-item-label">User / Role Management</span>
              </button>

              <button
                type="button"
                className={navClass('audit')}
                onClick={() => handleNav('audit')}
                aria-current={currentTab === 'audit' ? 'page' : undefined}
                data-tooltip="Activity Logs"
                title={isCollapsed ? 'Activity Logs' : undefined}
              >
                <History size={18} aria-hidden="true" />
                <span className="nav-item-label">Activity Logs</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-snippet">
            <div
              className="user-avatar"
              title={`${user?.full_name || 'User'} (${user?.role?.replace('_', ' ') || 'Role'})`}
            >
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="user-details">
              <div className="user-name" title={user?.full_name}>
                {user?.full_name}
              </div>
              <span className="user-role-badge">
                {user?.role?.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="sidebar-actions-row">
            <button
              type="button"
              onClick={onLogout}
              className="btn btn-secondary btn-sm sidebar-logout-btn"
              title="Sign Out"
              aria-label="Sign Out"
              data-tooltip="Sign Out"
            >
              <LogOut size={16} />
              <span className="sidebar-logout-text">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
