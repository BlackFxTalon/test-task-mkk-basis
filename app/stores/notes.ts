import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Note, NotesRepository } from '../domain/note'
import {
  areNoteInputsEqual,
  normalizeNoteInput,
  type NoteInput,
  type NoteValidationFailure,
} from '../domain/noteInput'
import { NotesStorageError } from '../domain/notesStorage'
import { browserNotesRepository } from '../repositories/browserNotesRepository'

export type CreateNoteResult =
  | { ok: true, note: Note }
  | { ok: false, reason: NoteValidationFailure | 'persistence' }

export type UpdateNoteResult =
  | { ok: true, note: Note }
  | {
      ok: false
      reason: 'not-found' | 'unchanged' | 'revision-conflict' | NoteValidationFailure | 'persistence'
    }

export interface UpdateNoteOptions {
  baselineRevision?: number
  force?: boolean
}

export type DeleteNoteResult =
  | { ok: true, note: Note }
  | { ok: false, reason: 'not-found' | 'persistence' }

export type ResetNotesResult =
  | { ok: true }
  | { ok: false, reason: 'persistence' }

export interface NotesStorageBlocker {
  kind: 'corrupted' | 'future-version' | 'blocked'
}

export const blockerMessage = (kind: NotesStorageBlocker['kind']): string =>
  kind === 'future-version'
    ? 'Данные заметок сохранены более новой версией приложения. Обновите приложение или сбросьте сохранённые данные заметок.'
    : kind === 'blocked'
      ? 'Браузер запретил доступ к хранилищу. Разрешите сайту сохранять данные и обновите страницу.'
      : 'Сохранённые данные заметок повреждены.'

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
    const storageBlocker = ref<NotesStorageBlocker | null>(null)

    const toStorageFailure = (caught: unknown): NotesStorageBlocker => {
      if (caught instanceof NotesStorageError) {
        return { kind: caught.failure }
      }
      return { kind: 'corrupted' }
    }

    const applyReadFailure = (caught: unknown): void => {
      notes.value = []
      storageBlocker.value = toStorageFailure(caught)
      error.value = blockerMessage(storageBlocker.value.kind)
    }

    const initialize = (): void => {
      try {
        notes.value = sortByUpdatedAt(dependencies.repository.read())
        error.value = null
        storageBlocker.value = null
      }
      catch (caught) {
        applyReadFailure(caught)
      }
      finally {
        isInitialized.value = true
      }
    }

    const refresh = (): boolean => {
      try {
        notes.value = sortByUpdatedAt(dependencies.repository.read())
        error.value = null
        storageBlocker.value = null
        return true
      }
      catch (caught) {
        applyReadFailure(caught)
        return false
      }
    }

    const resetSavedNotes = (): ResetNotesResult => {
      try {
        dependencies.repository.reset()
      }
      catch {
        error.value = 'Не удалось сбросить сохранённые данные заметок. Попробуйте ещё раз.'
        return { ok: false, reason: 'persistence' }
      }

      notes.value = []
      storageBlocker.value = null
      error.value = null
      return { ok: true }
    }

    const hasStoredDataAccess = (): boolean => {
      if (storageBlocker.value === null) {
        return true
      }
      error.value = blockerMessage(storageBlocker.value.kind)
      return false
    }

    const getNote = (id: string): Note | null => {
      const note = notes.value.find(candidate => candidate.id === id)
      return note ? cloneNote(note) : null
    }

    const commitNotes = (nextNotes: Note[], failureMessage: string): boolean => {
      if (!hasStoredDataAccess()) {
        return false
      }

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
      if (!hasStoredDataAccess()) {
        return { ok: false, reason: 'persistence' }
      }

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

    const updateNote = (id: string, input: NoteInput, options: UpdateNoteOptions = {}): UpdateNoteResult => {
      if (!hasStoredDataAccess()) {
        return { ok: false, reason: 'persistence' }
      }

      const existingNote = notes.value.find(note => note.id === id)
      if (!existingNote) {
        return { ok: false, reason: 'not-found' }
      }

      const normalized = normalizeNoteInput(input)
      if (!normalized.ok) {
        return normalized
      }

      if (
        !options.force
        && options.baselineRevision !== undefined
        && options.baselineRevision !== existingNote.revision
      ) {
        return { ok: false, reason: 'revision-conflict' }
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
      if (!hasStoredDataAccess()) {
        return { ok: false, reason: 'persistence' }
      }

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
      storageBlocker,
      initialize,
      refresh,
      resetSavedNotes,
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
