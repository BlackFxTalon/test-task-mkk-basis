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

    store.cancelSession()

    expect(store.session).toBeNull()
    expect(store.isDirty).toBe(false)
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
})
