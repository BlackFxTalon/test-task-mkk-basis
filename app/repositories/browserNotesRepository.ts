import type { Note, NotesRepository } from '../domain/note'
import {
  readNotesEnvelope,
  serializeNotesEnvelope,
} from '../domain/notesStorage'

export const NOTES_STORAGE_KEY = 'basis-notes:notes'

export interface NotesStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const createBrowserNotesRepository = (storage: NotesStoragePort): NotesRepository => ({
  read(): Note[] {
    const serialized = storage.getItem(NOTES_STORAGE_KEY)
    const parsed = readNotesEnvelope(serialized)
    const currentSerialized = serializeNotesEnvelope(parsed.notes)
    if (serialized !== null && serialized !== currentSerialized) {
      storage.setItem(NOTES_STORAGE_KEY, currentSerialized)
    }
    return parsed.notes
  },

  write(notes: Note[]): void {
    storage.setItem(NOTES_STORAGE_KEY, serializeNotesEnvelope(notes))
  },

  reset(): void {
    storage.removeItem(NOTES_STORAGE_KEY)
  },
})

export const browserNotesRepository: NotesRepository = createBrowserNotesRepository({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
})
