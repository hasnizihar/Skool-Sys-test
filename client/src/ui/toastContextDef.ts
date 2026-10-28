import { createContext } from 'react';

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

export interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  showSuccess: (message: string, action?: ToastAction) => string;
  showError: (message: string) => string;
  showWarning: (message: string, action?: ToastAction) => string;
  showInfo: (message: string) => string;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

