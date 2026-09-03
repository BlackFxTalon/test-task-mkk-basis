<script setup lang="ts">
import { NOTE_TITLE_MAX_LENGTH } from '../../domain/note'
import { useNotesStore } from '../../stores/notes'

useHead({ title: 'Новая заметка' })

const notesStore = useNotesStore()
const { announce } = useOperationStatus()
const titleInput = useTemplateRef<HTMLInputElement>('titleInput')
const title = ref('')
const titleError = ref<string | null>(null)
const isSaving = ref(false)

const titleDescription = computed(() => titleError.value ? 'note-title-help note-title-error' : 'note-title-help')

onMounted(() => {
  if (!notesStore.isInitialized) {
    notesStore.initialize()
  }
})

const saveNote = async (): Promise<void> => {
  isSaving.value = true
  titleError.value = null

  const result = notesStore.createNote({ title: title.value, items: [] })

  if (!result.ok) {
    isSaving.value = false

    if (result.reason === 'title-required') {
      titleError.value = 'Введите название заметки.'
    }
    else if (result.reason === 'title-too-long') {
      titleError.value = `Название не должно быть длиннее ${NOTE_TITLE_MAX_LENGTH} символов.`
    }

    if (titleError.value) {
      await nextTick()
      titleInput.value?.focus()
    }
    return
  }

  announce('Заметка создана.')
  await navigateTo('/')
}

const clearTitleError = (): void => {
  titleError.value = null
}
</script>

<template>
  <section class="create-note-page">
    <header>
      <p class="create-note-page__eyebrow">Новая заметка</p>
      <h1 class="page-title">Что важно запомнить?</h1>
      <p>Сейчас достаточно названия — задачи можно будет добавить при редактировании.</p>
    </header>

    <form class="note-form" novalidate @submit.prevent="saveNote">
      <div class="field">
        <div class="field__label-row">
          <label for="note-title">Название</label>
          <span aria-live="polite">{{ title.length }} / {{ NOTE_TITLE_MAX_LENGTH }}</span>
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
          @input="clearTitleError"
        >
        <p id="note-title-help" class="field__help">
          Обязательное поле, до {{ NOTE_TITLE_MAX_LENGTH }} символов.
        </p>
        <p v-if="titleError" id="note-title-error" class="field__error" role="alert">
          {{ titleError }}
        </p>
      </div>

      <p v-if="notesStore.error" class="note-form__error" role="alert">
        {{ notesStore.error }}
      </p>

      <button class="button button--primary" type="submit" :disabled="isSaving">
        {{ isSaving ? 'Сохраняем…' : 'Сохранить заметку' }}
      </button>
    </form>
  </section>
</template>

<style scoped lang="scss">
.create-note-page {
  display: grid;
  @include rem(gap, 32px);
  @include rem(max-width, 704px);
  padding-block: clamp(#{to-rem(40px)}, 8vw, #{to-rem(80px)});

  &__eyebrow {
    @include rem(margin, 0px, 0px, 9.6px);
    color: var(--color-accent-strong);
    font-weight: 800;
  }

  h1 {
    margin: 0;
    font-size: clamp(#{to-rem(36px)}, 7vw, #{to-rem(64px)});
    line-height: 1;
    letter-spacing: -0.05em;
  }

  header > p:last-child {
    @include rem(max-width, 592px);
    @include rem(margin, 16px, 0px, 0px);
    color: var(--color-text-muted);
    line-height: 1.6;
  }
}

.note-form {
  display: grid;
  justify-items: start;
  @include rem(gap, 24px);
  padding: clamp(#{to-rem(20px)}, 4vw, #{to-rem(32px)});
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 650;
  }

  .button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
}

.field {
  display: grid;
  width: 100%;
  @include rem(gap, 8.8px);

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
    @include rem(padding, 11.2px, 13.6px);
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
</style>
