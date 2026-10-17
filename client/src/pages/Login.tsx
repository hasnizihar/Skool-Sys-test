import React, { useState } from 'react';
import { School, LogIn, Lock, User, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { api, setAuthSession } from '../api/client';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const u = customUser || username;
    const p = customPass || password;

    try {
      setLoading(true);
      setError(null);
      const res = await api.login(u, p);
      setAuthSession(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleSubmit(undefined, u, p);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
        padding: '1.5rem',
        position: 'relative'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem 2rem',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            className="brand-badge"
            style={{
              width: 56,
              height: 56,
              fontSize: '1.75rem',
              margin: '0 auto 1rem'
            }}
          >
            <School size={30} />
          </div>
          <h1 style={{ fontSize: '1.65rem', marginBottom: '0.25rem' }}>SkoolSys</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Grade 6–13 School Management System
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--absent-bg)',
              color: 'var(--absent)',
              border: '1px solid var(--absent-border)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username or Email</label>
            <div style={{ position: 'relative' }}>
              <User
                size={18}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={18}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
          >
            <LogIn size={18} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </button>
        </form>

        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem'
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 700,
                color: 'var(--text-muted)'
              }}
            >
              1-Click Demo Accounts
            </span>
            <span className="badge" style={{ background: 'var(--bg-subtle)', fontSize: '0.7rem' }}>
              <Sparkles size={11} style={{ marginRight: 3, color: 'var(--primary)' }} />
              Fast Switch
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleQuickDemo('admin', 'admin123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.55rem 0.75rem' }}
            >
              <CheckCircle2 size={15} style={{ color: 'var(--primary)' }} />
              <div>
                <strong style={{ fontSize: '0.8rem' }}>Administrator / Principal</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Full system access & settings</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('teacher_nimali', 'teacher123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.55rem 0.75rem' }}
            >
              <CheckCircle2 size={15} style={{ color: 'var(--present)' }} />
              <div>
                <strong style={{ fontSize: '0.8rem' }}>Mrs. Nimali Perera (Class Teacher)</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Grade 8-A Attendance & Roster</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('teacher_samantha', 'teacher123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.55rem 0.75rem' }}
            >
              <CheckCircle2 size={15} style={{ color: '#0284c7' }} />
              <div>
                <strong style={{ fontSize: '0.8rem' }}>Mr. Samantha Silva (Subject Teacher)</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mathematics Marks Entry</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
