import React, { useState } from 'react';
import {
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight
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
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleTitle: 'Principal — Demo Account',
    name: `Principal (${SCHOOL_PROFILE.principalName} Profile)`,
    username: 'admin',
    password: 'admin123',
    roleTag: 'Executive',
    scope: 'School profile oversight, academic years, policy approvals & examination publishing'
  },
  {
    roleTitle: 'Vice Principal Academic',
    name: 'Vice Principal Academic',
    username: 'vp_academic',
    password: 'teacher123',
    roleTag: 'VP Academic',
    scope: 'Academic policy, school-wide moderation & examination approvals'
  },
  {
    roleTitle: 'Section Head (Grades 6–9)',
    name: 'Section Head (Grades 6–9)',
    username: 'section_head_junior',
    password: 'teacher123',
    roleTag: 'Junior Head',
    scope: 'Junior secondary moderation, marks endorsement & review'
  },
  {
    roleTitle: 'Section Head (Grades 10–13)',
    name: 'Section Head (Grades 10–13)',
    username: 'section_head_senior',
    password: 'teacher123',
    roleTag: 'Senior Head',
    scope: 'G.C.E. O/L & A/L section moderation & marks endorsement'
  },
  {
    roleTitle: 'Class Teacher (Grade 8-A)',
    name: 'Class Teacher (Grade 8-A)',
    username: 'teacher_nimali',
    password: 'teacher123',
    roleTag: 'Grade 8-A',
    scope: 'Grade 8-A homeroom, daily attendance register & student roster'
  },
  {
    roleTitle: 'Mathematics Teacher',
    name: 'Mathematics Teacher',
    username: 'teacher_samantha',
    password: 'teacher123',
    roleTag: 'Maths',
    scope: 'Grade 8-A & 11-A mathematics marks entry & term reports'
  },
  {
    roleTitle: 'Science & ICT Teacher',
    name: 'Science & ICT Teacher',
    username: 'teacher_priya',
    password: 'teacher123',
    roleTag: 'Science',
    scope: 'Grade 8-A science & ICT marks entry & term reports'
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
    setFilledFeedback(`Loaded ${roleName} (${u})`);
    setTimeout(() => setFilledFeedback(null), 3000);
  };

  const handleQuickDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleSubmit(undefined, u, p);
  };

  return (
    <div className="login-viewport">
      <div className="login-card card">
        {/* Minimalist School Header */}
        <header className="login-header">
          <img
            src="/kcc-logo.png"
            alt="Kattankudy Central College Official Crest"
            className="login-crest"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h1 className="login-title">{SCHOOL_PROFILE.name}</h1>
          <div className="login-tamil">{SCHOOL_PROFILE.nameTamil}</div>
          <p className="login-meta">
            {SCHOOL_PROFILE.secondaryTitle} • Census No. {SCHOOL_PROFILE.censusNo}
          </p>
        </header>

        {/* Error Feedback */}
        {error && (
          <div className="login-alert login-alert--error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Credential Fill Confirmation */}
        {filledFeedback && (
          <div className="login-alert login-alert--success" role="status">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>{filledFeedback}</span>
          </div>
        )}

        {/* Clean Sign In Form */}
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
            leftIcon={<User size={16} />}
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
            leftIcon={<Lock size={16} />}
            showPasswordToggle
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={loading}
            className="login-submit-btn"
            rightIcon={<ArrowRight size={16} />}
          >
            Sign In
          </Button>
        </form>

        {/* Testing & Demo Accounts (Minimalist Quick-Access) */}
        {isDemoEnabled && (
          <section className="login-demo-section" aria-label="Development Demo Accounts">
            <div className="login-demo-header">
              <KeyRound size={12} className="login-demo-icon" />
              <span>Testing & Demo Accounts</span>
            </div>

            <div className="login-demo-chips">
              {DEMO_ACCOUNTS.map((acc) => (
                <div key={acc.username} className="demo-chip-group">
                  <button
                    type="button"
                    className="demo-chip-btn"
                    onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                    title={`Fill ${acc.roleTitle} (${acc.username})`}
                  >
                    <span className="demo-chip-role">{acc.roleTitle}</span>
                    <span className="demo-chip-tag">{acc.roleTag}</span>
                  </button>
                  <button
                    type="button"
                    className="demo-chip-go"
                    onClick={() => handleQuickDemo(acc.username, acc.password)}
                    title={`Instant 1-Click Sign In as ${acc.roleTitle}`}
                  >
                    ➔
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Minimal Institutional Reference Footer */}
        <footer className="login-footer">
          <span>{SCHOOL_PROFILE.systemTitle}</span>
          <span className="footer-dot">•</span>
          <span>Principal: {SCHOOL_PROFILE.principalName}</span>
        </footer>
      </div>
    </div>
  );
};
