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
  Moon,
  Sun,
  X
} from 'lucide-react';
import { SchoolCrest } from './common/SchoolCrest';
import { SCHOOL_PROFILE } from '../config/schoolConfig';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  isOpen,
  onClose,
  theme,
  toggleTheme
}) => {
  const isAdmin = user?.role === 'admin';
  const isClassTeacher = user?.role === 'class_teacher' || isAdmin;

  // Handle ESC key to close mobile sidebar
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
    if (window.innerWidth <= 1024) {
      onClose();
    }
  };

  const cleanFullName = user?.full_name?.replace(/\s*\([^)]*\)/g, '').trim() || user?.username || 'User';

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          aria-label="Close sidebar overlay"
          className="sidebar-backdrop"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main Navigation">
        {/* Brand Header with Authentic KCC Crest */}
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <SchoolCrest size={38} showBorder={true} alt="Kattankudy Central College Crest" />
            <div className="brand-info">
              <h2 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                KCC SkoolSys
              </h2>
              <p style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.78)', margin: '1px 0 0 0' }}>
                Kattankudy Central College
              </p>
              <span
                style={{
                  fontSize: '0.67rem',
                  color: 'var(--kcc-gold)',
                  fontWeight: 600,
                  display: 'block',
                  marginTop: '1px',
                  fontFamily: 'var(--font-tamil)'
                }}
              >
                {SCHOOL_PROFILE.nameTamil}
              </span>
            </div>
          </div>

          {isOpen && (
            <button
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{
                width: 34,
                height: 34,
                minHeight: 34,
                minWidth: 34,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                border: 'none'
              }}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="nav-links">
          <div className="nav-section-title">Academic Operations</div>

          <button
            className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNav('dashboard')}
            aria-current={currentTab === 'dashboard' ? 'page' : undefined}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
            onClick={() => handleNav('students')}
            aria-current={currentTab === 'students' ? 'page' : undefined}
          >
            <Users size={18} />
            <span>Student Records</span>
          </button>

          {isClassTeacher && (
            <button
              className={`nav-item ${currentTab === 'attendance' ? 'active' : ''}`}
              onClick={() => handleNav('attendance')}
              aria-current={currentTab === 'attendance' ? 'page' : undefined}
            >
              <CalendarCheck size={18} />
              <span>Take Attendance</span>
            </button>
          )}

          <button
            className={`nav-item ${currentTab === 'attendance-reports' ? 'active' : ''}`}
            onClick={() => handleNav('attendance-reports')}
            aria-current={currentTab === 'attendance-reports' ? 'page' : undefined}
          >
            <FileSpreadsheet size={18} />
            <span>Attendance Reports</span>
          </button>

          <button
            className={`nav-item ${currentTab === 'marks' ? 'active' : ''}`}
            onClick={() => handleNav('marks')}
            aria-current={currentTab === 'marks' ? 'page' : undefined}
          >
            <GraduationCap size={18} />
            <span>Marks Management</span>
          </button>

          {isAdmin && (
            <>
              <div className="nav-section-title" style={{ marginTop: '0.75rem' }}>
                System Administration
              </div>

              <button
                className={`nav-item ${currentTab === 'admin' ? 'active' : ''}`}
                onClick={() => handleNav('admin')}
                aria-current={currentTab === 'admin' ? 'page' : undefined}
              >
                <ShieldCheck size={18} />
                <span>School Administration</span>
              </button>

              <button
                className={`nav-item ${currentTab === 'audit' ? 'active' : ''}`}
                onClick={() => handleNav('audit')}
                aria-current={currentTab === 'audit' ? 'page' : undefined}
              >
                <History size={18} />
                <span>System Audit Trail</span>
              </button>
            </>
          )}
        </nav>

        {/* Footer with Authenticated User & Controls */}
        <div className="sidebar-footer">
          <div className="user-snippet">
            <div className="user-avatar" title={user.username}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name" title={cleanFullName}>
                {cleanFullName}
              </div>
              <div className="user-role-badge">
                {user.role ? user.role.replace('_', ' ') : 'Faculty'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button
              onClick={toggleTheme}
              className="btn btn-secondary btn-sm"
              style={{
                flex: 1,
                fontSize: '0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>

            <button
              onClick={onLogout}
              className="btn btn-secondary btn-sm"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.25)',
                color: '#FCA5A5',
                border: '1px solid rgba(220, 38, 38, 0.4)'
              }}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
