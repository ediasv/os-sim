<script setup lang="ts">
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';

// Confirmation for an action that cannot be undone from the history (Figma
// "Diálogo — Remover tarefa"): says what will happen and waits. Closing by any
// other way than the confirm button is a cancellation.
withDefaults(
    defineProps<{
        open: boolean;
        title: string;
        message: string;
        confirmLabel: string;
        cancelLabel?: string;
    }>(),
    { cancelLabel: 'Cancelar' },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
    <UiDialog :open="open" :title="title" @close="emit('cancel')">
        <p class="ui-confirm__message">{{ message }}</p>
        <template #actions>
            <UiButton variant="secondary" @click="emit('cancel')">
                {{ cancelLabel }}
            </UiButton>
            <UiButton variant="danger" @click="emit('confirm')">
                {{ confirmLabel }}
            </UiButton>
        </template>
    </UiDialog>
</template>

<style scoped>
.ui-confirm__message {
    margin: 0;
    color: var(--color-text-primary);
    font: var(--font-body-md);
}
</style>
