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
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
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

          {/* SECTION 2: STUDENTS */}
          <div className="nav-section-title">Students</div>

          <button
            type="button"
            className={navClass('students')}
            onClick={() => handleNav('students')}
            aria-current={currentTab === 'students' ? 'page' : undefined}
            data-tooltip="Student Records"
            title={isCollapsed ? 'Student Records' : undefined}
          >
            <Users size={18} aria-hidden="true" />
            <span className="nav-item-label">Student Records</span>
          </button>

          {/* SECTION 3: ACADEMICS */}
          <div className="nav-section-title">Academics</div>

          {isClassTeacher && (
            <button
              type="button"
              className={navClass('attendance')}
              onClick={() => handleNav('attendance')}
              aria-current={currentTab === 'attendance' ? 'page' : undefined}
              data-tooltip="Take Attendance"
              title={isCollapsed ? 'Take Attendance' : undefined}
            >
              <CalendarCheck size={18} aria-hidden="true" />
              <span className="nav-item-label">Take Attendance</span>
            </button>
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

          {/* SECTION 4: ADMINISTRATION (Admin Only) */}
          {isAdmin && (
            <>
              <div className="nav-section-title">Administration</div>

              <button
                type="button"
                className={navClass('admin')}
                onClick={() => handleNav('admin')}
                aria-current={currentTab === 'admin' ? 'page' : undefined}
                data-tooltip="School Administration"
                title={isCollapsed ? 'School Administration' : undefined}
              >
                <ShieldCheck size={18} aria-hidden="true" />
                <span className="nav-item-label">School Administration</span>
              </button>

              <button
                type="button"
                className={navClass('audit')}
                onClick={() => handleNav('audit')}
                aria-current={currentTab === 'audit' ? 'page' : undefined}
                data-tooltip="Audit Trail"
                title={isCollapsed ? 'Audit Trail' : undefined}
              >
                <History size={18} aria-hidden="true" />
                <span className="nav-item-label">Audit Trail</span>
              </button>

              <button
                type="button"
                className={navClass('design-system')}
                onClick={() => handleNav('design-system')}
                aria-current={currentTab === 'design-system' ? 'page' : undefined}
                data-tooltip="UI Primitives Preview"
                title={isCollapsed ? 'UI Primitives Preview' : undefined}
              >
                <Sparkles size={18} aria-hidden="true" />
                <span className="nav-item-label">UI Primitives Preview</span>
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
