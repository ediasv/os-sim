<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import UiIcon from './UiIcon.vue';

// Modal shell (Figma "Diálogo"): title, body and a footer slot for actions.
// It only asks to close; what closing means (discard a draft, cancel a
// confirmation) is the owner's. A click outside does not close it, so a
// misplaced click never throws away what the user typed. A plain element
// with dialog semantics instead of <dialog>.showModal(), which the test
// environment (jsdom) does not implement.
defineProps<{ title: string }>();

const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const root = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;

const FOCUSABLE =
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-dialog-close])';

onMounted(async () => {
    opener =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    await nextTick();
    // The first field, else the first action; the close button is the last resort.
    const target =
        root.value?.querySelector<HTMLElement>(FOCUSABLE) ??
        root.value?.querySelector<HTMLElement>('[data-dialog-close]');
    target?.focus();
});

// Focus returns to the control that opened the dialog, if it still exists.
onBeforeUnmount(() => {
    if (opener?.isConnected) opener.focus();
});

/** Keeps Tab inside the dialog while it is modal. */
function trapTab(event: KeyboardEvent): void {
    const items = [
        ...(root.value?.querySelectorAll<HTMLElement>(
            `${FOCUSABLE}, [data-dialog-close]`,
        ) ?? []),
    ];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.stopPropagation();
        emit('close');
    } else if (event.key === 'Tab') {
        trapTab(event);
    }
}
</script>

<template>
    <div class="ui-dialog__backdrop">
        <div
            ref="root"
            class="ui-dialog"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            @keydown="onKeydown"
        >
            <header class="ui-dialog__header">
                <h2 :id="titleId" class="ui-dialog__title">
                    <slot name="title">{{ title }}</slot>
                </h2>
                <button
                    type="button"
                    class="ui-dialog__close"
                    data-dialog-close
                    aria-label="Fechar"
                    @click="emit('close')"
                >
                    <UiIcon name="close" />
                </button>
            </header>
            <div class="ui-dialog__body"><slot /></div>
            <footer v-if="$slots.footer" class="ui-dialog__footer">
                <slot name="footer" />
            </footer>
        </div>
    </div>
</template>

<style scoped>
/* Figma "Diálogo": a dimmed layer over the whole workspace. */
.ui-dialog__backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
    background: rgb(0 0 0 / 60%);
}

.ui-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    width: min(440px, 100%);
    max-height: 100%;
    padding: var(--spacing-lg);
    overflow: auto;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xl);
}

.ui-dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
}

.ui-dialog__title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin: 0;
    font: var(--font-heading-md);
    color: var(--color-text-primary);
}

.ui-dialog__close {
    display: inline-flex;
    padding: var(--spacing-2xs);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
}

.ui-dialog__body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    font: var(--font-body-md);
    color: var(--color-text-secondary);
}

.ui-dialog__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--spacing-sm);
}
</style>
