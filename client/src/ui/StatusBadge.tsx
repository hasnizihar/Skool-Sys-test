import React from 'react';
import {
  Check,
  X,
  Clock,
  Shield,
  FileText,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Award
} from 'lucide-react';
import './statusBadge.css';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AcademicGrade = 'A' | 'B' | 'C' | 'S' | 'F';
export type WorkflowStatus =
  | 'draft'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'submitted'
  | 'approved'
  | 'published'
  | 'conflicted'
  | 'rejected';

export type StatusBadgeType = AttendanceStatus | AcademicGrade | WorkflowStatus | 'neutral';

export interface StatusBadgeProps {
  status: StatusBadgeType;
  label?: string;
  variant?: 'subtle' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  variant = 'subtle',
  size = 'md',
  showIcon = true,
  className = ''
}) => {
  // Normalize status key
  const normalized = status.toLowerCase();

  // Resolve default icon & label based on semantic status
  let resolvedIcon: React.ReactNode = null;
  let resolvedLabel = label;

  switch (normalized) {
    case 'present':
    case 'p':
      resolvedIcon = <Check size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Present [P]';
      break;
    case 'absent':
      resolvedIcon = <X size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Absent [A]';
      break;
    case 'late':
    case 'l':
      resolvedIcon = <Clock size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Late [L]';
      break;
    case 'excused':
    case 'e':
      resolvedIcon = <Shield size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Excused [E]';
      break;
    case 'a':
    case 'b':
    case 'c':
    case 's':
    case 'f':
      resolvedIcon = <Award size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || `Grade ${status.toUpperCase()}`;
      break;
    case 'draft':
      resolvedIcon = <FileText size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Draft';
      break;
    case 'pending':
      resolvedIcon = <Clock size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Pending Sync';
      break;
    case 'syncing':
      resolvedIcon = <RefreshCw size={size === 'sm' ? 11 : 13} className="sk-spin" />;
      resolvedLabel = label || 'Syncing...';
      break;
    case 'synced':
    case 'submitted':
      resolvedIcon = <CheckCircle2 size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Synced';
      break;
    case 'published':
      resolvedIcon = <Award size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Published';
      break;
    case 'conflicted':
      resolvedIcon = <AlertTriangle size={size === 'sm' ? 11 : 13} />;
      resolvedLabel = label || 'Conflict Detected';
      break;
    default:
      resolvedLabel = label || status;
  }

  // Determine CSS status modifier
  const statusClass =
    ['a', 'b', 'c', 's', 'f'].includes(normalized)
      ? `sk-badge--grade-${normalized}`
      : `sk-badge--${normalized}`;

  return (
    <span
      className={[
        'sk-badge',
        statusClass,
        `sk-badge--${variant}`,
        `sk-badge--${size}`,
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showIcon && resolvedIcon && (
        <span className="sk-badge-icon" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
      <span>{resolvedLabel}</span>
    </span>
  );
};
