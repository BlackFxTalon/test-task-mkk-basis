import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Draft, DraftRepository } from '../domain/draft';
import type { Note, NotesRepository } from '../domain/note';
import { createNoteEditorStore, useNoteEditorStore } from './noteEditor';
import { createNotesStore, type NotesStoreDependencies } from './notes';

const createMemoryDraftRepository = (initial: Draft[] = []) => {
  const drafts = new Map(initial.map(draft => [draft.sessionId, structuredClone(draft)]));
  const repository: DraftRepository = {
    read: sessionId => structuredClone(drafts.get(sessionId) ?? null),
    write: draft => drafts.set(draft.sessionId, structuredClone(draft)),
    delete: sessionId => drafts.delete(sessionId),
    deleteOlderThan: cutoff => {
      for (const [sessionId, draft] of drafts) {
        if (draft.updatedAt < cutoff) {
          drafts.delete(sessionId);
        }
      }
    },
  };
  return { drafts, repository };
};

describe('хранилище редактора заметок', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('сохраняет черновик активной сессии после 700 мс бездействия', () => {
    vi.useFakeTimers();
    const drafts = new Map<string, Draft>();
    const repository: DraftRepository = {
      read: sessionId => drafts.get(sessionId) ?? null,
      write: draft => drafts.set(draft.sessionId, structuredClone(draft)),
      delete: sessionId => drafts.delete(sessionId),
      deleteOlderThan: () => {},
    };
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();

    expect(store.startSession({
      noteId: 'note-1',
      baselineRevision: 3,
      title: 'Список',
      items: [],
    })).toBe('session-1');

    store.setTitle('Новый список');
    vi.advanceTimersByTime(699);
    expect(drafts.size).toBe(0);

    vi.advanceTimersByTime(1);
    expect(drafts.get('session-1')).toEqual({
      sessionId: 'session-1',
      targetNoteId: 'note-1',
      baselineRevision: 3,
      current: { title: 'Новый список', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    });
  });

  it('отменяет активную сессию редактирования и её несохранённые изменения', () => {
    const { repository } = createMemoryDraftRepository();
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({
      noteId: 'existing',
      title: 'Список',
      items: [{ id: 'item', text: 'Пункт', completed: false }],
    });
    store.setTitle('Несохранённый список');
    store.removeItem(0);

    expect(store.isDirty).toBe(true);
    expect(store.canUndo).toBe(true);

    store.cancelSession();

    expect(store.session).toBeNull();
    expect(store.isDirty).toBe(false);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it('позволяет явно отменить сессию редактирования без изменений', () => {
    const { repository } = createMemoryDraftRepository();
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ noteId: null, title: '', items: [] });

    expect(store.isDirty).toBe(false);

    store.cancelSession();

    expect(store.session).toBeNull();
  });

  it('определяет наличие правок по нормализованным структурным изменениям', () => {
    const store = useNoteEditorStore();
    store.startSession({
      noteId: 'existing',
      title: 'Список',
      items: [{ id: 'item', text: 'Пункт', completed: false }],
    });

    store.setTitle('  Список  ');
    store.setItemText(0, '  Пункт  ');
    store.addItem({ id: 'empty', text: '   ', completed: false });

    expect(store.isDirty).toBe(false);

    store.setItemCompleted(0, true);

    expect(store.isDirty).toBe(true);
  });

  it('даёт отмену и повтор через хранилище редактора', () => {
    const store = useNoteEditorStore();
    store.startSession({ noteId: null, title: '', items: [] });

    store.setTitle('Новая заметка');
    expect(store.canUndo).toBe(true);

    const undoResult = store.undo();

    expect(undoResult?.action).toBe('undo');
    expect(store.session?.title).toBe('');
    expect(store.canRedo).toBe(true);

    const redoResult = store.redo();

    expect(redoResult?.action).toBe('redo');
    expect(store.session?.title).toBe('Новая заметка');
  });

  it('предлагает только черновик своей сессии и восстанавливает его без истории', () => {
    const { repository } = createMemoryDraftRepository([
      {
        sessionId: 'session-1',
        targetNoteId: 'note-1',
        baselineRevision: 4,
        current: {
          title: 'Восстановленный список',
          items: [{ id: 'restored', text: 'Вернувшийся пункт', completed: true }],
        },
        updatedAt: '2026-09-04T14:00:00.000Z',
      },
      {
        sessionId: 'other-session',
        targetNoteId: 'note-1',
        baselineRevision: 4,
        current: { title: 'Чужой черновик', items: [] },
        updatedAt: '2026-09-04T14:00:00.000Z',
      },
    ]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const store = useStore();

    store.startSession({
      sessionId: 'session-1',
      noteId: 'note-1',
      baselineRevision: 4,
      title: 'Сохранённый список',
      items: [],
    });

    expect(store.recoveryDraft?.current.title).toBe('Восстановленный список');

    store.restoreRecoveryDraft();

    expect(store.getInput()).toEqual({
      title: 'Восстановленный список',
      items: [{ id: 'restored', text: 'Вернувшийся пункт', completed: true }],
    });
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    expect(store.isDirty).toBe(true);
  });

  it('не предлагает черновик сессии для другой целевой заметки', () => {
    const { repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: 'note-2',
      baselineRevision: 1,
      current: { title: 'Другая заметка', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const store = useStore();

    store.startSession({
      sessionId: 'session-1',
      noteId: 'note-1',
      baselineRevision: 1,
      title: 'Первая заметка',
      items: [],
    });

    expect(store.recoveryDraft).toBeNull();
    expect(store.getInput().title).toBe('Первая заметка');
  });

  it('отклоняет восстановление и удаляет черновик текущей сессии', () => {
    const { drafts, repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: null,
      baselineRevision: null,
      current: { title: 'Несохранённая заметка', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ sessionId: 'session-1', noteId: null, title: '', items: [] });

    expect(store.discardRecoveryDraft()).toBe(true);

    expect(store.recoveryDraft).toBeNull();
    expect(store.getInput()).toEqual({ title: '', items: [] });
    expect(drafts.has('session-1')).toBe(false);
  });

  it('хранит черновики независимых сессий редактирования отдельно', () => {
    const { drafts, repository } = createMemoryDraftRepository();
    const useFirstStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const firstStore = useFirstStore(createPinia());
    const useSecondStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-2',
      now: () => '2026-09-05T14:01:00.000Z',
    });
    const secondStore = useSecondStore(createPinia());

    firstStore.startSession({ noteId: 'note-1', baselineRevision: 1, title: 'Первая', items: [] });
    firstStore.setTitle('Первая — черновик');
    firstStore.persistDraft();
    secondStore.startSession({ noteId: 'note-1', baselineRevision: 1, title: 'Первая', items: [] });
    secondStore.setTitle('Вторая вкладка — черновик');
    secondStore.persistDraft();

    expect([...drafts.keys()].sort()).toEqual(['session-1', 'session-2']);
    expect(drafts.get('session-1')?.current.title).toBe('Первая — черновик');
    expect(drafts.get('session-2')?.current.title).toBe('Вторая вкладка — черновик');
  });

  it('удаляет черновики старше 30 дней, оставляя недавние', () => {
    const { drafts, repository } = createMemoryDraftRepository([
      {
        sessionId: 'expired',
        targetNoteId: null,
        baselineRevision: null,
        current: { title: 'Старый', items: [] },
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        sessionId: 'recent',
        targetNoteId: null,
        baselineRevision: null,
        current: { title: 'Свежий', items: [] },
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
    ]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'new-session',
      now: () => '2026-09-04T00:00:00.000Z',
    });

    useStore().startSession({ noteId: null, title: '', items: [] });

    expect(drafts.has('expired')).toBe(false);
    expect(drafts.has('recent')).toBe(true);
  });

  it('оставляет правки в памяти и сообщает об ошибке записи черновика', () => {
    const repository: DraftRepository = {
      read: () => null,
      write: () => { throw new Error('квота превышена'); },
      delete: () => {},
      deleteOlderThan: () => {},
    };
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ noteId: null, title: '', items: [] });
    store.setTitle('Остаётся в памяти');

    expect(store.persistDraft()).toBe(false);

    expect(store.session?.title).toBe('Остаётся в памяти');
    expect(store.draftError).toBe('Не удалось сохранить черновик. Изменения остаются открыты в этой вкладке.');
  });

  it('удаляет текущий черновик при успешном завершении сессии', () => {
    const { drafts, repository } = createMemoryDraftRepository();
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ noteId: null, title: '', items: [] });
    store.setTitle('Сохранено');
    store.persistDraft();

    expect(store.finishSession()).toBe(true);

    expect(drafts.has('session-1')).toBe(false);
    expect(store.session).toBeNull();
    expect(store.canUndo).toBe(false);
  });

  it('не закрывает сессию, если удаление черновика не удалось при завершении', () => {
    const repository: DraftRepository = {
      read: () => null,
      write: () => {},
      delete: () => { throw new Error('хранилище заблокировано'); },
      deleteOlderThan: () => {},
    };
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ noteId: null, title: '', items: [] });
    store.setTitle('Сохранено');
    store.persistDraft();

    expect(store.finishSession()).toBe(false);

    expect(store.session?.title).toBe('Сохранено');
    expect(store.draftError).toBe('Не удалось удалить черновик.');
  });

  it('удаляет текущий черновик при подтверждённой отмене сессии', () => {
    const { drafts, repository } = createMemoryDraftRepository();
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    });
    const store = useStore();
    store.startSession({ noteId: null, title: '', items: [] });
    store.setTitle('Будет удалено');
    store.persistDraft();

    expect(store.cancelSession()).toBe(true);

    expect(drafts.has('session-1')).toBe(false);
    expect(store.session).toBeNull();
  });
});

describe('синхронизация хранилищ заметок и редактора между вкладками', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const savedNote = (): Note => ({
    id: 'note-1',
    title: 'Сохранённый список',
    items: [{ id: 'item-1', text: 'Пункт', completed: false }],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    revision: 1,
  });

  const externallySavedRevision = (): Note => ({
    id: 'note-1',
    title: 'Сохранено в другой вкладке',
    items: [{ id: 'item-1', text: 'Обновлённый пункт', completed: true }],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    revision: 2,
  });

  const setup = (initialNotes: Note[]) => {
    let storedNotes = structuredClone(initialNotes);
    const notesRepository: NotesRepository = {
      read: () => structuredClone(storedNotes),
      write: notes => { storedNotes = structuredClone(notes); },
      reset: () => { storedNotes = []; },
    };
    const notesDependencies: NotesStoreDependencies = {
      repository: notesRepository,
      createId: () => 'note-2',
      now: () => '2026-09-05T14:00:00.000Z',
    };
    const { repository: draftRepository } = createMemoryDraftRepository();
    const useNotesStore = createNotesStore(notesDependencies);
    const useEditorStore = createNoteEditorStore({
      repository: draftRepository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    return {
      useNotesStore,
      useEditorStore,
      saveExternally: (note: Note) => { storedNotes = structuredClone(storedNotes).map(candidate => candidate.id === note.id ? structuredClone(note) : candidate); },
    };
  };

  it('обновляет чистый редактор до внешне сохранённой ревизии без конфликта', () => {
    const { useNotesStore, useEditorStore, saveExternally } = setup([savedNote()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });

    saveExternally(externallySavedRevision());
    notesStore.refresh();
    const external = notesStore.getNote('note-1')!;
    const outcome = editorStore.applyExternalChange(external);

    expect(outcome).toBe('rebased');
    expect(editorStore.isExternallyModified).toBe(false);
    expect(editorStore.isDirty).toBe(false);
    expect(editorStore.getInput()).toEqual({
      title: external.title,
      items: external.items,
    });
    expect(editorStore.session?.baselineRevision).toBe(external.revision);
  });

  it('сохраняет локальные правки и сообщает о внешнем изменении', () => {
    const { useNotesStore, useEditorStore, saveExternally } = setup([savedNote()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });
    editorStore.setTitle('Локальная работа');

    saveExternally(externallySavedRevision());
    notesStore.refresh();
    const outcome = editorStore.applyExternalChange(notesStore.getNote('note-1'));

    expect(outcome).toBe('notified');
    expect(editorStore.isExternallyModified).toBe(true);
    expect(editorStore.getInput().title).toBe('Локальная работа');
    expect(editorStore.isDirty).toBe(true);

    const saveResult = notesStore.updateNote('note-1', editorStore.getInput(), {
      baselineRevision: editorStore.session?.baselineRevision ?? undefined,
    });
    expect(saveResult).toEqual({ ok: false, reason: 'revision-conflict' });
  });

  it('отклоняет сохранение с устаревшей базовой ревизией', () => {
    const { useNotesStore, useEditorStore } = setup([externallySavedRevision()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: 1,
      title: note.title,
      items: note.items,
    });
    editorStore.setTitle('Из другой вкладки');

    const result = notesStore.updateNote('note-1', editorStore.getInput(), {
      baselineRevision: editorStore.session?.baselineRevision ?? undefined,
    });

    expect(result).toEqual({ ok: false, reason: 'revision-conflict' });
    expect(notesStore.getNote('note-1')?.revision).toBe(2);
  });

  it('создаёт новую ревизию при намеренной перезаписи', () => {
    const { useNotesStore, useEditorStore } = setup([externallySavedRevision()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: 1,
      title: note.title,
      items: note.items,
    });
    editorStore.setTitle('Намеренная перезапись');

    const result = notesStore.updateNote('note-1', editorStore.getInput(), { force: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.note.revision).toBeGreaterThan(2);
      expect(result.note.title).toBe('Намеренная перезапись');
    }
    expect(notesStore.getNote('note-1')?.revision).toBe(3);
  });

  it('сохраняет правки редактора как отдельную новую заметку', () => {
    const { useNotesStore, useEditorStore } = setup([savedNote()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });
    editorStore.setTitle('Спасённая работа');

    const created = notesStore.createNote(editorStore.getInput());
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.note.revision).toBe(1);
      expect(created.note.title).toBe('Спасённая работа');
    }
    expect(notesStore.getNote('note-1')?.title).toBe('Сохранённый список');
    expect(editorStore.finishSession()).toBe(true);
    expect(editorStore.session).toBeNull();
  });

  it('переводит чистый редактор в состояние внешне удалённой заметки', () => {
    const { useNotesStore, useEditorStore } = setup([savedNote()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });

    const outcome = editorStore.applyExternalChange(null);

    expect(outcome).toBe('deleted');
    expect(editorStore.isExternallyDeleted).toBe(true);
  });

  it('предлагает спасти локальные правки, когда изменённую заметку удалили извне', () => {
    const { useNotesStore, useEditorStore } = setup([savedNote()]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });
    editorStore.setTitle('Уцелевшая работа');

    const outcome = editorStore.applyExternalChange(null);

    expect(outcome).toBe('deleted');
    expect(editorStore.isExternallyDeleted).toBe(true);
    expect(editorStore.isExternallyModified).toBe(false);
    expect(editorStore.getInput().title).toBe('Уцелевшая работа');
    expect(editorStore.isDirty).toBe(true);

    const created = notesStore.createNote(editorStore.getInput());
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.note.title).toBe('Уцелевшая работа');
    }
    expect(editorStore.finishSession()).toBe(true);
    expect(editorStore.isExternallyDeleted).toBe(false);
  });

  it('восстанавливает подходящий черновик как новую заметку при открытии ссылки удалённой заметки', () => {
    const { drafts, repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: 'note-1',
      baselineRevision: 2,
      current: {
        title: 'Черновик удалённой заметки',
        items: [{ id: 'draft-item', text: 'Уцелевший пункт', completed: false }],
      },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const store = useStore();

    const offered = store.offerDraftForDeletedNote('note-1', 'session-1');

    expect(offered?.current.title).toBe('Черновик удалённой заметки');
    expect(store.recoveryDraft?.current.title).toBe('Черновик удалённой заметки');

    expect(store.restoreOrphanedDraftAsNew()).toBe(true);

    expect(store.session?.noteId).toBeNull();
    expect(store.session?.sessionId).toBe('session-1');
    expect(store.getInput()).toEqual({
      title: 'Черновик удалённой заметки',
      items: [{ id: 'draft-item', text: 'Уцелевший пункт', completed: false }],
    });
    expect(store.isDirty).toBe(true);
    expect(store.canUndo).toBe(false);
    expect(store.recoveryDraft).toBeNull();
    expect(drafts.has('session-1')).toBe(true);
  });

  it('не предлагает невосстанавливаемый черновик для удалённой заметки', () => {
    const { repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: 'note-1',
      baselineRevision: 2,
      current: { title: '   ', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }]);
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const store = useStore();

    expect(store.offerDraftForDeletedNote('note-1', 'session-1')).toBeNull();
    expect(store.recoveryDraft).toBeNull();
  });

  it('игнорирует внешние события для другой заметки', () => {
    const otherNote: Note = {
      id: 'other-note',
      title: 'Другая заметка',
      items: [],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 5,
    };
    const { useNotesStore, useEditorStore } = setup([savedNote(), otherNote]);
    const notesStore = useNotesStore();
    const editorStore = useEditorStore();
    notesStore.initialize();
    const note = notesStore.getNote('note-1')!;
    editorStore.startSession({
      noteId: note.id,
      baselineRevision: note.revision,
      title: note.title,
      items: note.items,
    });

    expect(editorStore.applyExternalChange(otherNote)).toBe('ignored');
    expect(editorStore.isExternallyModified).toBe(false);

    expect(editorStore.applyExternalChange(savedNote())).toBe('ignored');
  });

  it('обновляет главный список из хранилища при внешних записях', () => {
    let externalNotes = [savedNote()];
    const notesRepository: NotesRepository = {
      read: () => structuredClone(externalNotes),
      write: () => {},
      reset: () => { externalNotes = []; },
    };
    const useNotesStore = createNotesStore({
      repository: notesRepository,
      createId: () => 'note-2',
      now: () => '2026-09-05T14:00:00.000Z',
    });
    const notesStore = useNotesStore();
    notesStore.initialize();
    expect(notesStore.notes.map(candidate => candidate.title)).toEqual(['Сохранённый список']);

    externalNotes = [...externalNotes, {
      id: 'external',
      title: 'Из другой вкладки',
      items: [],
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
      revision: 1,
    }];

    expect(notesStore.refresh()).toBe(true);
    expect(notesStore.notes.map(candidate => candidate.title)).toEqual([
      'Из другой вкладки',
      'Сохранённый список',
    ]);
  });
});
