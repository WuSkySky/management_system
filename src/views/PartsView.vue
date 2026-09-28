<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../auth'
import { advancePart, createPart, deletePart, listMachines, listStaff, nextActions, routeLabels, statusLabels, updatePart, type Machine, type Part, type PartInput, type Staff } from '../business'

const route = useRoute()
const router = useRouter()
const machines = ref<Machine[]>([])
const staff = ref<Staff[]>([])
const loading = ref(true)
const lastMachineId = ref('')
try { lastMachineId.value = sessionStorage.getItem('selectedMachineId') ?? '' } catch { /* 无法使用会话存储时仍可使用当前页面 */ }
const canManage = computed(() => auth.user?.role === 'admin')
const selectedMachineId = computed(() => {
  const requested = typeof route.query.machine === 'string' ? route.query.machine : ''
  if (machines.value.some(machine => machine.id === requested)) return requested
  if (machines.value.some(machine => machine.id === lastMachineId.value)) return lastMachineId.value
  return machines.value[0]?.id ?? ''
})
const selectedMachine = computed(() => machines.value.find(machine => machine.id === selectedMachineId.value))
const busy = ref(false)
const error = ref('')
const showAdd = ref(false)
const editingPartId = ref('')
const partDraft = ref<PartInput>({ name: '', route: 'procurement', assigneeId: '' })

function message(reason: unknown) { error.value = reason instanceof Error ? reason.message : '操作失败' }
function staffFor(route: PartInput['route']) { return staff.value.filter(person => person.role === route) }
function routeChanged() { partDraft.value.assigneeId = '' }
function canAdvance(part: Part) { return canManage.value || auth.user?.id === part.assigneeId }
async function refresh() {
  const [machineData, staffData] = await Promise.all([listMachines(), listStaff()])
  machines.value = machineData
  staff.value = staffData
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await action(); await refresh() }
  catch (reason) { message(reason) }
  finally { busy.value = false }
}
function selectMachine(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  void router.push({ name: 'parts', query: { machine: id } })
}
function addPart() {
  error.value = ''
  editingPartId.value = ''
  partDraft.value = { name: '', route: 'procurement', assigneeId: '' }
  showAdd.value = true
}
function cancelAdd() {
  showAdd.value = false
  partDraft.value = { name: '', route: 'procurement', assigneeId: '' }
  error.value = ''
}
function editPart(part: Part) {
  error.value = ''
  showAdd.value = false
  editingPartId.value = part.id
  partDraft.value = { name: part.name, route: part.route, assigneeId: part.assigneeId }
}
async function savePart() {
  const machineId = selectedMachineId.value
  await run(async () => {
    if (editingPartId.value) await updatePart(editingPartId.value, partDraft.value)
    else await createPart(machineId, partDraft.value)
    editingPartId.value = ''; showAdd.value = false
  })
}
async function advance(part: Part) { await run(() => advancePart(part.id)) }
async function removePart(part: Part) {
  await run(async () => {
    await deletePart(part.id)
    editingPartId.value = ''
  })
}
watch(selectedMachineId, id => {
  editingPartId.value = ''; showAdd.value = false; error.value = ''
  if (id) {
    lastMachineId.value = id
    try { sessionStorage.setItem('selectedMachineId', id) } catch { /* 当前页面仍会保留选择 */ }
  }
})
onMounted(async () => { try { await refresh() } catch (reason) { message(reason) } finally { loading.value = false } })
</script>

<template>
  <section class="machines-page">
    <div class="page-heading">
      <h1>零件</h1>
      <button v-if="canManage && selectedMachine && !showAdd" class="primary-button small-button" type="button" @click="addPart">添加零件</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <p v-if="loading" class="empty-state" role="status">加载中…</p>
    <div v-else-if="machines.length" class="machine-picker">
      <label for="selected-machine">机器</label>
      <select id="selected-machine" :value="selectedMachineId" @change="selectMachine">
        <option v-for="machine in machines" :key="machine.id" :value="machine.id">{{ machine.name }}</option>
      </select>
    </div>
    <p v-else-if="!error" class="empty-state">暂无机器。</p>

    <template v-if="selectedMachine">
      <form v-if="showAdd && canManage" class="editor create-editor" @submit.prevent="savePart">
        <h2>添加零件</h2>
        <div class="form-grid part-fields">
          <label>名称<input v-model="partDraft.name" required maxlength="64" /></label>
          <label>线路<select v-model="partDraft.route" @change="routeChanged"><option value="procurement">采购</option><option value="production">生产</option></select></label>
          <label>负责人<select v-model="partDraft.assigneeId" required><option value="" disabled>请选择</option><option v-for="person in staffFor(partDraft.route)" :key="person.id" :value="person.id">{{ person.displayName }}</option></select></label>
        </div>
        <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="cancelAdd">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存零件</button></div>
      </form>

      <p v-if="!selectedMachine.parts.length" class="empty-state">这台机器还没有零件{{ canManage ? '，可在这里添加' : '' }}。</p>
      <div v-else class="parts-table">
        <table :class="{ 'with-admin': canManage }">
          <colgroup><col class="name-column" /><col class="route-column" /><col class="assignee-column" /><col class="status-column" /><col class="action-column" /><col v-if="canManage" class="admin-column" /></colgroup>
          <thead><tr><th scope="col">名称</th><th scope="col">线路</th><th scope="col">负责人</th><th scope="col">状态</th><th scope="col">操作</th><th v-if="canManage" scope="col">管理员操作</th></tr></thead>
          <tbody>
            <template v-for="part in selectedMachine.parts" :key="part.id">
              <tr class="part-data-row">
                <td class="name-cell" :title="part.name">{{ part.name }}</td>
                <td class="route-cell">{{ routeLabels[part.route] }}</td>
                <td class="assignee-cell">{{ part.assigneeName }}</td>
                <td class="status-cell">{{ statusLabels[part.status] }}</td>
                <td class="action-cell">
                  <div class="part-action-group">
                    <button v-if="nextActions[part.status] && canAdvance(part)" class="outline-button" type="button" :disabled="busy" @click="advance(part)">{{ nextActions[part.status] }}</button>
                    <span v-else class="no-action">—</span>
                  </div>
                </td>
                <td v-if="canManage" class="admin-cell"><button class="text-button" type="button" @click="editPart(part)">编辑</button></td>
              </tr>
              <tr v-if="editingPartId === part.id && canManage" class="part-edit-row"><td colspan="6">
                <form class="editor" @submit.prevent="savePart">
                  <div class="form-grid part-fields">
                    <label>名称<input v-model="partDraft.name" required maxlength="64" /></label>
                    <label>线路<select v-model="partDraft.route" @change="routeChanged"><option value="procurement">采购</option><option value="production">生产</option></select></label>
                    <label>负责人<select v-model="partDraft.assigneeId" required><option value="" disabled>请选择</option><option v-for="person in staffFor(partDraft.route)" :key="person.id" :value="person.id">{{ person.displayName }}</option></select></label>
                  </div>
                  <p class="muted">更换线路后，状态会从新线路的第一步开始。</p>
                  <div class="form-actions"><button class="danger-button small-button" type="button" :disabled="busy" @click="removePart(part)">删除零件</button><button class="secondary-button small-button" type="button" :disabled="busy" @click="editingPartId = ''">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存</button></div>
                </form>
              </td></tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
