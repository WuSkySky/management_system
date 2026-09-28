<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, logout } from './auth'

const router = useRouter()
const signOutError = ref('')
async function signOut() {
  signOutError.value = ''
  try {
    await logout()
    await router.replace('/login')
  } catch {
    signOutError.value = '退出失败，请重试'
  }
}
</script>

<template>
  <div class="app-shell">
    <header v-if="auth.user" class="app-header">
      <nav aria-label="主导航">
        <RouterLink to="/machines">机器</RouterLink>
        <RouterLink to="/parts">零件</RouterLink>
        <RouterLink v-if="auth.user.role === 'admin'" to="/part-templates">零件模板</RouterLink>
        <RouterLink v-if="auth.user.role === 'admin'" to="/admin">人员</RouterLink>
      </nav>
      <div class="account">
        <span v-if="signOutError" class="header-error" role="alert">{{ signOutError }}</span>
        <span>{{ auth.user.displayName }}</span>
        <button type="button" class="text-button" @click="signOut">退出</button>
      </div>
    </header>
    <main :class="auth.user ? 'main-content' : 'login-content'">
      <RouterView />
    </main>
  </div>
</template>
