import React, { useState, useEffect } from 'react';
import { getCurrentUser, clearAuthSession, api } from './api/client';
import { Login } from './pages/Login';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { OfflineBanner } from './components/OfflineBanner';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Attendance } from './pages/Attendance';
import { AttendanceReports } from './pages/AttendanceReports';
import { MarksEntry } from './pages/MarksEntry';
import { AdminSettings } from './pages/AdminSettings';
import { AuditLogs } from './pages/AuditLogs';
import { ToastProvider } from './components/common/Toast';
import { getUnsyncedWorkSummary, clearCachedRostersForUser } from './api/offlineQueue';

const VALID_TABS = ['dashboard', 'students', 'attendance', 'attendance-reports', 'marks', 'admin', 'audit'];

function getInitialTab(): string {
  const hash = window.location.hash.replace('#/', '').replace('#', '').trim();
  return VALID_TABS.includes(hash) ? hash : 'dashboard';
}

export function App() {
  const [user, setUser] = useState<any | null>(getCurrentUser());
  const [currentTab, setCurrentTab] = useState<string>(getInitialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('skoolsys_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    window.location.hash = `/${currentTab}`;
  }, [currentTab]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '').trim();
      if (VALID_TABS.includes(hash)) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
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
    return (
      <ToastProvider>
        <Login onLoginSuccess={(u) => setUser(u)} />
      </ToastProvider>
    );
  }

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard': return 'School Operations Dashboard';
      case 'students': return 'Student Information Records';
      case 'attendance': return 'Daily Attendance Register';
      case 'attendance-reports': return 'Attendance Reports & Registry';
      case 'marks': return 'Examination Marks & Reports';
      case 'admin': return 'School Administration & Security';
      case 'audit': return 'System Audit Trail';
      default: return 'SkoolSys Management Portal';
    }
  };

  return (
    <ToastProvider>
      <div className="app-container">
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          user={user}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        <div className="main-wrapper">
          <OfflineBanner />

          <Navbar
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            title={getPageTitle()}
            user={user}
            theme={theme}
            toggleTheme={toggleTheme}
          />

          <main className="page-container">
            {currentTab === 'dashboard' && (
              <Dashboard onNavigate={setCurrentTab} user={user} />
            )}
            {currentTab === 'students' && (
              <Students user={user} />
            )}
            {currentTab === 'attendance' && (
              <Attendance user={user} />
            )}
            {currentTab === 'attendance-reports' && (
              <AttendanceReports />
            )}
            {currentTab === 'marks' && (
              <MarksEntry user={user} />
            )}
            {currentTab === 'admin' && user.role === 'admin' && (
              <AdminSettings />
            )}
            {currentTab === 'audit' && user.role === 'admin' && (
              <AuditLogs />
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
