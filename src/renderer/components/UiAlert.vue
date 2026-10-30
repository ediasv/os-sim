<script setup lang="ts">
import { computed } from 'vue';
import type { IconName } from './icons';
import UiIcon from './UiIcon.vue';

export type AlertTone = 'danger' | 'warning' | 'success' | 'info';

// Presents text it receives; who writes it (banner, form, diagnostics) and
// what it means stays with the caller. Never moves focus or hides itself:
// the caller removes it on `dismiss`. A message about a condition that still
// holds, such as a correctable error (DEC-24), passes `dismissible: false`
// and is removed by the caller when the state changes.
const props = withDefaults(
    defineProps<{
        tone: AlertTone;
        title?: string;
        message: string;
        dismissible?: boolean;
    }>(),
    { dismissible: true },
);

const emit = defineEmits<{ dismiss: [] }>();

const icons: Record<AlertTone, IconName> = {
    danger: 'alert',
    warning: 'warning',
    success: 'check',
    info: 'info',
};

// Figma usage rule: problems interrupt, confirmations are announced politely.
const role = computed(() =>
    props.tone === 'danger' || props.tone === 'warning' ? 'alert' : 'status',
);

const dismissLabel = computed(() =>
    props.tone === 'danger' ? 'Fechar mensagem de erro' : 'Fechar mensagem',
);
</script>

<template>
    <div class="ui-alert" :class="`ui-alert--${tone}`" :role="role">
        <span class="ui-alert__leading">
            <UiIcon :name="icons[tone]" />
        </span>
        <div class="ui-alert__content">
            <p v-if="title" class="ui-alert__title">{{ title }}</p>
            <p class="ui-alert__message">{{ message }}</p>
        </div>
        <button
            v-if="dismissible"
            type="button"
            class="ui-alert__dismiss"
            :aria-label="dismissLabel"
            @click="emit('dismiss')"
        >
            <UiIcon name="close" />
        </button>
    </div>
</template>

<style scoped>
/* Figma "Error message" and "Notice": one layout, tone sets the accent. */
.ui-alert {
    display: flex;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-xs) var(--spacing-xs)
        var(--spacing-md);
    border: 1px solid var(--ui-alert-accent);
    border-radius: var(--radius-lg);
    background: var(--ui-alert-background);
}

.ui-alert--danger {
    --ui-alert-accent: var(--color-status-danger);
    --ui-alert-background: var(--color-status-danger-subtle);
}

.ui-alert--warning {
    --ui-alert-accent: var(--color-status-warning);
    --ui-alert-background: var(--color-status-warning-subtle);
}

.ui-alert--success {
    --ui-alert-accent: var(--color-status-success);
    --ui-alert-background: var(--color-status-success-subtle);
}

.ui-alert--info {
    --ui-alert-accent: var(--color-accent-default);
    --ui-alert-background: var(--color-accent-subtle);
}

.ui-alert__leading {
    flex: none;
    padding-top: var(--spacing-2xs);
    color: var(--ui-alert-accent);
}

.ui-alert__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--spacing-2xs);
    min-width: 0;
    padding-block: var(--spacing-2xs);
}

.ui-alert__title {
    margin: 0;
    font: var(--font-heading-sm);
    color: var(--color-text-primary);
}

/* Received text is shown as is: kept spacing, long tokens still wrap. */
.ui-alert__message {
    margin: 0;
    font: var(--font-body-md);
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

/* Figma "Dismiss button". Focus uses the global ring from base.css. */
.ui-alert__dismiss {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: var(--spacing-2xs);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
}

.ui-alert__dismiss:hover {
    background: var(--color-border-default);
    color: var(--color-text-primary);
}
</style>
