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
      throw new Error('Хранилище недоступно');
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

describe('хранилище заметок', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('загружает сохранённые заметки, упорядоченные по последнему успешному сохранению', () => {
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

  it('создаёт и сохраняет нормализованную заметку через явное действие', () => {
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

  it('обрезает текст пунктов и убирает пустые строки при создании заметки', () => {
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

  it('отклоняет текст пункта длиннее 300 символов', () => {
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

  it('отклоняет пустой заголовок, не меняя и не сохраняя заметки', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({ title: '   ', items: [] });

    expect(result).toEqual({ ok: false, reason: 'title-required' });
    expect(store.notes).toEqual([]);
    expect(repository.writeCalls).toBe(0);
  });

  it('отклоняет заголовок длиннее 120 символов', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.createNote({ title: 'а'.repeat(NOTE_TITLE_MAX_LENGTH + 1), items: [] });

    expect(result).toEqual({ ok: false, reason: 'title-too-long' });
    expect(store.notes).toEqual([]);
    expect(repository.writeCalls).toBe(0);
  });

  it('допускает одинаковые заголовки и ставит последнюю заметку первой', () => {
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

  it('не меняет наблюдаемое состояние, если сохранить не удалось', () => {
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

  it('обновляет заметку, нормализует список пунктов и поднимает её наверх', () => {
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

  it('удаляет существующий пункт, если его нет в обновлении', () => {
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

  it('не сохраняет заметку без изменений', () => {
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

  it('возвращает сохранённую заметку по идентификатору и сообщает о неизвестной', () => {
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

  it('не выполняет запись при обновлении неизвестной заметки', () => {
    const repository = new InMemoryNotesRepository();
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();
    store.initialize();

    const result = store.updateNote('missing', { title: 'Список', items: [] });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(repository.writeCalls).toBe(0);
  });

  it('проверяет существующую заметку перед записью', () => {
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

  it('оставляет существующую заметку нетронутой, когда обновление не удаётся сохранить', () => {
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

  it('удаляет существующую заметку и сохраняет изменение', () => {
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

  it('оставляет заметку видимой, когда удаление не удаётся сохранить', () => {
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

  it('мигрирует поддерживаемую старую версию схемы на текущую, сохраняя заметки пользователя', () => {
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

  it('мигрирует поддерживаемые версии хранилища по цепочке, перенося заметки через каждый шаг', () => {
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

  it('сообщает о повреждённом хранилище как о явном блокере вместо пустого списка', () => {
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

  it('сообщает о некорректной структуре заметок как о блокере, не называя это повреждением JSON', () => {
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

  it('сообщает о неизвестной будущей версии схемы как о блокере и не трогает её данные', () => {
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

  it('сообщает о будущей версии, даже если структура её данных тоже некорректна', () => {
    const port = new InMemoryStoragePort({
      [NOTES_STORAGE_KEY]: '{"schemaVersion":99,"notes":"junk"}',
    });
    const repository = createBrowserNotesRepository(port);
    const useNotesStore = createNotesStore(createDependencies(repository));
    const store = useNotesStore();

    store.initialize();

    expect(store.storageBlocker).toEqual({ kind: 'future-version' });
  });

  it('блокирует изменяющие действия, пока хранилище заблокировано, и не трогает данные', () => {
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

  it('обновление сохраняет существующий блокер и не подменяет список пустым', () => {
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

  it('сбрасывает только ключ сохранённых заметок после явного подтверждения и снимает блокер', () => {
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

  it('сообщает о неудачном сбросе вместо ложного успеха', () => {
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

  it('не даёт ошибке квоты удалить или незаметно потерять сохранённые заметки', () => {
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

  it('сообщает о заблокированном доступе к хранилищу, не называя это повреждением', () => {
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

  it('считает данные версии 1 с некорректной структурой заметки повреждёнными, а не мигрирует их молча', () => {
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

  it('позволяет повторить попытку после устранимой ошибки записи без повторного ввода данных', () => {
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
