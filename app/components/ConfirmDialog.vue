<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  customActions?: boolean
}>(), {
  cancelLabel: 'Отмена',
  destructive: false,
  customActions: false,
});

const emit = defineEmits<{
  cancel: []
  confirm: []
}>();

const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton');
let triggerElement: HTMLElement | null = null;
let openedModally = false;
const fallbackInertElements = new Set<HTMLElement>();

const CLOSE_ANIMATION_FALLBACK_MS = 240;
let closeAnimationToken = 0;
let closeAnimationTimer: number | undefined;
const isClosing = ref(false);

const initialFocusTarget = (): HTMLElement | null =>
  cancelButton.value
  ?? dialog.value?.querySelector<HTMLElement>('.confirm-dialog__actions button')
  ?? null;

const containFallbackFocus = (event: FocusEvent): void => {
  const element = dialog.value;
  if (
    !openedModally
    && element?.open
    && event.target instanceof Node
    && !element.contains(event.target)
  ) {
    initialFocusTarget()?.focus();
  }
};

const enableFallbackContainment = (element: HTMLDialogElement): void => {
  for (const sibling of Array.from(document.body.children)) {
    if (sibling instanceof HTMLElement && sibling !== element && !sibling.inert) {
      sibling.inert = true;
      fallbackInertElements.add(sibling);
    }
  }
  document.addEventListener('focusin', containFallbackFocus);
};

const disableFallbackContainment = (): void => {
  document.removeEventListener('focusin', containFallbackFocus);
  for (const element of fallbackInertElements) {
    element.inert = false;
  }
  fallbackInertElements.clear();
};

const restoreFocus = (): void => {
  if (triggerElement?.isConnected) {
    triggerElement.focus();
  }
  triggerElement = null;
};

const closeInstant = (): void => {
  const element = dialog.value;
  if (!element) {
    return;
  }

  if (element.open && openedModally) {
    element.close();
  }
  else {
    element.removeAttribute('open');
  }

  disableFallbackContainment();
  openedModally = false;
  restoreFocus();
};

const closeDialog = (): void => {
  const element = dialog.value;
  if (!element || !element.open) {
    closeInstant();
    return;
  }

  const token = ++closeAnimationToken;
  isClosing.value = true;
  const finish = (): void => {
    if (token !== closeAnimationToken) {
      return;
    }

    window.clearTimeout(closeAnimationTimer);
    isClosing.value = false;
    closeInstant();
  };

  closeAnimationTimer = window.setTimeout(finish, CLOSE_ANIMATION_FALLBACK_MS);
  element.addEventListener('animationend', finish, { once: true });
};

const openDialog = async (): Promise<void> => {
  const element = dialog.value;
  if (!element || element.open) {
    return;
  }

  closeAnimationToken += 1;
  isClosing.value = false;
  triggerElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  try {
    element.showModal();
    openedModally = true;
  }
  catch {
    element.setAttribute('open', '');
    openedModally = false;
    enableFallbackContainment(element);
  }

  await nextTick();
  initialFocusTarget()?.focus();
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void openDialog();
    }
    else {
      closeDialog();
    }
  },
  { immediate: true, flush: 'post' },
);

const requestCancel = (): void => {
  emit('cancel');
};

const requestConfirm = (): void => {
  emit('confirm');
};

const handleKeydown = (event: KeyboardEvent): void => {
  const element = dialog.value;
  if (!element) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    requestCancel();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusable = Array.from(
    element.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};

onBeforeUnmount(closeInstant);
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="confirm-dialog"
      :class="{ 'confirm-dialog--closing': isClosing }"
      @cancel.prevent="requestCancel"
      @keydown="handleKeydown"
    >
      <div class="confirm-dialog__content">
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="confirm-dialog__actions">
          <template v-if="customActions">
            <slot name="actions" />
          </template>
          <template v-else>
            <button ref="cancelButton" class="button button--secondary" type="button" autofocus @click="requestCancel">
              {{ cancelLabel }}
            </button>
            <button
              class="button"
              :class="destructive ? 'button--danger' : 'button--primary'"
              type="button"
              @click="requestConfirm"
            >
              {{ confirmLabel }}
            </button>
          </template>
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

  &[open] {
    animation: confirm-dialog-enter 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  &:modal[open] {
    animation-name: confirm-dialog-enter-modal;
  }

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
    transition: opacity 160ms ease;
  }

  &.confirm-dialog--closing {
    animation: confirm-dialog-exit 160ms ease forwards;
  }

  &:modal.confirm-dialog--closing {
    animation-name: confirm-dialog-exit-modal;
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

@keyframes confirm-dialog-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes confirm-dialog-enter-modal {
  from {
    opacity: 0;
    transform: translateY(#{to-rem(12px)}) scale(0.98);
  }

  to {
    opacity: 1;
  }
}

@keyframes confirm-dialog-exit {
  to {
    opacity: 0;
  }
}

@keyframes confirm-dialog-exit-modal {
  to {
    opacity: 0;
    transform: translateY(#{to-rem(8px)}) scale(0.98);
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
