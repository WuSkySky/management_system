<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '../auth'

const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="login-panel" aria-labelledby="login-title">
    <p class="eyebrow">PRODUCTION MANAGEMENT</p>
    <h1 id="login-title">登录</h1>
    <p class="muted">使用管理员提供的帐号名和密码</p>
    <form @submit.prevent="submit">
      <label for="username">帐号名</label>
      <input id="username" v-model="username" type="text" autocomplete="username" required autofocus />
      <label for="password">密码</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button" type="submit" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
    </form>
  </section>
</template>
