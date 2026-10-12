<script setup lang="ts">
import { useGame } from '~/composables/useGame'
const { ui } = useGame()
</script>

<template>
  <div class="toasts">
    <TransitionGroup name="t">
      <div v-for="t in ui.toasts" :key="t.id" class="toast glass" :class="t.kind">{{ t.msg }}</div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts { position: fixed; top: 66px; left: 50%; transform: translateX(-50%); z-index: 60; display: grid; gap: 6px; justify-items: center; pointer-events: none; }
.toast { padding: 8px 14px; font-size: 12.5px; font-weight: 600; }
.toast.err { border-color: rgba(255, 80, 80, 0.5); color: #ffc9c9; }
.t-enter-active, .t-leave-active { transition: all 0.25s ease; }
.t-enter-from, .t-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
