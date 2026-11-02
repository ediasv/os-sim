<script setup lang="ts">
import UiButton from '../../components/UiButton.vue';
import UiDialog from '../../components/UiDialog.vue';

// Yes/no confirmation (Figma "Diálogo — Remover tarefa"). Used before removing
// a task and before a file replaces the configuration (FE-04); the owner says
// what each means. Cancel is the safe default and also what Escape does.
defineProps<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
    <UiDialog :title="title" @close="emit('cancel')">
        <p class="confirm-dialog__message">{{ message }}</p>
        <template #footer>
            <UiButton variant="secondary" @click="emit('cancel')">
                Cancelar
            </UiButton>
            <UiButton
                :variant="destructive ? 'danger' : 'primary'"
                @click="emit('confirm')"
            >
                {{ confirmLabel }}
            </UiButton>
        </template>
    </UiDialog>
</template>

<style scoped>
.confirm-dialog__message {
    margin: 0;
}
</style>
