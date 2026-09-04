<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
}>(), {
  destructive: false,
})

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton')
let triggerElement: HTMLElement | null = null
let openedModally = false
const fallbackInertElements = new Set<HTMLElement>()

const containFallbackFocus = (event: FocusEvent): void => {
  const element = dialog.value
  if (
    !openedModally
    && element?.open
    && event.target instanceof Node
    && !element.contains(event.target)
  ) {
    cancelButton.value?.focus()
  }
}

const enableFallbackContainment = (element: HTMLDialogElement): void => {
  for (const sibling of Array.from(document.body.children)) {
    if (sibling instanceof HTMLElement && sibling !== element && !sibling.inert) {
      sibling.inert = true
      fallbackInertElements.add(sibling)
    }
  }
  document.addEventListener('focusin', containFallbackFocus)
}

const disableFallbackContainment = (): void => {
  document.removeEventListener('focusin', containFallbackFocus)
  for (const element of fallbackInertElements) {
    element.inert = false
  }
  fallbackInertElements.clear()
}

const restoreFocus = (): void => {
  if (triggerElement?.isConnected) {
    triggerElement.focus()
  }
  triggerElement = null
}

const closeDialog = (): void => {
  const element = dialog.value
  if (!element) {
    return
  }

  if (element.open && openedModally) {
    element.close()
  }
  else {
    element.removeAttribute('open')
  }

  disableFallbackContainment()
  openedModally = false
  restoreFocus()
}

const openDialog = async (): Promise<void> => {
  const element = dialog.value
  if (!element || element.open) {
    return
  }

  triggerElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  try {
    element.showModal()
    openedModally = true
  }
  catch {
    element.setAttribute('open', '')
    openedModally = false
    enableFallbackContainment(element)
  }

  await nextTick()
  cancelButton.value?.focus()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void openDialog()
    }
    else {
      closeDialog()
    }
  },
  { immediate: true, flush: 'post' },
)

const requestCancel = (): void => {
  emit('cancel')
}

const handleKeydown = (event: KeyboardEvent): void => {
  const element = dialog.value
  if (!element) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    requestCancel()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusable = Array.from(
    element.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
  )
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onBeforeUnmount(closeDialog)
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="confirm-dialog"
      @cancel.prevent="requestCancel"
      @keydown="handleKeydown"
    >
      <div class="confirm-dialog__content">
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="confirm-dialog__actions">
          <button ref="cancelButton" class="button button--secondary" type="button" autofocus @click="requestCancel">
            Отмена
          </button>
          <button
            class="button"
            :class="destructive ? 'button--danger' : 'button--primary'"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped lang="scss">
.confirm-dialog {
  width: min(calc(100% - #{to-rem(32px)}), #{to-rem(520px)});
  max-width: none;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: 0 #{to-rem(24px)} #{to-rem(80px)} rgb(0 0 0 / 35%);

  &[open]:not(:modal) {
    position: fixed;
    inset-block-start: 50%;
    transform: translateY(-50%);
    box-shadow:
      0 0 0 100vmax rgb(2 18 24 / 64%),
      0 #{to-rem(24px)} #{to-rem(80px)} rgb(0 0 0 / 35%);
  }

  &::backdrop {
    background: rgb(2 18 24 / 64%);
    backdrop-filter: blur(3px);
  }

  &__content {
    display: grid;
    @include rem(gap, 16px);
    @include rem(padding, 28px);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    @include rem(font-size, 24px);
  }

  p {
    color: var(--color-text-muted);
    line-height: 1.55;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    @include rem(gap, 12px);
    @include rem(margin-top, 8px);
  }
}

@media (max-width: #{to-rem(480px)}) {
  .confirm-dialog__actions {
    display: grid;

    .button {
      width: 100%;
    }
  }
}
</style>
