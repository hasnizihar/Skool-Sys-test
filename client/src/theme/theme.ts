import { createTheme, MantineColorsTuple } from '@mantine/core';

// Institutional Refined Blue (10-shade palette)
const refinedBlue: MantineColorsTuple = [
  '#eff6ff', // 0: lightest tint, badge background
  '#dbeafe', // 1: light hover tint
  '#bfdbfe', // 2: light border
  '#93c5fd', // 3: subtle border / secondary tint
  '#60a5fa', // 4: mid blue
  '#3b82f6', // 5: vibrant blue
  '#2563eb', // 6: primary brand & interactive blue
  '#1d4ed8', // 7: primary hover
  '#1e40af', // 8: deep institutional blue (active states)
  '#172554'  // 9: dark navy text & contrast
];

// Institutional Neutral Slate
const slate: MantineColorsTuple = [
  '#f8fafc', // 0: soft neutral grey app background
  '#f1f5f9', // 1: subtle card & input background
  '#e2e8f0', // 2: subtle border color
  '#cbd5e1', // 3: strong border
  '#94a3b8', // 4: muted icons
  '#64748b', // 5: muted helper text
  '#475569', // 6: secondary text
  '#334155', // 7: body text
  '#1e293b', // 8: headings
  '#0f172a'  // 9: high-contrast text
];

// Attendance & Operations Semantic Colors
const statusGreen: MantineColorsTuple = [
  '#ecfdf5',
  '#d1fae5',
  '#a7f3d0',
  '#6ee7b7',
  '#34d399',
  '#10b981',
  '#059669',
  '#047857',
  '#065f46',
  '#064e3b'
];

const statusRed: MantineColorsTuple = [
  '#fef2f2',
  '#fee2e2',
  '#fecaca',
  '#fca5a5',
  '#f87171',
  '#ef4444',
  '#dc2626',
  '#b91c1c',
  '#991b1b',
  '#7f1d1d'
];

const statusAmber: MantineColorsTuple = [
  '#fffbeb',
  '#fef3c7',
  '#fde68a',
  '#fcd34d',
  '#fbbf24',
  '#f59e0b',
  '#d97706',
  '#b45309',
  '#92400e',
  '#78350f'
];

export const skoolSysTheme = createTheme({
  primaryColor: 'refinedBlue',
  colors: {
    refinedBlue,
    slate,
    statusGreen,
    statusRed,
    statusAmber
  },

  // Modern institutional sans-serif
  fontFamily: "'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  
  headings: {
    fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '600'
  },

  // 8-12px radius standard
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px'
  },

  // Structured spacing scale
  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px'
  },

  // Soft institutional shadows
  shadows: {
    xs: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
    sm: '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
    md: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
    lg: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
    xl: '0 20px 25px -5px rgba(15, 23, 42, 0.10), 0 8px 10px -6px rgba(15, 23, 42, 0.04)'
  },

  // Institutional Component Defaults
  components: {
    Button: {
      defaultProps: {
        radius: 'md'
      }
    },
    TextInput: {
      defaultProps: {
        radius: 'md'
      }
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md'
      }
    },
    Select: {
      defaultProps: {
        radius: 'md'
      }
    },
    Textarea: {
      defaultProps: {
        radius: 'md'
      }
    },
    Card: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
        padding: 'md'
      }
    },
    Paper: {
      defaultProps: {
        radius: 'md',
        withBorder: true
      }
    },
    Table: {
      defaultProps: {
        highlightOnHover: true,
        verticalSpacing: 'sm',
        horizontalSpacing: 'md'
      }
    },
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true
      }
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        variant: 'light'
      }
    },
    ActionIcon: {
      defaultProps: {
        radius: 'md'
      }
    }
  }
});

export default skoolSysTheme;
