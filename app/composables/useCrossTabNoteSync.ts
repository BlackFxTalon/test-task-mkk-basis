import { NOTES_STORAGE_KEY } from '../repositories/browserNotesRepository';

export const useCrossTabNoteSync = (options: {
  noteId: () => string | undefined
  isReady: () => boolean
  onNoteDeleted: (hasLocalChanges: boolean) => void
}) => {
  const notesStore = useNotesStore();
  const editorStore = useNoteEditorStore();

  const handleStorageChange = (event: StorageEvent): void => {
    if (event.key !== NOTES_STORAGE_KEY && event.key !== null) {
      return;
    }

    if (!notesStore.refresh()) {
      return;
    }

    const noteId = options.noteId();
    if (noteId === undefined || !options.isReady()) {
      return;
    }

    const externalNote = notesStore.getNote(noteId);
    const outcome = editorStore.applyExternalChange(externalNote);

    if (outcome === 'deleted') {
      options.onNoteDeleted(editorStore.isDirty);
    }
  };

  onMounted(() => {
    window.addEventListener('storage', handleStorageChange);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('storage', handleStorageChange);
  });
};
