import React from 'react';
import { Paper, Stack, Title, Text, Box } from '@mantine/core';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  withBorder?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  withBorder = true
}) => {
  return (
    <Paper
      withBorder={withBorder}
      p="xl"
      radius="md"
      bg="slate.0"
      style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 180
      }}
    >
      <Stack align="center" gap="sm" maw={440}>
        {icon && (
          <Box c="slate.4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </Box>
        )}
        <Title order={4} fw={600} c="slate.8" size="h5">
          {title}
        </Title>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
        {action && <Box mt="xs">{action}</Box>}
      </Stack>
    </Paper>
  );
};

export default EmptyState;
