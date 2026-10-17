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

export function App() {
  const [user, setUser] = useState<any | null>(getCurrentUser());
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('skoolsys_theme') as 'light' | 'dark') || 'light';
  });

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

  const handleLogout = () => {
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
      case 'attendance': return 'Daily Attendance Register';
      case 'attendance-reports': return 'Attendance Reports & Registry';
      case 'marks': return 'Examination Marks & Reports';
      case 'admin': return 'School Administration & Security';
      case 'audit': return 'System Audit Trail';
      default: return 'SkoolSys Management Portal';
    }
  };

  return (
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
  );
}

export default App;
