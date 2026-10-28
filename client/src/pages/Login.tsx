import React, { useState } from 'react';
import {
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
  Info,
  CalendarCheck2,
  FileCheck2
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
      <div className="login-shell">
        {/* Left Hero Brand Panel (Desktop) */}
        <aside className="login-hero-panel" aria-label="Institutional Identity & Governance">
          <div className="login-hero-brand">
            <div className="login-hero-crest-frame">
              <img
                src="/kcc-logo.png"
                alt="Kattankudy Central College Official Crest"
                className="login-hero-crest-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <h2 className="login-hero-school-name">{SCHOOL_PROFILE.name}</h2>
            <div className="login-hero-school-tamil">{SCHOOL_PROFILE.nameTamil}</div>
            <div className="login-hero-census-pill">
              <span>{SCHOOL_PROFILE.type}</span>
              <span className="pill-dot">•</span>
              <span>Census No. {SCHOOL_PROFILE.censusNo}</span>
            </div>
          </div>

          <div className="login-hero-highlights">
            <div className="hero-feature-item">
              <div className="hero-feature-icon">
                <Shield size={18} />
              </div>
              <div className="hero-feature-text">
                <div className="hero-feature-title">Separation of Duties & Governance</div>
                <div className="hero-feature-desc">Principal executive oversight, Section Head moderation, and independent review.</div>
              </div>
            </div>

            <div className="hero-feature-item">
              <div className="hero-feature-icon">
                <CalendarCheck2 size={18} />
              </div>
              <div className="hero-feature-text">
                <div className="hero-feature-title">Daily Attendance & Roll-Call</div>
                <div className="hero-feature-desc">Touch-friendly roll-call, absentee tracking directory, and offline sync.</div>
              </div>
            </div>

            <div className="hero-feature-item">
              <div className="hero-feature-icon">
                <FileCheck2 size={18} />
              </div>
              <div className="hero-feature-text">
                <div className="hero-feature-title">Marks Management & Official Reports</div>
                <div className="hero-feature-desc">Dynamic scoring thresholds, sealed publications, and official report cards.</div>
              </div>
            </div>
          </div>

          <div className="login-hero-footer">
            <div className="login-hero-academic-pill">
              <span className="live-status-dot" />
              <span>Academic Year 2026 • Assessment Period</span>
            </div>
            <div className="login-hero-zone-text">
              {SCHOOL_PROFILE.zone} Educational Zone • Eastern Province, Sri Lanka
            </div>
          </div>
        </aside>

        {/* Right Authentication Card */}
        <main className="login-card-container card">
          {/* Brand & Portal Header */}
          <header className="login-brand-header">
            {/* Desktop Institution Context Pill */}
            <div className="login-desktop-inst-pill">
              <span className="inst-name-en">{SCHOOL_PROFILE.name}</span>
              <span className="inst-dot">•</span>
              <span className="inst-name-ta">{SCHOOL_PROFILE.nameTamil}</span>
              <span className="inst-dot">•</span>
              <span className="inst-census">Census No. {SCHOOL_PROFILE.censusNo}</span>
            </div>

            {/* Mobile Crest & Header */}
            <div className="login-mobile-crest">
              <img
                src="/kcc-logo.png"
                alt="Kattankudy Central College Official Crest"
                className="login-mobile-crest-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <h1 className="login-school-title">
              <span className="desktop-title">Academic Portal Sign In</span>
              <span className="mobile-title">{SCHOOL_PROFILE.name}</span>
            </h1>

            <div className="login-tamil-title mobile-only">
              {SCHOOL_PROFILE.nameTamil}
            </div>

            <p className="login-census-subtitle">
              <span className="desktop-desc">Authoritative operations portal for executive leadership, sectional heads, and faculty.</span>
              <span className="mobile-desc">{SCHOOL_PROFILE.secondaryTitle} • Census No. {SCHOOL_PROFILE.censusNo}</span>
            </p>

            <div className="login-system-pill">
              <span className="system-pill-dot" />
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

          {/* Form Container */}
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
              Sign In to Portal
            </Button>
          </form>

          {/* Development & Testing Credentials Panel */}
          {isDemoEnabled && (
            <section className="demo-accounts-panel" aria-label="Development Demo Accounts">
              <div className="demo-panel-header">
                <div className="demo-panel-title">
                  <KeyRound size={16} />
                  <span>Testing & Demo Accounts</span>
                </div>
                <span className="badge badge-dev-pill">
                  <Sparkles size={11} />
                  Dev Mode
                </span>
              </div>

              <p className="demo-panel-description">
                Click <strong>Fill</strong> to populate form fields, or <strong>Sign In ➔</strong> for instant 1-click authentication:
              </p>

              <div className="demo-accounts-grid">
                {DEMO_ACCOUNTS.map((acc, index) => {
                  const IconComponent = acc.icon;
                  const isLastOdd = index === DEMO_ACCOUNTS.length - 1 && DEMO_ACCOUNTS.length % 2 !== 0;
                  return (
                    <div
                      key={acc.username}
                      className={`demo-account-card ${isLastOdd ? 'demo-card-full-span' : ''}`}
                    >
                      <div className="demo-card-main-content">
                        <div className="demo-card-header">
                          <div className="demo-card-identity">
                            <div
                              className="demo-card-icon"
                              style={{ background: acc.bgColor, color: acc.color }}
                            >
                              <IconComponent size={14} />
                            </div>
                            <div className="demo-card-text-col">
                              <div className="demo-card-role-title" title={acc.roleTitle}>
                                {acc.roleTitle}
                              </div>
                              <div className="demo-card-creds">
                                <code>{acc.username}</code> <span className="creds-sep">/</span> <code>{acc.password}</code>
                              </div>
                            </div>
                          </div>

                          <span
                            className="demo-role-badge"
                            style={{
                              background: acc.bgColor,
                              color: acc.color,
                              borderColor: acc.borderColor
                            }}
                          >
                            {acc.roleTag}
                          </span>
                        </div>

                        <div className="demo-scope-text" title={acc.scope}>
                          Scope: {acc.scope}
                        </div>
                      </div>

                      <div className="demo-actions-row">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          fullWidth
                          onClick={() => handleFillCredentials(acc.username, acc.password, acc.roleTitle)}
                          leftIcon={<ClipboardCheck size={13} />}
                        >
                          Fill Form
                        </Button>

                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => handleQuickDemo(acc.username, acc.password)}
                          rightIcon={<ArrowRight size={13} />}
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
            <div className="login-profile-footer-header">
              <Info size={13} />
              <span>Institutional Profile Reference</span>
            </div>
            <div className="login-profile-meta-grid">
              <div><strong>Principal:</strong> {SCHOOL_PROFILE.principalName}</div>
              <div><strong>Zone & Division:</strong> {SCHOOL_PROFILE.zone} • {SCHOOL_PROFILE.division}</div>
              <div className="full-col">
                <strong>Classification:</strong> {SCHOOL_PROFILE.type} (Census {SCHOOL_PROFILE.censusNo}) • {SCHOOL_PROFILE.studentCategory} (Grades 6–13)
              </div>
            </div>
            <div className="login-demo-notice">
              {SCHOOL_PROFILE.demoResultNotice}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};
