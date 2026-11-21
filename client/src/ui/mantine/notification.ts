import { notifications } from '@mantine/notifications';

export const showAppNotification = {
  success: (title: string, message?: string) =>
    notifications.show({
      title,
      message,
      color: 'statusGreen',
      autoClose: 4000
    }),
  error: (title: string, message?: string) =>
    notifications.show({
      title,
      message,
      color: 'statusRed',
      autoClose: 6000
    }),
  info: (title: string, message?: string) =>
    notifications.show({
      title,
      message,
      color: 'refinedBlue',
      autoClose: 4000
    }),
  warning: (title: string, message?: string) =>
    notifications.show({
      title,
      message,
      color: 'statusAmber',
      autoClose: 5000
    })
};

export default showAppNotification;
