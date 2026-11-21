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
  UserCheck
} from 'lucide-react';
import { Tooltip, Badge } from '@mantine/core';
import { isUserSectionHead, isUserClassTeacher } from '../utils/authUtils';
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
          {navigationSections.map((sec, secIdx) => {
            const visibleItems = sec.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;

            return (
              <React.Fragment key={sec.title || secIdx}>
                <div className="nav-section-title">{sec.title}</div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;

                  const buttonElement = (
                    <button
                      type="button"
                      className={navClass(item.id)}
                      onClick={() => handleNav(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      data-tooltip={item.label}
                    >
                      <Icon size={18} aria-hidden={true} strokeWidth={isActive ? 2.2 : 1.9} />
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge && (
                        <Badge size="xs" variant="light" color="refinedBlue">
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );

                  if (isCollapsed) {
                    return (
                      <Tooltip
                        key={item.id}
                        label={item.label}
                        position="right"
                        withArrow
                        offset={12}
                      >
                        {buttonElement}
                      </Tooltip>
                    );
                  }

                  return <React.Fragment key={item.id}>{buttonElement}</React.Fragment>;
                })}
              </React.Fragment>
            );
          })}
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
