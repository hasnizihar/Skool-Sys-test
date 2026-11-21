import React from 'react';
import { Group, Stack, Title, Text, Box } from '@mantine/core';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  icon
}) => {
  return (
    <Box mb="xl">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group align="flex-start" gap="sm">
          {icon && (
            <Box style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              {icon}
            </Box>
          )}
          <Stack gap={4}>
            <Group gap="xs" align="center">
              <Title order={2} style={{ fontSize: '1.45rem', fontWeight: 650, color: 'var(--mantine-color-slate-9, #0f172a)' }}>
                {title}
              </Title>
              {badge}
            </Group>
            {subtitle && (
              <Text size="sm" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Stack>
        </Group>

        {actions && (
          <Group gap="sm" align="center" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Box>
  );
};

export default PageHeader;
