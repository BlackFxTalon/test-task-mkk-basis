import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createNotesStore, type NotesStoreDependencies } from './notes'
import { NOTE_TITLE_MAX_LENGTH, type Note, type NotesRepository } from '../domain/note'

class InMemoryNotesRepository implements NotesRepository {
  writeCalls = 0
  failWrites = false

  constructor(public storedNotes: Note[] = []) {}

  read(): Note[] {
    return structuredClone(this.storedNotes)
  }

  write(notes: Note[]): void {
    this.writeCalls += 1
    if (this.failWrites) {
      throw new Error('Storage unavailable')
    }
    this.storedNotes = structuredClone(notes)
  }
}

const createDependencies = (
  repository: NotesRepository,
  overrides: Partial<NotesStoreDependencies> = {},
): NotesStoreDependencies => ({
  repository,
  createId: () => 'note-id',
  now: () => '2026-09-03T12:00:00.000Z',
  ...overrides,
})

describe('notes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads saved notes sorted by the latest successful save', () => {
    const older: Note = {
      id: 'older',
      title: 'Раньше',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    }
    const newer: Note = {
      id: 'newer',
      title: 'Позже',
      items: [],
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      revision: 1,
    }
    const repository = new InMemoryNotesRepository([older, newer])
    const useNotesStore = createNotesStore(createDependencies(repository))
    const store = useNotesStore()

    store.initialize()

    expect(store.notes.map(note => note.id)).toEqual(['newer', 'older'])
    expect(store.isInitialized).toBe(true)
    expect(store.error).toBeNull()
  })

  it('creates and persists a normalized note through an explicit action', () => {
    const repository = new InMemoryNotesRepository()
    const useNotesStore = createNotesStore(createDependencies(repository))
    const store = useNotesStore()
    store.initialize()

    const result = store.createNote({
      title: '  Покупки  ',
      items: [
        { id: 'item-1', text: 'Хлеб', completed: false },
        { id: 'item-2', text: 'Молоко', completed: true },
      ],
    })

    expect(result).toEqual({
      ok: true,
      note: {
        id: 'note-id',
        title: 'Покупки',
        items: [
          { id: 'item-1', text: 'Хлеб', completed: false },
          { id: 'item-2', text: 'Молоко', completed: true },
        ],
        createdAt: '2026-09-03T12:00:00.000Z',
        updatedAt: '2026-09-03T12:00:00.000Z',
        revision: 1,
      },
    })
    expect(store.notes).toEqual(repository.storedNotes)
    expect(repository.writeCalls).toBe(1)
  })

  it('rejects a blank title without changing or persisting notes', () => {
    const repository = new InMemoryNotesRepository()
    const useNotesStore = createNotesStore(createDependencies(repository))
    const store = useNotesStore()
    store.initialize()

    const result = store.createNote({ title: '   ', items: [] })

    expect(result).toEqual({ ok: false, reason: 'title-required' })
    expect(store.notes).toEqual([])
    expect(repository.writeCalls).toBe(0)
  })

  it('rejects a title longer than 120 characters', () => {
    const repository = new InMemoryNotesRepository()
    const useNotesStore = createNotesStore(createDependencies(repository))
    const store = useNotesStore()
    store.initialize()

    const result = store.createNote({ title: 'а'.repeat(NOTE_TITLE_MAX_LENGTH + 1), items: [] })

    expect(result).toEqual({ ok: false, reason: 'title-too-long' })
    expect(store.notes).toEqual([])
    expect(repository.writeCalls).toBe(0)
  })

  it('allows duplicate titles and keeps the latest save first', () => {
    const repository = new InMemoryNotesRepository()
    const ids = ['first', 'second']
    const timestamps = ['2026-09-03T12:00:00.000Z', '2026-09-03T13:00:00.000Z']
    const useNotesStore = createNotesStore(createDependencies(repository, {
      createId: () => ids.shift()!,
      now: () => timestamps.shift()!,
    }))
    const store = useNotesStore()
    store.initialize()

    const firstResult = store.createNote({ title: 'Планы', items: [] })
    const secondResult = store.createNote({ title: 'Планы', items: [] })

    expect(firstResult.ok).toBe(true)
    expect(secondResult.ok).toBe(true)
    expect(store.notes.map(note => ({ id: note.id, title: note.title }))).toEqual([
      { id: 'second', title: 'Планы' },
      { id: 'first', title: 'Планы' },
    ])
    expect(repository.writeCalls).toBe(2)
  })

  it('keeps observable state unchanged when persistence fails', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Сохранена',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    }
    const repository = new InMemoryNotesRepository([existing])
    const useNotesStore = createNotesStore(createDependencies(repository))
    const store = useNotesStore()
    store.initialize()
    repository.failWrites = true

    const result = store.createNote({ title: 'Новая', items: [] })

    expect(result).toEqual({ ok: false, reason: 'persistence' })
    expect(store.notes).toEqual([existing])
    expect(store.error).toBe('Не удалось сохранить заметку. Попробуйте ещё раз.')
  })
})
