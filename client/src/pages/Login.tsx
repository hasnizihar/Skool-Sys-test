import React, { useState } from 'react';
import { School, LogIn, Lock, User, AlertCircle, Sparkles, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { api, setAuthSession } from '../api/client';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
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
        position: 'relative',
        backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(67, 56, 202, 0.08) 0%, transparent 60%)'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '470px',
          padding: '2.5rem 2.25rem',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            className="brand-badge"
            style={{
              width: 58,
              height: 58,
              fontSize: '1.85rem',
              margin: '0 auto 1rem',
              boxShadow: '0 8px 24px rgba(67, 56, 202, 0.3)'
            }}
          >
            <School size={32} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>SkoolSys</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Grades 6–13 Academic Management System
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
            <label className="form-label">Username or Academic ID</label>
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
                style={{ paddingLeft: '2.5rem', height: 42 }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or teacher_nimali"
                required
                autoComplete="username"
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
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem', height: 42 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.65rem', padding: '0.75rem', minHeight: '44px' }}
          >
            <LogIn size={18} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
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
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: 'var(--text-muted)'
              }}
            >
              1-Click Demo Accounts
            </span>
            <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.7rem' }}>
              <Sparkles size={11} style={{ marginRight: 3 }} />
              Fast Switch
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => handleQuickDemo('admin', 'admin123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.85rem' }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.825rem' }}>Administrator / Principal (`admin`)</strong>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Full system access, classes, & settings</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('teacher_nimali', 'teacher123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.85rem' }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--present)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.825rem' }}>Mrs. Nimali Perera (`teacher_nimali`)</strong>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Class Teacher (Grade 8-A) Attendance & Roster</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('teacher_samantha', 'teacher123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.85rem' }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.825rem' }}>Mr. Samantha Silva (`teacher_samantha`)</strong>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Mathematics Subject Teacher (Gr. 8-A, 8-B, 11-A)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('teacher_priya', 'teacher123')}
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.85rem' }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.825rem' }}>Ms. Priya Fernando (`teacher_priya`)</strong>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Science Subject Teacher (Gr. 8-A, 8-B)</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
