import React, { useState } from 'react';
import {
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight
} from 'lucide-react';
import { useForm, isNotEmpty } from '@mantine/form';
import {
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Stack
} from '@mantine/core';
import { api, setAuthSession } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
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
    scope: 'School profile oversight, academic years, sections & administrative settings'
  },
  {
    roleTitle: 'Vice Principal Academic',
    name: 'Vice Principal Academic',
    username: 'vp_academic',
    password: 'teacher123',
    roleTag: 'VP Academic',
    scope: 'Academic leadership, school sections & teacher assignments'
  },
  {
    roleTitle: 'Section Head (Grades 6–9)',
    name: 'Section Head (Grades 6–9)',
    username: 'section_head_junior',
    password: 'teacher123',
    roleTag: 'Junior Head',
    scope: 'Junior secondary section walkthrough & classroom status monitoring'
  },
  {
    roleTitle: 'Section Head (Grades 10–13)',
    name: 'Section Head (Grades 10–13)',
    username: 'section_head_senior',
    password: 'teacher123',
    roleTag: 'Senior Head',
    scope: 'Senior secondary section walkthrough & classroom status monitoring'
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
    scope: 'Grade 8-A & 11-A mathematics instruction & classroom teaching'
  },
  {
    roleTitle: 'Science & ICT Teacher',
    name: 'Science & ICT Teacher',
    username: 'teacher_priya',
    password: 'teacher123',
    roleTag: 'Science',
    scope: 'Grade 8-A science & ICT instruction & classroom teaching'
  }
];

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const isDemoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filledFeedback, setFilledFeedback] = useState<string | null>(null);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      username: '',
      password: '',
    },
    validate: {
      username: isNotEmpty('Username or Academic ID is required'),
      password: isNotEmpty('Password is required'),
    },
  });

  const performLogin = async (usernameVal: string, passwordVal: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.login(usernameVal, passwordVal);
      setAuthSession(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = form.onSubmit((values) => {
    return performLogin(values.username, values.password);
  });

  const handleFillCredentials = (u: string, p: string, roleName: string) => {
    form.setValues({ username: u, password: p });
    setError(null);
    setFilledFeedback(`Loaded ${roleName} (${u})`);
    setTimeout(() => setFilledFeedback(null), 3000);
  };

  const handleQuickDemo = (u: string, p: string) => {
    form.setValues({ username: u, password: p });
    performLogin(u, p);
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
          <Alert
            icon={<AlertCircle size={16} />}
            color="red"
            radius="md"
            mb="sm"
            role="alert"
          >
            {error}
          </Alert>
        )}

        {/* Credential Fill Confirmation */}
        {filledFeedback && (
          <Alert
            icon={<CheckCircle2 size={16} />}
            color="statusGreen"
            radius="md"
            mb="sm"
            role="status"
          >
            {filledFeedback}
          </Alert>
        )}

        {/* Clean Sign In Form powered by @mantine/form */}
        <form onSubmit={handleSubmit} className="login-form">
          <Stack gap="sm">
            <TextInput
              label="Username or Academic ID"
              placeholder="e.g. admin or teacher_nimali"
              required
              autoComplete="username"
              leftSection={<User size={16} />}
              key={form.key('username')}
              {...form.getInputProps('username')}
            />

            <PasswordInput
              label="Password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              leftSection={<Lock size={16} />}
              key={form.key('password')}
              {...form.getInputProps('password')}
            />

            <Button
              type="submit"
              variant="filled"
              color="refinedBlue"
              size="md"
              fullWidth
              loading={loading || form.submitting}
              className="login-submit-btn"
              rightSection={<ArrowRight size={16} />}
              mt="xs"
            >
              Sign In
            </Button>
          </Stack>
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
