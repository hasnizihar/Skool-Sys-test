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
  School
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
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="brand-badge">
          <School size={22} />
        </div>
        <div className="brand-info">
          <h2>SkoolSys</h2>
          <p>Grades 6–13 Portal</p>
        </div>
      </div>

      <nav className="nav-links">
        <div className="nav-section-title">Core Management</div>

        <button
          className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNav('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'students' ? 'active' : ''}`}
          onClick={() => handleNav('students')}
        >
          <Users size={18} />
          <span>Student Records</span>
        </button>

        <div className="nav-section-title">Attendance (Daily Register)</div>

        {isClassTeacher && (
          <button
            className={`nav-item ${currentTab === 'attendance' ? 'active' : ''}`}
            onClick={() => handleNav('attendance')}
          >
            <CalendarCheck size={18} />
            <span>Take Attendance</span>
          </button>
        )}

        <button
          className={`nav-item ${currentTab === 'attendance-reports' ? 'active' : ''}`}
          onClick={() => handleNav('attendance-reports')}
        >
          <FileSpreadsheet size={18} />
          <span>Attendance Reports</span>
        </button>

        <div className="nav-section-title">Academics & Exams</div>

        <button
          className={`nav-item ${currentTab === 'marks' ? 'active' : ''}`}
          onClick={() => handleNav('marks')}
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
            >
              <ShieldCheck size={18} />
              <span>School Administration</span>
            </button>

            <button
              className={`nav-item ${currentTab === 'audit' ? 'active' : ''}`}
              onClick={() => handleNav('audit')}
            >
              <History size={18} />
              <span>Audit Trail</span>
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
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            onClick={onLogout}
            className="btn btn-secondary btn-sm btn-icon"
            title="Sign Out"
            style={{ color: '#ef4444' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
