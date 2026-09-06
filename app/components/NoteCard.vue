<script setup lang="ts">
import type { Note } from '../domain/note';

const props = defineProps<{
  note: Note
}>();

const emit = defineEmits<{
  delete: [note: Note]
}>();

const requestDelete = (): void => {
  emit('delete', props.note);
};

const previewItems = computed(() => props.note.items.slice(0, 3));
const hiddenCount = computed(() => Math.max(0, props.note.items.length - previewItems.value.length));
const completedCount = computed(() => props.note.items.filter(item => item.completed).length);
const progressLabel = computed(() => {
  if (props.note.items.length === 0) {
    return 'Нет задач';
  }

  return `${completedCount.value} из ${props.note.items.length} выполнено`;
});
</script>

<template>
  <article class="note-card">
    <header class="note-card__header">
      <h2>
        <NuxtLink :to="`/notes/${note.id}`">{{ note.title }}</NuxtLink>
      </h2>
      <p>{{ progressLabel }}</p>
    </header>

    <p v-if="note.items.length === 0" class="note-card__empty">
      В этой заметке пока нет задач.
    </p>

    <ul v-else class="note-card__preview">
      <li v-for="item in previewItems" :key="item.id" :class="{ 'note-card__item--completed': item.completed }">
        <input
          type="checkbox"
          :checked="item.completed"
          disabled
        >
        <span>{{ item.text }}</span>
      </li>
    </ul>

    <p v-if="hiddenCount > 0" class="note-card__more">Ещё {{ hiddenCount }}</p>

    <div class="note-card__actions">
      <NuxtLink class="note-card__edit" :to="`/notes/${note.id}`">
        Редактировать
      </NuxtLink>
      <button class="note-card__delete" type="button" @click="requestDelete">
        Удалить
      </button>
    </div>
  </article>
</template>

<style scoped lang="scss">
.note-card {
  display: grid;
  @include rem(gap, 20px);
  min-width: 0;
  padding: clamp(#{to-rem(20px)}, 3vw, #{to-rem(28px)});
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);

  &__header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    @include rem(gap, 16px);

    h2,
    p {
      margin: 0;
    }

    h2 {
      min-width: 0;
      overflow-wrap: anywhere;
      @include rem(font-size, 20px);
      line-height: 1.3;

      a {
        color: inherit;
        text-decoration-color: var(--color-border);
        text-underline-offset: 0.18em;

        &:hover {
          text-decoration-color: var(--color-accent-strong);
        }
      }
    }

    p {
      flex: 0 0 auto;
      color: var(--color-text-muted);
      @include rem(font-size, 14px);
      font-weight: 650;
    }
  }

  &__preview {
    display: grid;
    @include rem(gap, 12px);
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      min-width: 0;
      align-items: center;
      @include rem(gap, 11.2px);
      line-height: 1.45;
    }

    input {
      @include rem(width, 18.4px);
      @include rem(height, 18.4px);
      flex: 0 0 auto;
      margin: 0;
      accent-color: var(--color-accent-strong);
    }

    span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  &__item--completed span {
    color: var(--color-text-muted);
    text-decoration: line-through;
    text-decoration-thickness: 0.1em;
  }

  &__empty,
  &__more {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__more {
    @include rem(font-size, 14px);
    font-weight: 700;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    @include rem(gap, 12px);
  }

  &__edit,
  &__delete {
    display: inline-flex;
    min-height: #{to-rem(44px)};
    align-items: center;
    justify-content: center;
    @include rem(padding-inline, 8px);
    font-weight: 750;
  }

  &__edit {
    color: var(--color-accent-strong);
    text-underline-offset: 0.18em;
  }

  &__delete {
    border: 0;
    color: var(--color-danger);
    background: transparent;
    cursor: pointer;
    font: inherit;
  }
}

@media (max-width: #{to-rem(544px)}) {
  .note-card__header {
    display: grid;
  }
}
</style>
