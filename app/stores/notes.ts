import { defineStore } from 'pinia'
import { ref } from 'vue'
import { NOTE_TITLE_MAX_LENGTH, type Note, type NotesRepository } from '../domain/note'
import { browserNotesRepository } from '../repositories/browserNotesRepository'

export interface CreateNoteInput {
  title: string
  items: Note['items']
}

export type CreateNoteResult =
  | { ok: true, note: Note }
  | { ok: false, reason: 'title-required' | 'title-too-long' | 'persistence' }

export interface NotesStoreDependencies {
  repository: NotesRepository
  createId: () => string
  now: () => string
}

const sortByUpdatedAt = (notes: Note[]): Note[] =>
  [...notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

const cloneNote = (note: Note): Note => ({
  ...note,
  items: note.items.map(item => ({ ...item })),
})

export const createNotesStore = (dependencies: NotesStoreDependencies) =>
  defineStore('notes', () => {
    const notes = ref<Note[]>([])
    const isInitialized = ref(false)
    const error = ref<string | null>(null)

    const initialize = (): void => {
      try {
        notes.value = sortByUpdatedAt(dependencies.repository.read())
        error.value = null
      }
      catch {
        notes.value = []
        error.value = 'Не удалось загрузить заметки.'
      }
      finally {
        isInitialized.value = true
      }
    }

    const createNote = (input: CreateNoteInput): CreateNoteResult => {
      const title = input.title.trim()
      if (!title) {
        return { ok: false, reason: 'title-required' }
      }
      if (title.length > NOTE_TITLE_MAX_LENGTH) {
        return { ok: false, reason: 'title-too-long' }
      }

      const timestamp = dependencies.now()
      const note: Note = {
        id: dependencies.createId(),
        title,
        items: structuredClone(input.items),
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      }
      const nextNotes = sortByUpdatedAt([note, ...notes.value.map(cloneNote)])

      try {
        dependencies.repository.write(nextNotes)
      }
      catch {
        error.value = 'Не удалось сохранить заметку. Попробуйте ещё раз.'
        return { ok: false, reason: 'persistence' }
      }

      notes.value = nextNotes
      error.value = null

      return { ok: true, note }
    }

    return {
      notes,
      isInitialized,
      error,
      initialize,
      createNote,
    }
  })

export const useNotesStore = createNotesStore({
  repository: browserNotesRepository,
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
})
