import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Role = 'admin' | 'procurement' | 'production'
type PublicUser = { id: string; username: string; displayName: string; role: Role }
type UserRow = { id: string; username: string; display_name: string; password: string; role: Role; disabled_at: number | null }
type SessionRow = { id: string; username: string; display_name: string; role: Role; expires_at: number }
type LoginAttempt = { failures: number; blocked_until: number | null }
type StaffRole = 'procurement' | 'production'
type PartStatus = 'not_purchased' | 'purchased_unpaid' | 'paid_unstocked' | 'missing_materials' | 'producing' | 'stocked'
type MachineRow = { id: string; name: string; expected_date: string }
type PartRow = { id: string; machine_id: string; name: string; route: StaffRole; assignee_id: string; assignee_name: string; status: PartStatus }
type PartTemplateRow = { id: string; name: string; route: StaffRole; assignee_id: string; assignee_name: string }
type AppEnv = { Bindings: Env }

const app = new Hono<AppEnv>()
const COOKIE_NAME = 'pm_session'
const SESSION_AGE = 60 * 60 * 24 * 7
const BLOCK_SECONDS = 60 * 15
const statusSteps: Record<StaffRole, readonly PartStatus[]> = {
  procurement: ['not_purchased', 'purchased_unpaid', 'paid_unstocked', 'stocked'],
  production: ['missing_materials', 'producing', 'stocked'],
}

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return origin === new URL(request.url).origin
}

function sessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_AGE,
  }
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function toPublicUser(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>): PublicUser {
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role }
}

async function currentUser(db: D1Database, token: string | undefined): Promise<PublicUser | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const row = await db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND u.disabled_at IS NULL
  `).bind(await hashToken(token)).first<SessionRow>()
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return null
  return toPublicUser(row)
}

async function attemptKey(username: string, ip: string): Promise<string> {
  return hashToken(`${username}:${ip}`)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function nameFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function validName(value: string): boolean {
  return value.length > 0 && value.length <= 64
}

function validRoute(value: unknown): value is StaffRole {
  return value === 'procurement' || value === 'production'
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
}

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}

async function assigneeValid(db: D1Database, id: string, route: StaffRole): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM users WHERE id = ? AND role = ? AND disabled_at IS NULL').bind(id, route).first()
  return !!row
}

async function assignmentCounts(db: D1Database, id: string): Promise<{ parts: number; templates: number }> {
  const row = await db.prepare('SELECT (SELECT COUNT(*) FROM parts WHERE assignee_id = ?) AS parts, (SELECT COUNT(*) FROM part_templates WHERE assignee_id = ?) AS templates')
    .bind(id, id).first<{ parts: number; templates: number }>()
  return { parts: row?.parts ?? 0, templates: row?.templates ?? 0 }
}

function assignmentError(counts: { parts: number; templates: number }): string {
  return `此人负责 ${counts.parts} 个零件和 ${counts.templates} 个零件模板，请先调整负责人后再删除`
}

app.use('/api/*', async (c, next) => {
  await next()
  noStore(c)
})

app.get('/api/health', c => c.json({ status: 'ok' }))

app.post('/api/auth/login', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求格式无效' }, 400) }
  if (!body || typeof body !== 'object') return c.json({ error: '请求格式无效' }, 400)
  const input = body as Record<string, unknown>
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 1 || password.length > 256) return c.json({ error: '帐号名或密码错误' }, 401)

  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE updated_at < ?').bind(now - 24 * 60 * 60).run()
  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run()
  const key = await attemptKey(username, c.req.header('CF-Connecting-IP') || 'local')
  const attempt = await c.env.DB.prepare('SELECT failures, blocked_until FROM login_attempts WHERE key = ?').bind(key).first<LoginAttempt>()
  if (attempt?.blocked_until && attempt.blocked_until > now) return c.json({ error: '尝试次数过多，请稍后再试' }, 429)

  const user = await c.env.DB.prepare('SELECT id, username, display_name, password, role, disabled_at FROM users WHERE username = ?').bind(username).first<UserRow>()
  const valid = user && user.disabled_at === null && password === user.password
  if (!valid) {
    await c.env.DB.prepare(`
      INSERT INTO login_attempts (key, failures, blocked_until, updated_at)
      VALUES (?, 1, NULL, ?)
      ON CONFLICT(key) DO UPDATE SET
        failures = CASE WHEN updated_at < ? THEN 1 ELSE failures + 1 END,
        blocked_until = CASE WHEN updated_at >= ? AND failures >= 4 THEN ? ELSE NULL END,
        updated_at = excluded.updated_at
    `).bind(key, now, now - BLOCK_SECONDS, now - BLOCK_SECONDS, now + BLOCK_SECONDS).run()
    return c.json({ error: '帐号名或密码错误' }, 401)
  }

  await c.env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run()
  const previousToken = getCookie(c, COOKIE_NAME)
  if (previousToken && /^[A-Za-z0-9_-]{43}$/.test(previousToken)) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(previousToken)).run()
  }
  const token = newToken()
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await hashToken(token), user.id, now + SESSION_AGE, now).run()
  setCookie(c, COOKIE_NAME, token, sessionCookieOptions(c.req.raw))
  return c.json({ user: toPublicUser(user) })
})

app.get('/api/auth/me', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  return c.json({ user })
})

app.post('/api/auth/logout', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const token = getCookie(c, COOKIE_NAME)
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  }
  deleteCookie(c, COOKIE_NAME, { path: '/', secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax' })
  return c.json({ ok: true })
})

app.get('/api/test', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  return c.json({ message: '登录有效', user })
})

app.get('/api/admin/test', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  return c.json({ message: '管理员权限有效', user })
})

app.get('/api/admin/users', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const result = await c.env.DB.prepare('SELECT id, username, display_name, password, role, disabled_at FROM users ORDER BY created_at, username').all<UserRow>()
  return c.json({ users: result.results.map(row => ({ ...toPublicUser(row), password: row.password, disabled: row.disabled_at !== null })) })
})

app.post('/api/admin/users', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const admin = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!admin) return c.json({ error: '请先登录' }, 401)
  if (admin.role !== 'admin') return c.json({ error: '无权限' }, 403)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求格式无效' }, 400) }
  if (!body || typeof body !== 'object') return c.json({ error: '请求格式无效' }, 400)
  const input = body as Record<string, unknown>
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : ''
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const role = input.role
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return c.json({ error: '帐号名需为 3–32 位英文、数字、点、下划线或连字符' }, 400)
  if (!displayName || displayName.length > 64) return c.json({ error: '姓名需为 1–64 个字符' }, 400)
  if (!password || password.length > 256) return c.json({ error: '密码需为 1–256 个字符' }, 400)
  if (role !== 'procurement' && role !== 'production' && role !== 'admin') return c.json({ error: '请选择有效角色' }, 400)
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (exists) return c.json({ error: '帐号名已存在' }, 409)

  const user: PublicUser = { id: crypto.randomUUID(), username, displayName, role }
  try {
    await c.env.DB.prepare('INSERT INTO users (id, username, display_name, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.id, user.username, user.displayName, password, user.role, Math.floor(Date.now() / 1000)).run()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return c.json({ error: '帐号名已存在' }, 409)
    throw error
  }
  return c.json({ user }, 201)
})

app.get('/api/admin/users/:id/assignments', async c => {
  const admin = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!admin) return c.json({ error: '请先登录' }, 401)
  if (admin.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const id = c.req.param('id')
  if (!await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()) return c.json({ error: '人员不存在' }, 404)
  return c.json(await assignmentCounts(c.env.DB, id))
})

app.patch('/api/admin/users/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const admin = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!admin) return c.json({ error: '请先登录' }, 401)
  if (admin.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id, username, display_name, password, role, disabled_at FROM users WHERE id = ?').bind(id).first<UserRow>()
  if (!existing) return c.json({ error: '人员不存在' }, 404)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  if (body.username !== undefined && body.username !== existing.username) return c.json({ error: '帐号名不可修改' }, 400)
  const displayName = nameFrom(body.displayName)
  const password = body.password
  const role = body.role
  if (!validName(displayName)) return c.json({ error: '姓名需为 1–64 个字符' }, 400)
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) return c.json({ error: '密码需为 1–256 个字符' }, 400)
  if (role !== 'admin' && role !== 'procurement' && role !== 'production') return c.json({ error: '请选择有效角色' }, 400)
  if (role !== existing.role) {
    const counts = await assignmentCounts(c.env.DB, id)
    if (counts.parts || counts.templates) return c.json({ error: '此人仍负责零件或零件模板，请先调整负责人后再修改角色' }, 409)
  }
  await c.env.DB.prepare('UPDATE users SET display_name = ?, password = ?, role = ? WHERE id = ?')
    .bind(displayName, password, role, id).run()
  return c.json({ user: { id, username: existing.username, displayName, role } })
})

app.delete('/api/admin/users/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const admin = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!admin) return c.json({ error: '请先登录' }, 401)
  if (admin.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const id = c.req.param('id')
  if (!await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()) return c.json({ error: '人员不存在' }, 404)
  const counts = await assignmentCounts(c.env.DB, id)
  if (counts.parts || counts.templates) return c.json({ error: assignmentError(counts) }, 409)
  try {
    const result = await c.env.DB.prepare('DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM parts WHERE assignee_id = ?) AND NOT EXISTS (SELECT 1 FROM part_templates WHERE assignee_id = ?)')
      .bind(id, id, id).run()
    if (!result.meta.changes) return c.json({ error: '此人已有负责的零件或零件模板，无法删除' }, 409)
  } catch (error) {
    if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) return c.json({ error: '此人已有负责的零件或零件模板，无法删除' }, 409)
    throw error
  }
  return c.json({ ok: true })
})

app.get('/api/staff', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  const result = await c.env.DB.prepare("SELECT id, display_name, role FROM users WHERE role IN ('procurement', 'production') AND disabled_at IS NULL ORDER BY display_name, username").all<{ id: string; display_name: string; role: StaffRole }>()
  return c.json({ staff: result.results.map(row => ({ id: row.id, displayName: row.display_name, role: row.role })) })
})

app.get('/api/part-templates', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const result = await c.env.DB.prepare('SELECT t.id, t.name, t.route, t.assignee_id, u.display_name AS assignee_name FROM part_templates t JOIN users u ON u.id = t.assignee_id ORDER BY t.created_at, t.name').all<PartTemplateRow>()
  return c.json({ templates: result.results.map(row => ({
    id: row.id, name: row.name, route: row.route, assigneeId: row.assignee_id, assigneeName: row.assignee_name,
  })) })
})

app.post('/api/part-templates', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '零件模板名称需为 1–64 个字符' }, 400)
  if (!validRoute(body.route) || !validId(body.assigneeId) || !await assigneeValid(c.env.DB, body.assigneeId, body.route)) return c.json({ error: '请选择与线路对应的负责人' }, 400)
  if (await c.env.DB.prepare('SELECT id FROM part_templates WHERE name = ?').bind(name).first()) return c.json({ error: '零件模板名称不能重复' }, 409)
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare('INSERT INTO part_templates (id, name, route, assignee_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, body.route, body.assigneeId, Math.floor(Date.now() / 1000)).run()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return c.json({ error: '零件模板名称不能重复' }, 409)
    throw error
  }
  return c.json({ id }, 201)
})

app.patch('/api/part-templates/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '零件模板名称需为 1–64 个字符' }, 400)
  if (!validRoute(body.route) || !validId(body.assigneeId) || !await assigneeValid(c.env.DB, body.assigneeId, body.route)) return c.json({ error: '请选择与线路对应的负责人' }, 400)
  const id = c.req.param('id')
  if (await c.env.DB.prepare('SELECT id FROM part_templates WHERE name = ? AND id <> ?').bind(name, id).first()) return c.json({ error: '零件模板名称不能重复' }, 409)
  try {
    const result = await c.env.DB.prepare('UPDATE part_templates SET name = ?, route = ?, assignee_id = ? WHERE id = ?')
      .bind(name, body.route, body.assigneeId, id).run()
    if (!result.meta.changes) return c.json({ error: '零件模板不存在' }, 404)
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return c.json({ error: '零件模板名称不能重复' }, 409)
    throw error
  }
  return c.json({ ok: true })
})

app.delete('/api/part-templates/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const result = await c.env.DB.prepare('DELETE FROM part_templates WHERE id = ?').bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: '零件模板不存在' }, 404)
  return c.json({ ok: true })
})

app.get('/api/machines', async c => {
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  const [machinesResult, partsResult] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name, expected_date FROM machines ORDER BY expected_date, created_at'),
    c.env.DB.prepare('SELECT p.id, p.machine_id, p.name, p.route, p.assignee_id, u.display_name AS assignee_name, p.status FROM parts p JOIN users u ON u.id = p.assignee_id ORDER BY p.created_at, p.name'),
  ])
  const machines = machinesResult.results as MachineRow[]
  const parts = partsResult.results as PartRow[]
  return c.json({ machines: machines.map(machine => ({
    id: machine.id,
    name: machine.name,
    expectedDate: machine.expected_date,
    parts: parts.filter(part => part.machine_id === machine.id).map(part => ({
      id: part.id, name: part.name, route: part.route, assigneeId: part.assignee_id,
      assigneeName: part.assignee_name, status: part.status,
    })),
  })) })
})

app.post('/api/machines', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '机器名称需为 1–64 个字符' }, 400)
  if (!validDate(body.expectedDate)) return c.json({ error: '请选择有效的预计完成日期' }, 400)
  if (body.parts !== undefined && (!Array.isArray(body.parts) || body.parts.length > 100)) return c.json({ error: '零件列表无效' }, 400)
  const partInputs = (body.parts ?? []) as unknown[]
  const parts: { name: string; route: StaffRole; assigneeId: string }[] = []
  const names = new Set<string>()
  for (const input of partInputs) {
    if (!input || typeof input !== 'object') return c.json({ error: '零件信息无效' }, 400)
    const part = input as Record<string, unknown>
    const partName = nameFrom(part.name)
    if (!validName(partName)) return c.json({ error: '零件名称需为 1–64 个字符' }, 400)
    if (names.has(partName.toLowerCase())) return c.json({ error: '同一台机器的零件名称不能重复' }, 409)
    names.add(partName.toLowerCase())
    if (!validRoute(part.route) || !validId(part.assigneeId) || !await assigneeValid(c.env.DB, part.assigneeId, part.route)) return c.json({ error: '请选择与线路对应的负责人' }, 400)
    parts.push({ name: partName, route: part.route, assigneeId: part.assigneeId })
  }
  const templateResult = await c.env.DB.prepare('SELECT name, route, assignee_id FROM part_templates ORDER BY created_at, name').all<{ name: string; route: StaffRole; assignee_id: string }>()
  for (const template of templateResult.results) {
    if (names.has(template.name.toLowerCase())) return c.json({ error: '零件名称与零件模板重复' }, 409)
    names.add(template.name.toLowerCase())
    parts.push({ name: template.name, route: template.route, assigneeId: template.assignee_id })
  }
  const exists = await c.env.DB.prepare('SELECT id FROM machines WHERE name = ?').bind(name).first()
  if (exists) return c.json({ error: '机器名称已存在' }, 409)
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO machines (id, name, expected_date, created_at) VALUES (?, ?, ?, ?)').bind(id, name, body.expectedDate, now),
      ...parts.map(part => c.env.DB.prepare('INSERT INTO parts (id, machine_id, name, route, assignee_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, part.name, part.route, part.assigneeId, statusSteps[part.route][0], now)),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return c.json({ error: '机器或零件名称已存在' }, 409)
    throw error
  }
  return c.json({ id }, 201)
})

app.patch('/api/machines/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '机器名称需为 1–64 个字符' }, 400)
  if (!validDate(body.expectedDate)) return c.json({ error: '请选择有效的预计完成日期' }, 400)
  const exists = await c.env.DB.prepare('SELECT id FROM machines WHERE name = ? AND id <> ?').bind(name, c.req.param('id')).first()
  if (exists) return c.json({ error: '机器名称已存在' }, 409)
  const result = await c.env.DB.prepare('UPDATE machines SET name = ?, expected_date = ? WHERE id = ?').bind(name, body.expectedDate, c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: '机器不存在' }, 404)
  return c.json({ ok: true })
})

app.delete('/api/machines/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const result = await c.env.DB.prepare('DELETE FROM machines WHERE id = ?').bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: '机器不存在' }, 404)
  return c.json({ ok: true })
})

app.post('/api/machines/:id/parts', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const machineId = c.req.param('id')
  if (!await c.env.DB.prepare('SELECT id FROM machines WHERE id = ?').bind(machineId).first()) return c.json({ error: '机器不存在' }, 404)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '零件名称需为 1–64 个字符' }, 400)
  if (!validRoute(body.route) || !validId(body.assigneeId) || !await assigneeValid(c.env.DB, body.assigneeId, body.route)) return c.json({ error: '请选择与线路对应的负责人' }, 400)
  if (await c.env.DB.prepare('SELECT id FROM parts WHERE machine_id = ? AND name = ?').bind(machineId, name).first()) return c.json({ error: '同一台机器的零件名称不能重复' }, 409)
  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO parts (id, machine_id, name, route, assignee_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, machineId, name, body.route, body.assigneeId, statusSteps[body.route][0], Math.floor(Date.now() / 1000)).run()
  return c.json({ id }, 201)
})

app.patch('/api/parts/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT machine_id, route FROM parts WHERE id = ?').bind(id).first<{ machine_id: string; route: StaffRole }>()
  if (!existing) return c.json({ error: '零件不存在' }, 404)
  const body = await readBody(c)
  if (!body) return c.json({ error: '请求格式无效' }, 400)
  const name = nameFrom(body.name)
  if (!validName(name)) return c.json({ error: '零件名称需为 1–64 个字符' }, 400)
  if (!validRoute(body.route) || !validId(body.assigneeId) || !await assigneeValid(c.env.DB, body.assigneeId, body.route)) return c.json({ error: '请选择与线路对应的负责人' }, 400)
  if (await c.env.DB.prepare('SELECT id FROM parts WHERE machine_id = ? AND name = ? AND id <> ?').bind(existing.machine_id, name, id).first()) return c.json({ error: '同一台机器的零件名称不能重复' }, 409)
  await c.env.DB.prepare('UPDATE parts SET name = ?, route = ?, assignee_id = ?, status = CASE WHEN route = ? THEN status ELSE ? END WHERE id = ?')
    .bind(name, body.route, body.assigneeId, body.route, statusSteps[body.route][0], id).run()
  return c.json({ ok: true })
})

app.delete('/api/parts/:id', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  if (user.role !== 'admin') return c.json({ error: '无权限' }, 403)
  const result = await c.env.DB.prepare('DELETE FROM parts WHERE id = ?').bind(c.req.param('id')).run()
  if (!result.meta.changes) return c.json({ error: '零件不存在' }, 404)
  return c.json({ ok: true })
})

app.post('/api/parts/:id/advance', async c => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '请求来源无效' }, 403)
  const user = await currentUser(c.env.DB, getCookie(c, COOKIE_NAME))
  if (!user) return c.json({ error: '请先登录' }, 401)
  const part = await c.env.DB.prepare('SELECT route, assignee_id, status FROM parts WHERE id = ?').bind(c.req.param('id')).first<{ route: StaffRole; assignee_id: string; status: PartStatus }>()
  if (!part) return c.json({ error: '零件不存在' }, 404)
  if (user.role !== 'admin' && user.id !== part.assignee_id) return c.json({ error: '无权限' }, 403)
  const steps = statusSteps[part.route]
  const next = steps[steps.indexOf(part.status) + 1]
  if (!next) return c.json({ error: '零件已入库' }, 409)
  const result = await c.env.DB.prepare('UPDATE parts SET status = ? WHERE id = ? AND status = ? AND assignee_id = ?').bind(next, c.req.param('id'), part.status, part.assignee_id).run()
  if (!result.meta.changes) return c.json({ error: '状态已变化，请刷新后重试' }, 409)
  return c.json({ status: next })
})

app.notFound(c => c.json({ error: '接口不存在' }, 404))
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'api_error', message: error.message, path: c.req.path }))
  return c.json({ error: '服务暂不可用' }, 500)
})

export default app
