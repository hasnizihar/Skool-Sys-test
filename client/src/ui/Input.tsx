import React, { forwardRef, useState, useId } from 'react';
import { Eye, EyeOff, X, AlertCircle } from 'lucide-react';
import './input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  isValid?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      helperText,
      errorMessage,
      isInvalid = false,
      isValid = false,
      leftIcon,
      rightIcon,
      clearable = false,
      onClear,
      showPasswordToggle = false,
      type = 'text',
      required,
      disabled,
      className = '',
      value,
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const [showPassword, setShowPassword] = useState(false);

    const effectiveInvalid = isInvalid || Boolean(errorMessage);
    const resolvedType = type === 'password' && showPasswordToggle && showPassword ? 'text' : type;

    return (
      <div className={`sk-input-wrapper ${className}`}>
        {label && (
          <div className="sk-input-label-row">
            <label htmlFor={inputId} className="sk-input-label">
              {label}
              {required && <span className="sk-input-required" aria-hidden="true">*</span>}
            </label>
          </div>
        )}

        <div
          className={[
            'sk-input-box',
            effectiveInvalid ? 'is-invalid' : '',
            isValid && !effectiveInvalid ? 'is-valid' : '',
            disabled ? 'is-disabled' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {leftIcon && (
            <span className="sk-input-adornment sk-input-adornment--left" aria-hidden="true">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            disabled={disabled}
            required={required}
            value={value}
            aria-invalid={effectiveInvalid ? 'true' : undefined}
            aria-describedby={
              effectiveInvalid ? errorId : helperText ? helperId : undefined
            }
            className="sk-input-field"
            {...rest}
          />

          {clearable && value && !disabled && (
            <span className="sk-input-adornment sk-input-adornment--right">
              <button
                type="button"
                onClick={onClear}
                className="sk-input-action-btn"
                aria-label="Clear input value"
              >
                <X size={15} />
              </button>
            </span>
          )}

          {type === 'password' && showPasswordToggle && !disabled && (
            <span className="sk-input-adornment sk-input-adornment--right">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="sk-input-action-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          )}

          {rightIcon && !(type === 'password' && showPasswordToggle) && (
            <span className="sk-input-adornment sk-input-adornment--right" aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </div>

        {effectiveInvalid && errorMessage && (
          <div id={errorId} className="sk-input-feedback sk-input-error" role="alert">
            <AlertCircle size={13} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!effectiveInvalid && helperText && (
          <div id={helperId} className="sk-input-feedback sk-input-helper">
            {helperText}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
