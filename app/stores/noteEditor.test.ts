import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNoteEditorStore } from './noteEditor'

describe('note editor store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('discards the active editing session and its unsaved changes', () => {
    const store = useNoteEditorStore()
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
    const store = useNoteEditorStore()
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
})
