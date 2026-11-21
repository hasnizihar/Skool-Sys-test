import React from 'react';
import { Center, Stack, Loader, Text } from '@mantine/core';

export interface LoadingStateProps {
  message?: string;
  minHeight?: number | string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  minHeight = 200
}) => {
  return (
    <Center style={{ minHeight, width: '100%' }}>
      <Stack align="center" gap="sm">
        <Loader size="md" color="refinedBlue" type="oval" />
        {message && (
          <Text size="sm" c="dimmed">
            {message}
          </Text>
        )}
      </Stack>
    </Center>
  );
};

export default LoadingState;
