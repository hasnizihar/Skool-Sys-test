import React, { useState } from 'react';
import {
  Button,
  Input,
  StatusBadge,
  SegmentedControl,
  Modal,
  useToast
} from './index';
import {
  Check,
  X,
  Clock,
  Shield,
  Search,
  Lock,
  Mail,
  User,
  Sparkles,
  RotateCcw,
  Plus
} from 'lucide-react';

export const ComponentPreview: React.FC = () => {
  const toast = useToast();

  // Button States
  const [btnLoading, setBtnLoading] = useState(false);

  // Input States
  const [textVal, setTextVal] = useState('');
  const [passVal, setPassVal] = useState('Secret123!');
  const [errorInputVal, setErrorInputVal] = useState('Invalid Score');

  // SegmentedControl States
  const [attendanceVal, setAttendanceVal] = useState<'present' | 'absent' | 'late' | 'excused'>('present');
  const [filterVal, setFilterVal] = useState<'all' | 'unmarked' | 'absent'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<'sm' | 'md' | 'lg'>('md');

  const attendanceOptions = [
    {
      value: 'present' as const,
      label: 'Present',
      letter: 'P',
      icon: <Check size={14} />,
      colorVariant: 'present' as const,
      ariaLabel: 'Mark student present'
    },
    {
      value: 'absent' as const,
      label: 'Absent',
      letter: 'A',
      icon: <X size={14} />,
      colorVariant: 'absent' as const,
      ariaLabel: 'Mark student absent'
    },
    {
      value: 'late' as const,
      label: 'Late',
      letter: 'L',
      icon: <Clock size={14} />,
      colorVariant: 'late' as const,
      ariaLabel: 'Mark student late'
    },
    {
      value: 'excused' as const,
      label: 'Excused',
      letter: 'E',
      icon: <Shield size={14} />,
      colorVariant: 'excused' as const,
      ariaLabel: 'Mark student excused'
    }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      <header style={{ marginBottom: '32px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
              SkoolSys 2.0 Design Tokens & UI Primitives
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Institutional Green (#026536), School Gold (#F1EF22), 48px Attendance Touch Targets & WCAG 2.2 AA Accessibility.
            </p>
          </div>
        </div>
      </header>

      {/* Section 1: Buttons */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          1. Reusable Buttons (`Button.tsx`)
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <Button variant="primary" leftIcon={<Check size={16} />}>Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="accent">School Gold Accent</Button>
          <Button variant="danger" leftIcon={<X size={16} />}>Danger / Delete</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <Button size="sm" variant="primary">Small (36px / 44px)</Button>
          <Button size="md" variant="primary">Medium (40px)</Button>
          <Button size="lg" variant="primary">Large (48px Touch)</Button>
          <Button
            variant="secondary"
            isLoading={btnLoading}
            onClick={() => {
              setBtnLoading(true);
              setTimeout(() => setBtnLoading(false), 2000);
            }}
          >
            {btnLoading ? 'Processing...' : 'Click to Test Loading Spinner'}
          </Button>
          <Button variant="primary" disabled>Disabled State</Button>
          <Button variant="secondary" iconOnly aria-label="Add item"><Plus size={16} /></Button>
        </div>
      </section>

      {/* Section 2: Inputs */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          2. Accessible Form Inputs (`Input.tsx`)
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <Input
            label="Student Full Name"
            placeholder="e.g. Mohamed Thahir"
            required
            leftIcon={<User size={16} />}
            value={textVal}
            onChange={(e) => setTextVal(e.target.value)}
            clearable
            onClear={() => setTextVal('')}
            helperText="Enter official name as on birth certificate"
          />

          <Input
            label="Staff Password"
            type="password"
            showPasswordToggle
            required
            leftIcon={<Lock size={16} />}
            value={passVal}
            onChange={(e) => setPassVal(e.target.value)}
            helperText="Click eye icon to toggle visibility"
          />

          <Input
            label="Terminal Mark (Score 0–100)"
            required
            isInvalid
            errorMessage="Score cannot exceed maximum of 100 for this examination component"
            value={errorInputVal}
            onChange={(e) => setErrorInputVal(e.target.value)}
          />

          <Input
            label="Search Roster"
            placeholder="Search by admission number or name..."
            leftIcon={<Search size={16} />}
            clearable
          />
        </div>
      </section>

      {/* Section 3: Status Badges */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          3. Status Badges & Academic Grade Chips (`StatusBadge.tsx`)
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Attendance Statuses (Subtle & Solid):</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <StatusBadge status="present" variant="subtle" />
            <StatusBadge status="present" variant="solid" />
            <StatusBadge status="absent" variant="subtle" />
            <StatusBadge status="absent" variant="solid" />
            <StatusBadge status="late" variant="subtle" />
            <StatusBadge status="late" variant="solid" />
            <StatusBadge status="excused" variant="subtle" />
            <StatusBadge status="excused" variant="solid" />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Academic Grade Chips (Grades 6–13):</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <StatusBadge status="A" label="Grade A (Distinction 75+)" />
            <StatusBadge status="B" label="Grade B (Very Good 65+)" />
            <StatusBadge status="C" label="Grade C (Credit 50+)" />
            <StatusBadge status="S" label="Grade S (Pass 35+)" />
            <StatusBadge status="F" label="Grade F (Fail < 35)" />
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Workflow & Sync States:</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <StatusBadge status="draft" />
            <StatusBadge status="pending" label="Pending Sync (Offline)" />
            <StatusBadge status="syncing" label="Syncing in Background..." />
            <StatusBadge status="synced" label="Synced to Server" />
            <StatusBadge status="published" label="Published (SHA-256 Sealed)" />
            <StatusBadge status="conflicted" label="Concurrency Conflict" />
          </div>
        </div>
      </section>

      {/* Section 4: Segmented Controls */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          4. Attendance 48px Touch Segmented Control (`SegmentedControl.tsx`)
        </h2>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)' }}>#01 • Mohamed Thahir</span>
              <span style={{ marginLeft: '8px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>ADM-2024-001 • Grade 8-A</span>
            </div>
            <StatusBadge status={attendanceVal} size="sm" />
          </div>

          <SegmentedControl
            isAttendance
            fullWidth
            options={attendanceOptions}
            value={attendanceVal}
            onChange={(val) => setAttendanceVal(val)}
            ariaLabel="Select attendance for Mohamed Thahir"
          />

          <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            👉 <strong>Try Arrow Keys:</strong> Focus any button and use <kbd>←</kbd> <kbd>→</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> to change status with complete keyboard accessibility.
          </p>
        </div>
      </section>

      {/* Section 5: Modals */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          5. Accessible Modal Dialog (`Modal.tsx`)
        </h2>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => {
              setModalSize('md');
              setIsModalOpen(true);
            }}
          >
            Open Medium Modal (580px)
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setModalSize('sm');
              setIsModalOpen(true);
            }}
          >
            Open Small Dialog (440px)
          </Button>
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          size={modalSize}
          title="Attendance Conflict Detected"
          description="Review conflicting attendance markings between local device and server revision."
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsModalOpen(false);
                  toast.showSuccess('Resolved attendance conflict successfully.');
                }}
              >
                Accept Local Version
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0 }}>
              The class register for <strong>Grade 8-A (2026-10-28)</strong> was modified on another terminal while your device was offline.
            </p>
            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <strong>Student:</strong> Mohamed Thahir (Roll #01)<br />
              <strong>Local Device:</strong> <StatusBadge status="absent" size="sm" /><br />
              <strong>School Server:</strong> <StatusBadge status="present" size="sm" />
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Trap focus is active: Press <kbd>Tab</kbd> to cycle inside dialog, or press <kbd>Esc</kbd> to dismiss.
            </p>
          </div>
        </Modal>
      </section>

      {/* Section 6: Toasts */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--text-main)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
          6. Accessible Toast Notifications (`ToastContext.tsx`)
        </h2>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => {
              toast.showSuccess('Marked 40 students present in Grade 8-A.', {
                label: 'Undo Action',
                onClick: () => {
                  toast.showInfo('Mark all present action undone.');
                }
              });
            }}
          >
            Trigger "Mark All Present" (with 5s Undo Action)
          </Button>

          <Button
            variant="danger"
            onClick={() => {
              toast.showError('Offline sync rejected: HTTP 409 Concurrency conflict on Grade 11-A.');
            }}
          >
            Trigger Error Toast
          </Button>

          <Button
            variant="accent"
            onClick={() => {
              toast.showWarning('Device offline. 3 registers stored in IndexedDB.');
            }}
          >
            Trigger Warning Toast
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              toast.showInfo('Academic term 1 examination schedule updated.');
            }}
          >
            Trigger Info Toast
          </Button>
        </div>
      </section>
    </div>
  );
};
