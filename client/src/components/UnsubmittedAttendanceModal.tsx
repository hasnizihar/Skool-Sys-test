import React from 'react';
import { CheckCircle2, AlertTriangle, Save, Send, X } from 'lucide-react';
import { Button } from '@mantine/core';

interface UnsubmittedAttendanceModalProps {
  opened: boolean;
  classTitle?: string;
  dateStr?: string;
  counts: {
    total: number;
    recorded: number;
    unrecorded: number;
  };
  saving?: boolean;
  onClose: () => void; // Stay on register
  onSubmitAndLeave: () => Promise<void> | void;
  onSaveDraftAndLeave: () => Promise<void> | void;
  onDiscardAndLeave: () => void;
}

const formatDisplayDate = (isoDate?: string) => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  return `${parseInt(parts[2], 10)} ${month} ${parts[0]}`;
};

export const UnsubmittedAttendanceModal: React.FC<UnsubmittedAttendanceModalProps> = ({
  opened,
  classTitle = 'Selected Class',
  dateStr,
  counts,
  saving = false,
  onClose,
  onSubmitAndLeave,
  onSaveDraftAndLeave,
  onDiscardAndLeave
}) => {
  if (!opened) return null;

  const canSubmitFinal = counts.unrecorded === 0 && counts.total > 0;
  const formattedDate = formatDisplayDate(dateStr);

  return (
    <div className="msa-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" style={{ zIndex: 1100 }}>
      <div
        className="msa-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px', padding: '20px' }}
      >
        {/* Header */}
        <div className="msa-modal-header" style={{ alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: canSubmitFinal ? '#eff6ff' : '#fffbeb',
                border: `1px solid ${canSubmitFinal ? '#bfdbfe' : '#fde68a'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: canSubmitFinal ? '#2563eb' : '#d97706',
                flexShrink: 0
              }}
            >
              {canSubmitFinal ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div>
              <h3 className="msa-modal-title" style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                {canSubmitFinal ? 'Submit Final Register?' : 'Attendance Incomplete'}
              </h3>
              <p className="msa-modal-subtitle" style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                {classTitle} {formattedDate ? `• ${formattedDate}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="msa-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
            style={{ marginTop: '-2px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Callout Banner */}
        {canSubmitFinal ? (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px',
              margin: '8px 0 16px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                All {counts.total} Students Marked
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: '#dcfce7',
                  color: '#15803d',
                  border: '1px solid #86efac',
                  borderRadius: '6px',
                  padding: '2px 8px'
                }}
              >
                100% COMPLETE
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
              Roll-call is complete. Would you like to submit the official finalized register before leaving?
            </p>
          </div>
        ) : (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '12px 14px',
              margin: '8px 0 16px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#92400e' }}>
                Roll-Call In Progress
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  padding: '2px 8px'
                }}
              >
                {counts.recorded}/{counts.total} MARKED
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#b45309', lineHeight: 1.45 }}>
              <strong>{counts.unrecorded} student(s)</strong> remain unmarked. Final submission requires all students to be marked. You can save your progress as a <strong>Draft</strong> so no marks are lost.
            </p>
          </div>
        )}

        {/* Action Buttons Stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {canSubmitFinal ? (
            <>
              <Button
                color="blue"
                size="md"
                radius="md"
                leftSection={<Send size={16} />}
                onClick={onSubmitAndLeave}
                loading={saving}
                fullWidth
                style={{ fontWeight: 700, height: '44px' }}
              >
                Submit Final Register & Leave
              </Button>

              <Button
                variant="default"
                size="md"
                radius="md"
                leftSection={<Save size={16} />}
                onClick={onSaveDraftAndLeave}
                loading={saving}
                fullWidth
                style={{ fontWeight: 600, height: '42px', color: '#334155' }}
              >
                Save Draft & Leave
              </Button>
            </>
          ) : (
            <Button
              color="blue"
              size="md"
              radius="md"
              leftSection={<Save size={16} />}
              onClick={onSaveDraftAndLeave}
              loading={saving}
              fullWidth
              style={{ fontWeight: 700, height: '44px' }}
            >
              Save Draft & Leave
            </Button>
          )}

          {/* Balanced Footer Choices: Stay on Register vs Discard Changes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '2px' }}>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              radius="md"
              onClick={onClose}
              disabled={saving}
              fullWidth
              style={{ fontWeight: 600, height: '38px', color: '#475569' }}
            >
              Stay on Register
            </Button>

            <Button
              variant="subtle"
              color="red"
              size="sm"
              radius="md"
              onClick={onDiscardAndLeave}
              disabled={saving}
              fullWidth
              style={{ fontWeight: 600, height: '38px', color: '#dc2626' }}
            >
              Discard Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
