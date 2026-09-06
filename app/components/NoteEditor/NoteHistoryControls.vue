<script setup lang="ts">
defineProps<{
  canUndo: boolean
  canRedo: boolean
  message: string | null
}>();

const emit = defineEmits<{
  undo: []
  redo: []
}>();

const undo = (): void => {
  emit('undo');
};

const redo = (): void => {
  emit('redo');
};
</script>

<template>
  <div class="history-controls">
    <button
      class="button button--secondary"
      type="button"
      :disabled="!canUndo"
      @click="undo"
    >
      Отменить изменение
    </button>
    <button
      class="button button--secondary"
      type="button"
      :disabled="!canRedo"
      @click="redo"
    >
      Повторить изменение
    </button>
    <p v-if="message" class="history-controls__message">
      {{ message }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.history-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  @include rem(gap, 12px);

  &__message {
    flex-basis: 100%;
    margin: 0;
    color: var(--color-text-muted);
    font-weight: 650;
  }
}
</style>
