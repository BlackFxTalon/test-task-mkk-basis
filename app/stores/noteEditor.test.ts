import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Draft, DraftRepository } from '../domain/draft'
import { createNoteEditorStore, useNoteEditorStore } from './noteEditor'

const createMemoryDraftRepository = (initial: Draft[] = []) => {
  const drafts = new Map(initial.map(draft => [draft.sessionId, structuredClone(draft)]))
  const repository: DraftRepository = {
    read: sessionId => structuredClone(drafts.get(sessionId) ?? null),
    write: draft => drafts.set(draft.sessionId, structuredClone(draft)),
    delete: sessionId => drafts.delete(sessionId),
    deleteOlderThan: cutoff => {
      for (const [sessionId, draft] of drafts) {
        if (draft.updatedAt < cutoff) {
          drafts.delete(sessionId)
        }
      }
    },
  }
  return { drafts, repository }
}

describe('note editor store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists the active session draft after 700 ms of inactivity', () => {
    vi.useFakeTimers()
    const drafts = new Map<string, Draft>()
    const repository: DraftRepository = {
      read: sessionId => drafts.get(sessionId) ?? null,
      write: draft => drafts.set(draft.sessionId, structuredClone(draft)),
      delete: sessionId => drafts.delete(sessionId),
      deleteOlderThan: () => {},
    }
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()

    expect(store.startSession({
      noteId: 'note-1',
      baselineRevision: 3,
      title: 'Список',
      items: [],
    })).toBe('session-1')

    store.setTitle('Новый список')
    vi.advanceTimersByTime(699)
    expect(drafts.size).toBe(0)

    vi.advanceTimersByTime(1)
    expect(drafts.get('session-1')).toEqual({
      sessionId: 'session-1',
      targetNoteId: 'note-1',
      baselineRevision: 3,
      current: { title: 'Новый список', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    })
  })

  it('discards the active editing session and its unsaved changes', () => {
    const { repository } = createMemoryDraftRepository()
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({
      noteId: 'existing',
      title: 'Список',
      items: [{ id: 'item', text: 'Пункт', completed: false }],
    })
    store.setTitle('Несохранённый список')
    store.removeItem(0)

    expect(store.isDirty).toBe(true)
    expect(store.canUndo).toBe(true)

    store.cancelSession()

    expect(store.session).toBeNull()
    expect(store.isDirty).toBe(false)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })

  it('allows a clean editing session to be cancelled explicitly', () => {
    const { repository } = createMemoryDraftRepository()
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ noteId: null, title: '', items: [] })

    expect(store.isDirty).toBe(false)

    store.cancelSession()

    expect(store.session).toBeNull()
  })

  it('uses normalized structural changes to determine dirty state', () => {
    const store = useNoteEditorStore()
    store.startSession({
      noteId: 'existing',
      title: 'Список',
      items: [{ id: 'item', text: 'Пункт', completed: false }],
    })

    store.setTitle('  Список  ')
    store.setItemText(0, '  Пункт  ')
    store.addItem({ id: 'empty', text: '   ', completed: false })

    expect(store.isDirty).toBe(false)

    store.setItemCompleted(0, true)

    expect(store.isDirty).toBe(true)
  })

  it('exposes undo and redo through the editor store', () => {
    const store = useNoteEditorStore()
    store.startSession({ noteId: null, title: '', items: [] })

    store.setTitle('Новая заметка')
    expect(store.canUndo).toBe(true)

    const undoResult = store.undo()

    expect(undoResult?.action).toBe('undo')
    expect(store.session?.title).toBe('')
    expect(store.canRedo).toBe(true)

    const redoResult = store.redo()

    expect(redoResult?.action).toBe('redo')
    expect(store.session?.title).toBe('Новая заметка')
  })

  it('offers only the exact session draft and restores it without history', () => {
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
    ])
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    })
    const store = useStore()

    store.startSession({
      sessionId: 'session-1',
      noteId: 'note-1',
      baselineRevision: 4,
      title: 'Сохранённый список',
      items: [],
    })

    expect(store.recoveryDraft?.current.title).toBe('Восстановленный список')

    store.restoreRecoveryDraft()

    expect(store.getInput()).toEqual({
      title: 'Восстановленный список',
      items: [{ id: 'restored', text: 'Вернувшийся пункт', completed: true }],
    })
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    expect(store.isDirty).toBe(true)
  })

  it('does not offer a session draft for a different target note', () => {
    const { repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: 'note-2',
      baselineRevision: 1,
      current: { title: 'Другая заметка', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }])
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    })
    const store = useStore()

    store.startSession({
      sessionId: 'session-1',
      noteId: 'note-1',
      baselineRevision: 1,
      title: 'Первая заметка',
      items: [],
    })

    expect(store.recoveryDraft).toBeNull()
    expect(store.getInput().title).toBe('Первая заметка')
  })

  it('discards recovery and deletes the current session draft', () => {
    const { drafts, repository } = createMemoryDraftRepository([{
      sessionId: 'session-1',
      targetNoteId: null,
      baselineRevision: null,
      current: { title: 'Несохранённая заметка', items: [] },
      updatedAt: '2026-09-04T14:00:00.000Z',
    }])
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'unused',
      now: () => '2026-09-05T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ sessionId: 'session-1', noteId: null, title: '', items: [] })

    expect(store.discardRecoveryDraft()).toBe(true)

    expect(store.recoveryDraft).toBeNull()
    expect(store.getInput()).toEqual({ title: '', items: [] })
    expect(drafts.has('session-1')).toBe(false)
  })

  it('keeps drafts for independent editing sessions separate', () => {
    const { drafts, repository } = createMemoryDraftRepository()
    const useFirstStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-05T14:00:00.000Z',
    })
    const firstStore = useFirstStore(createPinia())
    const useSecondStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-2',
      now: () => '2026-09-05T14:01:00.000Z',
    })
    const secondStore = useSecondStore(createPinia())

    firstStore.startSession({ noteId: 'note-1', baselineRevision: 1, title: 'Первая', items: [] })
    firstStore.setTitle('Первая — черновик')
    firstStore.persistDraft()
    secondStore.startSession({ noteId: 'note-1', baselineRevision: 1, title: 'Первая', items: [] })
    secondStore.setTitle('Вторая вкладка — черновик')
    secondStore.persistDraft()

    expect([...drafts.keys()].sort()).toEqual(['session-1', 'session-2'])
    expect(drafts.get('session-1')?.current.title).toBe('Первая — черновик')
    expect(drafts.get('session-2')?.current.title).toBe('Вторая вкладка — черновик')
  })

  it('cleans drafts older than 30 days while retaining recent drafts', () => {
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
    ])
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'new-session',
      now: () => '2026-09-04T00:00:00.000Z',
    })

    useStore().startSession({ noteId: null, title: '', items: [] })

    expect(drafts.has('expired')).toBe(false)
    expect(drafts.has('recent')).toBe(true)
  })

  it('keeps active edits in memory and exposes a draft write failure', () => {
    const repository: DraftRepository = {
      read: () => null,
      write: () => { throw new Error('quota exceeded') },
      delete: () => {},
      deleteOlderThan: () => {},
    }
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ noteId: null, title: '', items: [] })
    store.setTitle('Остаётся в памяти')

    expect(store.persistDraft()).toBe(false)

    expect(store.session?.title).toBe('Остаётся в памяти')
    expect(store.draftError).toBe('Не удалось сохранить черновик. Изменения остаются открыты в этой вкладке.')
  })

  it('deletes the current draft when a session finishes after save', () => {
    const { drafts, repository } = createMemoryDraftRepository()
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ noteId: null, title: '', items: [] })
    store.setTitle('Сохранено')
    store.persistDraft()

    expect(store.finishSession()).toBe(true)

    expect(drafts.has('session-1')).toBe(false)
    expect(store.session).toBeNull()
    expect(store.canUndo).toBe(false)
  })

  it('does not close the session when draft deletion fails on finish', () => {
    const repository: DraftRepository = {
      read: () => null,
      write: () => {},
      delete: () => { throw new Error('storage locked') },
      deleteOlderThan: () => {},
    }
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ noteId: null, title: '', items: [] })
    store.setTitle('Сохранено')
    store.persistDraft()

    expect(store.finishSession()).toBe(false)

    expect(store.session?.title).toBe('Сохранено')
    expect(store.draftError).toBe('Не удалось удалить черновик.')
  })

  it('deletes the current draft when a session is confirmed as cancelled', () => {
    const { drafts, repository } = createMemoryDraftRepository()
    const useStore = createNoteEditorStore({
      repository,
      createSessionId: () => 'session-1',
      now: () => '2026-09-04T14:00:00.000Z',
    })
    const store = useStore()
    store.startSession({ noteId: null, title: '', items: [] })
    store.setTitle('Будет удалено')
    store.persistDraft()

    expect(store.cancelSession()).toBe(true)

    expect(drafts.has('session-1')).toBe(false)
    expect(store.session).toBeNull()
  })
})
