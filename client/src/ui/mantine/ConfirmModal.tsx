import React from 'react';
import { Modal, Text, Group, Button, Stack, Box } from '@mantine/core';

export interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'refinedBlue',
  loading = false,
  icon
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          {icon && <Box style={{ display: 'flex', alignItems: 'center' }}>{icon}</Box>}
          <Text fw={600} size="md">
            {title}
          </Text>
        </Group>
      }
      centered
      size="md"
      radius="md"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      <Stack gap="lg" pt="xs">
        <Text size="sm" c="slate.7">
          {message}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            color={confirmColor}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ConfirmModal;
