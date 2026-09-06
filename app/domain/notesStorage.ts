import type { Note, TodoItem } from './note'

export interface NotesEnvelopeV1 {
  schemaVersion: 1
  notes: Array<Omit<Note, 'revision'>>
}

export interface NotesEnvelopeV2 {
  schemaVersion: 2
  notes: Note[]
}

export type NotesEnvelope = NotesEnvelopeV2
export const CURRENT_NOTES_SCHEMA_VERSION = 2

export type NotesStorageFailure = 'corrupted' | 'future-version'

export class NotesStorageError extends Error {
  readonly failure: NotesStorageFailure

  constructor(failure: NotesStorageFailure) {
    const reason = failure === 'future-version'
      ? 'Notes storage was written by a newer application version.'
      : 'Notes storage data is corrupted.'
    super(reason)
    this.name = 'NotesStorageError'
    this.failure = failure
  }
}

const isNoteLike = (value: unknown): value is Note => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Note>
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && Array.isArray(candidate.items)
    && candidate.items.every(isTodoItemLike)
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && typeof candidate.revision === 'number'
}

const isTodoItemLike = (value: unknown): value is TodoItem => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<TodoItem>
  return typeof candidate.id === 'string' && typeof candidate.text === 'string'
}

const isNotesArrayV2 = (value: unknown): value is Note[] =>
  Array.isArray(value) && value.every(isNoteLike)

export const readNotesEnvelope = (serialized: string | null): NotesEnvelopeV2 => {
  if (serialized === null) {
    return { schemaVersion: CURRENT_NOTES_SCHEMA_VERSION, notes: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  }
  catch {
    throw new NotesStorageError('corrupted')
  }

  return migrateNotesEnvelope(parsed)
}

export const migrateNotesEnvelope = (raw: unknown): NotesEnvelopeV2 => {
  if (!raw || typeof raw !== 'object') {
    throw new NotesStorageError('corrupted')
  }

  const candidate = raw as { schemaVersion?: unknown }
  if (typeof candidate.schemaVersion !== 'number' || !Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion < 1) {
    throw new NotesStorageError('corrupted')
  }
  if (candidate.schemaVersion > CURRENT_NOTES_SCHEMA_VERSION) {
    throw new NotesStorageError('future-version')
  }

  if (candidate.schemaVersion === 1) {
    return migrateNotesEnvelope(migrateNotesV1ToV2(raw as NotesEnvelopeV1))
  }

  return validateNotesEnvelopeV2(raw)
}

const migrateNotesV1ToV2 = (envelope: NotesEnvelopeV1): NotesEnvelopeV2 => {
  if (!Array.isArray(envelope.notes)) {
    throw new NotesStorageError('corrupted')
  }

  return {
    schemaVersion: 2,
    notes: envelope.notes.map(note => ({
      ...note,
      revision: 1,
      items: Array.isArray(note.items)
        ? note.items.map(item => ({
            id: item.id,
            text: item.text,
            completed: item.completed === true,
          }))
        : [],
    })),
  }
}

const validateNotesEnvelopeV2 = (raw: unknown): NotesEnvelopeV2 => {
  const candidate = raw as { notes?: unknown }
  if (!isNotesArrayV2(candidate.notes)) {
    throw new NotesStorageError('corrupted')
  }

  return { schemaVersion: 2, notes: structuredClone(candidate.notes) }
}

export const serializeNotesEnvelope = (notes: Note[]): string =>
  JSON.stringify({
    schemaVersion: CURRENT_NOTES_SCHEMA_VERSION,
    notes,
  } satisfies NotesEnvelope)
