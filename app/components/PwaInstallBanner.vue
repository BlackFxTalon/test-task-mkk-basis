<script setup lang="ts">
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

const installPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);

const handleBeforeInstallPrompt = (event: Event): void => {
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  event.preventDefault();
  installPrompt.value = event as BeforeInstallPromptEvent;
};

const handleAppInstalled = (): void => {
  installPrompt.value = null;
};

const requestInstall = async (): Promise<void> => {
  const prompt = installPrompt.value;
  if (prompt === null) return;

  installPrompt.value = null;
  await prompt.prompt();
  await prompt.userChoice;
};

const dismissInstall = (): void => {
  installPrompt.value = null;
};

onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
});
</script>

<template>
  <Transition name="install-banner">
    <aside v-if="installPrompt" class="install-banner">
      <div class="install-banner__copy">
        <strong class="install-banner__title">Установите «Заметки»</strong>
        <span class="install-banner__description">Работайте в отдельном окне и без сети.</span>
      </div>

      <div class="install-banner__actions">
        <button class="button button--primary" type="button" @click="requestInstall">
          Установить
        </button>
        <button class="button button--secondary" type="button" @click="dismissInstall">
          Не сейчас
        </button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped lang="scss">
.install-banner {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: max(#{to-rem(16px)}, env(safe-area-inset-bottom));
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  @include rem(gap, 24px);
  width: min(calc(100% - #{to-rem(32px)}), #{to-rem(720px)});
  margin-inline: auto;
  @include rem(padding, 18px, 20px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(16px);

  &__copy {
    display: grid;
    @include rem(gap, 4px);
  }

  &__title {
    @include rem(font-size, 18px);
  }

  &__description {
    color: var(--color-text-muted);
    @include rem(font-size, 14px);
  }

  &__actions {
    display: flex;
    flex-shrink: 0;
    @include rem(gap, 8px);
  }
}

.install-banner-enter-active,
.install-banner-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.install-banner-enter-from,
.install-banner-leave-to {
  opacity: 0;
  transform: translateY(#{to-rem(24px)});
}

@media (max-width: #{to-rem(576px)}) {
  .install-banner {
    align-items: stretch;
    flex-direction: column;
    @include rem(gap, 16px);

    &__actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
}
</style>
