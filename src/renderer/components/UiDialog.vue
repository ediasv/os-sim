<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import UiIcon from './UiIcon.vue';

// Modal shell over the native <dialog> (Figma "Diálogo — ..."). The owner
// controls `open`; Esc and the close button only ask to close, so a form can
// keep its draft or confirm before closing. Knows nothing about what it holds.
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const dialog = ref<HTMLDialogElement | null>(null);
let opener: HTMLElement | null = null;

// jsdom has no showModal; the attribute fallback keeps component tests honest
// about what is open, while Chromium (Electron) uses the real modal.
function sync(open: boolean): void {
    const el = dialog.value;
    if (el === null) return;
    if (open && !el.open) {
        opener = document.activeElement as HTMLElement | null;
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
    } else if (!open && el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
        opener?.focus();
    }
}

onMounted(() => sync(props.open));
watch(() => props.open, sync);
// Owners may remove the dialog instead of turning `open` off.
onBeforeUnmount(() => opener?.focus());
</script>

<template>
    <dialog
        ref="dialog"
        class="ui-dialog"
        :aria-labelledby="titleId"
        @cancel.prevent="emit('close')"
    >
        <header class="ui-dialog__header">
            <h2 :id="titleId" class="ui-dialog__title">
                <slot name="title-icon" />
                {{ title }}
            </h2>
            <button
                type="button"
                class="ui-dialog__close"
                aria-label="Fechar"
                @click="emit('close')"
            >
                <UiIcon name="close" />
            </button>
        </header>
        <div class="ui-dialog__body"><slot /></div>
        <footer v-if="$slots.actions" class="ui-dialog__actions">
            <slot name="actions" />
        </footer>
    </dialog>
</template>

<style scoped>
.ui-dialog {
    width: min(560px, calc(100vw - 2 * var(--spacing-lg)));
    max-height: calc(100vh - 2 * var(--spacing-lg));
    padding: var(--spacing-lg);
    overflow: auto;
    color: var(--color-text-primary);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xl);
}

.ui-dialog::backdrop {
    background: rgb(0 0 0 / 60%);
}

.ui-dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
}

.ui-dialog__title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin: 0;
    font: var(--font-heading-md);
}

.ui-dialog__close {
    display: inline-flex;
    padding: var(--spacing-2xs);
    color: var(--color-text-secondary);
    background: transparent;
    border: 0;
    border-radius: var(--radius-md);
    cursor: pointer;
}

.ui-dialog__body {
    display: grid;
    gap: var(--spacing-md);
}

.ui-dialog__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
}
</style>
