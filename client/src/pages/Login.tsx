import React, { useState } from 'react';
import {
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
  Award,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  LogIn
} from 'lucide-react';
import { api, setAuthSession } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import { SchoolCrest } from '../components/common/SchoolCrest';

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
    roleTitle: 'Principal — Demo Account',
    name: `Principal — Demo Account (${SCHOOL_PROFILE.principalName} Profile)`,
    username: 'admin',
    password: 'admin123',
    roleTag: 'Principal (Executive)',
    scope: 'School profile oversight, academic years, policy approvals & examination publishing',
    icon: Shield
  },
  {
    roleTitle: 'Vice Principal Academic — Demo Account',
    name: 'Vice Principal Academic — Demo Account',
    username: 'vp_academic',
    password: 'teacher123',
    roleTag: 'VP Academic',
    scope: 'Academic policy, school-wide moderation & examination approvals',
    icon: Award
  },
  {
    roleTitle: 'Section Head (Grades 6–9) — Demo Account',
    name: 'Section Head (Grades 6–9) — Demo Account',
    username: 'section_head_junior',
    password: 'teacher123',
    roleTag: 'Junior Section Head',
    scope: 'Junior secondary moderation, marks endorsement & review',
    icon: ClipboardCheck
  },
  {
    roleTitle: 'Section Head (Grades 10–13) — Demo Account',
    name: 'Section Head (Grades 10–13) — Demo Account',
    username: 'section_head_senior',
    password: 'teacher123',
    roleTag: 'Senior Section Head',
    scope: 'G.C.E. O/L & A/L section moderation & marks endorsement',
    icon: ClipboardCheck
  },
  {
    roleTitle: 'Class Teacher (Grade 8-A) — Demo Account',
    name: 'Class Teacher (Grade 8-A) — Demo Account',
    username: 'teacher_nimali',
    password: 'teacher123',
    roleTag: 'Class Teacher',
    scope: 'Grade 8-A homeroom, daily attendance register & student roster',
    icon: BookOpen
  },
  {
    roleTitle: 'Mathematics Teacher — Demo Account',
    name: 'Mathematics Teacher — Demo Account',
    username: 'teacher_samantha',
    password: 'teacher123',
    roleTag: 'Subject Teacher',
    scope: 'Grade 8-A & 11-A mathematics marks entry & term reports',
    icon: Calculator
  },
  {
    roleTitle: 'Science & ICT Teacher — Demo Account',
    name: 'Science & ICT Teacher — Demo Account',
    username: 'teacher_priya',
    password: 'teacher123',
    roleTag: 'Subject Teacher',
    scope: 'Grade 8-A science & ICT marks entry & term reports',
    icon: FlaskConical
  }
];

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const isDemoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filledFeedback, setFilledFeedback] = useState<string | null>(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(true);

  const handleSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const u = customUser || username;
    const p = customPass || password;

    if (!u.trim() || !p) {
      setError('Please enter both username and password.');
      return;
    }

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
    setFilledFeedback(`Loaded credentials for ${roleName}`);
    setTimeout(() => setFilledFeedback(null), 3500);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--kcc-canvas)',
        padding: '2rem 1.25rem',
        backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(7, 94, 59, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(244, 220, 36, 0.04) 0%, transparent 40%)'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '960px',
          padding: 0,
          display: 'flex',
          flexDirection: 'row',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: '0 20px 45px -10px rgba(16, 43, 33, 0.18)',
          border: '1px solid var(--kcc-border)'
        }}
      >
        {/* LEFT PANEL: Deep Forest-Green Institutional Showcase */}
        <div
          style={{
            flex: '1 1 45%',
            backgroundColor: 'var(--kcc-primary)',
            color: '#FFFFFF',
            padding: '3rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden'
          }}
          className="login-left-panel"
        >
          {/* Subtle Decorative Pattern */}
          <div
            style={{
              position: 'absolute',
              right: '-60px',
              bottom: '-60px',
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              border: '2px solid rgba(244, 220, 36, 0.15)',
              pointerEvents: 'none'
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-20px',
              bottom: '-20px',
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              pointerEvents: 'none'
            }}
          />

          <div>
            {/* Crest Badge */}
            <div style={{ marginBottom: '1.75rem', display: 'inline-block' }}>
              <SchoolCrest size="xl" showBorder={true} alt={SCHOOL_PROFILE.name} />
            </div>

            <div
              style={{
                width: '40px',
                height: '4px',
                backgroundColor: 'var(--kcc-gold)',
                borderRadius: '2px',
                marginBottom: '1rem'
              }}
            />

            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                color: '#FFFFFF',
                lineHeight: 1.25,
                marginBottom: '0.35rem',
                letterSpacing: '-0.02em'
              }}
            >
              {SCHOOL_PROFILE.name}
            </h1>

            <div
              style={{
                fontSize: '1.1rem',
                color: 'var(--kcc-gold)',
                fontWeight: 600,
                marginBottom: '0.85rem',
                fontFamily: 'var(--font-tamil)'
              }}
            >
              {SCHOOL_PROFILE.nameTamil}
            </div>

            <p
              style={{
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.85)',
                lineHeight: 1.55,
                marginBottom: '1.5rem'
              }}
            >
              Official management portal for student admissions, daily classroom attendance registers, and academic examination moderation for Grades 6 to 13.
            </p>
          </div>

          <div
            style={{
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.7)'
            }}
          >
            <div>
              <strong style={{ color: '#FFFFFF' }}>{SCHOOL_PROFILE.type}</strong> • Census No. {SCHOOL_PROFILE.censusNo}
            </div>
            <div>
              {SCHOOL_PROFILE.zone} Zone • {SCHOOL_PROFILE.division} Division
            </div>
            <div style={{ color: 'var(--kcc-gold)', fontWeight: 600, marginTop: '2px' }}>
              {SCHOOL_PROFILE.systemTitle}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Clean White Authentication Form */}
        <div
          style={{
            flex: '1 1 55%',
            backgroundColor: 'var(--kcc-surface)',
            padding: '3rem 2.75rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
          className="login-right-panel"
        >
          <div style={{ marginBottom: '1.75rem' }}>
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: 'var(--kcc-text)',
                marginBottom: '0.4rem',
                letterSpacing: '-0.02em'
              }}
            >
              Faculty & Staff Sign In
            </h2>
            <p style={{ color: 'var(--kcc-text-muted)', fontSize: '0.875rem' }}>
              Enter your official academic account credentials to access your administrative workspace.
            </p>
          </div>

          {/* Error Notice */}
          {error && (
            <div
              role="alert"
              style={{
                backgroundColor: 'var(--absent-bg)',
                color: 'var(--absent)',
                border: '1px solid var(--absent-border)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                marginBottom: '1.25rem'
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Feedback Notice */}
          {filledFeedback && (
            <div
              style={{
                backgroundColor: 'var(--present-bg)',
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
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{filledFeedback}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.15rem' }}>
              <label className="form-label" htmlFor="login-username">
                Username or Staff Academic ID
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={18}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--kcc-text-muted)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.6rem' }}
                  placeholder="e.g. admin or teacher_nimali"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--kcc-text-muted)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: '2.6rem', paddingRight: '2.6rem' }}
                  placeholder="Enter your confidential password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--kcc-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--kcc-text-muted)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--kcc-primary)', width: 16, height: 16 }}
                />
                <span>Remember this terminal</span>
              </label>

              <span style={{ fontSize: '0.8rem', color: 'var(--kcc-text-muted)' }}>
                Secure SSL Session
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem'
              }}
            >
              <LogIn size={18} />
              <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
            </button>
          </form>

          {/* Authorized Demo Accounts Drawer (Developer / Verification Environment) */}
          {isDemoEnabled && (
            <div
              style={{
                marginTop: '1.75rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--kcc-border)'
              }}
            >
              <button
                type="button"
                onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  padding: '0.4rem 0',
                  color: 'var(--kcc-text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.825rem',
                  fontWeight: 600
                }}
              >
                <span>Testing & Demo Accounts</span>
                {showDemoAccounts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showDemoAccounts && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    marginTop: '0.75rem',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    paddingRight: '0.25rem'
                  }}
                >
                  {DEMO_ACCOUNTS.map((acc) => {
                    const Icon = acc.icon;
                    return (
                      <div
                        key={acc.username}
                        onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                        style={{
                          padding: '0.6rem 0.8rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--kcc-border)',
                          backgroundColor: 'var(--kcc-canvas)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          transition: 'all var(--transition-fast)'
                        }}
                        className="demo-account-item"
                        title={`Click to fill ${acc.username} credentials`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                          <Icon size={16} style={{ color: 'var(--kcc-primary)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--kcc-text)' }}>
                              {acc.roleTitle}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--kcc-text-muted)' }}>
                              {acc.username} • {acc.roleTag}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubmit(undefined, acc.username, acc.password);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.2rem 0.55rem',
                            minHeight: '28px',
                            flexShrink: 0
                          }}
                        >
                          Quick Log In
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
