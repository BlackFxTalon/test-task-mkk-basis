import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Note, NotesRepository } from '../domain/note'
import {
  areNoteInputsEqual,
  normalizeNoteInput,
  type NoteInput,
  type NoteValidationFailure,
} from '../domain/noteInput'
import { browserNotesRepository } from '../repositories/browserNotesRepository'

export type CreateNoteResult =
  | { ok: true, note: Note }
  | { ok: false, reason: NoteValidationFailure | 'persistence' }

export type UpdateNoteResult =
  | { ok: true, note: Note }
  | {
    ok: false
    reason: 'not-found' | 'unchanged' | NoteValidationFailure | 'persistence'
  }

export type DeleteNoteResult =
  | { ok: true, note: Note }
  | { ok: false, reason: 'not-found' | 'persistence' }

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

    const getNote = (id: string): Note | null => {
      const note = notes.value.find(candidate => candidate.id === id)
      return note ? cloneNote(note) : null
    }

    const commitNotes = (nextNotes: Note[], failureMessage: string): boolean => {
      try {
        dependencies.repository.write(nextNotes)
      }
      catch {
        error.value = failureMessage
        return false
      }

      notes.value = nextNotes
      error.value = null
      return true
    }

    const hasNoteChanged = (id: string, input: NoteInput): boolean => {
      const existingNote = notes.value.find(note => note.id === id)
      return existingNote ? !areNoteInputsEqual(input, existingNote) : false
    }

    const createNote = (input: NoteInput): CreateNoteResult => {
      const normalized = normalizeNoteInput(input)
      if (!normalized.ok) {
        return normalized
      }

      const timestamp = dependencies.now()
      const note: Note = {
        id: dependencies.createId(),
        title: normalized.title,
        items: normalized.items,
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      }
      const nextNotes = sortByUpdatedAt([note, ...notes.value.map(cloneNote)])

      if (!commitNotes(nextNotes, 'Не удалось сохранить заметку. Попробуйте ещё раз.')) {
        return { ok: false, reason: 'persistence' }
      }

      return { ok: true, note }
    }

    const updateNote = (id: string, input: NoteInput): UpdateNoteResult => {
      const existingNote = notes.value.find(note => note.id === id)
      if (!existingNote) {
        return { ok: false, reason: 'not-found' }
      }

      const normalized = normalizeNoteInput(input)
      if (!normalized.ok) {
        return normalized
      }

      if (areNoteInputsEqual(normalized, existingNote)) {
        return { ok: false, reason: 'unchanged' }
      }

      const updatedNote: Note = {
        ...cloneNote(existingNote),
        title: normalized.title,
        items: normalized.items,
        updatedAt: dependencies.now(),
        revision: existingNote.revision + 1,
      }
      const nextNotes = sortByUpdatedAt(
        notes.value.map(note => note.id === id ? updatedNote : cloneNote(note)),
      )

      if (!commitNotes(nextNotes, 'Не удалось сохранить заметку. Попробуйте ещё раз.')) {
        return { ok: false, reason: 'persistence' }
      }

      return { ok: true, note: updatedNote }
    }

    const deleteNote = (id: string): DeleteNoteResult => {
      const note = notes.value.find(candidate => candidate.id === id)
      if (!note) {
        return { ok: false, reason: 'not-found' }
      }

      const nextNotes = notes.value
        .filter(candidate => candidate.id !== id)
        .map(cloneNote)

      if (!commitNotes(nextNotes, 'Не удалось удалить заметку. Попробуйте ещё раз.')) {
        return { ok: false, reason: 'persistence' }
      }

      return { ok: true, note: cloneNote(note) }
    }

    return {
      notes,
      isInitialized,
      error,
      initialize,
      getNote,
      hasNoteChanged,
      createNote,
      updateNote,
      deleteNote,
    }
  })

export const useNotesStore = createNotesStore({
  repository: browserNotesRepository,
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
})
