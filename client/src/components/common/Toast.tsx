import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((m: string, t?: string) => showToast({ type: 'success', message: m, title: t }), [showToast]);
  const error = useCallback((m: string, t?: string) => showToast({ type: 'error', message: m, title: t, duration: 6000 }), [showToast]);
  const warning = useCallback((m: string, t?: string) => showToast({ type: 'warning', message: m, title: t }), [showToast]);
  const info = useCallback((m: string, t?: string) => showToast({ type: 'info', message: m, title: t }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div
        className="toast-container"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          zIndex: 9999,
          maxWidth: '380px',
          width: 'calc(100% - 3rem)',
          pointerEvents: 'none'
        }}
      >
        {toasts.map((toast) => {
          let bg = 'var(--kcc-surface)';
          let border = 'var(--kcc-border)';
          let iconColor = 'var(--kcc-primary)';
          let Icon = Info;

          if (toast.type === 'success') {
            bg = 'var(--present-bg)';
            border = 'var(--present-border)';
            iconColor = 'var(--present)';
            Icon = CheckCircle2;
          } else if (toast.type === 'error') {
            bg = 'var(--absent-bg)';
            border = 'var(--absent-border)';
            iconColor = 'var(--absent)';
            Icon = AlertCircle;
          } else if (toast.type === 'warning') {
            bg = 'var(--late-bg)';
            border = 'var(--late-border)';
            iconColor = 'var(--late)';
            Icon = AlertTriangle;
          }

          return (
            <div
              key={toast.id}
              role="alert"
              className="toast-item"
              style={{
                pointerEvents: 'auto',
                backgroundColor: bg,
                border: `1px solid ${border}`,
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                color: 'var(--kcc-text)',
                animation: 'toastSlideIn 200ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <Icon size={18} style={{ color: iconColor, flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '2px' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: '0.825rem', lineHeight: 1.4 }}>{toast.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--kcc-text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

