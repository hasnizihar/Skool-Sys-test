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
  School,
  X,
  Sparkles
} from 'lucide-react';

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
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          aria-label="Close sidebar"
          className="sidebar-backdrop"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main Navigation">
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="brand-badge">
              <School size={22} />
            </div>
            <div className="brand-info">
              <h2 style={{ fontSize: '0.95rem', lineHeight: 1.25 }}>Kattankudy Central College</h2>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>National School — Kattankudy</p>
              <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 600, display: 'block' }}>காத்தான்குடி மத்திய கல்லூரி</span>
            </div>
          </div>

          {isOpen && (
            <button
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{ width: 32, height: 32, minHeight: 32 }}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          )}
        </div>

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

              <button
                className={`nav-item ${currentTab === 'design-system' ? 'active' : ''}`}
                onClick={() => handleNav('design-system')}
                aria-current={currentTab === 'design-system' ? 'page' : undefined}
              >
                <Sparkles size={18} />
                <span>UI Primitives Preview</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-snippet">
            <div className="user-avatar">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="user-details">
              <div className="user-name" title={user?.full_name}>{user?.full_name}</div>
              <span className="user-role-badge">{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            <button
              onClick={toggleTheme}
              className="btn btn-secondary btn-sm"
              style={{ flex: 1 }}
              title="Toggle Light/Dark Theme"
              aria-label={`Toggle Theme. Current is ${theme}`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <button
              onClick={onLogout}
              className="btn btn-secondary btn-sm btn-icon"
              title="Sign Out"
              aria-label="Sign Out"
              style={{ color: 'var(--absent)' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
