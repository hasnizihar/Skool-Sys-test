import React, { useState, useEffect } from 'react';
import { Menu, ShieldCheck, Wifi, WifiOff, Sun, Moon, Calendar, Award } from 'lucide-react';
import { api } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import { SchoolCrest } from './common/SchoolCrest';

interface NavbarProps {
  onToggleSidebar: () => void;
  title: string;
  user: any;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleSidebar,
  title,
  user,
  theme,
  toggleTheme
}) => {
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [nodeStatus, setNodeStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [academicPeriodStr, setAcademicPeriodStr] = useState<string>('Loading academic context...');

  useEffect(() => {
    const d = new Date();
    setCurrentDateStr(
      d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    );
  }, []);

  // Probes genuine /api/health endpoint
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
          if (res?.status === 'healthy') {
            setNodeStatus('connected');
          } else {
            setNodeStatus('disconnected');
          }
        }
      } catch {
        if (isMounted) {
          setNodeStatus('disconnected');
        }
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 30000);

    const handleOnline = () => checkServerHealth();
    const handleOffline = () => { if (isMounted) setNodeStatus('disconnected'); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Academic year and term context
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
        } else {
          if (isMounted) {
            setAcademicPeriodStr('Academic Operations Active');
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

  return (
    <header className="top-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <button
          onClick={onToggleSidebar}
          className="btn btn-secondary btn-icon mobile-menu-toggle"
          aria-label="Toggle navigation menu"
          title="Toggle navigation menu"
          style={{ flexShrink: 0 }}
        >
          <Menu size={20} />
        </button>

        <div>
          <div className="navbar-brand-crumb">
            <span className="navbar-crumb-parent" title={SCHOOL_PROFILE.name}>
              {SCHOOL_PROFILE.name}
            </span>
            <span className="navbar-crumb-sep">/</span>
            <h1 className="navbar-title">{title}</h1>
          </div>
          <p className="navbar-subtitle">
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--kcc-primary)'
              }}
            />
            {academicPeriodStr}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {/* Date Badge */}
        <div
          className="badge"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            padding: '0.3rem 0.65rem'
          }}
          title="Current civil date"
        >
          <Calendar size={13} style={{ color: 'var(--kcc-primary)' }} />
          <span>{currentDateStr || 'Today'}</span>
        </div>

        {/* Grounded Local Server Health */}
        <div
          className="badge"
          style={{
            background:
              nodeStatus === 'connected'
                ? 'var(--present-bg)'
                : nodeStatus === 'disconnected'
                ? 'var(--absent-bg)'
                : 'var(--bg-subtle)',
            color:
              nodeStatus === 'connected'
                ? 'var(--present)'
                : nodeStatus === 'disconnected'
                ? 'var(--absent)'
                : 'var(--text-muted)',
            border: `1px solid ${
              nodeStatus === 'connected'
                ? 'var(--present-border)'
                : nodeStatus === 'disconnected'
                ? 'var(--absent-border)'
                : 'var(--border-color)'
            }`,
            fontSize: '0.75rem',
            padding: '0.3rem 0.65rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}
          title={
            nodeStatus === 'connected'
              ? 'Local School Node: Connected and healthy'
              : nodeStatus === 'disconnected'
              ? 'Local School Node: Unreachable / Offline'
              : 'Verifying local node status...'
          }
        >
          {nodeStatus === 'connected' ? (
            <Wifi size={13} />
          ) : (
            <WifiOff size={13} />
          )}
          <span>{nodeStatus === 'connected' ? 'Connected' : 'Offline'}</span>
        </div>

        {/* User Role Tag */}
        <div
          className="badge"
          style={{
            background: 'var(--kcc-primary-soft)',
            color: 'var(--kcc-primary)',
            border: '1px solid rgba(7, 94, 59, 0.25)',
            fontSize: '0.75rem',
            padding: '0.3rem 0.65rem',
            fontWeight: 700
          }}
          title={`Active Role: ${user?.role}`}
        >
          <ShieldCheck size={13} />
          <span style={{ textTransform: 'capitalize' }}>
            {user?.role ? user.role.replace('_', ' ') : 'Faculty'}
          </span>
        </div>
      </div>
    </header>
  );
};
