import React from 'react';

interface CollegeLogoProps {
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  inContainer?: boolean;
  className?: string;
  showSubtitle?: boolean;
}

export const CollegeLogo: React.FC<CollegeLogoProps> = ({
  size = 'md',
  inContainer = false,
  className = '',
  showSubtitle = false
}) => {
  let dimension = 44;
  if (typeof size === 'number') {
    dimension = size;
  } else {
    switch (size) {
      case 'sm': dimension = 32; break;
      case 'md': dimension = 44; break;
      case 'lg': dimension = 60; break;
      case 'xl': dimension = 80; break;
    }
  }

  const logoSvg = (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kattankudy Central College Crest"
      role="img"
    >
      {/* Outer Shield Outline */}
      <path
        d="M60 6C82 6 104 14 104 36C104 68 84 98 60 114C36 98 16 68 16 36C16 14 38 6 60 6Z"
        fill="#026536"
      />
      {/* Golden Inner Border */}
      <path
        d="M60 11C79 11 98 18 98 38C98 65 80 92 60 106C40 92 22 65 22 38C22 18 41 11 60 11Z"
        stroke="#F1EF22"
        strokeWidth="3"
        fill="#026536"
      />
      
      {/* Upper Shield Segment with Sunburst / Torch */}
      <path
        d="M60 20L62.5 28H57.5L60 20Z"
        fill="#F1EF22"
      />
      <path
        d="M50 22L54.5 29L50.5 31L50 22Z"
        fill="#F1EF22"
      />
      <path
        d="M70 22L69.5 31L65.5 29L70 22Z"
        fill="#F1EF22"
      />

      {/* Flame of Knowledge */}
      <path
        d="M60 24C62.5 28 65 31 65 35C65 38 62.8 40 60 40C57.2 40 55 38 55 35C55 31 57.5 28 60 24Z"
        fill="#F1EF22"
      />
      <path
        d="M60 28C61.2 30 62.5 32 62.5 34.5C62.5 36 61.4 37 60 37C58.6 37 57.5 36 57.5 34.5C57.5 32 58.8 30 60 28Z"
        fill="#FFFFFF"
      />

      {/* Classical Open Book of Wisdom */}
      <path
        d="M36 49C44 48 52 49 60 52C68 49 76 48 84 49V68C76 67 68 68 60 71C52 68 44 67 36 68V49Z"
        fill="#FFFFFF"
      />
      {/* Book Center spine & lines */}
      <path
        d="M60 52V71"
        stroke="#026536"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M41 55H54M41 59H54M41 63H52"
        stroke="#026536"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M66 55H79M66 59H79M68 63H79"
        stroke="#026536"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Laurel Wreath Branches (Left & Right) */}
      <path
        d="M28 42C26 50 26 59 29 67C32 75 38 82 46 88"
        stroke="#F1EF22"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="26" cy="48" r="2" fill="#F1EF22" />
      <circle cx="27" cy="58" r="2" fill="#F1EF22" />
      <circle cx="31" cy="68" r="2" fill="#F1EF22" />
      <circle cx="38" cy="78" r="2" fill="#F1EF22" />

      <path
        d="M92 42C94 50 94 59 91 67C88 75 82 82 74 88"
        stroke="#F1EF22"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="94" cy="48" r="2" fill="#F1EF22" />
      <circle cx="93" cy="58" r="2" fill="#F1EF22" />
      <circle cx="89" cy="68" r="2" fill="#F1EF22" />
      <circle cx="82" cy="78" r="2" fill="#F1EF22" />

      {/* Bottom College Banner Ribbon */}
      <path
        d="M24 88L30 84H90L96 88L92 98H28L24 88Z"
        fill="#F1EF22"
      />
      <text
        x="60"
        y="93"
        fill="#026536"
        fontSize="7"
        fontWeight="800"
        textAnchor="middle"
        fontFamily="'Inter', sans-serif"
        letterSpacing="0.08em"
      >
        K.C.C
      </text>

      {/* Year of Inception / National School */}
      <text
        x="60"
        y="102"
        fill="#FFFFFF"
        fontSize="5.5"
        fontWeight="600"
        textAnchor="middle"
        fontFamily="'Inter', sans-serif"
        letterSpacing="0.04em"
      >
        NATIONAL SCHOOL
      </text>
    </svg>
  );

  if (inContainer) {
    return (
      <div
        className="college-logo-container"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: typeof size === 'number' && size < 40 ? '8px' : '10px',
          padding: typeof size === 'number' && size < 40 ? '4px' : '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          flexShrink: 0
        }}
        title="Kattankudy Central College Official Emblem"
      >
        {logoSvg}
      </div>
    );
  }

  return logoSvg;
};
