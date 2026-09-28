<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createPartTemplate, deletePartTemplate, listPartTemplates, listStaff, routeLabels, updatePartTemplate, type PartInput, type PartTemplate, type Staff } from '../business'

const templates = ref<PartTemplate[]>([])
const staff = ref<Staff[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const showAdd = ref(false)
const editingId = ref('')
const draft = ref<PartInput>({ name: '', route: 'procurement', assigneeId: '' })

function message(reason: unknown) { error.value = reason instanceof Error ? reason.message : '操作失败' }
function staffFor(route: PartInput['route']) { return staff.value.filter(person => person.role === route) }
function routeChanged() { draft.value.assigneeId = '' }
async function refresh() {
  const [templateData, staffData] = await Promise.all([listPartTemplates(), listStaff()])
  templates.value = templateData
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
function addTemplate() {
  error.value = ''
  editingId.value = ''
  draft.value = { name: '', route: 'procurement', assigneeId: '' }
  showAdd.value = true
}
function cancelAdd() {
  showAdd.value = false
  draft.value = { name: '', route: 'procurement', assigneeId: '' }
  error.value = ''
}
function editTemplate(template: PartTemplate) {
  error.value = ''
  showAdd.value = false
  editingId.value = template.id
  draft.value = { name: template.name, route: template.route, assigneeId: template.assigneeId }
}
async function saveTemplate() {
  await run(async () => {
    if (editingId.value) await updatePartTemplate(editingId.value, draft.value)
    else await createPartTemplate(draft.value)
    editingId.value = ''
    showAdd.value = false
  })
}
async function removeTemplate(template: PartTemplate) {
  await run(async () => {
    await deletePartTemplate(template.id)
    editingId.value = ''
  })
}
onMounted(async () => { try { await refresh() } catch (reason) { message(reason) } finally { loading.value = false } })
</script>

<template>
  <section class="machines-page">
    <div class="page-heading">
      <h1>零件模板</h1>
      <button v-if="!showAdd" class="primary-button small-button" type="button" @click="addTemplate">添加零件</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <form v-if="showAdd" class="editor create-editor" @submit.prevent="saveTemplate">
      <h2>添加零件模板</h2>
      <div class="form-grid part-fields">
        <label>名称<input v-model="draft.name" required maxlength="64" /></label>
        <label>线路<select v-model="draft.route" @change="routeChanged"><option value="procurement">采购</option><option value="production">生产</option></select></label>
        <label>负责人<select v-model="draft.assigneeId" required><option value="" disabled>请选择</option><option v-for="person in staffFor(draft.route)" :key="person.id" :value="person.id">{{ person.displayName }}</option></select></label>
      </div>
      <div class="form-actions"><button class="secondary-button small-button" type="button" :disabled="busy" @click="cancelAdd">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存模板</button></div>
    </form>

    <p v-if="loading" class="empty-state" role="status">加载中…</p>
    <p v-else-if="!templates.length && !error" class="empty-state">零件模板暂无零件，可在这里添加。</p>
    <div v-else-if="templates.length" class="parts-table template-table">
      <table>
        <colgroup><col class="template-name-column" /><col class="template-route-column" /><col class="template-assignee-column" /><col class="template-admin-column" /></colgroup>
        <thead><tr><th scope="col">名称</th><th scope="col">线路</th><th scope="col">负责人</th><th scope="col">管理员操作</th></tr></thead>
        <tbody>
          <template v-for="part in templates" :key="part.id">
            <tr class="part-data-row">
              <td class="name-cell" :title="part.name">{{ part.name }}</td>
              <td>{{ routeLabels[part.route] }}</td>
              <td>{{ part.assigneeName }}</td>
              <td><button class="text-button" type="button" @click="editTemplate(part)">编辑</button></td>
            </tr>
            <tr v-if="editingId === part.id" class="part-edit-row"><td colspan="4">
              <form class="editor" @submit.prevent="saveTemplate">
                <div class="form-grid part-fields">
                  <label>名称<input v-model="draft.name" required maxlength="64" /></label>
                  <label>线路<select v-model="draft.route" @change="routeChanged"><option value="procurement">采购</option><option value="production">生产</option></select></label>
                  <label>负责人<select v-model="draft.assigneeId" required><option value="" disabled>请选择</option><option v-for="person in staffFor(draft.route)" :key="person.id" :value="person.id">{{ person.displayName }}</option></select></label>
                </div>
                <div class="form-actions"><button class="danger-button small-button" type="button" :disabled="busy" @click="removeTemplate(part)">删除模板</button><button class="secondary-button small-button" type="button" :disabled="busy" @click="editingId = ''">取消</button><button class="primary-button small-button" type="submit" :disabled="busy">保存</button></div>
              </form>
            </td></tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
