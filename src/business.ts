import { api, type StaffRole } from './auth'

export type PartStatus = 'not_purchased' | 'purchased_unpaid' | 'paid_unstocked' | 'missing_materials' | 'producing' | 'stocked'
export type Staff = { id: string; displayName: string; role: StaffRole }
export type Part = { id: string; name: string; route: StaffRole; assigneeId: string; assigneeName: string; status: PartStatus }
export type Machine = { id: string; name: string; expectedDate: string; parts: Part[] }
export type PartInput = { name: string; route: StaffRole; assigneeId: string }
export type PartTemplate = PartInput & { id: string; assigneeName: string }

export const routeLabels: Record<StaffRole, string> = { procurement: '采购', production: '生产' }
export const statusLabels: Record<PartStatus, string> = {
  not_purchased: '未采购', purchased_unpaid: '已采购未付款', paid_unstocked: '已付款未入库',
  missing_materials: '缺少原材料', producing: '生产中', stocked: '已入库',
}
export const nextActions: Partial<Record<PartStatus, string>> = {
  not_purchased: '采购完成', purchased_unpaid: '付款完成', paid_unstocked: '确认入库',
  missing_materials: '原料齐全开始生产', producing: '生产结束入库',
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export async function listMachines(): Promise<Machine[]> {
  return (await api<{ machines: Machine[] }>('/api/machines')).machines
}

export async function listStaff(): Promise<Staff[]> {
  return (await api<{ staff: Staff[] }>('/api/staff')).staff
}

export async function listPartTemplates(): Promise<PartTemplate[]> {
  return (await api<{ templates: PartTemplate[] }>('/api/part-templates')).templates
}

export async function createPartTemplate(part: PartInput): Promise<void> {
  await api('/api/part-templates', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(part) })
}

export async function updatePartTemplate(id: string, part: PartInput): Promise<void> {
  await api(`/api/part-templates/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(part) })
}

export async function deletePartTemplate(id: string): Promise<void> {
  await api(`/api/part-templates/${id}`, { method: 'DELETE' })
}

export async function createMachine(name: string, expectedDate: string): Promise<void> {
  await api('/api/machines', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name, expectedDate }) })
}

export async function updateMachine(id: string, name: string, expectedDate: string): Promise<void> {
  await api(`/api/machines/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ name, expectedDate }) })
}

export async function deleteMachine(id: string): Promise<void> {
  await api(`/api/machines/${id}`, { method: 'DELETE' })
}

export async function createPart(machineId: string, part: PartInput): Promise<void> {
  await api(`/api/machines/${machineId}/parts`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(part) })
}

export async function updatePart(id: string, part: PartInput): Promise<void> {
  await api(`/api/parts/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(part) })
}

export async function deletePart(id: string): Promise<void> {
  await api(`/api/parts/${id}`, { method: 'DELETE' })
}

export async function advancePart(id: string): Promise<void> {
  await api(`/api/parts/${id}/advance`, { method: 'POST' })
}
