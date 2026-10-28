import React, { forwardRef } from 'react';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      iconOnly = false,
      fullWidth = false,
      disabled,
      className = '',
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const classNames = [
      'sk-btn',
      `sk-btn--${variant}`,
      `sk-btn--${size}`,
      iconOnly ? 'sk-btn--icon-only' : '',
      fullWidth ? 'sk-btn--full' : '',
      isLoading ? 'sk-btn--loading' : '',
      disabled || isLoading ? 'sk-btn--disabled' : '',
      className
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : undefined}
        aria-disabled={disabled || isLoading ? 'true' : undefined}
        className={classNames}
        {...rest}
      >
        {isLoading ? (
          <>
            <span className="sk-btn-spinner" aria-hidden="true" />
            {!iconOnly && <span>Loading...</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="sk-btn-icon sk-btn-icon--left" aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="sk-btn-icon sk-btn-icon--right" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
