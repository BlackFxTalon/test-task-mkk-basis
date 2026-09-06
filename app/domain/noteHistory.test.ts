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

describe('история правок заметки', () => {
  it('отменяет и повторяет каждую атомарную операцию над заметкой', () => {
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

  it('группирует непрерывный ввод до 700 мс бездействия', () => {
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

  it('фиксирует ввод при потере фокуса и смене редактируемого поля', () => {
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

  it('фиксирует незавершённый ввод перед структурными действиями, отменой и повтором', () => {
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

  it('восстанавливает идентичность и позицию пунктов после вставки и удаления', () => {
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

  it('сбрасывает ветку повтора после нового изменения', () => {
    const history = createNoteHistory(cloneNoteInput(initial));

    history.setItemCompleted('first', true);
    history.undo();
    expect(history.canRedo).toBe(true);

    history.setTitle('Новая ветка');
    history.commitText();

    expect(history.canRedo).toBe(false);
  });

  it('хранит только последние 50 операций', () => {
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

  it('очищает отмену и повтор, не меняя текущее состояние редактора', () => {
    const history = createNoteHistory(cloneNoteInput(initial));
    history.setItemCompleted('first', true);

    history.clear();

    expect(history.state.items[0]?.completed).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
