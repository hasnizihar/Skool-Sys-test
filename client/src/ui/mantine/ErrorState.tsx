import React from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { AlertCircle, RotateCcw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  retryLabel = 'Try again'
}) => {
  return (
    <Alert
      icon={<AlertCircle size={18} />}
      title={title}
      color="red"
      radius="md"
      variant="light"
    >
      <Stack gap="xs">
        <Text size="sm">{message}</Text>
        {onRetry && (
          <Group justify="flex-start" mt="xs">
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<RotateCcw size={14} />}
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          </Group>
        )}
      </Stack>
    </Alert>
  );
};

export default ErrorState;
