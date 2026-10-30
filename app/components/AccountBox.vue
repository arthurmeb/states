<script setup lang="ts">
import { ref } from 'vue'
import { useGame } from '~/composables/useGame'

// mode 'claim': protect the current nation with a username + password; 'login': sign in on this device
const props = defineProps<{ mode: 'claim' | 'login' }>()
const { ui, send } = useGame()
const open = ref(false)
const user = ref(ui.account ?? '')
const pass = ref('')
function submit() {
  if (props.mode === 'claim') send({ t: 'register', user: user.value, pass: pass.value })
  else send({ t: 'login', user: user.value, pass: pass.value })
  pass.value = ''
}
</script>

<template>
  <div class="acct">
    <template v-if="mode === 'claim'">
      <div v-if="ui.recovery" class="code">
        <b>🔑 Your recovery code</b>
        <div class="mono big">{{ ui.recovery }}</div>
        <p>Write it down. It signs you in if you forget your password, and it won't be shown again.</p>
        <button class="btn small" @click="ui.recovery = null">I've saved it</button>
      </div>
      <div v-else-if="ui.account && !open" class="row between">
        <span class="muted small">👤 Signed in as <b>{{ ui.account }}</b></span>
        <button class="btn small" @click="open = true">Change</button>
      </div>
      <button v-else-if="!open" class="btn small block" @click="open = true">👤 Save my nation with a username & password</button>
    </template>
    <button v-else-if="!open" class="link" @click="open = true">Already have a nation? Sign in →</button>

    <form v-if="open && !ui.recovery" class="form" @submit.prevent="submit">
      <p class="muted small">{{ mode === 'claim' ? 'Then sign in from any device to keep playing this nation.' : 'Sign in with your username and password, or your recovery code.' }}</p>
      <input v-model="user" class="field" placeholder="Username" autocomplete="username" maxlength="24">
      <input v-model="pass" class="field" type="password" :placeholder="mode === 'claim' ? 'Password (8+ characters)' : 'Password or recovery code'" :autocomplete="mode === 'claim' ? 'new-password' : 'current-password'">
      <div class="row">
        <button class="btn primary small" type="submit">{{ mode === 'claim' ? 'Save' : 'Sign in' }}</button>
        <button class="btn small" type="button" @click="open = false">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.acct { margin-top: 10px; }
.form { display: grid; gap: 6px; margin-top: 6px; }
.row { display: flex; gap: 6px; align-items: center; }
.small { font-size: 12px; margin: 0; }
.link { background: none; border: 0; color: var(--accent); font-size: 12.5px; font-weight: 600; padding: 0; }
.code { border: 1px solid rgba(255, 212, 59, .5); background: rgba(255, 212, 59, .08); border-radius: 8px; padding: 9px 11px; display: grid; gap: 5px; font-size: 12px; }
.code p { margin: 0; color: var(--muted); }
.big { font-size: 17px; letter-spacing: .08em; color: var(--accent); }
</style>
