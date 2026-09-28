<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { auth } from '../auth'
import { createMachine, deleteMachine, listMachines, updateMachine, type Machine } from '../business'

const machines = ref<Machine[]>([])
const loading = ref(true)
const canManage = computed(() => auth.user?.role === 'admin')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const showCreate = ref(false)
const newName = ref('')
const newDate = ref('')
const editingId = ref('')
const confirmingDeleteId = ref('')
const editName = ref('')
const editDate = ref('')

function daysUntil(expectedDate: string): number {
  const today = new Date()
  const [year, month, day] = expectedDate.split('-').map(Number)
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((Date.UTC(year, month - 1, day) - todayDay) / 86_400_000)
}
function dueHint(expectedDate: string): string {
  const days = daysUntil(expectedDate)
  if (days < 0) return `已逾期 ${-days} 天`
  if (days === 0) return '今天到期'
  if (days < 15) return `剩余 ${days} 天`
  return ''
}

function message(reason: unknown) { error.value = reason instanceof Error ? reason.message : '操作失败' }
async function refresh() { machines.value = await listMachines() }
async function run(action: () => Promise<void>, success: string) {
  if (busy.value) return
  busy.value = true
  error.value = ''; notice.value = ''
  try { await action(); await refresh(); notice.value = success }
  catch (reason) { message(reason) }
  finally { busy.value = false }
}
async function saveNewMachine() {
  await run(async () => {
    await createMachine(newName.value, newDate.value)
    showCreate.value = false
    newName.value = ''; newDate.value = ''
  }, '机器已创建')
}
function cancelCreate() {
  showCreate.value = false
  newName.value = ''
  newDate.value = ''
  error.value = ''
}
function editMachine(machine: Machine) {
  error.value = ''; notice.value = ''
  editingId.value = machine.id
  confirmingDeleteId.value = ''
  editName.value = machine.name
  editDate.value = machine.expectedDate
}
async function saveMachine() {
  await run(async () => {
    await updateMachine(editingId.value, editName.value, editDate.value)
    editingId.value = ''
  }, '机器已更新')
}
async function removeMachine(machine: Machine) {
  await run(async () => {
    await deleteMachine(machine.id)
    editingId.value = ''
    confirmingDeleteId.value = ''
  }, '机器已删除')
}
onMounted(async () => { try { await refresh() } catch (reason) { message(reason) } finally { loading.value = false } })
</script>

<template>
  <section class="machines-page">
    <div class="page-heading">
      <h1>机器</h1>
      <button v-if="canManage && !showCreate" class="primary-button small-button" type="button" @click="showCreate = true; error = ''; notice = ''">创建机器</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success" role="status">{{ notice }}</p>

    <form v-if="showCreate && canManage" class="editor create-editor" @submit.prevent="saveNewMachine">
      <h2>创建机器</h2>
      <div class="form-grid">
        <label>名称<input v-model="newName" required maxlength="64" /></label>
        <label>预计完成日期<input v-model="newDate" type="date" required /></label>
      </div>
      <p class="muted">保存后会自动添加当前零件模板中的零件。</p>
      <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="cancelCreate">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存机器</button></div>
    </form>

    <p v-if="loading" class="empty-state" role="status">加载中…</p>
    <p v-else-if="!machines.length && !error" class="empty-state">暂无机器{{ canManage ? '，可先创建一台机器' : '' }}。</p>
    <div v-else-if="machines.length" class="simple-table machine-table">
      <table :class="{ 'with-admin': canManage }">
        <colgroup><col class="machine-name-column" /><col class="machine-date-column" /><col v-if="canManage" class="machine-admin-column" /></colgroup>
        <thead><tr><th scope="col">名称</th><th scope="col">预计完成日期</th><th v-if="canManage" scope="col">管理</th></tr></thead>
        <tbody>
          <template v-for="machine in machines" :key="machine.id">
            <tr :class="{ 'due-soon': daysUntil(machine.expectedDate) < 15, 'due-overdue': daysUntil(machine.expectedDate) < 0 }">
              <td class="name-cell"><RouterLink :to="{ name: 'parts', query: { machine: machine.id } }" :aria-label="`查看 ${machine.name} 的零件`">{{ machine.name }}</RouterLink></td>
              <td>{{ machine.expectedDate }}<span v-if="dueHint(machine.expectedDate)" class="due-hint">{{ dueHint(machine.expectedDate) }}</span></td>
              <td v-if="canManage"><button class="text-button" type="button" @click="editMachine(machine)">编辑</button></td>
            </tr>
            <tr v-if="editingId === machine.id && canManage" class="table-edit-row"><td colspan="3">
              <form class="editor" @submit.prevent="saveMachine">
                <div class="form-grid"><label>名称<input v-model="editName" required maxlength="64" /></label><label>预计完成日期<input v-model="editDate" type="date" required /></label></div>
                <div v-if="confirmingDeleteId === machine.id" class="delete-confirmation">
                  <p>删除「{{ machine.name }}」会同时删除其 {{ machine.parts.length }} 个零件，且无法恢复。</p>
                  <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="confirmingDeleteId = ''">取消删除</button><button class="danger-button small-button" type="button" :disabled="busy" @click="removeMachine(machine)">确认删除</button></div>
                </div>
                <div v-else class="form-actions"><button class="danger-button small-button" type="button" :disabled="busy" @click="confirmingDeleteId = machine.id">删除机器</button><button class="secondary-button small-button" type="button" :disabled="busy" @click="editingId = ''">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存</button></div>
              </form>
            </td></tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
