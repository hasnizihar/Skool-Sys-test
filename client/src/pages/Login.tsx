import React, { useState } from 'react';
import {
  School,
  LogIn,
  Lock,
  User,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Eye,
  EyeOff,
  Shield,
  BookOpen,
  Calculator,
  FlaskConical,
  ArrowRight,
  ClipboardCheck,
  KeyRound,
  Award,
  Info
} from 'lucide-react';
import { api, setAuthSession } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';

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
  color: string;
  bgColor: string;
  borderColor: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleTitle: 'Principal — Demo Account',
    name: `Principal — Demo Account (${SCHOOL_PROFILE.principalName} Profile)`,
    username: 'admin',
    password: 'admin123',
    roleTag: 'Principal (Executive)',
    scope: 'School profile oversight, academic years, policy approvals & examination publishing',
    icon: Shield,
    color: 'var(--primary)',
    bgColor: 'var(--primary-light)',
    borderColor: 'rgba(67, 56, 202, 0.25)'
  },
  {
    roleTitle: 'Vice Principal Academic — Demo Account',
    name: 'Vice Principal Academic — Demo Account',
    username: 'vp_academic',
    password: 'teacher123',
    roleTag: 'VP Academic',
    scope: 'Academic policy, school-wide moderation & examination approvals',
    icon: Award,
    color: '#8b5cf6',
    bgColor: '#f5f3ff',
    borderColor: 'rgba(139, 92, 246, 0.25)'
  },
  {
    roleTitle: 'Section Head (Grades 6–9) — Demo Account',
    name: 'Section Head (Grades 6–9) — Demo Account',
    username: 'section_head_junior',
    password: 'teacher123',
    roleTag: 'Junior Section Head',
    scope: 'Junior secondary moderation, marks endorsement & review',
    icon: ClipboardCheck,
    color: '#0284c7',
    bgColor: '#f0f9ff',
    borderColor: 'rgba(2, 132, 199, 0.25)'
  },
  {
    roleTitle: 'Section Head (Grades 10–13) — Demo Account',
    name: 'Section Head (Grades 10–13) — Demo Account',
    username: 'section_head_senior',
    password: 'teacher123',
    roleTag: 'Senior Section Head',
    scope: 'G.C.E. O/L & A/L section moderation & marks endorsement',
    icon: ClipboardCheck,
    color: '#0369a1',
    bgColor: '#e0f2fe',
    borderColor: 'rgba(3, 105, 161, 0.25)'
  },
  {
    roleTitle: 'Class Teacher (Grade 8-A) — Demo Account',
    name: 'Class Teacher (Grade 8-A) — Demo Account',
    username: 'teacher_nimali',
    password: 'teacher123',
    roleTag: 'Class Teacher',
    scope: 'Grade 8-A homeroom, daily attendance register & student roster',
    icon: BookOpen,
    color: 'var(--present)',
    bgColor: 'var(--present-bg)',
    borderColor: 'var(--present-border)'
  },
  {
    roleTitle: 'Mathematics Teacher — Demo Account',
    name: 'Mathematics Teacher — Demo Account',
    username: 'teacher_samantha',
    password: 'teacher123',
    roleTag: 'Subject Teacher',
    scope: 'Grade 8-A & 11-A mathematics marks entry & term reports',
    icon: Calculator,
    color: 'var(--secondary)',
    bgColor: 'var(--secondary-light)',
    borderColor: 'rgba(13, 148, 136, 0.25)'
  },
  {
    roleTitle: 'Science & ICT Teacher — Demo Account',
    name: 'Science & ICT Teacher — Demo Account',
    username: 'teacher_priya',
    password: 'teacher123',
    roleTag: 'Subject Teacher',
    scope: 'Grade 8-A science & ICT marks entry & term reports',
    icon: FlaskConical,
    color: 'var(--accent)',
    bgColor: 'var(--accent-light)',
    borderColor: 'var(--late-border)'
  }
];

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  // Always active in local dev (npm run dev) or when explicitly configured
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
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillCredentials = (u: string, p: string, roleName: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
    setFilledFeedback(`Filled credentials for ${roleName} (${u})`);
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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
        padding: '2rem 1.5rem',
        position: 'relative',
        backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(67, 56, 202, 0.08) 0%, transparent 60%)'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '560px',
          padding: '2.5rem 2.25rem',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            className="brand-badge"
            style={{
              width: 60,
              height: 60,
              fontSize: '1.85rem',
              margin: '0 auto 1rem',
              boxShadow: '0 8px 24px rgba(67, 56, 202, 0.3)'
            }}
          >
            <School size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.2rem', color: 'var(--text-main)' }}>
            {SCHOOL_PROFILE.name}
          </h1>
          <div
            style={{
              fontSize: '1rem',
              color: 'var(--primary)',
              fontWeight: 700,
              marginBottom: '0.35rem'
            }}
          >
            {SCHOOL_PROFILE.nameTamil}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', margin: 0 }}>
            {SCHOOL_PROFILE.secondaryTitle} • Census No. {SCHOOL_PROFILE.censusNo}
          </p>
          <div
            style={{
              display: 'inline-block',
              marginTop: '0.5rem',
              padding: '0.2rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              fontSize: '0.725rem',
              color: 'var(--text-muted)',
              fontWeight: 600
            }}
          >
            {SCHOOL_PROFILE.systemTitle}
          </div>
        </div>

        {/* Error Alert */}
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
              background: 'var(--present-bg)',
              color: 'var(--present)',
              border: '1px solid var(--present-border)',
              padding: '0.65rem 0.95rem',
              borderRadius: 'var(--radius-md)',
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

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
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
            style={{ width: '100%', padding: '0.75rem', minHeight: '44px', fontWeight: 600 }}
          >
            <LogIn size={18} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </button>
        </form>

        {/* Development & Testing Credentials Panel */}
        {isDemoEnabled && (
          <div
            style={{
              marginTop: '1.75rem',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '1.25rem'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <KeyRound size={15} style={{ color: 'var(--primary)' }} />
                <span
                  style={{
                    fontSize: '0.78rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                    color: 'var(--text-main)'
                  }}
                >
                  Testing & Demo Accounts
                </span>
              </div>
              <span
                className="badge"
                style={{
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <Sparkles size={11} />
                Dev Mode
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.4 }}>
              Click <strong>Fill</strong> to populate credentials, or <strong>Sign In ➔</strong> for instant 1-click authentication:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {DEMO_ACCOUNTS.map((acc) => {
                const IconComponent = acc.icon;
                return (
                  <div
                    key={acc.username}
                    style={{
                      border: `1px solid ${acc.borderColor}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 0.85rem',
                      background: 'var(--bg-surface)',
                      transition: 'all 0.15s ease',
                      boxShadow: 'var(--shadow-xs)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        marginBottom: '0.4rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-sm)',
                            background: acc.bgColor,
                            color: acc.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <IconComponent size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {acc.roleTitle}
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            {acc.name}
                          </div>
                        </div>
                      </div>

                      <span
                        className="badge"
                        style={{
                          background: acc.bgColor,
                          color: acc.color,
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          border: `1px solid ${acc.borderColor}`
                        }}
                      >
                        {acc.roleTag}
                      </span>
                    </div>

                    {/* Monospace Credentials Display */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.5rem',
                        margin: '0.45rem 0',
                        fontSize: '0.75rem',
                        padding: '0.35rem 0.55rem',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Username:</span>
                        <code
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            background: 'var(--bg-surface)',
                            padding: '1px 5px',
                            borderRadius: 3,
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          {acc.username}
                        </code>
                      </div>
                      <span style={{ color: 'var(--border-color)' }}>|</span>
                      <div>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Password:</span>
                        <code
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            background: 'var(--bg-surface)',
                            padding: '1px 5px',
                            borderRadius: 3,
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          {acc.password}
                        </code>
                      </div>
                    </div>

                    {/* Scope description */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.55rem' }}>
                      Scope: {acc.scope}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                      <button
                        type="button"
                        onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                        className="btn btn-secondary btn-sm"
                        style={{
                          flex: 1,
                          fontSize: '0.74rem',
                          padding: '0.35rem 0.6rem',
                          justifyContent: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <ClipboardCheck size={13} />
                        <span>Fill Form</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickDemo(acc.username, acc.password)}
                        className="btn btn-primary btn-sm"
                        style={{
                          flex: 1,
                          fontSize: '0.74rem',
                          padding: '0.35rem 0.6rem',
                          justifyContent: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span>Sign In</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Official Institutional Profile Footer Card */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            lineHeight: 1.45
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--text-main)', fontWeight: 600 }}>
            <Info size={13} style={{ color: 'var(--primary)' }} />
            <span>Institutional Profile Reference</span>
          </div>
          <div>
            <strong>Principal:</strong> {SCHOOL_PROFILE.principalName}{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
              (Spelling requires formal school confirmation prior to official correspondence)
            </span>
          </div>
          <div>
            <strong>Zone & Division:</strong> {SCHOOL_PROFILE.zone} • {SCHOOL_PROFILE.division}
          </div>
          <div>
            <strong>Type & Classification:</strong> {SCHOOL_PROFILE.type} (Census {SCHOOL_PROFILE.censusNo}) • {SCHOOL_PROFILE.studentCategory} (Grades 6–13)
          </div>
          <div style={{ marginTop: '0.4rem', color: 'var(--accent)', fontWeight: 600 }}>
            {SCHOOL_PROFILE.demoResultNotice} — All records are synthetic demonstration fixtures.
          </div>
        </div>
      </div>
    </div>
  );
};
