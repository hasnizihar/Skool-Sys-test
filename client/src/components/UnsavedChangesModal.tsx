import React from 'react';
import { Modal, Text, Group, Button, Stack, ThemeIcon } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';

export interface UnsavedChangesModalProps {
  opened: boolean;
  onClose: () => void;
  onDiscard: () => void;
  title?: string;
  message?: string;
  discardLabel?: string;
  keepEditingLabel?: string;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  opened,
  onClose,
  onDiscard,
  title = 'Discard Unsaved Changes?',
  message = 'You have unsaved changes on this student record. If you leave now, all your entered information will be lost.',
  discardLabel = 'Discard & Leave',
  keepEditingLabel = 'Keep Editing'
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="amber" variant="light" size="lg" radius="md">
            <AlertTriangle size={20} color="#d97706" />
          </ThemeIcon>
          <Text fw={700} size="md" c="var(--text-main, #0f172a)">
            {title}
          </Text>
        </Group>
      }
      centered
      radius="md"
      padding="lg"
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3
      }}
      zIndex={2000}
    >
      <Stack gap="lg">
        <Text size="sm" c="var(--text-muted, #64748b)" style={{ lineHeight: 1.55 }}>
          {message}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {keepEditingLabel}
          </Button>
          <Button color="red" onClick={onDiscard}>
            {discardLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
