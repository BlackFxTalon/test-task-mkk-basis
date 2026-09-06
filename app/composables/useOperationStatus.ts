export const useOperationStatus = () => {
  const message = useState<string | null>('operation-status', () => null);
  const timeout = useState<NodeJS.Timeout | number | null>('operation-status-timeout', () => null);

  const announce = (nextMessage: string): void => {
    message.value = nextMessage;

    if (timeout.value) {
      clearTimeout(timeout.value);
    }

    timeout.value = setTimeout(() => {
      message.value = null;
      timeout.value = null;
    }, 5000);
  };

  return { message, announce };
};
