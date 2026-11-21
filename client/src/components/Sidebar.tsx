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

interface NavItemDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  visible: boolean;
  badge?: string;
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
  const isClassTeacher = isUserClassTeacher(user);
  const isSectionHead = isUserSectionHead(user);

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
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const navClass = (tab: string) => `nav-item ${currentTab === tab ? 'active' : ''}`;

  // Grouped Navigation Structure
  const navigationSections: Array<{
    title: string;
    items: NavItemDef[];
  }> = [
    {
      title: 'Overview',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          visible: true
        }
      ]
    },
    {
      title: 'Students',
      items: [
        {
          id: 'students',
          label: 'Student Records',
          icon: Users,
          visible: true
        }
      ]
    },
    {
      title: 'Academics',
      items: [
        {
          id: 'attendance',
          label: 'Take Attendance',
          icon: CalendarCheck,
          visible: isClassTeacher
        },
        {
          id: 'attendance-reports',
          label: 'Attendance Reports',
          icon: FileSpreadsheet,
          visible: true
        },
        {
          id: 'marks',
          label: 'Marks Management',
          icon: GraduationCap,
          visible: true
        }
      ]
    },
    {
      title: 'Live Tracking',
      items: [
        {
          id: 'classroom-status',
          label: 'Classroom Status',
          icon: Activity,
          visible: true
        },
        {
          id: 'mobile-classroom-status',
          label: 'Section Walkthrough',
          icon: Smartphone,
          visible: isSectionHead
        }
      ]
    },
    {
      title: 'Administration',
      items: [
        {
          id: 'teachers',
          label: 'Teachers & Faculty',
          icon: GraduationCap,
          visible: isAdmin
        },
        {
          id: 'admin',
          label: 'School Administration',
          icon: ShieldCheck,
          visible: isAdmin
        },
        {
          id: 'audit',
          label: 'Audit Trail',
          icon: History,
          visible: isAdmin
        }
      ]
    }
  ];

  const userInitial = user?.full_name?.charAt(0)?.toUpperCase() || 'U';
  const roleDisplay = user?.role ? user.role.replace('_', ' ') : 'Faculty';

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
        {/* Brand Header */}
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
              <p>National School — Census 07166</p>
            </div>
          </div>

          {/* Desktop Collapse Toggle */}
          {onToggleCollapse && (
            <Tooltip
              label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              position="right"
              withArrow
              disabled={isOpen}
            >
              <button
                type="button"
                onClick={onToggleCollapse}
                className="sidebar-collapse-toggle"
                aria-expanded={!isCollapsed}
                aria-controls="app-sidebar"
                aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
              >
                {isCollapsed ? (
                  <ChevronRight size={16} strokeWidth={2.2} />
                ) : (
                  <ChevronLeft size={16} strokeWidth={2.2} />
                )}
              </button>
            </Tooltip>
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

        {/* Primary Navigation Links */}
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
                <span className="nav-item-label">Take Attendance</span>
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

          {/* SECTION 4: LIVE OPERATIONS (PHASE 2) */}
          <div className="nav-section-title">Live Tracking</div>

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
            </>
          )}
        </nav>

        {/* User Profile & Sign Out Footer */}
        <div className="sidebar-footer">
          <div className="user-snippet">
            <Tooltip
              label={`${user?.full_name || 'User'} (${roleDisplay})`}
              position="right"
              disabled={!isCollapsed}
              withArrow
            >
              <div
                className="user-avatar"
                title={`${user?.full_name || 'User'} (${roleDisplay})`}
              >
                {userInitial}
              </div>
            </Tooltip>

            <div className="user-details">
              <div className="user-name" title={user?.full_name}>
                {user?.full_name}
              </div>
              <span className="user-role-badge">
                {roleDisplay}
              </span>
            </div>
          </div>

          <div className="sidebar-actions-row">
            <Tooltip
              label="Sign Out"
              position="right"
              disabled={!isCollapsed}
              withArrow
            >
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
            </Tooltip>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
