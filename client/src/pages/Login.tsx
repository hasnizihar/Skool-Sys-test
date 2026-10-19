import React, { useState } from 'react';
import {
  LogIn,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Shield,
  BookOpen,
  Calculator,
  FlaskConical,
  ArrowRight,
  Sparkles,
  School,
  Check
} from 'lucide-react';
import { api, setAuthSession } from '../api/client';
import { CollegeLogo } from '../components/CollegeLogo';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

interface DemoAccount {
  roleTitle: string;
  name: string;
  username: string;
  password: string;
  roleTag: string;
  scope: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleTitle: 'Principal / Administrator',
    name: 'Dr. Anura Bandara',
    username: 'admin',
    password: 'admin123',
    roleTag: 'Admin (Full Access)',
    scope: 'All 13 Tables, Academic Years, Classes, User Accounts & Security',
    icon: Shield
  },
  {
    roleTitle: 'Class Teacher (Grade 8-A)',
    name: 'Mrs. Nimali Perera',
    username: 'teacher_nimali',
    password: 'teacher123',
    roleTag: 'Class Teacher',
    scope: 'Grade 8-A Homeroom, Daily Attendance Register & Student Roster',
    icon: BookOpen
  },
  {
    roleTitle: 'Mathematics Subject Teacher',
    name: 'Mr. Samantha Silva',
    username: 'teacher_samantha',
    password: 'teacher123',
    roleTag: 'Math Teacher',
    scope: 'Grade 8-A, 8-B, 11-A Mathematics Marks Entry & Term Reports',
    icon: Calculator
  },
  {
    roleTitle: 'Science Subject Teacher',
    name: 'Ms. Priya Wickramasinghe',
    username: 'teacher_priya',
    password: 'teacher123',
    roleTag: 'Science Teacher',
    scope: 'Grade 8-A, 8-B Science Marks Entry & Term Reports',
    icon: FlaskConical
  }
];

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const isDemoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filledFeedback, setFilledFeedback] = useState<string | null>(null);

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
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillCredentials = (u: string, p: string, roleName: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
    setFilledFeedback(`Selected ${roleName} (${u})`);
    setTimeout(() => setFilledFeedback(null), 4000);
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
        alignItems: 'stretch',
        backgroundColor: 'var(--bg-app)',
        position: 'relative'
      }}
    >
      {/* Left Institutional Branding Panel */}
      <div
        className="login-brand-panel"
        style={{
          flex: '1 1 480px',
          maxWidth: '540px',
          backgroundColor: '#026536',
          color: '#FFFFFF',
          padding: '3.5rem 3rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Decorative subtle background pattern */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-10%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(241, 239, 34, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        {/* Top: Logo in white container */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <CollegeLogo size={64} inContainer={true} />
            <div>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: 'rgba(241, 239, 34, 0.2)',
                  color: '#F1EF22',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  marginBottom: '0.35rem',
                  letterSpacing: '0.04em'
                }}
              >
                NATIONAL SCHOOL
              </span>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
                Kattankudy Central College
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#E8F4EC', opacity: 0.85 }}>
                School Management System • Grades 6–13
              </p>
            </div>
          </div>

          <div style={{ marginTop: '2.5rem' }}>
            <h2 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.25, marginBottom: '1rem' }}>
              Modern Academic Administration
            </h2>
            <p style={{ fontSize: '0.925rem', color: '#E8F4EC', lineHeight: 1.6, opacity: 0.9 }}>
              Centralized platform for student records, daily attendance register, term marks, and official terminal report cards.
            </p>
          </div>
        </div>

        {/* Middle Feature Highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: '2rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F1EF22',
                flexShrink: 0
              }}
            >
              <Check size={16} />
            </div>
            <div>
              <strong style={{ fontSize: '0.875rem', color: '#FFFFFF' }}>Instant Daily Attendance</strong>
              <p style={{ fontSize: '0.775rem', color: '#E8F4EC', opacity: 0.8 }}>
                Fast roll call with offline storage and automatic background sync.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F1EF22',
                flexShrink: 0
              }}
            >
              <Check size={16} />
            </div>
            <div>
              <strong style={{ fontSize: '0.875rem', color: '#FFFFFF' }}>Examination Results & Reports</strong>
              <p style={{ fontSize: '0.775rem', color: '#E8F4EC', opacity: 0.8 }}>
                Spreadsheet marks entry and printable A4 terminal report cards.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F1EF22',
                flexShrink: 0
              }}
            >
              <Check size={16} />
            </div>
            <div>
              <strong style={{ fontSize: '0.875rem', color: '#FFFFFF' }}>Role-Based Access Control</strong>
              <p style={{ fontSize: '0.775rem', color: '#E8F4EC', opacity: 0.8 }}>
                Secure homeroom teacher and subject teacher assignment scopes.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: '#E8F4EC', opacity: 0.75 }}>
            Kattankudy Central College • Batticaloa • Academic Year 2026
          </p>
        </div>
      </div>

      {/* Right / Center Form Panel */}
      <div
        style={{
          flex: '1 1 500px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 2rem',
          overflowY: 'auto'
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '520px',
            padding: '2.5rem 2.25rem',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          {/* Brand Heading for mobile or quick header */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
              <CollegeLogo size={52} inContainer={true} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Faculty & Staff Sign In
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Enter your official credentials to access the management portal
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              style={{
                background: 'var(--absent-bg)',
                color: 'var(--absent)',
                border: '1px solid var(--absent-border)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-input)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem'
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Fill Feedback Alert */}
          {filledFeedback && (
            <div
              style={{
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                border: '1px solid rgba(2, 101, 54, 0.3)',
                padding: '0.65rem 0.95rem',
                borderRadius: 'var(--radius-input)',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{filledFeedback}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Username or Faculty ID</label>
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

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
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
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                height: 44,
                fontSize: '0.95rem',
                fontWeight: 700
              }}
            >
              <LogIn size={18} />
              <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
            </button>
          </form>

          {/* Quick Demo Accounts Fast Access */}
          {isDemoEnabled && (
            <div
              style={{
                marginTop: '1.75rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid var(--border-color)'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Fast Demo Accounts
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click to auto-fill</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                {DEMO_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon;
                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: username === acc.username ? 'var(--primary-light)' : 'var(--bg-subtle)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)'
                      }}
                      title={`${acc.roleTitle} (${acc.scope})`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                        <Icon size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {acc.name.split(' ')[0]} {acc.name.split(' ')[1]?.charAt(0)}.
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.675rem',
                          color: 'var(--text-muted)',
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {acc.roleTag}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
