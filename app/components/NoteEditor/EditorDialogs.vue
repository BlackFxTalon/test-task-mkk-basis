<script setup lang="ts">
export type EditorDialogKind =
  | 'cancel'
  | 'delete'
  | 'navigation'
  | 'recovery'
  | 'conflict'
  | 'deleted'
  | 'deleted-recovery'

defineProps<{
  kind: EditorDialogKind
  description: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
  cancelRecovery: []
  confirmRecovery: []
  restoreLatest: []
  saveAsNew: []
  overwriteExternal: []
  exitWithoutSaving: []
}>()

const DIALOG_TEXT: Record<EditorDialogKind, {
  title: string
  confirmLabel: string
  cancelLabel: string
}> = {
  cancel: {
    title: 'Выйти из редактора?',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Отмена',
  },
  delete: {
    title: 'Удалить заметку?',
    confirmLabel: 'Удалить заметку',
    cancelLabel: 'Отмена',
  },
  navigation: {
    title: 'Выйти из редактора?',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Отмена',
  },
  recovery: {
    title: 'Восстановить черновик?',
    confirmLabel: 'Восстановить черновик',
    cancelLabel: 'Удалить черновик',
  },
  conflict: {
    title: 'Заметка изменена в другой вкладке',
    confirmLabel: 'Продолжить редактирование',
    cancelLabel: 'Продолжить редактирование',
  },
  deleted: {
    title: 'Заметка удалена в другой вкладке',
    confirmLabel: 'Выйти без сохранения',
    cancelLabel: 'Продолжить редактирование',
  },
  'deleted-recovery': {
    title: 'Заметка удалена, но есть несохранённая работа',
    confirmLabel: 'Восстановить как новую заметку',
    cancelLabel: 'Удалить черновик',
  },
}
</script>

<template>
  <ConfirmDialog
    :open="true"
    :title="DIALOG_TEXT[kind].title"
    :description="description"
    :confirm-label="DIALOG_TEXT[kind].confirmLabel"
    :cancel-label="DIALOG_TEXT[kind].cancelLabel"
    :destructive="kind === 'delete'"
    :custom-actions="kind === 'conflict' || kind === 'deleted'"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  >
    <template v-if="kind === 'conflict'" #actions>
      <button class="button button--secondary" type="button" @click="emit('cancel')">
        Продолжить редактирование
      </button>
      <button class="button button--secondary" type="button" @click="emit('restoreLatest')">
        Загрузить актуальную версию
      </button>
      <button class="button button--secondary" type="button" @click="emit('saveAsNew')">
        Сохранить как новую заметку
      </button>
      <button class="button button--danger" type="button" @click="emit('overwriteExternal')">
        Перезаписать изменения другой вкладки
      </button>
    </template>
    <template v-else-if="kind === 'deleted'" #actions>
      <button class="button button--secondary" type="button" @click="emit('saveAsNew')">
        Сохранить как новую заметку
      </button>
      <button class="button button--danger" type="button" @click="emit('exitWithoutSaving')">
        Выйти без сохранения
      </button>
    </template>
  </ConfirmDialog>
</template>
