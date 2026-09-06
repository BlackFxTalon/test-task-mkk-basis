import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { blockerMessage, createNotesStore, type NotesStoreDependencies } from './notes';
import { NOTE_ITEM_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, type Note, type NotesRepository } from '../domain/note';
import { NotesStorageError } from '../domain/notesStorage';
import { createBrowserNotesRepository, NOTES_STORAGE_KEY, type NotesStoragePort } from '../repositories/browserNotesRepository';

class InMemoryNotesRepository implements NotesRepository {
  writeCalls = 0;
  failWrites = false;

  constructor(public storedNotes: Note[] = []) {}

  read(): Note[] {
    return structuredClone(this.storedNotes);
  }

  write(notes: Note[]): void {
    this.writeCalls += 1;
    if (this.failWrites) {
      throw new Error('Storage unavailable');
    }
    this.storedNotes = structuredClone(notes);
  }

  reset(): void {
    this.storedNotes = [];
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
});

class InMemoryStoragePort implements NotesStoragePort {
  private items: Map<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.items = new Map(Object.entries(initial));
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('notes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads saved notes sorted by the latest successful save', () => {
    const older: Note = {
      id: 'older',
      title: 'Раньше',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const newer: Note = {
      id: 'newer',
      title: 'Позже',
      items: [],
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([older, newer]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.notes.map(note => note.id)).toEqual(['newer', 'older']);
    expect(store.isInitialized).toBe(true);
    expect(store.error).toBeNull();
  });

  it('creates and persists a normalized note through an explicit action', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({
      title: '  Покупки  ',
      items: [
        { id: 'item-1', text: 'Хлеб', completed: false },
        { id: 'item-2', text: 'Молоко', completed: true },
      ],
    });

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
    });
    expect(store.notes).toEqual(repository.storedNotes);
    expect(repository.writeCalls).toBe(1);
  });

  it('trims task text and removes empty rows when creating a note', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({
      title: 'Список',
      items: [
        { id: 'first', text: '  Первый  ', completed: false },
        { id: 'empty', text: '   ', completed: false },
        { id: 'second', text: 'Второй', completed: true },
      ],
    });

    expect(result.ok && result.note.items).toEqual([
      { id: 'first', text: 'Первый', completed: false },
      { id: 'second', text: 'Второй', completed: true },
    ]);
  });

  it('rejects task text longer than 300 characters', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({
      title: 'Список',
      items: [{ id: 'item', text: 'а'.repeat(NOTE_ITEM_MAX_LENGTH + 1), completed: false }],
    });

    expect(result).toEqual({ ok: false, reason: 'item-too-long' });
    expect(repository.writeCalls).toBe(0);
  });

  it('rejects a blank title without changing or persisting notes', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({ title: '   ', items: [] });

    expect(result).toEqual({ ok: false, reason: 'title-required' });
    expect(store.notes).toEqual([]);
    expect(repository.writeCalls).toBe(0);
  });

  it('rejects a title longer than 120 characters', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({ title: 'а'.repeat(NOTE_TITLE_MAX_LENGTH + 1), items: [] });

    expect(result).toEqual({ ok: false, reason: 'title-too-long' });
    expect(store.notes).toEqual([]);
    expect(repository.writeCalls).toBe(0);
  });

  it('allows duplicate titles and keeps the latest save first', () => {
    const repository = new InMemoryNotesRepository();
    const ids = ['first', 'second'];
    const timestamps = ['2026-09-03T12:00:00.000Z', '2026-09-03T13:00:00.000Z'];
    const useNotesStore = createNotesStore(createDependencies(repository, {
      createId: () => ids.shift()!,
      now: () => timestamps.shift()!,
    }));
    const store = useNotesStore();
    store.initialize();

    const firstResult = store.createNote({ title: 'Планы', items: [] });
    const secondResult = store.createNote({ title: 'Планы', items: [] });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(store.notes.map(note => ({ id: note.id, title: note.title }))).toEqual([
      { id: 'second', title: 'Планы' },
      { id: 'first', title: 'Планы' },
    ]);
    expect(repository.writeCalls).toBe(2);
  });

  it('keeps observable state unchanged when persistence fails', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Сохранена',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();
    repository.failWrites = true;

    const result = store.createNote({ title: 'Новая', items: [] });

    expect(result).toEqual({ ok: false, reason: 'persistence' });
    expect(store.notes).toEqual([existing]);
    expect(store.error).toBe('Не удалось сохранить заметку. Попробуйте ещё раз.');
  });

  it('updates a note, normalizes its task list, and moves it to the top', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [{ id: 'old-item', text: 'Старый пункт', completed: false }],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 2,
    };
    const other: Note = {
      id: 'other',
      title: 'Другая',
      items: [],
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing, other]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.updateNote('existing', {
      title: '  Обновлённый список  ',
      items: [
        { id: 'old-item', text: '  Первый пункт  ', completed: true },
        { id: 'empty-item', text: '   ', completed: false },
        { id: 'new-item', text: 'Повтор', completed: false },
        { id: 'duplicate-item', text: 'Повтор', completed: false },
      ],
    });

    expect(result).toEqual({
      ok: true,
      note: {
        id: 'existing',
        title: 'Обновлённый список',
        items: [
          { id: 'old-item', text: 'Первый пункт', completed: true },
          { id: 'new-item', text: 'Повтор', completed: false },
          { id: 'duplicate-item', text: 'Повтор', completed: false },
        ],
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-03T12:00:00.000Z',
        revision: 3,
      },
    });
    expect(store.notes.map(note => note.id)).toEqual(['existing', 'other']);
    expect(repository.storedNotes).toEqual(store.notes);
  });

  it('deletes an existing task item when it is omitted from an update', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [
        { id: 'remove-me', text: 'Удалить', completed: false },
        { id: 'keep-me', text: 'Оставить', completed: true },
      ],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.updateNote('existing', {
      title: 'Список',
      items: [{ id: 'keep-me', text: 'Оставить', completed: true }],
    });

    expect(result.ok).toBe(true);
    expect(store.getNote('existing')?.items).toEqual([
      { id: 'keep-me', text: 'Оставить', completed: true },
    ]);
    expect(repository.storedNotes).toEqual(store.notes);
  });

  it('does not persist an unchanged existing note', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [{ id: 'item', text: 'Пункт', completed: false }],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 2,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.updateNote('existing', {
      title: '  Список  ',
      items: [
        { id: 'item', text: '  Пункт  ', completed: false },
        { id: 'empty', text: '   ', completed: false },
      ],
    });

    expect(result).toEqual({ ok: false, reason: 'unchanged' });
    expect(store.notes).toEqual([existing]);
    expect(repository.writeCalls).toBe(0);
  });

  it('returns a saved note by ID and reports an unknown note', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    expect(store.getNote('existing')).toEqual(existing);
    expect(store.getNote('missing')).toBeNull();
  });

  it('does not write when updating an unknown note', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.updateNote('missing', { title: 'Список', items: [] });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(repository.writeCalls).toBe(0);
  });

  it('validates an existing note before writing', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const blankTitle = store.updateNote('existing', { title: '   ', items: [] });
    const longItem = store.updateNote('existing', {
      title: 'Список',
      items: [{ id: 'item', text: 'а'.repeat(NOTE_ITEM_MAX_LENGTH + 1), completed: false }],
    });

    expect(blankTitle).toEqual({ ok: false, reason: 'title-required' });
    expect(longItem).toEqual({ ok: false, reason: 'item-too-long' });
    expect(store.notes).toEqual([existing]);
    expect(repository.writeCalls).toBe(0);
  });

  it('keeps the existing note intact when an update cannot be persisted', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();
    repository.failWrites = true;

    const result = store.updateNote('existing', { title: 'Изменённый список', items: [] });

    expect(result).toEqual({ ok: false, reason: 'persistence' });
    expect(store.notes).toEqual([existing]);
    expect(store.error).toBe('Не удалось сохранить заметку. Попробуйте ещё раз.');
  });

  it('deletes and persists an existing note', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Удалить',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.deleteNote('existing');

    expect(result).toEqual({ ok: true, note: existing });
    expect(store.notes).toEqual([]);
    expect(repository.storedNotes).toEqual([]);
    expect(repository.writeCalls).toBe(1);
  });

  it('keeps a note observable when deletion cannot be persisted', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Оставить',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    };
    const repository = new InMemoryNotesRepository([existing]);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();
    repository.failWrites = true;

    const result = store.deleteNote('existing');

    expect(result).toEqual({ ok: false, reason: 'persistence' });
    expect(store.notes).toEqual([existing]);
    expect(repository.storedNotes).toEqual([existing]);
    expect(store.error).toBe('Не удалось удалить заметку. Попробуйте ещё раз.');
  });

  it('migrates a supported older schema version to the current one, preserving user notes', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        notes: [{
          id: 'legacy',
          title: 'Старая заметка',
          items: [{ id: 'item', text: 'Пункт', completed: true }],
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        }],
      }),
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.error).toBeNull();
    expect(store.notes.map(note => note.id)).toEqual(['legacy']);
    expect(store.notes[0]).toMatchObject({
      id: 'legacy',
      title: 'Старая заметка',
      items: [{ id: 'item', text: 'Пункт', completed: true }],
    });
    expect(JSON.parse(port.getItem(NOTES_STORAGE_KEY)!)).toMatchObject({ schemaVersion: 2 });
  });

  it('migrates supported storage versions in sequence with notes carried through every step', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        notes: [{
          id: 'kept-through-migrations',
          title: 'Переживает миграции',
          items: [],
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        }],
      }),
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.notes.map(note => note.id)).toEqual(['kept-through-migrations']);
    expect(JSON.parse(port.getItem(NOTES_STORAGE_KEY)!).schemaVersion).toBe(2);
  });

  it('reports corrupted storage as an explicit blocker instead of an empty list', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: '{"schemaVersion":2,',
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.notes).toEqual([]);
    expect(store.isInitialized).toBe(true);
    expect(store.storageBlocker).toEqual({ kind: 'corrupted' });
    expect(store.error).toBe('Сохранённые данные заметок повреждены.');
    expect(port.getItem(NOTES_STORAGE_KEY)).toBe('{"schemaVersion":2,');
  });

  it('reports invalid notes structure as a blocker without naming it corruption of JSON', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, notes: { id: 'not-an-array' } }),
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'corrupted' });
    expect(store.notes).toEqual([]);
  });

  it('reports an unknown future schema version as a blocker and keeps its payload intact', () => {
    const futurePayload = JSON.stringify({
      schemaVersion: 99,
      notes: [{ id: 'from-future', title: 'Будущее', items: [], createdAt: '', updatedAt: '', revision: 7 }],
    });
    const port = new InMemoryStoragePort({ [NOTES_STORAGE_KEY]: futurePayload });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'future-version' });
    expect(store.notes).toEqual([]);
    expect(port.getItem(NOTES_STORAGE_KEY)).toBe(futurePayload);
  });

  it('reports a future version even when its stored payload structure is also malformed', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: '{"schemaVersion":99,"notes":"junk"}',
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'future-version' });
  });

  it('blocks mutating actions while storage is blocked and leaves the payload untouched', () => {
    const futurePayload = '{"schemaVersion":99,"notes":"junk"}';
    const port = new InMemoryStoragePort({ [NOTES_STORAGE_KEY]: futurePayload });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const createResult = store.createNote({ title: 'Новая', items: [] });
    const updateResult = store.updateNote('any', { title: 'Изменение', items: [] });
    const deleteResult = store.deleteNote('any');

    expect(createResult).toEqual({ ok: false, reason: 'persistence' });
    expect(updateResult).toEqual({ ok: false, reason: 'persistence' });
    expect(deleteResult).toEqual({ ok: false, reason: 'persistence' });
    expect(port.getItem(NOTES_STORAGE_KEY)).toBe(futurePayload);
  });

  it('refresh keeps an existing blocker and does not fall back to an empty list', () => {
    const futurePayload = JSON.stringify({ schemaVersion: 99, notes: [] });
    const port = new InMemoryStoragePort({ [NOTES_STORAGE_KEY]: futurePayload });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const refreshed = store.refresh();

    expect(refreshed).toBe(false);
    expect(store.storageBlocker).toEqual({ kind: 'future-version' });
    expect(port.getItem(NOTES_STORAGE_KEY)).toBe(futurePayload);
  });

  it('resets only the saved-notes key after explicit confirmation and clears the blocker', () => {
    const futurePayload = JSON.stringify({ schemaVersion: 99, notes: [] });
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: futurePayload,
      'notes-theme': 'dark',
      'basis-notes:drafts': JSON.stringify({ schemaVersion: 1, drafts: [] }),
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();
    expect(store.storageBlocker).toEqual({ kind: 'future-version' });

    const result = store.resetSavedNotes();

    expect(result).toEqual({ ok: true });
    expect(store.storageBlocker).toBeNull();
    expect(store.error).toBeNull();
    expect(store.notes).toEqual([]);
    expect(port.getItem(NOTES_STORAGE_KEY)).toBeNull();
    expect(port.getItem('notes-theme')).toBe('dark');
    expect(port.getItem('basis-notes:drafts')).toBe(JSON.stringify({ schemaVersion: 1, drafts: [] }));
  });

  it('reports a failed reset instead of claiming success', () => {
    const futurePayload = JSON.stringify({ schemaVersion: 99, notes: [] });
    const port = new InMemoryStoragePort({ [NOTES_STORAGE_KEY]: futurePayload });
    const repository = {
      read: () => {
        throw new NotesStorageError('future-version');
      },
      write: () => {
        throw new Error('blocked');
      },
      reset: () => {
        throw new Error('quota');
      },
    } satisfies NotesRepository;
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.resetSavedNotes();

    expect(result).toEqual({ ok: false, reason: 'persistence' });
    expect(store.storageBlocker).toEqual({ kind: 'future-version' });
    expect(port.getItem(NOTES_STORAGE_KEY)).toBe(futurePayload);
  });

  it('keeps a quota write failure from deleting or silently discarding saved notes', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Сохранена',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 3,
    };
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, notes: [existing] }),
    });
    const failingPort = new Proxy(port, {
      get(target, prop, receiver) {
        if (prop === 'setItem') {
          return () => {
            throw new DOMException('QuotaExceeded', 'QuotaExceededError');
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const repository = createBrowserNotesRepository(failingPort);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();
    expect(store.notes.map(note => note.id)).toEqual(['existing']);

    const result = store.updateNote('existing', { title: 'Другое', items: [] });

    expect(result).toEqual({ ok: false, reason: 'persistence' });
    expect(store.notes.map(note => note.id)).toEqual(['existing']);
    expect(JSON.parse(port.getItem(NOTES_STORAGE_KEY)!).notes[0].title).toBe('Сохранена');
  });

  it('reports blocked storage access instead of calling it corruption', () => {
    const blockedPort: NotesStoragePort = {
      getItem: () => {
        throw new DOMException('The document is sandboxed', 'SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const repository = createBrowserNotesRepository(blockedPort);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'blocked' });
    expect(store.error).toBe(blockerMessage('blocked'));
    expect(store.isInitialized).toBe(true);
  });

  it('treats a v1 payload with malformed note structure as corrupted, not as a silent migration', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        notes: [{ title: 'Без идентификатора', items: [], createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' }],
      }),
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'corrupted' });
    expect(store.notes).toEqual([]);
  });

  it('lets the user retry and succeed after a recoverable write failure without retyping data', () => {
    const existing: Note = {
      id: 'existing',
      title: 'Список',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 2,
    };
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, notes: [existing] }),
    });
    let failNextWrite = true;
    const flakyPort = new Proxy(port, {
      get(target, prop, receiver) {
        if (prop === 'setItem') {
          return (...args: [string, string]) => {
            if (failNextWrite) {
              failNextWrite = false;
              throw new DOMException('QuotaExceeded', 'QuotaExceededError');
            }
            return (Reflect.get(target, prop, receiver) as (k: string, v: string) => void).apply(target, args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const repository = createBrowserNotesRepository(flakyPort);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const firstAttempt = store.updateNote('existing', { title: 'Изменённый список', items: [] });
    expect(firstAttempt).toEqual({ ok: false, reason: 'persistence' });
    expect(store.notes.map(note => note.id)).toEqual(['existing']);

    const retry = store.updateNote('existing', { title: 'Изменённый список', items: [] });

    expect(retry).toEqual({
      ok: true,
      note: { ...existing, title: 'Изменённый список', updatedAt: '2026-09-03T12:00:00.000Z', revision: 3 },
    });
    expect(store.error).toBeNull();
    expect(store.notes.map(note => note.title)).toEqual(['Изменённый список']);
    expect(JSON.parse(port.getItem(NOTES_STORAGE_KEY)!).notes[0].title).toBe('Изменённый список');
  });
});
