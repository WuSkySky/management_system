import { reactive } from 'vue'

export type Role = 'admin' | 'procurement' | 'production'
export type StaffRole = Exclude<Role, 'admin'>
export const roleLabels: Record<Role, string> = {
  admin: '管理员',
  procurement: '采购人员',
  production: '生产人员',
}
export type User = { id: string; username: string; displayName: string; role: Role }
export type ManagedUser = User & { password: string; disabled: boolean }

export const auth = reactive<{ user: User | null; loaded: boolean }>({ user: null, loaded: false })
let restorePromise: Promise<void> | null = null

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || '请求失败')
  return result
}

export async function restoreSession(): Promise<void> {
  if (auth.loaded) return
  if (!restorePromise) {
    restorePromise = (async () => {
      try {
        const result = await api<{ user: User }>('/api/auth/me')
        auth.user = result.user
      } catch {
        auth.user = null
      } finally {
        auth.loaded = true
      }
    })()
  }
  await restorePromise
}

export async function login(username: string, password: string): Promise<void> {
  const result = await api<{ user: User }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  auth.user = result.user
  auth.loaded = true
}

export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' })
  auth.user = null
  auth.loaded = true
}

export async function getTestMessage(admin = false): Promise<string> {
  const result = await api<{ message: string }>(admin ? '/api/admin/test' : '/api/test')
  return result.message
}

export async function listUsers(): Promise<ManagedUser[]> {
  const result = await api<{ users: ManagedUser[] }>('/api/admin/users')
  return result.users
}

export async function createUser(username: string, displayName: string, password: string, role: Role): Promise<User> {
  const result = await api<{ user: User }>('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, password, role }),
  })
  return result.user
}

export async function updateUser(id: string, displayName: string, password: string, role: Role): Promise<User> {
  const result = await api<{ user: User }>(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, password, role }),
  })
  return result.user
}

export async function userAssignmentCounts(id: string): Promise<{ parts: number; templates: number }> {
  return api(`/api/admin/users/${id}/assignments`)
}

export async function deleteUser(id: string): Promise<void> {
  await api(`/api/admin/users/${id}`, { method: 'DELETE' })
}
