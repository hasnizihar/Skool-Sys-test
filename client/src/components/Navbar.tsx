import React, { useState, useEffect, useCallback } from 'react';
import {
  Menu,
  ShieldCheck,
  WifiOff,
  Sun,
  Moon,
  Calendar,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import { getUnsyncedWorkSummary, UnsyncedWorkSummary } from '../api/offlineQueue';
import './navbar.css';

interface NavbarProps {
  onToggleSidebar: () => void;
  title: string;
  currentTab?: string;
  onNavigate?: (tab: string) => void;
  user: any;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleSidebar,
  title,
  currentTab = 'dashboard',
  onNavigate,
  user,
  theme,
  toggleTheme
}) => {
  const [currentDateStr] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  });

  const [nodeStatus, setNodeStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [academicPeriodStr, setAcademicPeriodStr] = useState<string>('Academic Year 2026 • Assessment Period');
  const [syncSummary, setSyncSummary] = useState<UnsyncedWorkSummary | null>(null);

  // Poll real IndexedDB offline queue state without duplicating sources
  const refreshSyncState = useCallback(async () => {
    if (!user?.id) {
      setSyncSummary(null);
      return;
    }
    try {
      const summary = await getUnsyncedWorkSummary(user.id);
      setSyncSummary(summary);
    } catch {
      // IndexedDB might be initializing
    }
  }, [user]);

  useEffect(() => {
    refreshSyncState();
    const interval = setInterval(refreshSyncState, 5000);
    window.addEventListener('online', refreshSyncState);
    window.addEventListener('offline', refreshSyncState);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', refreshSyncState);
      window.removeEventListener('offline', refreshSyncState);
    };
  }, [refreshSyncState]);

  // Grounded node health verification (probes real /api/health endpoint)
  useEffect(() => {
    let isMounted = true;

    const checkServerHealth = async () => {
      if (!navigator.onLine) {
        if (isMounted) setNodeStatus('disconnected');
        return;
      }
      try {
        const res = await api.getHealth();
        if (isMounted) {
          setNodeStatus(res?.status === 'healthy' ? 'connected' : 'disconnected');
        }
      } catch {
        if (isMounted) setNodeStatus('disconnected');
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 30000);

    const handleOnline = () => {
      checkServerHealth();
      refreshSyncState();
    };
    const handleOffline = () => {
      if (isMounted) setNodeStatus('disconnected');
      refreshSyncState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshSyncState]);

  // Grounded academic year and active term discovery
  useEffect(() => {
    let isMounted = true;
    const fetchAcademicContext = async () => {
      try {
        const yearsRes = await api.getAcademicYears();
        const years = yearsRes?.years || [];
        const currentYear = years.find((y: any) => y.is_current === 1) || years[0];

        if (currentYear) {
          const termsRes = await api.getAcademicTerms(currentYear.id).catch(() => ({ terms: [] }));
          const terms = termsRes?.terms || [];
          const currentTerm = terms.find((t: any) => t.is_current === 1) || terms[0];

          if (isMounted) {
            const termLabel = currentTerm?.name ? `${currentTerm.name} Assessment Period` : 'Assessment Period';
            setAcademicPeriodStr(`Academic Year ${currentYear.name} • ${termLabel}`);
          }
        }
      } catch {
        if (isMounted) {
          setAcademicPeriodStr('Academic Year 2026 • Term 1 Assessment Period');
        }
      }
    };

    fetchAcademicContext();
  }, []);

  // Determine truthful sync indicator state
  const isOnline = navigator.onLine && nodeStatus === 'connected';
  const hasConflicts = (syncSummary?.conflicted || 0) > 0;
  const isSyncing = (syncSummary?.syncing || 0) > 0;
  const pendingCount = (syncSummary?.pending || 0);

  const getBreadcrumbs = () => {
    switch (currentTab) {
      case 'students':
        return ['Students', 'Directory & Records'];
      case 'attendance':
        return ['Attendance', 'Daily Class Register'];
      case 'attendance-reports':
        return ['Attendance', 'Reports & Registry'];
      case 'marks':
        return ['Academics', 'Examination & Marks'];
      case 'admin':
        return ['System & Security', 'Administration'];
      case 'audit':
        return ['System & Security', 'Audit Trail'];
      case 'design-system':
        return ['Development', 'UI Primitives Preview'];
      case 'dashboard':
      default:
        return ['Operations', 'Dashboard'];
    }
  };

  const crumbs = getBreadcrumbs();

  return (
    <header className="top-navbar">
      <div className="navbar-left">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="btn btn-secondary btn-icon mobile-menu-toggle"
          aria-label="Toggle navigation menu"
          title="Toggle navigation menu"
          style={{ flexShrink: 0 }}
        >
          <Menu size={20} />
        </button>

        <div className="navbar-breadcrumbs">
          <div className="navbar-crumb-trail navbar-brand-crumb">
            <span
              className="navbar-crumb-item navbar-crumb-parent"
              onClick={() => onNavigate?.('dashboard')}
              style={{ cursor: onNavigate ? 'pointer' : 'default' }}
              title={SCHOOL_PROFILE.name}
            >
              KCC
            </span>
            <ChevronRight size={12} className="navbar-crumb-divider navbar-crumb-sep" />
            <span className="navbar-crumb-item">{crumbs[0]}</span>
            <ChevronRight size={12} className="navbar-crumb-divider" />
            <h1 className="navbar-page-title navbar-title">{title}</h1>
          </div>

          <div className="navbar-academic-badge navbar-subtitle">
            <span className="navbar-academic-dot" />
            <span>{academicPeriodStr}</span>
          </div>
        </div>
      </div>

      <div className="navbar-right">
        {/* Real Local Date Pill */}
        <div className="navbar-date-badge badge" title="Current session date">
          <Calendar size={13} style={{ color: 'var(--primary)' }} />
          <span>{currentDateStr || 'Today'}</span>
        </div>

        {/* Grounded Truthful Sync Status Chip */}
        {hasConflicts ? (
          <button
            type="button"
            className="sync-status-chip sync-status-chip--conflicted"
            onClick={() => onNavigate?.('attendance')}
            title="Concurrency conflict detected between local changes and server. Tap to review."
          >
            <AlertTriangle size={13} />
            <span>Conflict Detected</span>
          </button>
        ) : isSyncing ? (
          <div
            className="sync-status-chip sync-status-chip--syncing"
            title="Uploading queued offline changes to school server..."
          >
            <RefreshCw size={13} className="sk-spin" />
            <span>Syncing...</span>
          </div>
        ) : pendingCount > 0 ? (
          <button
            type="button"
            className="sync-status-chip sync-status-chip--pending"
            onClick={() => onNavigate?.('attendance')}
            title={`${pendingCount} record(s) queued locally on device. Ready for synchronization.`}
          >
            <Clock size={13} />
            <span>{pendingCount} Pending Sync</span>
          </button>
        ) : !isOnline ? (
          <div
            className="sync-status-chip sync-status-chip--offline"
            title="School server unreachable. Working in offline mode; local changes safely persisted in IndexedDB."
          >
            <WifiOff size={13} />
            <span>Offline (Local Mode)</span>
          </div>
        ) : (
          <div
            className="sync-status-chip sync-status-chip--synced"
            title="Online and connected to school server. All local mutations synchronized."
          >
            <span className="sync-chip-dot" />
            <CheckCircle2 size={13} />
            <span>Online • Synced</span>
          </div>
        )}

        {/* Administrator Role Pill */}
        {user?.role === 'admin' && (
          <div
            className="badge"
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: '0.75rem',
              border: '1px solid var(--present-border)',
              padding: '0.3rem 0.65rem'
            }}
          >
            <ShieldCheck size={13} />
            <span>Administrator</span>
          </div>
        )}

        {/* Theme Mode Toggle Button */}
        {toggleTheme && (
          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-secondary btn-icon"
            style={{ width: 36, height: 36, minHeight: 36 }}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun size={17} style={{ color: '#f59e0b' }} />
            ) : (
              <Moon size={17} style={{ color: 'var(--primary)' }} />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
