import React from 'react';
import { Menu, ShieldAlert, Sparkles, Wifi } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar: () => void;
  title: string;
  user: any;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, title, user }) => {
  return (
    <header className="top-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={onToggleSidebar}
          className="btn btn-secondary btn-icon"
          style={{ display: 'inline-flex' }}
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1 style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>{title}</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Academic Year 2026 • Term 1 Assessment Period
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          className="badge"
          style={{
            background: 'var(--bg-subtle)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem'
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              display: 'inline-block'
            }}
          />
          <Wifi size={12} style={{ marginRight: 2 }} />
          <span>Local Server Connected</span>
        </div>

        {user?.role === 'admin' && (
          <div
            className="badge"
            style={{
              background: 'rgba(79, 70, 229, 0.1)',
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: '0.75rem'
            }}
          >
            <Sparkles size={13} />
            <span>Admin Mode</span>
          </div>
        )}
      </div>
    </header>
  );
};
