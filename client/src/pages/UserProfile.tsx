import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Key,
  Mail,
  School,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RotateCcw,
  Save,
  Clock,
  Wifi,
  Calendar,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  Tabs,
  Card,
  Group,
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Badge,
  Text,
  Title,
  Paper,
  SimpleGrid,
  Divider,
  LoadingOverlay,
  List,
  ThemeIcon
} from '@mantine/core';
import { useForm, isNotEmpty, isEmail } from '@mantine/form';
import { api, setAuthSession, getAuthToken } from '../api/client';
import { useToast } from '../ui';
import { PageContainer } from '../ui/mantine';
import { isUserSectionHead, isUserClassTeacher } from '../utils/authUtils';

interface UserProfileProps {
  user: any;
  onUpdateUser?: (updated: any) => void;
  onNavigate?: (tab: string) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onUpdateUser,
  onNavigate
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<string | null>('details');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [changingPassword, setChangingPassword] = useState<boolean>(false);
  const [freshUser, setFreshUser] = useState<any>(user);
  const [loadingFresh, setLoadingFresh] = useState<boolean>(false);

  const cleanFullName = freshUser?.full_name?.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim() || 'Faculty Member';
  const userInitial = cleanFullName.charAt(0)?.toUpperCase() || 'U';
  const isAdmin = freshUser?.role === 'admin';
  const isSectionHead = isUserSectionHead(freshUser);
  const isClassTeacher = isUserClassTeacher(freshUser);

  const roleDisplay = isAdmin
    ? 'Principal (Institutional Administrator)'
    : isSectionHead
    ? 'Section Head (Academic Supervisor)'
    : isClassTeacher
    ? 'Class Teacher (Homeroom In-Charge)'
    : freshUser?.role
    ? freshUser.role.replace('_', ' ')
    : 'Faculty Member';

  // Profile Form (powered by @mantine/form in uncontrolled mode)
  const profileForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      full_name: cleanFullName,
      email: freshUser?.email || ''
    },
    validate: {
      full_name: isNotEmpty('Full name is required'),
      email: isEmail('A valid email address is required')
    }
  });

  // Password Form (powered by @mantine/form in uncontrolled mode)
  const passwordForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    },
    validate: {
      currentPassword: isNotEmpty('Current password is required'),
      newPassword: (val) => {
        if (!val || val.length < 8) return 'Password must be at least 8 characters long';
        if (!/[a-zA-Z]/.test(val) || !/[0-9]/.test(val)) return 'Password must contain both letters and numbers';
        return null;
      },
      confirmPassword: (val, values) =>
        val !== values.newPassword ? 'Passwords do not match' : null
    }
  });

  // Refresh user data from /api/auth/me
  const refreshUserData = async () => {
    try {
      setLoadingFresh(true);
      const res = await api.getMe();
      if (res?.user) {
        setFreshUser(res.user);
        profileForm.setValues({
          full_name: res.user.full_name?.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim() || '',
          email: res.user.email || ''
        });
        profileForm.resetDirty();
        if (onUpdateUser) {
          onUpdateUser(res.user);
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setLoadingFresh(false);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, []);

  // Update Profile Details
  const handleSaveProfile = async (values: typeof profileForm.values) => {
    try {
      setSavingProfile(true);
      const res = await api.updateMyProfile(values);
      if (res?.success && res?.user) {
        setFreshUser(res.user);
        const currentToken = getAuthToken();
        if (currentToken) {
          setAuthSession(currentToken, res.user);
        }
        if (onUpdateUser) {
          onUpdateUser(res.user);
        }
        profileForm.resetDirty();
        toast.showSuccess('Personal profile updated successfully!');
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async (values: typeof passwordForm.values) => {
    try {
      setChangingPassword(true);
      const res = await api.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });

      if (res?.success) {
        if (res.token) {
          setAuthSession(res.token, freshUser);
        }
        passwordForm.reset();
        toast.showSuccess('Password updated successfully! Your active session has been renewed.');
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  // Format created date
  const memberSince = freshUser?.created_at
    ? new Date(freshUser.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '2026 Academic Session';

  const assignedClassesList = freshUser?.assignedClasses || [];
  const assignedSectionsList = freshUser?.assignedSections || [];

  return (
    <PageContainer>
      <div style={{ paddingBottom: '2.5rem' }}>
        {/* Profile Hero Banner */}
        <Paper
          withBorder
          p="xl"
          radius="md"
          mb="xl"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e293b 100%)',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Subtle Institutional Background Accent */}
          <div
            style={{
              position: 'absolute',
              right: '-30px',
              bottom: '-30px',
              opacity: 0.08,
              pointerEvents: 'none'
            }}
          >
            <School size={220} color="#ffffff" />
          </div>

          <Group align="center" gap="lg" wrap="wrap">
            {/* Big Avatar Circle */}
            <div
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                border: '3px solid rgba(255, 255, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 700,
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
              }}
            >
              {userInitial}
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <Group gap="xs" mb={4}>
                <Title order={2} style={{ color: '#ffffff', margin: 0, fontWeight: 700 }}>
                  {cleanFullName}
                </Title>
                <Badge color="green" variant="filled" size="sm" leftSection={<CheckCircle2 size={12} />}>
                  Active Staff
                </Badge>
              </Group>

              <Text size="sm" style={{ color: '#cbd5e1' }} mb="xs">
                {roleDisplay} • Kattankudy Central College
              </Text>

              <Group gap="sm" wrap="wrap">
                <Badge variant="outline" color="gray" size="sm" style={{ color: '#e2e8f0', borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                  @{freshUser?.username}
                </Badge>
                <Badge variant="outline" color="gray" size="sm" style={{ color: '#e2e8f0', borderColor: 'rgba(255, 255, 255, 0.3)' }} leftSection={<Mail size={12} />}>
                  {freshUser?.email}
                </Badge>
                <Badge variant="outline" color="gray" size="sm" style={{ color: '#e2e8f0', borderColor: 'rgba(255, 255, 255, 0.3)' }} leftSection={<Calendar size={12} />}>
                  Member since {memberSince}
                </Badge>
              </Group>
            </div>
          </Group>
        </Paper>

        {/* Profile Navigation Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab} variant="outline" radius="md">
          <Tabs.List style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-surface, #fff)' }}>
            <Tabs.Tab value="details" leftSection={<User size={16} />}>
              Personal Information
            </Tabs.Tab>
            <Tabs.Tab value="security" leftSection={<Key size={16} />}>
              Password & Security
            </Tabs.Tab>
            <Tabs.Tab value="responsibilities" leftSection={<Layers size={16} />}>
              Assigned Responsibilities
            </Tabs.Tab>
            <Tabs.Tab value="session" leftSection={<Shield size={16} />}>
              Session & Diagnostics
            </Tabs.Tab>
          </Tabs.List>

          {/* ================================================================ */}
          {/* TAB 1: PERSONAL INFORMATION & ACCOUNT DETAILS                    */}
          {/* ================================================================ */}
          <Tabs.Panel value="details">
            <Paper p="lg" radius="md" withBorder style={{ position: 'relative' }}>
              <LoadingOverlay visible={loadingFresh || savingProfile} />

              <form onSubmit={profileForm.onSubmit(handleSaveProfile)}>
                <Stack gap="lg">
                  <div>
                    <Text fw={600} size="md">
                      Staff Identification & Profile Details
                    </Text>
                    <Text size="xs" c="dimmed">
                      Update your official faculty name and institutional email address.
                    </Text>
                  </div>
                  <Divider />

                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <TextInput
                      label="Full Faculty Name"
                      description="Official name appearing on academic registers and reports"
                      placeholder="e.g. Mr. A. L. M. Sabry"
                      required
                      leftSection={<User size={14} />}
                      key={profileForm.key('full_name')}
                      {...profileForm.getInputProps('full_name')}
                    />

                    <TextInput
                      label="Official Email Address"
                      description="Institutional email used for school system notifications"
                      placeholder="e.g. teacher@kcc.sch.lk"
                      required
                      leftSection={<Mail size={14} />}
                      key={profileForm.key('email')}
                      {...profileForm.getInputProps('email')}
                    />

                    <TextInput
                      label="System Username"
                      description="Unique login username (assigned by School Administrator)"
                      value={freshUser?.username || ''}
                      disabled
                      leftSection={<Shield size={14} />}
                    />

                    <TextInput
                      label="Institutional Role"
                      description="Official authority and role designation"
                      value={roleDisplay}
                      disabled
                      leftSection={<School size={14} />}
                    />

                    <TextInput
                      label="User ID"
                      description="Database index identifier"
                      value={`Staff Ref: #${freshUser?.id || '—'}`}
                      disabled
                    />

                    <TextInput
                      label="Account Status"
                      description="Current administrative security status"
                      value={freshUser?.is_active ? 'Active • Authorized Staff' : 'Inactive'}
                      disabled
                    />
                  </SimpleGrid>

                  <Group justify="flex-end" mt="md">
                    <Button
                      variant="default"
                      size="sm"
                      leftSection={<RotateCcw size={14} />}
                      onClick={refreshUserData}
                    >
                      Reload
                    </Button>
                    <Button
                      type="submit"
                      color="blue"
                      size="sm"
                      leftSection={<Save size={16} />}
                      loading={savingProfile}
                    >
                      Save Profile Changes
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          </Tabs.Panel>

          {/* ================================================================ */}
          {/* TAB 2: PASSWORD & SECURITY MANAGEMENT                            */}
          {/* ================================================================ */}
          <Tabs.Panel value="security">
            <Paper p="lg" radius="md" withBorder style={{ position: 'relative' }}>
              <LoadingOverlay visible={changingPassword} />

              <form onSubmit={passwordForm.onSubmit(handleChangePassword)}>
                <Stack gap="lg">
                  <div>
                    <Text fw={600} size="md">
                      Change Account Password
                    </Text>
                    <Text size="xs" c="dimmed">
                      Ensure your account uses a secure password to protect confidential student registers.
                    </Text>
                  </div>
                  <Divider />

                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <Stack gap="md">
                      <PasswordInput
                        label="Current Password"
                        description="Enter your existing account password"
                        placeholder="••••••••"
                        required
                        leftSection={<Lock size={14} />}
                        key={passwordForm.key('currentPassword')}
                        {...passwordForm.getInputProps('currentPassword')}
                      />

                      <PasswordInput
                        label="New Password"
                        description="Minimum 8 characters with letters and numbers"
                        placeholder="••••••••"
                        required
                        leftSection={<Key size={14} />}
                        key={passwordForm.key('newPassword')}
                        {...passwordForm.getInputProps('newPassword')}
                      />

                      <PasswordInput
                        label="Confirm New Password"
                        description="Re-type your new password to verify"
                        placeholder="••••••••"
                        required
                        leftSection={<CheckCircle2 size={14} />}
                        key={passwordForm.key('confirmPassword')}
                        {...passwordForm.getInputProps('confirmPassword')}
                      />
                    </Stack>

                    {/* Password Policy Card */}
                    <Card withBorder padding="md" radius="sm" style={{ backgroundColor: 'var(--bg-subtle, #f8fafc)' }}>
                      <Text fw={600} size="sm" mb="xs">
                        Institutional Password Policy
                      </Text>
                      <Text size="xs" c="dimmed" mb="md">
                        To comply with Ministry of Education data protection standards:
                      </Text>

                      <List
                        spacing="xs"
                        size="xs"
                        icon={
                          <ThemeIcon color="blue" size={20} radius="xl">
                            <CheckCircle2 size={12} />
                          </ThemeIcon>
                        }
                      >
                        <List.Item>At least 8 characters in length</List.Item>
                        <List.Item>Must contain alphabetical letters (A-Z or a-z)</List.Item>
                        <List.Item>Must contain at least one numeric digit (0-9)</List.Item>
                        <List.Item>Changing your password will renew your active session token</List.Item>
                      </List>
                    </Card>
                  </SimpleGrid>

                  <Group justify="flex-end" mt="md">
                    <Button
                      type="submit"
                      color="blue"
                      size="sm"
                      leftSection={<Key size={16} />}
                      loading={changingPassword}
                    >
                      Update Password
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          </Tabs.Panel>

          {/* ================================================================ */}
          {/* TAB 3: ACADEMIC RESPONSIBILITIES & ROLES                         */}
          {/* ================================================================ */}
          <Tabs.Panel value="responsibilities">
            <Stack gap="lg">
              {/* Administrator Authority */}
              {isAdmin && (
                <Card withBorder padding="md" radius="sm">
                  <Group gap="xs" mb="xs">
                    <Shield size={18} color="#2563eb" />
                    <Text fw={600} size="sm">
                      School Administration & System Ownership
                    </Text>
                    <Badge color="blue" variant="light" size="sm">
                      Full Institutional Authority
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mb="md">
                    As the Principal / School Administrator, you have complete authority across institutional metadata, faculty assignments, student admissions, attendance oversight, and audit logs.
                  </Text>

                  <Group gap="xs">
                    <Button
                      variant="light"
                      size="xs"
                      color="blue"
                      rightSection={<ArrowRight size={14} />}
                      onClick={() => onNavigate?.('settings')}
                    >
                      School Settings
                    </Button>
                    <Button
                      variant="light"
                      size="xs"
                      color="blue"
                      rightSection={<ArrowRight size={14} />}
                      onClick={() => onNavigate?.('teachers')}
                    >
                      Faculty Directory
                    </Button>
                    <Button
                      variant="light"
                      size="xs"
                      color="blue"
                      rightSection={<ArrowRight size={14} />}
                      onClick={() => onNavigate?.('admin')}
                    >
                      User & Role Management
                    </Button>
                  </Group>
                </Card>
              )}

              {/* Section Head Assignment */}
              {isSectionHead && (
                <Card withBorder padding="md" radius="sm">
                  <Group gap="xs" mb="xs">
                    <Layers size={18} color="#7c3aed" />
                    <Text fw={600} size="sm">
                      Section Head Academic Supervision
                    </Text>
                    <Badge color="grape" variant="light" size="sm">
                      Section Head
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mb="md">
                    You are assigned as Section Head. You have supervisory access to section classes and the live Section Walkthrough monitoring tool.
                  </Text>

                  {assignedSectionsList.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                      {assignedSectionsList.map((sec: any) => (
                        <Paper key={sec.id} withBorder p="xs" radius="sm">
                          <Text fw={600} size="xs">
                            {sec.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Grades: {sec.grade_range || 'All'}
                          </Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  ) : (
                    <Text size="xs" c="dimmed" fs="italic">
                      Assigned across school sections according to leadership authorizations.
                    </Text>
                  )}

                  <Group justify="flex-end" mt="sm">
                    <Button
                      variant="light"
                      size="xs"
                      color="grape"
                      rightSection={<ArrowRight size={14} />}
                      onClick={() => onNavigate?.('mobile-classroom-status')}
                    >
                      Launch Section Walkthrough
                    </Button>
                  </Group>
                </Card>
              )}

              {/* Class Teacher Assignment */}
              {isClassTeacher && (
                <Card withBorder padding="md" radius="sm">
                  <Group gap="xs" mb="xs">
                    <School size={18} color="#059669" />
                    <Text fw={600} size="sm">
                      Homeroom Class Teacher Responsibilities
                    </Text>
                    <Badge color="green" variant="light" size="sm">
                      Class Teacher
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mb="md">
                    You are authorized to manage daily student attendance and maintain the roll-call register for your assigned homeroom class.
                  </Text>

                  {assignedClassesList.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                      {assignedClassesList.map((cls: any) => (
                        <Paper key={cls.id} withBorder p="xs" radius="sm">
                          <Text fw={600} size="xs">
                            {cls.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Grade: {cls.grade} • Section: {cls.section_name || 'Standard'}
                          </Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  ) : (
                    <Text size="xs" c="dimmed" fs="italic">
                      Assigned to homeroom classes via teacher assignments.
                    </Text>
                  )}

                  <Group justify="flex-end" mt="sm">
                    <Button
                      variant="light"
                      size="xs"
                      color="green"
                      rightSection={<ArrowRight size={14} />}
                      onClick={() => onNavigate?.('mobile-attendance')}
                    >
                      Open Mobile Roll-Call
                    </Button>
                  </Group>
                </Card>
              )}

              {/* General Staff Note if not specialized */}
              {!isAdmin && !isSectionHead && !isClassTeacher && (
                <Paper withBorder p="md" radius="sm" style={{ textAlign: 'center' }}>
                  <School size={28} color="#94a3b8" style={{ margin: '0 auto 0.5rem auto' }} />
                  <Text fw={600} size="sm">
                    Teaching Faculty
                  </Text>
                  <Text size="xs" c="dimmed">
                    You have access to school directories, attendance reports, and live classroom status monitoring. Contact the Principal if your homeroom assignments need updating.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ================================================================ */}
          {/* TAB 4: SESSION & DEVICE STATUS                                   */}
          {/* ================================================================ */}
          <Tabs.Panel value="session">
            <Paper p="lg" radius="md" withBorder>
              <Stack gap="md">
                <div>
                  <Text fw={600} size="md">
                    Device Session & Offline Sync Status
                  </Text>
                  <Text size="xs" c="dimmed">
                    Information about your active browser session on the school local network.
                  </Text>
                </div>
                <Divider />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Card withBorder padding="md" radius="sm">
                    <Group gap="xs" mb="xs">
                      <Wifi size={16} color="#2563eb" />
                      <Text fw={600} size="xs">
                        Network Connectivity
                      </Text>
                    </Group>
                    <Text size="sm" fw={600} color={navigator.onLine ? 'green' : 'red'}>
                      {navigator.onLine ? 'Connected to School Network' : 'Working in Offline Mode'}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {navigator.onLine
                        ? 'All attendance submissions are synchronized immediately with the local SQLite server.'
                        : 'Local mutations are safely stored in IndexedDB and will synchronize upon reconnecting.'}
                    </Text>
                  </Card>

                  <Card withBorder padding="md" radius="sm">
                    <Group gap="xs" mb="xs">
                      <Clock size={16} color="#059669" />
                      <Text fw={600} size="xs">
                        Session Security Token
                      </Text>
                    </Group>
                    <Text size="sm" fw={600}>
                      Token Version: {freshUser?.token_version || 1}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Sessions expire automatically after 24 hours of inactivity or when signing out.
                    </Text>
                  </Card>
                </SimpleGrid>
              </Stack>
            </Paper>
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageContainer>
  );
};

export default UserProfile;
