import React from 'react';
import { SCHOOL_PROFILE } from '../../config/schoolConfig';

interface SchoolCrestProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showBorder?: boolean;
  alt?: string;
}

export const SchoolCrest: React.FC<SchoolCrestProps> = ({
  size = 'md',
  className = '',
  showBorder = true,
  alt = 'Kattankudy Central College Crest'
}) => {
  let dimension = 40;
  if (typeof size === 'number') {
    dimension = size;
  } else {
    switch (size) {
      case 'xs': dimension = 28; break;
      case 'sm': dimension = 36; break;
      case 'md': dimension = 44; break;
      case 'lg': dimension = 56; break;
      case 'xl': dimension = 76; break;
    }
  }

  return (
    <div
      className={`kcc-crest-container ${className}`}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        borderRadius: '50%',
        backgroundColor: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: showBorder ? '0 0 0 1.5px var(--kcc-gold), 0 2px 8px rgba(7, 94, 59, 0.18)' : 'none',
        padding: Math.max(2, Math.round(dimension * 0.05)),
        flexShrink: 0
      }}
      title={SCHOOL_PROFILE.name}
    >
      <img
        src={SCHOOL_PROFILE.crestUrl}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block'
        }}
        loading="eager"
      />
    </div>
  );
};

