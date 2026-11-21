import React from 'react';
import { Group, Stack, Text, Box, Divider } from '@mantine/core';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  withDivider?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  withDivider = false
}) => {
  return (
    <Box mb="md">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Group gap="xs" align="center">
            <Text fw={600} size="md" c="slate.8">
              {title}
            </Text>
            {badge}
          </Group>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>

        {actions && (
          <Group gap="xs" align="center">
            {actions}
          </Group>
        )}
      </Group>

      {withDivider && <Divider mt="sm" color="slate.2" />}
    </Box>
  );
};

export default SectionHeader;
