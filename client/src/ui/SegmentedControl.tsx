import React, { useRef, useId } from 'react';
import './segmentedControl.css';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  letter?: string;
  icon?: React.ReactNode;
  colorVariant?: 'present' | 'absent' | 'late' | 'excused' | 'primary' | 'neutral';
  disabled?: boolean;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  name?: string;
  isAttendance?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  name,
  isAttendance = false,
  fullWidth = false,
  disabled = false,
  className = '',
  ariaLabel = 'Segmented options'
}: SegmentedControlProps<T>) {
  const generatedId = useId();
  const groupName = name || generatedId;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = options.length - 1;
    }

    if (targetIndex !== -1) {
      const targetOption = options[targetIndex];
      if (!targetOption.disabled && !disabled) {
        onChange(targetOption.value);
        buttonRefs.current[targetIndex]?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        'sk-segmented-control',
        isAttendance ? 'sk-segmented-control--attendance' : '',
        fullWidth ? 'sk-segmented-control--full' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((opt, idx) => {
        const isSelected = value === opt.value;
        const isDisabled = disabled || Boolean(opt.disabled);

        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current[idx] = el; }}
            type="button"
            role="radio"
            name={groupName}
            aria-checked={isSelected}
            aria-label={opt.ariaLabel || opt.label}
            disabled={isDisabled}
            tabIndex={isSelected || (value === null && idx === 0) ? 0 : -1}
            onClick={() => {
              if (!isDisabled) onChange(opt.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={[
              'sk-segmented-btn',
              isSelected ? 'is-selected' : '',
              opt.colorVariant ? `sk-seg--${opt.colorVariant}` : '',
              isDisabled ? 'is-disabled' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
            {opt.letter && <span className="sk-segmented-letter">{opt.letter}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
