import React from 'react';
import { AlertTriangle, Info, CheckCircle2, HelpCircle } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  confirmLoading = false
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertTriangle size={24} style={{ color: 'var(--absent)' }} />;
      case 'warning':
        return <HelpCircle size={24} style={{ color: 'var(--late)' }} />;
      case 'primary':
      default:
        return <Info size={24} style={{ color: 'var(--kcc-primary)' }} />;
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="460px"
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div style={{ flexShrink: 0, marginTop: '2px' }}>{getIcon()}</div>
        <div style={{ fontSize: '0.925rem', color: 'var(--kcc-text)', lineHeight: 1.5 }}>
          {message}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirmLoading}
          className="btn btn-secondary"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmLoading}
          className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          style={
            variant === 'danger'
              ? { backgroundColor: 'var(--absent)', color: '#fff', borderColor: 'var(--absent)' }
              : undefined
          }
        >
          {confirmLoading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </AccessibleModal>
  );
};

