<script setup lang="ts">
import { NOTE_TITLE_MAX_LENGTH } from '../../domain/note'

const title = defineModel<string>({ required: true })

defineProps<{
  error: string | null
}>()

const emit = defineEmits<{
  commit: []
  clearError: []
}>()

const titleInput = useTemplateRef<HTMLInputElement>('titleInput')

defineExpose({
  focus: (): void => {
    titleInput.value?.focus()
  },
})
</script>

<template>
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
      :class="{ 'field__input--invalid': Boolean(error) }"
      @input="emit('clearError')"
      @blur="emit('commit')"
    >
    <p id="note-title-help" class="field__help">
      Обязательное поле, до {{ NOTE_TITLE_MAX_LENGTH }} символов.
    </p>
    <p v-if="error" id="note-title-error" class="field__error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped lang="scss">
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

    &.field__input--invalid {
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
