import type { Note, NotesRepository } from '../domain/note'

interface NotesEnvelope {
  schemaVersion: 1
  notes: Note[]
}

export const NOTES_STORAGE_KEY = 'basis-notes:notes'

const isNotesEnvelope = (value: unknown): value is NotesEnvelope => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<NotesEnvelope>
  return candidate.schemaVersion === 1 && Array.isArray(candidate.notes)
}

class BrowserNotesRepository implements NotesRepository {
  read(): Note[] {
    const serialized = localStorage.getItem(NOTES_STORAGE_KEY)
    if (serialized === null) {
      return []
    }

    const parsed: unknown = JSON.parse(serialized)
    if (!isNotesEnvelope(parsed)) {
      throw new Error('Unsupported notes storage format')
    }

    return structuredClone(parsed.notes)
  }

  write(notes: Note[]): void {
    const envelope: NotesEnvelope = {
      schemaVersion: 1,
      notes,
    }

    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(envelope))
  }
}

export const browserNotesRepository: NotesRepository = new BrowserNotesRepository()