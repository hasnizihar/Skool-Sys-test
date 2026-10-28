import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import './toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  message: string;
  type?: ToastType;
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  showSuccess: (message: string, action?: ToastAction) => string;
  showError: (message: string) => string;
  showWarning: (message: string, action?: ToastAction) => string;
  showInfo: (message: string) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      id = Math.random().toString(36).substring(2, 9),
      message,
      type = 'info',
      durationMs = 5000,
      action
    }: ToastOptions) => {
      const newToast: ToastItem = { id, message, type, durationMs, action };

      setToasts((prev) => [...prev.filter((t) => t.id !== id), newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }

      return id;
    },
    [dismissToast]
  );

  const showSuccess = useCallback(
    (message: string, action?: ToastAction) =>
      showToast({ message, type: 'success', action }),
    [showToast]
  );

  const showError = useCallback(
    (message: string) => showToast({ message, type: 'error', durationMs: 7000 }),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, action?: ToastAction) =>
      showToast({ message, type: 'warning', action }),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string) => showToast({ message, type: 'info' }),
    [showToast]
  );

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} aria-hidden="true" />;
      case 'error':
        return <AlertCircle size={18} aria-hidden="true" />;
      case 'warning':
        return <AlertTriangle size={18} aria-hidden="true" />;
      case 'info':
      default:
        return <Info size={18} aria-hidden="true" />;
    }
  };

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        dismissToast
      }}
    >
      {children}

      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="sk-toast-container"
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                role={t.type === 'error' ? 'alert' : 'status'}
                className={`sk-toast sk-toast--${t.type}`}
              >
                <div className="sk-toast-content">
                  <span className="sk-toast-icon">{getIcon(t.type || 'info')}</span>
                  <span className="sk-toast-msg">{t.message}</span>
                </div>

                <div className="sk-toast-actions">
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        dismissToast(t.id);
                      }}
                      className="sk-toast-action-btn"
                    >
                      {t.action.label}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    className="sk-toast-dismiss-btn"
                    aria-label="Dismiss notification"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
