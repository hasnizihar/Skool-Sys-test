import React, { useState, useEffect } from 'react';
import { Menu, ShieldCheck, Sparkles, Wifi, Sun, Moon, Calendar } from 'lucide-react';

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
            <span className="navbar-crumb-parent">Portal</span>
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
                backgroundColor: 'var(--primary)'
              }}
            />
            Academic Year 2026 • Term 1 Assessment Period
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div
          className="badge"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            padding: '0.3rem 0.65rem'
          }}
          title="Current date"
        >
          <Calendar size={13} style={{ color: 'var(--primary)' }} />
          <span>{currentDateStr || 'Today'}</span>
        </div>

        <div
          className="badge"
          style={{
            background: 'var(--present-bg)',
            color: 'var(--present)',
            border: '1px solid var(--present-border)',
            fontSize: '0.75rem',
            padding: '0.3rem 0.65rem'
          }}
          title="Local School Network Status: Connected"
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--present)',
              display: 'inline-block'
            }}
          />
          <Wifi size={12} />
          <span>Local Node Online</span>
        </div>

        {user?.role === 'admin' && (
          <div
            className="badge"
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: '0.75rem',
              border: '1px solid rgba(67, 56, 202, 0.25)',
              padding: '0.3rem 0.65rem'
            }}
          >
            <ShieldCheck size={13} />
            <span>Administrator</span>
          </div>
        )}

        {toggleTheme && (
          <button
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
