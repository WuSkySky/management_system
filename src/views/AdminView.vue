<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, createUser, deleteUser, listUsers, roleLabels, updateUser, userAssignmentCounts, type ManagedUser, type Role } from '../auth'

const router = useRouter()
const users = ref<ManagedUser[]>([])
const loading = ref(true)
const showCreate = ref(false)
const username = ref('')
const displayName = ref('')
const password = ref('')
const role = ref<Role>('procurement')
const editingId = ref('')
const confirmingDeleteId = ref('')
const editDisplayName = ref('')
const editPassword = ref('')
const editRole = ref<Role>('procurement')
const error = ref('')
const notice = ref('')
const busy = ref(false)

function message(reason: unknown) { error.value = reason instanceof Error ? reason.message : '操作失败' }
async function refresh() { users.value = await listUsers() }
function cancelCreate() {
  showCreate.value = false
  username.value = ''
  displayName.value = ''
  password.value = ''
  role.value = 'procurement'
  error.value = ''
}
async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await createUser(username.value, displayName.value, password.value, role.value)
    cancelCreate()
    await refresh()
    notice.value = '人员已添加'
  } catch (reason) { message(reason) }
  finally { busy.value = false }
}
function editUser(user: ManagedUser) {
  error.value = ''
  notice.value = ''
  showCreate.value = false
  editingId.value = user.id
  confirmingDeleteId.value = ''
  editDisplayName.value = user.displayName
  editPassword.value = user.password
  editRole.value = user.role
}
async function saveUser() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const updated = await updateUser(editingId.value, editDisplayName.value, editPassword.value, editRole.value)
    editingId.value = ''
    if (auth.user?.id === updated.id) {
      auth.user = updated
      if (updated.role !== 'admin') {
        await router.replace({ name: 'machines' })
        return
      }
    }
    await refresh()
    notice.value = '人员已更新'
  } catch (reason) { message(reason) }
  finally { busy.value = false }
}
async function requestDelete(user: ManagedUser) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const counts = await userAssignmentCounts(user.id)
    if (counts.parts || counts.templates) {
      window.alert(`此人负责 ${counts.parts} 个零件和 ${counts.templates} 个零件模板，请先调整负责人后再删除`)
      return
    }
    confirmingDeleteId.value = user.id
  } catch (reason) { message(reason) }
  finally { busy.value = false }
}
async function confirmDelete(user: ManagedUser) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await deleteUser(user.id)
    editingId.value = ''
    confirmingDeleteId.value = ''
    if (auth.user?.id === user.id) {
      auth.user = null
      await router.replace({ name: 'login' })
      return
    }
    await refresh()
    notice.value = '人员已删除'
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : '删除失败'
    if (detail.includes('负责')) {
      confirmingDeleteId.value = ''
      window.alert(detail)
    } else message(reason)
  } finally { busy.value = false }
}
onMounted(async () => { try { await refresh() } catch (reason) { message(reason) } finally { loading.value = false } })
</script>

<template>
  <section class="machines-page">
    <div class="page-heading">
      <h1>人员</h1>
      <button v-if="!showCreate" class="primary-button small-button" type="button" @click="showCreate = true; editingId = ''; confirmingDeleteId = ''; error = ''; notice = ''">添加人员</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success" role="status">{{ notice }}</p>

    <form v-if="showCreate" class="editor create-editor" @submit.prevent="submit">
      <h2>添加人员</h2>
      <div class="form-grid">
        <label>姓名<input v-model="displayName" autocomplete="off" required maxlength="64" /></label>
        <label>帐号名<input v-model="username" autocomplete="off" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" /></label>
        <label>密码<input v-model="password" type="password" autocomplete="new-password" required maxlength="256" /></label>
        <label>角色<select v-model="role" required><option value="procurement">采购人员</option><option value="production">生产人员</option><option value="admin">管理员</option></select></label>
      </div>
      <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="cancelCreate">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存人员</button></div>
    </form>

    <p v-if="loading" class="empty-state" role="status">加载中…</p>
    <p v-else-if="!users.length && !error" class="empty-state">暂无人员。</p>
    <div v-else-if="users.length" class="simple-table people-table">
      <table>
        <colgroup><col /><col /><col /><col /><col /></colgroup>
        <thead><tr><th scope="col">姓名</th><th scope="col">帐号名</th><th scope="col">密码</th><th scope="col">角色</th><th scope="col">管理员操作</th></tr></thead>
        <tbody>
          <template v-for="user in users" :key="user.id">
            <tr>
              <td class="name-cell">{{ user.displayName }}</td>
              <td>{{ user.username }}</td>
              <td class="password-cell">{{ user.password }}</td>
              <td>{{ roleLabels[user.role] }}{{ user.disabled ? ' · 已停用' : '' }}</td>
              <td><button class="text-button" type="button" @click="editUser(user)">编辑</button></td>
            </tr>
            <tr v-if="editingId === user.id" class="table-edit-row"><td colspan="5">
              <form class="editor" @submit.prevent="saveUser">
                <div class="form-grid">
                  <label>姓名<input v-model="editDisplayName" required maxlength="64" /></label>
                  <label>帐号名<input :value="user.username" readonly /></label>
                  <label>密码<input v-model="editPassword" type="password" autocomplete="new-password" required maxlength="256" /></label>
                  <label>角色<select v-model="editRole" required><option value="procurement">采购人员</option><option value="production">生产人员</option><option value="admin">管理员</option></select></label>
                </div>
                <div v-if="confirmingDeleteId === user.id" class="delete-confirmation">
                  <p>确定删除「{{ user.displayName }}」（{{ user.username }}）吗？删除后无法恢复。</p>
                  <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="confirmingDeleteId = ''">取消删除</button><button class="danger-button small-button" type="button" :disabled="busy" @click="confirmDelete(user)">确认删除</button></div>
                </div>
                <div v-else class="form-actions"><button class="danger-button small-button" type="button" :disabled="busy" @click="requestDelete(user)">删除人员</button><button class="secondary-button small-button" type="button" :disabled="busy" @click="editingId = ''">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存</button></div>
              </form>
            </td></tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
