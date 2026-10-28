import React, { useState } from 'react';
import {
  School,
  LogIn,
  Lock,
  User,
  AlertCircle,
  Sparkles,
  CheckCircle2,
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
import { Button, Input } from '../ui';
import './login.css';

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
    borderColor: 'var(--present-border)'
  },
  {
    roleTitle: 'Vice Principal Academic — Demo Account',
    name: 'Vice Principal Academic — Demo Account',
    username: 'vp_academic',
    password: 'teacher123',
    roleTag: 'VP Academic',
    scope: 'Academic policy, school-wide moderation & examination approvals',
    icon: Award,
    color: '#0284c7',
    bgColor: '#f0f9ff',
    borderColor: '#bae6fd'
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
    borderColor: '#bae6fd'
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
    borderColor: '#7dd3fc'
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
    borderColor: '#99f6e4'
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
  const isDemoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="login-viewport">
      <div className="login-card-container card">
        {/* Brand & School Header */}
        <header className="login-brand-header">
          <div className="login-brand-emblem" aria-hidden="true">
            <School size={30} />
          </div>
          <h1 className="login-school-title">
            {SCHOOL_PROFILE.name}
          </h1>
          <div className="login-tamil-title">
            {SCHOOL_PROFILE.nameTamil}
          </div>
          <p className="login-census-subtitle">
            {SCHOOL_PROFILE.secondaryTitle} • Census No. {SCHOOL_PROFILE.censusNo}
          </p>
          <div className="login-system-pill">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
            <span>{SCHOOL_PROFILE.systemTitle}</span>
          </div>
        </header>

        {/* Error Feedback */}
        {error && (
          <div className="login-alert-banner login-alert--error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Credential Fill Confirmation */}
        {filledFeedback && (
          <div className="login-alert-banner login-alert--success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{filledFeedback}</span>
          </div>
        )}

        {/* Form Container with Milestone 1 UI Primitives */}
        <form onSubmit={handleSubmit} className="login-form">
          <Input
            label="Username or Academic ID"
            name="username"
            type="text"
            placeholder="e.g. admin or teacher_nimali"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            leftIcon={<User size={18} />}
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock size={18} />}
            showPasswordToggle
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={loading}
            className="login-submit-btn"
            leftIcon={<LogIn size={18} />}
          >
            Sign In
          </Button>
        </form>

        {/* Development & Testing Credentials Panel */}
        {isDemoEnabled && (
          <section className="demo-accounts-panel" aria-label="Development Demo Accounts">
            <div className="demo-panel-header">
              <div className="demo-panel-title">
                <KeyRound size={16} style={{ color: 'var(--primary)' }} />
                <span>Testing & Demo Accounts</span>
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

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
              Click <strong>Fill</strong> to populate form fields, or <strong>Sign In ➔</strong> for instant 1-click authentication:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {DEMO_ACCOUNTS.map((acc) => {
                const IconComponent = acc.icon;
                return (
                  <div key={acc.username} className="demo-account-card">
                    <div className="demo-card-top">
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
                          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {acc.roleTitle}
                          </div>
                          <div style={{ fontSize: '0.71875rem', color: 'var(--text-muted)' }}>
                            {acc.name}
                          </div>
                        </div>
                      </div>

                      <span
                        className="demo-role-badge"
                        style={{
                          background: acc.bgColor,
                          color: acc.color,
                          border: `1px solid ${acc.borderColor}`
                        }}
                      >
                        {acc.roleTag}
                      </span>
                    </div>

                    <div className="demo-creds-box">
                      <div>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Username:</span>
                        <code style={{ fontWeight: 700, color: 'var(--text-main)' }}>{acc.username}</code>
                      </div>
                      <span style={{ color: 'var(--border-color)' }}>|</span>
                      <div>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Password:</span>
                        <code style={{ fontWeight: 700, color: 'var(--text-main)' }}>{acc.password}</code>
                      </div>
                    </div>

                    <div className="demo-scope-text">
                      Scope: {acc.scope}
                    </div>

                    <div className="demo-actions-row">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                        leftIcon={<ClipboardCheck size={14} />}
                      >
                        Fill Form
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        fullWidth
                        onClick={() => handleQuickDemo(acc.username, acc.password)}
                        rightIcon={<ArrowRight size={14} />}
                      >
                        Sign In ➔
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Institutional Profile Reference Footer */}
        <footer className="login-profile-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--text-main)', fontWeight: 600 }}>
            <Info size={13} style={{ color: 'var(--primary)' }} />
            <span>Institutional Profile Reference</span>
          </div>
          <div>
            <strong>Principal:</strong> {SCHOOL_PROFILE.principalName}
          </div>
          <div>
            <strong>Zone & Division:</strong> {SCHOOL_PROFILE.zone} • {SCHOOL_PROFILE.division}
          </div>
          <div>
            <strong>Classification:</strong> {SCHOOL_PROFILE.type} (Census {SCHOOL_PROFILE.censusNo}) • {SCHOOL_PROFILE.studentCategory} (Grades 6–13)
          </div>
          <div style={{ marginTop: '0.35rem', color: 'var(--accent)', fontWeight: 600 }}>
            {SCHOOL_PROFILE.demoResultNotice}
          </div>
        </footer>
      </div>
    </div>
  );
};
