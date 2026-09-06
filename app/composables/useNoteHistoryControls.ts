import type { HistoryOperationType, HistoryResult } from '../domain/noteHistory';

const historyOperationLabels: Record<HistoryOperationType, string> = {
  title: 'Изменение заголовка',
  'item-text': 'Изменение пункта',
  'item-completed': 'Изменение отметки пункта',
  'item-inserted': 'Добавление пункта',
  'item-removed': 'Удаление пункта',
};

const formatHistoryMessage = (result: HistoryResult): string =>
  `${historyOperationLabels[result.operation]} ${result.action === 'undo' ? 'отменено' : 'повторено'}.`;

const isTextEditingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement
  && target.matches([
    'textarea',
    '[contenteditable="true"]',
    'input:not([type])',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input[type="password"]',
  ].join(', '));

export const useNoteHistoryControls = (editorStore: ReturnType<typeof useNoteEditorStore>) => {
  const historyMessage = ref<string | null>(null);
  let historyMessageTimeout: NodeJS.Timeout | null = null;

  const showHistoryMessage = (message: string): void => {
    historyMessage.value = message;
    if (historyMessageTimeout !== null) {
      clearTimeout(historyMessageTimeout);
    }
    historyMessageTimeout = setTimeout(() => {
      historyMessage.value = null;
      historyMessageTimeout = null;
    }, 3000);
  };

  const undo = (): void => {
    const result = editorStore.undo();
    if (result) {
      showHistoryMessage(formatHistoryMessage(result));
    }
  };

  const redo = (): void => {
    const result = editorStore.redo();
    if (result) {
      showHistoryMessage(formatHistoryMessage(result));
    }
  };

  const handleHistoryShortcut = (event: KeyboardEvent): void => {
    if ((!event.ctrlKey && !event.metaKey) || event.altKey || isTextEditingTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      redo();
    }
    else if (key === 'z') {
      event.preventDefault();
      undo();
    }
    else if (key === 'y') {
      event.preventDefault();
      redo();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleHistoryShortcut);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleHistoryShortcut);
    if (historyMessageTimeout !== null) {
      clearTimeout(historyMessageTimeout);
    }
  });

  return {
    historyMessage,
    undo,
    redo,
  };
};
