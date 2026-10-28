import React from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  HelpCircle,
  FileText,
  Send,
  Eye,
  CheckCheck,
  Globe,
  RotateCcw
} from 'lucide-react';

export type StatusType =
  | 'present'
  | 'absent'
  | 'late'
  | 'excused'
  | 'unmarked'
  | 'draft'
  | 'submitted'
  | 'reviewed'
  | 'approved'
  | 'published'
  | 'reissued'
  | 'rejected'
  | 'active'
  | 'inactive'
  | 'pending';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  showIcon = true
}) => {
  const normStatus = (status || '').toLowerCase().trim();

  let text = label || normStatus;
  let bg = 'var(--kcc-canvas)';
  let color = 'var(--kcc-text-muted)';
  let border = 'var(--kcc-border)';
  let Icon = HelpCircle;

  switch (normStatus) {
    case 'present':
      text = label || 'Present';
      bg = 'var(--present-bg)';
      color = 'var(--present)';
      border = 'var(--present-border)';
      Icon = CheckCircle;
      break;
    case 'absent':
      text = label || 'Absent';
      bg = 'var(--absent-bg)';
      color = 'var(--absent)';
      border = 'var(--absent-border)';
      Icon = XCircle;
      break;
    case 'late':
      text = label || 'Late';
      bg = 'var(--late-bg)';
      color = 'var(--late)';
      border = 'var(--late-border)';
      Icon = Clock;
      break;
    case 'excused':
      text = label || 'Excused';
      bg = 'var(--excused-bg)';
      color = 'var(--excused)';
      border = 'var(--excused-border)';
      Icon = ShieldAlert;
      break;
    case 'unmarked':
      text = label || 'Unmarked';
      bg = 'var(--kcc-canvas)';
      color = 'var(--kcc-text-muted)';
      border = 'var(--kcc-border)';
      Icon = HelpCircle;
      break;
    case 'draft':
      text = label || 'Draft';
      bg = 'var(--kcc-canvas)';
      color = 'var(--kcc-text-muted)';
      border = 'var(--kcc-border)';
      Icon = FileText;
      break;
    case 'submitted':
      text = label || 'Submitted';
      bg = '#E0F2FE';
      color = '#0369A1';
      border = '#BAE6FD';
      Icon = Send;
      break;
    case 'reviewed':
      text = label || 'Reviewed';
      bg = '#F3E8FF';
      color = '#7E22CE';
      border = '#E9D5FF';
      Icon = Eye;
      break;
    case 'approved':
      text = label || 'Approved';
      bg = 'var(--kcc-primary-soft)';
      color = 'var(--kcc-primary)';
      border = 'rgba(7, 94, 59, 0.25)';
      Icon = CheckCheck;
      break;
    case 'published':
      text = label || 'Published';
      bg = '#075E3B';
      color = '#FFFFFF';
      border = '#075E3B';
      Icon = Globe;
      break;
    case 'reissued':
      text = label || 'Reissued';
      bg = '#FEF3C7';
      color = '#B45309';
      border = '#FDE68A';
      Icon = RotateCcw;
      break;
    case 'rejected':
      text = label || 'Rejected';
      bg = 'var(--absent-bg)';
      color = 'var(--absent)';
      border = 'var(--absent-border)';
      Icon = XCircle;
      break;
    case 'active':
      text = label || 'Active';
      bg = 'var(--present-bg)';
      color = 'var(--present)';
      border = 'var(--present-border)';
      Icon = CheckCircle;
      break;
    case 'inactive':
      text = label || 'Inactive';
      bg = 'var(--kcc-canvas)';
      color = 'var(--kcc-text-muted)';
      border = 'var(--kcc-border)';
      Icon = XCircle;
      break;
    case 'pending':
      text = label || 'Pending';
      bg = 'var(--late-bg)';
      color = 'var(--late)';
      border = 'var(--late-border)';
      Icon = Clock;
      break;
  }

  const padding =
    size === 'sm' ? '0.15rem 0.45rem' : size === 'lg' ? '0.4rem 0.85rem' : '0.25rem 0.65rem';
  const fontSize = size === 'sm' ? '0.7rem' : size === 'lg' ? '0.85rem' : '0.75rem';
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 15 : 13;

  return (
    <span
      className="badge status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-full)',
        padding,
        fontSize,
        fontWeight: 600,
        textTransform: 'capitalize',
        lineHeight: 1.2,
        whiteSpace: 'nowrap'
      }}
    >
      {showIcon && <Icon size={iconSize} />}
      <span>{text}</span>
    </span>
  );
};

