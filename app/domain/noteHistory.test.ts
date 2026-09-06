import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneNoteInput, type NoteInput } from './noteInput';
import { createNoteHistory } from './noteHistory';

const initial: NoteInput = {
  title: 'Список',
  items: [
    { id: 'first', text: 'Первый', completed: false },
    { id: 'second', text: 'Второй', completed: true },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('note history', () => {
  it('undoes and redoes every atomic note operation', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setTitle('Новый список');
    history.commitText();
    history.setItemText('first', 'Изменённый');
    history.commitText();
    history.setItemCompleted('first', true);
    history.addItem({ id: 'third', text: 'Третий', completed: false });
    history.removeItem('second');

    expect(history.state).toEqual({
      title: 'Новый список',
      items: [
        { id: 'first', text: 'Изменённый', completed: true },
        { id: 'third', text: 'Третий', completed: false },
      ],
    });

    history.undo();
    expect(history.state.items.map(item => item.id)).toEqual(['first', 'second', 'third']);
    history.undo();
    expect(history.state.items.map(item => item.id)).toEqual(['first', 'second']);
    history.undo();
    expect(history.state.items[0]?.completed).toBe(false);
    history.undo();
    expect(history.state.items[0]?.text).toBe('Первый');
    history.undo();
    expect(history.state.title).toBe('Список');
    expect(history.canUndo).toBe(false);

    for (let index = 0; index < 5; index += 1) {
      history.redo();
    }

    expect(history.state).toEqual({
      title: 'Новый список',
      items: [
        { id: 'first', text: 'Изменённый', completed: true },
        { id: 'third', text: 'Третий', completed: false },
      ],
    });
    expect(history.canRedo).toBe(false);
  });

  it('groups continuous typing until 700 ms of inactivity', () => {
    vi.useFakeTimers();
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setTitle('С');
    vi.advanceTimersByTime(300);
    history.setTitle('Сп');
    vi.advanceTimersByTime(699);
    history.setTitle('Список дел');
    vi.advanceTimersByTime(700);

    history.undo();

    expect(history.state.title).toBe('Список');
    expect(history.canUndo).toBe(false);

    history.setTitle('Первый burst');
    vi.advanceTimersByTime(700);
    history.setTitle('Второй burst');
    vi.advanceTimersByTime(700);

    history.undo();
    expect(history.state.title).toBe('Первый burst');
    history.undo();
    expect(history.state.title).toBe('Список');
  });

  it('commits typing on blur and when the target field changes', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setTitle('Заголовок');
    history.commitText();
    history.setItemText('first', 'Первый изменён');
    history.setItemText('second', 'Второй изменён');

    history.undo();
    expect(history.state.items[1]?.text).toBe('Второй');
    history.undo();
    expect(history.state.items[0]?.text).toBe('Первый');
    history.undo();
    expect(history.state.title).toBe('Список');
  });

  it('flushes pending typing before structural actions, undo, and redo', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setTitle('Перед добавлением');
    history.addItem({ id: 'third', text: '', completed: false });
    history.undo();
    expect(history.state.items.map(item => item.id)).toEqual(['first', 'second']);
    history.undo();
    expect(history.state.title).toBe('Список');

    history.setItemText('first', 'Перед undo');
    history.undo();
    expect(history.state.items[0]?.text).toBe('Первый');
    history.redo();
    expect(history.state.items[0]?.text).toBe('Перед undo');
  });

  it('restores item identity and position after insertion and deletion', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.removeItem('first');
    history.undo();
    expect(history.state.items).toEqual(initial.items);

    history.addItem({ id: 'third', text: 'Третий', completed: false }, 1);
    history.undo();
    expect(history.state.items).toEqual(initial.items);
    history.redo();
    expect(history.state.items.map(item => item.id)).toEqual(['first', 'third', 'second']);
  });

  it('discards the redo branch after a new change', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setItemCompleted('first', true);
    history.undo();
    expect(history.canRedo).toBe(true);

    history.setTitle('Новая ветка');
    history.commitText();

    expect(history.canRedo).toBe(false);
  });

  it('retains only the latest 50 operations', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    for (let index = 0; index < 51; index += 1) {
      history.setItemCompleted('first', index % 2 === 0);
    }

    for (let index = 0; index < 50; index += 1) {
      history.undo();
    }

    expect(history.canUndo).toBe(false);
    expect(history.state.items[0]?.completed).toBe(true);
  });

  it('clears undo and redo without changing current editor state', () => {
    const history = createNoteHistory(cloneNoteInput(initial));
    history.setItemCompleted('first', true);

    history.clear();

    expect(history.state.items[0]?.completed).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
