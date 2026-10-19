import React from 'react';
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
import { CollegeLogo } from './CollegeLogo';

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

  const handleNav = (tab: string) => {
    setCurrentTab(tab);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          aria-label="Close navigation sidebar"
          className="sidebar-backdrop"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main Navigation">
        {/* College Brand Header */}
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {/* College Logo in White Container on Green Background */}
            <CollegeLogo size={36} inContainer={true} />
            <div className="brand-info">
              <h2>SkoolSys</h2>
              <p>Kattankudy Central College</p>
            </div>
          </div>

          {isOpen && (
            <button
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{
                width: 32,
                height: 32,
                minHeight: 32,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                border: 'none'
              }}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="nav-links">
          <div className="nav-section-title">Core Management</div>

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

          <div className="nav-section-title">Attendance (Daily Register)</div>

          {isClassTeacher && (
            <button
              className={`nav-item ${currentTab === 'attendance' ? 'active' : ''}`}
              onClick={() => handleNav('attendance')}
              aria-current={currentTab === 'attendance' ? 'page' : undefined}
            >
              <CalendarCheck size={18} />
              <span>Take Attendance</span>
              <span className="nav-item-badge">Daily</span>
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

          <div className="nav-section-title">Academics & Exams</div>

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
              <div className="nav-section-title">System & Security</div>

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
                <span>Audit Trail</span>
              </button>
            </>
          )}
        </nav>

        {/* Sidebar Footer with Faculty User Info */}
        <div className="sidebar-footer">
          <div className="user-snippet">
            <div className="user-avatar">
              {user?.full_name?.charAt(0) || 'K'}
            </div>
            <div className="user-details">
              <div className="user-name" title={user?.full_name}>{user?.full_name}</div>
              <span className="user-role-badge">{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
            <button
              onClick={toggleTheme}
              className="btn btn-secondary btn-sm"
              style={{
                flex: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Toggle Light/Dark Theme"
              aria-label={`Toggle Theme. Current is ${theme}`}
            >
              {theme === 'dark' ? <Sun size={14} style={{ color: 'var(--accent)' }} /> : <Moon size={14} />}
              <span style={{ fontSize: '0.75rem' }}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            <button
              onClick={onLogout}
              className="btn btn-secondary btn-sm btn-icon"
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.2)',
                color: '#fca5a5',
                border: '1px solid rgba(220, 38, 38, 0.35)'
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
