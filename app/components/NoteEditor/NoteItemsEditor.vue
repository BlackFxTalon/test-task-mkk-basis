<script setup lang="ts">
import { NOTE_ITEM_MAX_LENGTH, type TodoItem } from '../../domain/note';

defineProps<{
  items: TodoItem[]
}>();

const emit = defineEmits<{
  add: []
  remove: [index: number]
  updateText: [index: number, value: string]
  updateCompleted: [index: number, completed: boolean]
  commitText: []
  clearErrors: []
}>();

const addItem = (): void => {
  emit('add');
};

const removeItem = (index: number): void => {
  emit('remove', index);
};

const updateText = (index: number, event: Event): void => {
  emit('updateText', index, (event.target as HTMLInputElement).value);
};

const updateCompleted = (index: number, event: Event): void => {
  emit('updateCompleted', index, (event.target as HTMLInputElement).checked);
};

const commitText = (): void => {
  emit('commitText');
};
</script>

<template>
  <fieldset class="items-editor">
    <legend>Список задач</legend>

    <p v-if="items.length === 0" class="items-editor__empty">
      Пунктов пока нет. Можно сохранить заметку без них.
    </p>

    <ol v-else class="items-editor__list">
      <li v-for="(item, index) in items" :key="item.id" class="item-row">
        <label class="item-row__checkbox">
          <input
            type="checkbox"
            :checked="item.completed"
            @change="updateCompleted(index, $event)"
          >
        </label>
        <div class="item-row__field">
          <label :for="`note-item-${item.id}`">Пункт {{ index + 1 }}</label>
          <input
            :id="`note-item-${item.id}`"
            type="text"
            :value="item.text"
            :maxlength="NOTE_ITEM_MAX_LENGTH"
            @input="updateText(index, $event)"
            @blur="commitText"
          >
          <span :id="`note-item-count-${item.id}`" class="item-row__count">
            {{ item.text.length }} / {{ NOTE_ITEM_MAX_LENGTH }}
          </span>
        </div>
        <button
          class="item-row__remove"
          type="button"
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
</template>

<style scoped lang="scss">
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
    --hit-size: #{to-rem(44px)};
    --input-size: #{to-rem(22px)};

    display: grid;
    width: var(--hit-size);
    height: var(--hit-size);
    place-items: center;
    margin: calc((var(--hit-size) - var(--input-size)) / -2);
    cursor: pointer;

    input {
      width: var(--input-size);
      height: var(--input-size);
      margin: 0;
      accent-color: var(--color-accent-strong);
    }
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
