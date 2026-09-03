<script setup lang="ts">
import {
  NOTE_ITEM_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  type Note,
  type TodoItem,
} from '../domain/note'
import { useNotesStore } from '../stores/notes'

const props = defineProps<{
  noteId?: string
}>()

const notesStore = useNotesStore()
const { announce } = useOperationStatus()
const titleInput = useTemplateRef<HTMLInputElement>('titleInput')
const title = ref('')
const items = ref<TodoItem[]>([])
const isReady = ref(false)
const isSaving = ref(false)
const isNotFound = ref(false)
const titleError = ref<string | null>(null)
const formError = ref<string | null>(null)

const isEditing = computed(() => props.noteId !== undefined)
const pageTitle = computed(() => isEditing.value ? 'Редактирование заметки' : 'Новая заметка')
const noteInput = computed(() => ({ title: title.value, items: items.value }))
const isSaveDisabled = computed(() =>
  isSaving.value
  || (props.noteId !== undefined && !notesStore.hasNoteChanged(props.noteId, noteInput.value)),
)
const titleDescription = computed(() =>
  titleError.value ? 'note-title-help note-title-error' : 'note-title-help',
)

const populateEditor = (note: Note): void => {
  title.value = note.title
  items.value = note.items.map(item => ({ ...item }))
}

onMounted(() => {
  if (!notesStore.isInitialized) {
    notesStore.initialize()
  }

  if (props.noteId !== undefined && !notesStore.error) {
    const note = notesStore.getNote(props.noteId)
    if (!note) {
      isNotFound.value = true
    }
    else {
      populateEditor(note)
    }
  }

  isReady.value = true
})

const addItem = (): void => {
  items.value.push({
    id: crypto.randomUUID(),
    text: '',
    completed: false,
  })
}

const removeItem = (index: number): void => {
  items.value.splice(index, 1)
  formError.value = null
}

const clearErrors = (): void => {
  titleError.value = null
  formError.value = null
}

const focusInvalidTitle = async (): Promise<void> => {
  await nextTick()
  titleInput.value?.focus()
}

const saveNote = async (): Promise<void> => {
  isSaving.value = true
  clearErrors()

  const result = props.noteId === undefined
    ? notesStore.createNote(noteInput.value)
    : notesStore.updateNote(props.noteId, noteInput.value)

  if (!result.ok) {
    isSaving.value = false

    if (result.reason === 'title-required') {
      titleError.value = 'Введите название заметки.'
      await focusInvalidTitle()
    }
    else if (result.reason === 'title-too-long') {
      titleError.value = `Название не должно быть длиннее ${NOTE_TITLE_MAX_LENGTH} символов.`
      await focusInvalidTitle()
    }
    else if (result.reason === 'item-too-long') {
      formError.value = `Текст пункта не должен быть длиннее ${NOTE_ITEM_MAX_LENGTH} символов.`
    }
    else if (result.reason === 'not-found') {
      isNotFound.value = true
    }

    return
  }

  announce(isEditing.value ? 'Изменения сохранены.' : 'Заметка создана.')
  await navigateTo('/')
}
</script>

<template>
  <section class="note-editor-page">
    <p v-if="!isReady" class="note-editor-page__state">
      Загружаем заметку…
    </p>

    <div v-else-if="notesStore.error && !isNotFound" class="note-editor-page__state note-editor-page__state--error" role="alert">
      <h1>Не удалось открыть заметку</h1>
      <p>{{ notesStore.error }}</p>
      <NuxtLink class="button button--secondary" to="/">Вернуться к заметкам</NuxtLink>
    </div>

    <div v-else-if="isNotFound" class="note-editor-page__state">
      <p class="note-editor-page__eyebrow">Ошибка</p>
      <h1>Заметка не найдена</h1>
      <p>Возможно, её удалили или адрес указан неверно.</p>
      <div class="note-editor-page__state-actions">
        <NuxtLink class="button button--secondary" to="/">Вернуться к заметкам</NuxtLink>
        <NuxtLink class="button button--primary" to="/notes/new">Создать заметку</NuxtLink>
      </div>
    </div>

    <template v-else>
      <header class="note-editor-page__header">
        <p class="note-editor-page__eyebrow">{{ pageTitle }}</p>
        <h1>{{ isEditing ? 'Измените заметку' : 'Что важно запомнить?' }}</h1>
        <p>Добавьте название и пункты. Изменения попадут в список только после сохранения.</p>
      </header>

      <form class="note-form" novalidate @submit.prevent="saveNote">
        <div class="field">
          <div class="field__label-row">
            <label for="note-title">Название</label>
            <span>{{ title.length }} / {{ NOTE_TITLE_MAX_LENGTH }}</span>
          </div>
          <input
            id="note-title"
            ref="titleInput"
            v-model="title"
            name="title"
            type="text"
            :maxlength="NOTE_TITLE_MAX_LENGTH"
            autocomplete="off"
            :aria-describedby="titleDescription"
            :aria-invalid="Boolean(titleError)"
            @input="clearErrors"
          >
          <p id="note-title-help" class="field__help">
            Обязательное поле, до {{ NOTE_TITLE_MAX_LENGTH }} символов.
          </p>
          <p v-if="titleError" id="note-title-error" class="field__error">
            {{ titleError }}
          </p>
        </div>

        <fieldset class="items-editor">
          <legend>Список задач</legend>

          <p v-if="items.length === 0" class="items-editor__empty">
            Пунктов пока нет. Можно сохранить заметку без них.
          </p>

          <ol v-else class="items-editor__list">
            <li v-for="(item, index) in items" :key="item.id" class="item-row">
              <input
                v-model="item.completed"
                class="item-row__checkbox"
                type="checkbox"
                :aria-label="`Отметить пункт ${index + 1} выполненным`"
                @change="formError = null"
              >
              <div class="item-row__field">
                <label :for="`note-item-${item.id}`">Пункт {{ index + 1 }}</label>
                <input
                  :id="`note-item-${item.id}`"
                  v-model="item.text"
                  type="text"
                  :maxlength="NOTE_ITEM_MAX_LENGTH"
                  :aria-describedby="`note-item-count-${item.id}`"
                  @input="formError = null"
                >
                <span :id="`note-item-count-${item.id}`" class="item-row__count">
                  {{ item.text.length }} / {{ NOTE_ITEM_MAX_LENGTH }}
                </span>
              </div>
              <button
                class="item-row__remove"
                type="button"
                :aria-label="`Удалить пункт ${index + 1}`"
                @click="removeItem(index)"
              >
                Удалить
              </button>
            </li>
          </ol>

          <button class="button button--secondary" type="button" @click="addItem">
            Добавить пункт
          </button>
        </fieldset>

        <p v-if="formError" class="note-form__error" role="alert">{{ formError }}</p>
        <p v-if="notesStore.error" class="note-form__error" role="alert">{{ notesStore.error }}</p>

        <div class="note-form__actions">
          <button
            class="button button--primary"
            type="submit"
            :disabled="isSaveDisabled"
            :title="isEditing && !isSaveDisabled ? undefined : isEditing ? 'Нет изменений для сохранения' : undefined"
          >
            {{ isSaving ? 'Сохраняем…' : 'Сохранить' }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped lang="scss">
.note-editor-page {
  display: grid;
  @include rem(gap, 32px);
  @include rem(max-width, 800px);
  padding-block: clamp(#{to-rem(40px)}, 8vw, #{to-rem(80px)});

  &__header {
    h1 {
      margin: 0;
      font-size: clamp(#{to-rem(36px)}, 7vw, #{to-rem(64px)});
      line-height: 1;
      letter-spacing: -0.05em;
    }

    > p:last-child {
      @include rem(max-width, 640px);
      @include rem(margin, 16px, 0px, 0px);
      color: var(--color-text-muted);
      line-height: 1.6;
    }
  }

  &__eyebrow {
    @include rem(margin, 0px, 0px, 10px);
    color: var(--color-accent-strong);
    font-weight: 800;
  }

  &__state {
    @include rem(padding, 24px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);

    h1 {
      margin: 0;
    }

    > p:not(.note-editor-page__eyebrow) {
      @include rem(margin, 12px, 0px, 24px);
      color: var(--color-text-muted);
    }

    &--error h1 {
      color: var(--color-danger);
    }
  }

  &__state-actions {
    display: flex;
    flex-wrap: wrap;
    @include rem(gap, 12px);
  }
}

.note-form {
  display: grid;
  justify-items: stretch;
  @include rem(gap, 28px);
  padding: clamp(#{to-rem(20px)}, 4vw, #{to-rem(32px)});
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);

  &__actions {
    display: flex;
    flex-wrap: wrap;
    @include rem(gap, 12px);
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 650;
  }

  .button {
    justify-self: start;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
      transform: none;
    }
  }
}

.field {
  display: grid;
  @include rem(gap, 9px);

  &__label-row {
    display: flex;
    justify-content: space-between;
    @include rem(gap, 16px);

    label {
      font-weight: 750;
    }

    span {
      color: var(--color-text-muted);
      @include rem(font-size, 14px);
    }
  }

  input {
    width: 100%;
    @include rem(min-height, 48px);
    @include rem(padding, 11px, 14px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    color: var(--color-text);
    background: var(--color-background);
    font: inherit;

    &[aria-invalid='true'] {
      border-color: var(--color-danger);
    }
  }

  &__help,
  &__error {
    margin: 0;
    @include rem(font-size, 14px);
  }

  &__help {
    color: var(--color-text-muted);
  }

  &__error {
    color: var(--color-danger);
    font-weight: 650;
  }
}

.items-editor {
  display: grid;
  @include rem(gap, 16px);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    @include rem(margin-bottom, 12px);
    font-weight: 800;
    @include rem(font-size, 20px);
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__list {
    display: grid;
    @include rem(gap, 14px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
}

.item-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  @include rem(gap, 12px);
  @include rem(padding, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);

  &__checkbox {
    @include rem(width, 22px);
    @include rem(height, 22px);
    margin: 0;
    accent-color: var(--color-accent-strong);
  }

  &__field {
    display: grid;
    @include rem(gap, 6px);

    label,
    span {
      @include rem(font-size, 13px);
    }

    label {
      font-weight: 700;
    }

    input {
      width: 100%;
      @include rem(min-height, 44px);
      @include rem(padding, 9px, 12px);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      color: var(--color-text);
      background: var(--color-background);
      font: inherit;
    }
  }

  &__count {
    color: var(--color-text-muted);
  }

  &__remove {
    min-height: #{to-rem(44px)};
    padding-inline: #{to-rem(12px)};
    border: 1px solid currentColor;
    border-radius: var(--radius-control);
    color: var(--color-danger);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
}

@media (max-width: #{to-rem(640px)}) {
  .item-row {
    grid-template-columns: auto minmax(0, 1fr);

    &__remove {
      grid-column: 2;
      justify-self: start;
    }
  }
}
</style>
