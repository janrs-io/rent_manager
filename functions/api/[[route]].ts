import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { SignJWT, jwtVerify } from 'jose'
import { compare, hash } from 'bcrypt-ts'

type Bindings = {
  DB: D1Database
  JWT_SECRET?: string
}

type Variables = {
  admin_id: number
  username: string
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api')

const DEFAULT_SECRET = new TextEncoder().encode('rent_manager_production_jwt_secret_key_2026')

async function getJwtKey(secretStr?: string) {
  if (secretStr && secretStr.trim().length > 0) {
    return new TextEncoder().encode(secretStr)
  }
  return DEFAULT_SECRET
}

// 严格校验中国大陆18位身份证并计算周岁，过滤非法/虚拟年份
function calcAge(idCard?: string | null): number {
  if (!idCard || idCard.trim().length !== 18) return 0
  const card = idCard.trim()
  const birthStr = card.slice(6, 14) // YYYYMMDD
  const y = parseInt(birthStr.slice(0, 4), 10)
  const m = parseInt(birthStr.slice(4, 6), 10)
  const d = parseInt(birthStr.slice(6, 8), 10)
  const now = new Date()
  const currentYear = now.getFullYear()

  // 严格过滤假数据、测试数据（如 11111111...）
  if (!y || !m || !d || y < 1920 || y > currentYear || m < 1 || m > 12 || d < 1 || d > 31) {
    return 0
  }
  let age = currentYear - y
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  if (currentMonth < m || (currentMonth === m && currentDay < d)) {
    age--
  }
  return Math.max(0, age)
}

// 自动根据在租人数同步房间状态 (有在租人则 occupied，无人则 vacant)
async function syncRoomStatus(db: D1Database, roomId: number) {
  if (!roomId) return
  const row = await db.prepare(
    "SELECT COUNT(*) as count FROM tenants WHERE room_id = ? AND status = 'active'"
  ).bind(roomId).first<{ count: number }>()

  const count = row?.count || 0
  const newStatus = count > 0 ? 'occupied' : 'vacant'

  await db.prepare(
    "UPDATE rooms SET status = ? WHERE id = ? AND status != 'maintenance'"
  ).bind(newStatus, roomId).run()
}

// -------------------------------------------------------------
// 1. 公开路由：登录
// -------------------------------------------------------------
app.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')

  if (!username || !password) {
    return c.json({ error: '用户名和密码不能为空' }, 400)
  }

  const admin = await c.env.DB.prepare(
    'SELECT id, username, password FROM admins WHERE username = ?'
  )
    .bind(username)
    .first<{ id: number; username: string; password: string }>()

  if (!admin) {
    return c.json({ error: '用户名或密码错误' }, 401)
  }

  const ok = await compare(password, admin.password)
  if (!ok) {
    return c.json({ error: '用户名或密码错误' }, 401)
  }

  const token = await new SignJWT({ admin_id: admin.id, username: admin.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(await getJwtKey(c.env.JWT_SECRET))

  return c.json({ token, username: admin.username })
})

// -------------------------------------------------------------
// 鉴权中间件
// -------------------------------------------------------------
app.use('/*', async (c, next) => {
  if (c.req.path === '/api/auth/login') {
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401)
  }

  const tokenStr = authHeader.slice(7).trim()
  try {
    const { payload } = await jwtVerify(tokenStr, await getJwtKey(c.env.JWT_SECRET))
    c.set('admin_id', Number(payload.admin_id))
    c.set('username', String(payload.username))
    return next()
  } catch {
    return c.json({ error: 'Token 无效或已过期' }, 401)
  }
})

// -------------------------------------------------------------
// 2. 修改密码
// -------------------------------------------------------------
app.post('/auth/change-password', async (c) => {
  const adminId = c.get('admin_id')
  const body = await c.req.json().catch(() => ({}))
  const oldPassword = String(body.old_password || '')
  const newPassword = String(body.new_password || '')

  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return c.json({ error: '新密码不能少于6位' }, 400)
  }

  const admin = await c.env.DB.prepare('SELECT id, password FROM admins WHERE id = ?')
    .bind(adminId)
    .first<{ id: number; password: string }>()

  if (!admin) {
    return c.json({ error: '管理员不存在' }, 404)
  }

  const ok = await compare(oldPassword, admin.password)
  if (!ok) {
    return c.json({ error: '原密码错误' }, 401)
  }

  const newHash = await hash(newPassword, 10)
  await c.env.DB.prepare(
    "UPDATE admins SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  )
    .bind(newHash, adminId)
    .run()

  return c.json({ ok: true })
})

// -------------------------------------------------------------
// 3. 统计看板
// -------------------------------------------------------------
app.get('/dashboard', async (c) => {
  const year = c.req.query('year') || String(new Date().getFullYear())

  // 年度实收汇总
  const summary = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(rent_amount), 0) AS total_rent,
      COALESCE(SUM(electric_fee), 0) AS total_electric_fee,
      COALESCE(SUM(electric_usage), 0) AS total_electric_usage,
      COALESCE(SUM(water_fee), 0) AS total_water_fee,
      COALESCE(SUM(water_usage), 0) AS total_water_usage,
      COALESCE(SUM(broadband_fee), 0) AS total_broadband_fee,
      COALESCE(SUM(ev_charge_fee), 0) AS total_ev_charge_fee,
      COALESCE(SUM(total_amount), 0) AS total_income
    FROM rent_bills
    WHERE strftime('%Y', paid_at) = ? AND is_collected = 1
  `)
    .bind(year)
    .first<{
      total_rent: number
      total_electric_fee: number
      total_electric_usage: number
      total_water_fee: number
      total_water_usage: number
      total_broadband_fee: number
      total_ev_charge_fee: number
      total_income: number
    }>()

  // 12 个月明细汇总
  const monthlyRows = await c.env.DB.prepare(`
    SELECT
      strftime('%m', paid_at) as month,
      COALESCE(SUM(rent_amount), 0) as rent,
      COALESCE(SUM(electric_fee), 0) as electric_fee,
      COALESCE(SUM(electric_usage), 0) as electric_usage,
      COALESCE(SUM(water_fee), 0) as water_fee,
      COALESCE(SUM(water_usage), 0) as water_usage,
      COALESCE(SUM(total_amount), 0) as total
    FROM rent_bills
    WHERE strftime('%Y', paid_at) = ? AND is_collected = 1
    GROUP BY month
    ORDER BY month ASC
  `)
    .bind(year)
    .all<{
      month: string
      rent: number
      electric_fee: number
      electric_usage: number
      water_fee: number
      water_usage: number
      total: number
    }>()

  const monthlyMap = new Map<string, any>()
  for (const row of monthlyRows.results || []) {
    monthlyMap.set(row.month, row)
  }

  const monthly = []
  for (let i = 1; i <= 12; i++) {
    const mStr = String(i).padStart(2, '0')
    const item = monthlyMap.get(mStr) || {
      month: mStr,
      rent: 0,
      electric_fee: 0,
      electric_usage: 0,
      water_fee: 0,
      water_usage: 0,
      total: 0,
    }
    monthly.push(item)
  }

  return c.json({
    year,
    total: {
      rent: summary?.total_rent || 0,
      electric_fee: summary?.total_electric_fee || 0,
      electric_usage: summary?.total_electric_usage || 0,
      water_fee: summary?.total_water_fee || 0,
      water_usage: summary?.total_water_usage || 0,
      broadband_fee: summary?.total_broadband_fee || 0,
      ev_charge_fee: summary?.total_ev_charge_fee || 0,
      total_income: summary?.total_income || 0,
    },
    monthly,
  })
})

// -------------------------------------------------------------
// 4. 房间管理 (Rooms API - 解决起度向上回溯最后非0数据、状态动态同步)
// -------------------------------------------------------------
app.get('/rooms', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      r.*,
      COUNT(CASE WHEN t.status = 'active' THEN t.id ELSE NULL END) as tenant_count,
      GROUP_CONCAT(CASE WHEN t.status = 'active' THEN t.name ELSE NULL END, '、') as active_tenants,
      COALESCE((
        SELECT b.electric_end FROM rent_bills b
        WHERE (b.room_id = r.id OR b.room_no = r.room_no) AND b.electric_end > 0
        ORDER BY b.paid_at DESC, b.id DESC LIMIT 1
      ), 0) as last_electric_end,
      (
        SELECT b.paid_at FROM rent_bills b
        WHERE (b.room_id = r.id OR b.room_no = r.room_no) AND b.electric_end > 0
        ORDER BY b.paid_at DESC, b.id DESC LIMIT 1
      ) as last_electric_date,
      COALESCE((
        SELECT b.water_end FROM rent_bills b
        WHERE (b.room_id = r.id OR b.room_no = r.room_no) AND b.water_end > 0
        ORDER BY b.paid_at DESC, b.id DESC LIMIT 1
      ), 0) as last_water_end,
      (
        SELECT b.paid_at FROM rent_bills b
        WHERE (b.room_id = r.id OR b.room_no = r.room_no) AND b.water_end > 0
        ORDER BY b.paid_at DESC, b.id DESC LIMIT 1
      ) as last_water_date,
      (SELECT b.renew_date FROM rent_bills b WHERE (b.room_id = r.id OR b.room_no = r.room_no) ORDER BY b.paid_at DESC, b.id DESC LIMIT 1) as last_renew_date,
      (SELECT MAX(b.paid_at) FROM rent_bills b WHERE (b.room_id = r.id OR b.room_no = r.room_no)) as last_paid_at,
      (SELECT b.is_collected FROM rent_bills b WHERE (b.room_id = r.id OR b.room_no = r.room_no) ORDER BY b.paid_at DESC, b.id DESC LIMIT 1) as last_is_collected
    FROM rooms r
    LEFT JOIN tenants t ON t.room_id = r.id
    GROUP BY r.id
    ORDER BY r.room_no ASC
  `).all()

  const formatOriginMonth = (dateStr: string | null) => {
    if (!dateStr) return null
    const parts = dateStr.slice(0, 7).split('-')
    if (parts.length === 2) {
      return `${parts[0]}年${parseInt(parts[1], 10)}月`
    }
    return dateStr.slice(0, 7)
  }

  // 动态校准房间状态（若无人且非维修状态，即为空置），并标注非0抄表年月
  const list = (results || []).map((r: any) => {
    let effectiveStatus = r.status
    if (r.status !== 'maintenance') {
      effectiveStatus = r.tenant_count > 0 ? 'occupied' : 'vacant'
    }
    return {
      ...r,
      last_electric_end: Number(r.last_electric_end || 0),
      last_electric_date: r.last_electric_date || null,
      last_electric_month: formatOriginMonth(r.last_electric_date),
      last_water_end: Number(r.last_water_end || 0),
      last_water_date: r.last_water_date || null,
      last_water_month: formatOriginMonth(r.last_water_date),
      status: effectiveStatus,
    }
  })

  return c.json(list)
})

app.post('/rooms', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const roomNo = String(body.room_no || '').trim()
  const baseRent = parseFloat(body.base_rent) || 0
  const baseDeposit = parseFloat(body.base_deposit) || 0
  const electricPrice = parseFloat(body.electric_price) || 1.0
  const waterPrice = parseFloat(body.water_price) || 4.5
  const status = body.status === 'occupied' ? 'occupied' : 'vacant'
  const note = body.note ? String(body.note).trim() : null

  if (!roomNo || baseRent <= 0) {
    return c.json({ error: '房间号不能为空，且月租金必须大于0' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM rooms WHERE room_no = ?').bind(roomNo).first()
  if (existing) {
    return c.json({ error: '该房间号已存在' }, 400)
  }

  const res = await c.env.DB.prepare(`
    INSERT INTO rooms (room_no, base_rent, base_deposit, electric_price, water_price, status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(roomNo, baseRent, baseDeposit, electricPrice, waterPrice, status, note).run()

  return c.json({ id: res.meta.last_row_id, ok: true }, 201)
})

app.put('/rooms/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const roomNo = String(body.room_no || '').trim()
  const baseRent = parseFloat(body.base_rent) || 0
  const baseDeposit = parseFloat(body.base_deposit) || 0
  const electricPrice = parseFloat(body.electric_price) || 1.0
  const waterPrice = parseFloat(body.water_price) || 4.5
  const status = ['occupied', 'vacant', 'maintenance'].includes(body.status) ? body.status : 'vacant'
  const note = body.note ? String(body.note).trim() : null

  if (!roomNo || baseRent <= 0) {
    return c.json({ error: '房间号不能为空，且月租金必须大于0' }, 400)
  }

  const dup = await c.env.DB.prepare('SELECT id FROM rooms WHERE room_no = ? AND id != ?').bind(roomNo, id).first()
  if (dup) {
    return c.json({ error: '该房间号已被其他房间使用' }, 400)
  }

  const res = await c.env.DB.prepare(`
    UPDATE rooms SET
      room_no = ?, base_rent = ?, base_deposit = ?,
      electric_price = ?, water_price = ?, status = ?, note = ?
    WHERE id = ?
  `).bind(roomNo, baseRent, baseDeposit, electricPrice, waterPrice, status, note, id).run()

  if (res.meta.changes === 0) {
    return c.json({ error: '房间不存在' }, 404)
  }

  await c.env.DB.prepare('UPDATE tenants SET room_no = ? WHERE room_id = ?').bind(roomNo, id).run()
  await syncRoomStatus(c.env.DB, id)

  return c.json({ ok: true })
})

app.delete('/rooms/:id', async (c) => {
  const id = Number(c.req.param('id'))

  const activeCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM tenants WHERE room_id = ? AND status = 'active'"
  ).bind(id).first<{ count: number }>()

  if ((activeCount?.count || 0) > 0) {
    return c.json({ error: '该房间内尚有在租租客，禁止删除！请先办理退租或移出租客' }, 409)
  }

  const billCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM rent_bills WHERE room_id = ?"
  ).bind(id).first<{ count: number }>()

  if ((billCount?.count || 0) > 0) {
    return c.json({ error: '该房间有关联的历史收租流水账单，为防财务篡改禁止删除！建议将状态改为【空置】' }, 409)
  }

  const res = await c.env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run()
  if (res.meta.changes === 0) {
    return c.json({ error: '房间不存在' }, 404)
  }
  return c.json({ ok: true })
})

// -------------------------------------------------------------
// 5. 租客管理 (Tenants API - 状态自动级联房间)
// -------------------------------------------------------------
app.get('/tenants', async (c) => {
  const statusParam = c.req.query('status')

  let sql = `
    SELECT
      t.*,
      r.base_rent,
      r.base_deposit,
      r.electric_price,
      r.water_price,
      (SELECT MAX(b.paid_at) FROM rent_bills b WHERE b.room_no = t.room_no) as last_paid_at,
      (SELECT b.is_collected FROM rent_bills b WHERE b.room_no = t.room_no ORDER BY b.paid_at DESC, b.id DESC LIMIT 1) as last_is_collected,
      (SELECT b.renew_date FROM rent_bills b WHERE b.room_no = t.room_no ORDER BY b.paid_at DESC, b.id DESC LIMIT 1) as last_renew_date
    FROM tenants t
    JOIN rooms r ON r.id = t.room_id
  `
  const params: any[] = []
  if (statusParam && statusParam !== 'all') {
    sql += ' WHERE t.status = ?'
    params.push(statusParam)
  }
  sql += ' ORDER BY t.status ASC, t.room_no ASC, t.is_primary DESC, t.id ASC'

  const stmt = c.env.DB.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()

  const list = (results || []).map((t: any) => ({
    ...t,
    rent_amount: t.base_rent,
    deposit: t.base_deposit,
    age: calcAge(t.id_card),
  }))

  return c.json(list)
})

app.post('/tenants', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const roomNo = String(body.room_no || '').trim()
  const gender = ['male', 'female'].includes(body.gender) ? body.gender : 'unknown'
  const phone = body.phone ? String(body.phone).trim() : null
  const idCard = body.id_card ? String(body.id_card).trim() : null
  const address = body.address ? String(body.address).trim() : null
  const moveInDate = String(body.move_in_date || '')
  const rentAmount = parseFloat(body.rent_amount) || 0
  const deposit = parseFloat(body.deposit) || 0
  const isPrimary = body.is_primary === 0 ? 0 : 1

  if (!name || !roomNo || !moveInDate || rentAmount <= 0) {
    return c.json({ error: '请填写租客姓名、房间号、起租入住日期，且租金必须大于0' }, 400)
  }

  // 查找或自动创建房间
  let room = await c.env.DB.prepare('SELECT id FROM rooms WHERE room_no = ?').bind(roomNo).first<{ id: number }>()
  if (!room) {
    const res = await c.env.DB.prepare(`
      INSERT INTO rooms (room_no, base_rent, base_deposit, status)
      VALUES (?, ?, ?, 'occupied')
    `).bind(roomNo, rentAmount, deposit).run()
    room = { id: Number(res.meta.last_row_id) }
  }

  const insertRes = await c.env.DB.prepare(`
    INSERT INTO tenants (room_id, room_no, name, is_primary, gender, phone, id_card, address, move_in_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).bind(room.id, roomNo, name, isPrimary, gender, phone, idCard, address, moveInDate).run()

  // 联动房间状态为 occupied
  await syncRoomStatus(c.env.DB, room.id)

  return c.json({ id: insertRes.meta.last_row_id, ok: true }, 201)
})

app.put('/tenants/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const roomNo = String(body.room_no || '').trim()
  const gender = ['male', 'female'].includes(body.gender) ? body.gender : 'unknown'
  const phone = body.phone ? String(body.phone).trim() : null
  const idCard = body.id_card ? String(body.id_card).trim() : null
  const address = body.address ? String(body.address).trim() : null
  const moveInDate = String(body.move_in_date || '')
  const status = body.status === 'inactive' ? 'inactive' : 'active'
  const isPrimary = body.is_primary === 0 ? 0 : 1
  const moveOutDate = body.move_out_date ? String(body.move_out_date) : (status === 'inactive' ? new Date().toISOString().slice(0, 10) : null)

  if (!name || !roomNo || !moveInDate) {
    return c.json({ error: '请填写姓名、房间号与起租日期' }, 400)
  }

  // 获取该租客当前记录以防跨房间换房
  const currentTenant = await c.env.DB.prepare('SELECT room_id FROM tenants WHERE id = ?').bind(id).first<{ room_id: number }>()
  if (!currentTenant) {
    return c.json({ error: '租客不存在' }, 404)
  }

  let room = await c.env.DB.prepare('SELECT id FROM rooms WHERE room_no = ?').bind(roomNo).first<{ id: number }>()
  if (!room) {
    const rentAmount = parseFloat(body.rent_amount) || 0
    const deposit = parseFloat(body.deposit) || 0
    const res = await c.env.DB.prepare(
      "INSERT INTO rooms (room_no, base_rent, base_deposit, status) VALUES (?, ?, ?, 'occupied')"
    ).bind(roomNo, rentAmount, deposit).run()
    room = { id: Number(res.meta.last_row_id) }
  }

  await c.env.DB.prepare(`
    UPDATE tenants SET
      room_id = ?, room_no = ?, name = ?, is_primary = ?, gender = ?,
      phone = ?, id_card = ?, address = ?, move_in_date = ?,
      move_out_date = ?, status = ?
    WHERE id = ?
  `).bind(room.id, roomNo, name, isPrimary, gender, phone, idCard, address, moveInDate, moveOutDate, status, id).run()

  // 状态级联同步：原房间与新房间均同步状态
  if (currentTenant.room_id !== room.id) {
    await syncRoomStatus(c.env.DB, currentTenant.room_id)
  }
  await syncRoomStatus(c.env.DB, room.id)

  return c.json({ ok: true })
})

app.delete('/tenants/:id', async (c) => {
  const id = Number(c.req.param('id'))

  const tenant = await c.env.DB.prepare('SELECT room_id FROM tenants WHERE id = ?').bind(id).first<{ room_id: number }>()
  if (!tenant) {
    return c.json({ error: '租客不存在' }, 404)
  }

  const billCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM rent_bills WHERE tenant_id = ?'
  ).bind(id).first<{ count: number }>()

  if ((billCount?.count || 0) > 0) {
    return c.json({ error: '该租客关联有历史收租流水，为防财务对账失效禁止物理删除！建议在档案中办理【退租】。' }, 409)
  }

  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run()
  await syncRoomStatus(c.env.DB, tenant.room_id)

  return c.json({ ok: true })
})

// -------------------------------------------------------------
// 6. 退租清算 (Checkout Settlement API - 完善押金清算闭环)
// -------------------------------------------------------------
app.post('/checkout', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const tenantId = Number(body.tenant_id)
  const checkoutDate = String(body.checkout_date || new Date().toISOString().slice(0, 10))
  const depositPaid = parseFloat(body.deposit_amount) || 0
  const deductRent = parseFloat(body.deduct_rent) || 0
  const deductUtility = parseFloat(body.deduct_utility) || 0
  const deductDamage = parseFloat(body.deduct_damage) || 0
  const refundAmount = Math.max(0, Math.round((depositPaid - deductRent - deductUtility - deductDamage) * 100) / 100)
  const note = body.note ? String(body.note).trim() : null

  const tenant = await c.env.DB.prepare(
    'SELECT id, room_id, room_no, name FROM tenants WHERE id = ?'
  ).bind(tenantId).first<{ id: number; room_id: number; room_no: string; name: string }>()

  if (!tenant) {
    return c.json({ error: '租客不存在' }, 404)
  }

  // 1. 记录退租结算日志
  await c.env.DB.prepare(`
    INSERT INTO checkout_logs (room_id, room_no, tenant_id, checkout_date, deposit_amount, deduct_rent, deduct_utility, deduct_damage, refund_amount, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenant.room_id, tenant.room_no, tenant.id, checkoutDate,
    depositPaid, deductRent, deductUtility, deductDamage, refundAmount, note
  ).run()

  // 2. 将租客设为 inactive
  await c.env.DB.prepare(`
    UPDATE tenants SET status = 'inactive', move_out_date = ? WHERE id = ?
  `).bind(checkoutDate, tenant.id).run()

  // 3. 自动同步房间在租状态
  await syncRoomStatus(c.env.DB, tenant.room_id)

  return c.json({
    ok: true,
    refund_amount: refundAmount,
    message: `租客「${tenant.name}」退租结算完成，实退押金 ¥${refundAmount.toFixed(2)}`
  })
})

// -------------------------------------------------------------
// 7. 收租记录与账单 (Rent Records API - 支持自动账期、起度预填)
// -------------------------------------------------------------
app.get('/rent-records', async (c) => {
  const year = c.req.query('year')
  const month = c.req.query('month')
  const roomNo = c.req.query('room_no')

  let sql = 'SELECT * FROM rent_bills WHERE 1=1'
  const params: any[] = []

  if (year && month) {
    sql += " AND strftime('%Y', paid_at) = ? AND strftime('%m', paid_at) = ?"
    params.push(year, month.padStart(2, '0'))
  } else if (year) {
    sql += " AND strftime('%Y', paid_at) = ?"
    params.push(year)
  }

  if (roomNo) {
    sql += ' AND room_no = ?'
    params.push(roomNo)
  }

  sql += ' ORDER BY paid_at DESC, room_no ASC, id DESC'

  const stmt = c.env.DB.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()

  const list = (results || []).map((b: any) => ({
    ...b,
    amount: b.rent_amount,
    tenant_name: b.tenant_names,
    total: b.total_amount,
    is_collected: b.is_collected === 1,
  }))

  return c.json(list)
})

app.post('/rent-records', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  let roomId = Number(body.room_id)
  let roomNo = String(body.room_no || '').trim()

  const rentAmount = parseFloat(body.amount ?? body.rent_amount) || 0
  const paidAt = String(body.paid_at || '')
  const periodStart = body.period_start ? String(body.period_start) : null
  const periodEnd = body.period_end ? String(body.period_end) : null
  const renewDate = body.renew_date ? String(body.renew_date) : null
  const note = body.note ? String(body.note).trim() : null

  const eStart = parseFloat(body.electric_start) || 0
  const eEnd = parseFloat(body.electric_end) || 0
  const ePrice = parseFloat(body.electric_price) || 1.0

  const wStart = parseFloat(body.water_start) || 0
  const wEnd = parseFloat(body.water_end) || 0
  const wPrice = parseFloat(body.water_price) || 4.5

  const broadband = parseFloat(body.broadband_fee) || 0
  const evCharge = parseFloat(body.ev_charge_fee) || 0
  const otherFee = parseFloat(body.other_fee) || 0
  const isCollected = body.is_collected ? 1 : 0
  const payMethod = body.pay_method || 'wechat'

  if (!paidAt || rentAmount <= 0) {
    return c.json({ error: '请填写收租收款日期，且月租金必须大于0' }, 400)
  }
  if (eEnd < eStart) {
    return c.json({ error: '电表止度不能小于起度' }, 400)
  }
  if (wEnd < wStart) {
    return c.json({ error: '水表止度不能小于起度' }, 400)
  }

  let room = null
  if (roomId) {
    room = await c.env.DB.prepare('SELECT id, room_no FROM rooms WHERE id = ?').bind(roomId).first<{ id: number; room_no: string }>()
  } else if (roomNo) {
    room = await c.env.DB.prepare('SELECT id, room_no FROM rooms WHERE room_no = ?').bind(roomNo).first<{ id: number; room_no: string }>()
  }

  if (!room) {
    return c.json({ error: '请选择有效房间' }, 400)
  }
  roomId = room.id
  roomNo = room.room_no

  // 查询当前房间在租租客
  const activeTenants = await c.env.DB.prepare(
    "SELECT id, name FROM tenants WHERE room_id = ? AND status = 'active' ORDER BY is_primary DESC, id ASC"
  ).bind(roomId).all<{ id: number; name: string }>()

  const tNames = (activeTenants.results || []).map(t => t.name).join('、') || '空置期账单'
  const primaryTenantId = activeTenants.results?.[0]?.id || null

  const eUsage = Math.max(0, Math.round((eEnd - eStart) * 100) / 100)
  const eFee = Math.round(eUsage * ePrice * 100) / 100

  const wUsage = Math.max(0, Math.round((wEnd - wStart) * 100) / 100)
  const wFee = Math.round(wUsage * wPrice * 100) / 100

  const total = Math.round((rentAmount + eFee + wFee + broadband + evCharge + otherFee) * 100) / 100
  const billNo = `BILL-${paidAt.slice(0, 7).replace('-', '')}-${roomNo}-${Date.now().toString().slice(-4)}`

  const res = await c.env.DB.prepare(`
    INSERT INTO rent_bills (
      bill_no, room_id, room_no, tenant_id, tenant_names,
      period_start, period_end, paid_at, renew_date,
      rent_amount, electric_start, electric_end, electric_price, electric_usage, electric_fee,
      water_start, water_end, water_price, water_usage, water_fee,
      broadband_fee, ev_charge_fee, other_fee, total_amount, is_collected, pay_method, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    billNo, roomId, roomNo, primaryTenantId, tNames,
    periodStart, periodEnd, paidAt, renewDate,
    rentAmount, eStart, eEnd, ePrice, eUsage, eFee,
    wStart, wEnd, wPrice, wUsage, wFee,
    broadband, evCharge, otherFee, total, isCollected, payMethod, note
  ).run()

  return c.json({ id: res.meta.last_row_id, ok: true }, 201)
})

app.put('/rent-records/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))

  const rentAmount = parseFloat(body.amount ?? body.rent_amount) || 0
  const paidAt = String(body.paid_at || '')
  const periodStart = body.period_start ? String(body.period_start) : null
  const periodEnd = body.period_end ? String(body.period_end) : null
  const renewDate = body.renew_date ? String(body.renew_date) : null
  const note = body.note ? String(body.note).trim() : null

  const eStart = parseFloat(body.electric_start) || 0
  const eEnd = parseFloat(body.electric_end) || 0
  const ePrice = parseFloat(body.electric_price) || 1.0

  const wStart = parseFloat(body.water_start) || 0
  const wEnd = parseFloat(body.water_end) || 0
  const wPrice = parseFloat(body.water_price) || 4.5

  const broadband = parseFloat(body.broadband_fee) || 0
  const evCharge = parseFloat(body.ev_charge_fee) || 0
  const otherFee = parseFloat(body.other_fee) || 0
  const isCollected = body.is_collected ? 1 : 0
  const payMethod = body.pay_method || 'wechat'

  if (!paidAt || rentAmount <= 0) {
    return c.json({ error: '请填写收租收款日期，且月租金必须大于0' }, 400)
  }
  if (eEnd < eStart) {
    return c.json({ error: '电表止度不能小于起度' }, 400)
  }
  if (wEnd < wStart) {
    return c.json({ error: '水表止度不能小于起度' }, 400)
  }

  const eUsage = Math.max(0, Math.round((eEnd - eStart) * 100) / 100)
  const eFee = Math.round(eUsage * ePrice * 100) / 100

  const wUsage = Math.max(0, Math.round((wEnd - wStart) * 100) / 100)
  const wFee = Math.round(wUsage * wPrice * 100) / 100

  const total = Math.round((rentAmount + eFee + wFee + broadband + evCharge + otherFee) * 100) / 100

  const res = await c.env.DB.prepare(`
    UPDATE rent_bills SET
      rent_amount = ?, period_start = ?, period_end = ?, paid_at = ?, renew_date = ?,
      electric_start = ?, electric_end = ?, electric_price = ?, electric_usage = ?, electric_fee = ?,
      water_start = ?, water_end = ?, water_price = ?, water_usage = ?, water_fee = ?,
      broadband_fee = ?, ev_charge_fee = ?, other_fee = ?, total_amount = ?, is_collected = ?, pay_method = ?, note = ?
    WHERE id = ?
  `).bind(
    rentAmount, periodStart, periodEnd, paidAt, renewDate,
    eStart, eEnd, ePrice, eUsage, eFee,
    wStart, wEnd, wPrice, wUsage, wFee,
    broadband, evCharge, otherFee, total, isCollected, payMethod, note, id
  ).run()

  if (res.meta.changes === 0) {
    return c.json({ error: '账单不存在' }, 404)
  }
  return c.json({ ok: true })
})

app.put('/rent-records/:id/collect', async (c) => {
  const id = Number(c.req.param('id'))
  const res = await c.env.DB.prepare(`
    UPDATE rent_bills SET is_collected = CASE WHEN is_collected = 1 THEN 0 ELSE 1 END WHERE id = ?
  `).bind(id).run()

  if (res.meta.changes === 0) {
    return c.json({ error: '账单不存在' }, 404)
  }
  return c.json({ ok: true })
})

app.delete('/rent-records/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const res = await c.env.DB.prepare('DELETE FROM rent_bills WHERE id = ?').bind(id).run()
  if (res.meta.changes === 0) {
    return c.json({ error: '账单不存在' }, 404)
  }
  return c.json({ ok: true })
})

export const onRequest = handle(app)
