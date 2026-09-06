import type { Note } from '../domain/note';
import { useNotesStore, type DeleteNoteResult } from '../stores/notes';

export const useNoteDeletion = () => {
  const notesStore = useNotesStore();
  const { announce } = useOperationStatus();
  const notePendingDeletion = ref<Note | null>(null);

  const deletionDescription = computed(() => notePendingDeletion.value
    ? `Заметка «${notePendingDeletion.value.title}» будет удалена без возможности восстановления.`
    : '');

  const requestDeletion = (note: Note): void => {
    notePendingDeletion.value = note;
  };

  const cancelDeletion = (): void => {
    notePendingDeletion.value = null;
  };

  const confirmDeletion = (): DeleteNoteResult | null => {
    const note = notePendingDeletion.value;
    if (!note) {
      return null;
    }

    const result = notesStore.deleteNote(note.id);
    notePendingDeletion.value = null;

    if (result.ok) {
      announce(`Заметка «${result.note.title}» удалена.`);
    }

    return result;
  };

  return {
    notePendingDeletion,
    deletionDescription,
    requestDeletion,
    cancelDeletion,
    confirmDeletion,
  };
};
