import React, { useState, useEffect, useRef } from 'react';
import { getCurrentUser, clearAuthSession, api } from './api/client';
import { Login } from './pages/Login';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { OfflineBanner } from './components/OfflineBanner';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Attendance } from './pages/Attendance';
import { AttendanceReports } from './pages/AttendanceReports';
import { AdminSettings } from './pages/AdminSettings';
import { SchoolSettings } from './pages/SchoolSettings';
import { UserProfile } from './pages/UserProfile';
import { AuditLogs } from './pages/AuditLogs';
import { ClassroomStatusMonitoring } from './pages/ClassroomStatusMonitoring';
import { MobileClassroomStatus } from './pages/MobileClassroomStatus';
import { MobileSequentialAttendance } from './pages/MobileSequentialAttendance';
import { Teachers } from './pages/Teachers';
import { getUnsyncedWorkSummary, clearCachedRostersForUser } from './api/offlineQueue';
import { ToastProvider } from './ui';
import { isUserSectionHead } from './utils/authUtils';
import { ErrorState, PageContainer } from './ui/mantine';
import { MobileBottomNav } from './components/MobileBottomNav';

const VALID_TABS = [
  'dashboard',
  'students',
  'teachers',
  'sections',
  'attendance',
  'mobile-attendance',
  'attendance-reports',
  'classroom-status',
  'mobile-classroom-status',
  'admin',
  'settings',
  'profile',
  'audit'
];

function getInitialTab(): string {
  const hash = window.location.hash.replace('#/', '').replace('#', '').trim();
  return VALID_TABS.includes(hash) ? hash : 'dashboard';
}

export function App() {
  const [user, setUser] = useState<any | null>(getCurrentUser());
  const [currentTab, setCurrentTab] = useState<string>(getInitialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('skoolsys_sidebar_collapsed') === 'true';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('skoolsys_theme') as 'light' | 'dark') || 'light';
  });

  // Navigation guard reference for unsubmitted attendance pop-up
  const navGuardRef = useRef<((targetTab: string) => boolean) | null>(null);

  const handleNavigate = (targetTab: string) => {
    if (targetTab === currentTab) return;
    if (navGuardRef.current) {
      const allow = navGuardRef.current(targetTab);
      if (!allow) {
        // Navigation was intercepted by unsubmitted register pop-up
        window.location.hash = `/${currentTab}`;
        return;
      }
    }
    setCurrentTab(targetTab);
  };

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('skoolsys_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    window.location.hash = `/${currentTab}`;
  }, [currentTab]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '').trim();
      if (VALID_TABS.includes(hash)) {
        handleNavigate(hash);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [currentTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mantine-color-scheme', theme);
    localStorage.setItem('skoolsys_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleAuthInvalid = () => {
      setUser(null);
    };
    window.addEventListener('auth-invalid', handleAuthInvalid);

    // Verify session if user exists
    if (user) {
      api.getMe().then((res) => {
        if (res.user) setUser(res.user);
      }).catch(() => {
        // Keep local user if network is down
      });
    }

    return () => {
      window.removeEventListener('auth-invalid', handleAuthInvalid);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleLogout = async () => {
    if (user?.id) {
      try {
        const summary = await getUnsyncedWorkSummary(user.id);
        if (summary.hasUnsyncedWork) {
          const breakdown: string[] = [];
          if (summary.pending > 0) breakdown.push(`${summary.pending} pending sync`);
          if (summary.conflicted > 0) breakdown.push(`${summary.conflicted} conflict(s) awaiting resolution`);
          if (summary.rejected > 0) breakdown.push(`${summary.rejected} rejected record(s)`);
          if (summary.staleReviewRequired > 0) breakdown.push(`${summary.staleReviewRequired} aged record(s) requiring review (>7d)`);
          if (summary.syncing > 0) breakdown.push(`${summary.syncing} in-flight sync operation(s)`);
          if (summary.quarantined > 0) breakdown.push(`${summary.quarantined} quarantined legacy record(s)`);

          const proceed = window.confirm(
            `Notice: Unsynced attendance records are stored locally on this computer:\n\n` +
            breakdown.map((b) => ` • ${b}`).join('\n') +
            `\n\nTotal: ${summary.total} unsynced item(s).\n\n` +
            `These records are securely partitioned for user "${user.username}" and will be retained without data loss.\n` +
            `They will NOT sync to the school server until you log in again.\n\n` +
            `Do you wish to proceed with logout?`
          );
          if (!proceed) return;
        }
        await clearCachedRostersForUser(user.id);
      } catch (err) {
        console.warn('Error during logout offline cleanup:', err);
      }
    }
    clearAuthSession();
    setUser(null);
    setCurrentTab('dashboard');
  };

  if (!user) {
    return <Login onLoginSuccess={(u) => setUser(u)} />;
  }

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard': return 'School Operations Dashboard';
      case 'students': return 'Student Information Records';
      case 'teachers': return 'Faculty & Teachers Directory';
      case 'sections': return 'School Sections & Classroom Assignments';
      case 'attendance': return 'Daily Attendance Register';
      case 'mobile-attendance': return 'Mobile Sequential Student Roll-Call';
      case 'attendance-reports': return 'Attendance Reports & Registry';
      case 'classroom-status': return 'Live Classroom Status Monitoring';
      case 'mobile-classroom-status': return 'Section Head Walkthrough';
      case 'admin': return 'School Administration & Security';
      case 'settings': return 'School Settings & Configuration';
      case 'profile': return 'User Profile & Account Security';
      case 'audit': return 'System Audit Trail';
      default: return 'SkoolSys Management Portal';
    }
  };

  return (
    <ToastProvider>
      <div className="app-container">
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={handleNavigate}
          user={user}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          theme={theme}
          toggleTheme={toggleTheme}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />

        <div className="main-wrapper">
          <OfflineBanner />

          <Navbar
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            title={getPageTitle()}
            currentTab={currentTab}
            onNavigate={handleNavigate}
            user={user}
            theme={theme}
            toggleTheme={toggleTheme}
          />

          <main className="page-container">
            {currentTab === 'dashboard' && (
              <Dashboard onNavigate={handleNavigate} user={user} />
            )}
            {currentTab === 'students' && (
              <Students user={user} />
            )}
            {currentTab === 'teachers' && (
              user.role === 'admin' ? (
                <Teachers user={user} onNavigate={handleNavigate} />
              ) : (
                <PageContainer>
                  <ErrorState
                    title="Administrative Access Required"
                    message="The comprehensive Faculty and Teachers Directory is restricted to authorized school administrators."
                    onRetry={() => handleNavigate('dashboard')}
                    retryLabel="Return to Dashboard"
                  />
                </PageContainer>
              )
            )}
            {currentTab === 'sections' && (
              <AdminSettings initialTab="sections" />
            )}
            {currentTab === 'attendance' && (
              <Attendance
                user={user}
                onNavigate={handleNavigate}
                registerNavGuard={(guard) => { navGuardRef.current = guard; }}
              />
            )}
            {currentTab === 'mobile-attendance' && (
              <MobileSequentialAttendance
                user={user}
                onNavigate={handleNavigate}
                registerNavGuard={(guard) => { navGuardRef.current = guard; }}
              />
            )}
            {currentTab === 'attendance-reports' && (
              <AttendanceReports />
            )}
            {currentTab === 'classroom-status' && (
              <ClassroomStatusMonitoring user={user} onNavigate={handleNavigate} />
            )}
            {currentTab === 'mobile-classroom-status' && (
              isUserSectionHead(user) ? (
                <MobileClassroomStatus user={user} onNavigate={handleNavigate} />
              ) : (
                <PageContainer>
                  <ErrorState
                    title="Section Head Access Restricted"
                    message="You do not currently have assigned school sections. The Section Walkthrough tool is restricted to assigned Section Heads and the Principal."
                    onRetry={() => handleNavigate('dashboard')}
                    retryLabel="Return to Dashboard"
                  />
                </PageContainer>
              )
            )}
            {currentTab === 'admin' && user.role === 'admin' && (
              <AdminSettings />
            )}
            {currentTab === 'settings' && (
              user.role === 'admin' ? (
                <SchoolSettings user={user} onNavigate={handleNavigate} />
              ) : (
                <PageContainer>
                  <ErrorState
                    title="Administrative Access Required"
                    message="Institutional school settings, Ministry of Education metadata, and daily timetable schedules are restricted to authorized school administrators."
                    onRetry={() => handleNavigate('dashboard')}
                    retryLabel="Return to Dashboard"
                  />
                </PageContainer>
              )
            )}
            {currentTab === 'profile' && (
              <UserProfile user={user} onUpdateUser={setUser} onNavigate={handleNavigate} />
            )}
            {currentTab === 'audit' && user.role === 'admin' && (
              <AuditLogs />
            )}
          </main>

          <MobileBottomNav
            currentTab={currentTab}
            onNavigate={handleNavigate}
            onOpenMore={() => setSidebarOpen(true)}
            user={user}
          />
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
