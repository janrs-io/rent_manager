requireAuth();
initUserAvatar();

(function() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('todayDate').textContent = `${y}年${m}月${d}日`;
})();

function formatDate(str) {
  if (!str) return '-';
  const date = str.slice(0, 10);
  const [y, m, d] = date.split('-');
  return `${y}/${m}/${d}`;
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(val) {
  return escapeHtml(val);
}

let allTenants = [];

async function loadTenants() {
  const res = await request('GET', '/api/tenants');
  if (!res || !res.ok) return;
  allTenants = await res.json();
  filterTenants();
}

function filterTenants() {
  const kw = document.getElementById('filterKeyword').value.trim().toLowerCase();
  const statusFilter = document.getElementById('filterStatus').value;

  const filtered = allTenants.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (kw) {
      const matchName = String(t.name || '').toLowerCase().includes(kw);
      const matchRoom = String(t.room_no || '').toLowerCase().includes(kw);
      const matchPhone = String(t.phone || '').toLowerCase().includes(kw);
      const matchId = String(t.id_card || '').toLowerCase().includes(kw);
      if (!matchName && !matchRoom && !matchPhone && !matchId) return false;
    }
    return true;
  });

  renderTenantList(filtered);
}

function getGenderPill(gender) {
  if (gender === 'male') {
    return `<span class="gender-pill gender-pill-male" title="男">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="14" r="5"></circle>
        <line x1="19" y1="5" x2="13.5" y2="10.5"></line>
        <polyline points="15 5 19 5 19 9"></polyline>
      </svg>
    </span>`;
  } else if (gender === 'female') {
    return `<span class="gender-pill gender-pill-female" title="女">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="9" r="5"></circle>
        <line x1="12" y1="14" x2="12" y2="21"></line>
        <line x1="8.5" y1="17.5" x2="15.5" y2="17.5"></line>
      </svg>
    </span>`;
  }
  return '';
}

function getGenderTag(gender) {
  if (gender === 'male') {
    return `<span class="gender-tag gender-tag-male">男</span>`;
  } else if (gender === 'female') {
    return `<span class="gender-tag gender-tag-female">女</span>`;
  }
  return `<span class="gender-tag gender-tag-unknown">未知</span>`;
}

function renderTenantList(list) {
  const tbody = document.getElementById('tenantBody');
  tbody.innerHTML = '';

  const activeCount = allTenants.filter(t => t.status === 'active').length;
  const inactiveCount = allTenants.filter(t => t.status === 'inactive').length;
  document.getElementById('tenantCountBadge').textContent = `共 ${activeCount} 位在租租客 · ${inactiveCount} 位历史租客`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:36px;color:#a1a1aa">暂无符合条件的租客档案</td></tr>';
    return;
  }

  list.forEach(t => {
    const tr = document.createElement('tr');
    tr.className = 'row-hover';

    const isPrimary = t.is_primary === 1;
    const roleBadge = isPrimary
      ? '<span class="badge badge-gray" style="font-weight:600;">主承租人</span>'
      : '<span class="badge" style="background:#fafafc;border-color:#e4e4e7;color:#71717a;">合租同住</span>';

    const genderIcon = getGenderPill(t.gender);
    const genderTag = getGenderTag(t.gender);
    const ageText = (t.age && t.age > 0 && t.age < 120) ? `<span style="color:#71717a;margin-left:4px;">· ${t.age}岁</span>` : '';

    const statusBadge = t.status === 'active'
      ? '<span class="badge badge-green">在租中</span>'
      : '<span class="badge badge-gray">已退租</span>';

    // 核心业务：在租时提供专业的【退租结算】；已退租时支持【重新入住】
    const statusActionBtn = t.status === 'active'
      ? `<button class="btn-action btn-action-danger" onclick="openCheckoutModal(${escapeAttr(JSON.stringify(t))})">结算退租</button>`
      : `<button class="btn-action" onclick="toggleTenantStatus(${t.id}, 'active')">重新入住</button>`;

    tr.innerHTML = `
      <td style="font-weight: 600; color: #18181b;">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <span>${escapeHtml(t.name)}</span>
          ${genderIcon}
        </div>
      </td>
      <td>${roleBadge}</td>
      <td><span class="room-badge">${escapeHtml(t.room_no)} 房</span></td>
      <td>
        <div style="display:inline-flex;align-items:center;">
          ${genderTag}${ageText}
        </div>
      </td>
      <td style="font-family:ui-monospace, monospace;font-size:12px;">${escapeHtml(t.phone || '-')}</td>
      <td style="font-family:ui-monospace, monospace;font-size:12px;color:#71717a;">${escapeHtml(t.id_card || '-')}</td>
      <td style="color:#52525b;">${formatDate(t.move_in_date)}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">
        <div style="display:inline-flex;gap:4px;">
          <button class="btn-action" onclick="showTenantDetail(${escapeAttr(JSON.stringify(t))})">档案</button>
          <button class="btn-action btn-action-primary" onclick="openModal(${escapeAttr(JSON.stringify(t))})">编辑</button>
          ${statusActionBtn}
          <button class="btn-action" onclick="deleteTenant(${t.id}, '${escapeAttr(t.name)}')">删除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openModal(tenant) {
  document.getElementById('tenantForm').reset();
  document.getElementById('modalMask').style.display = 'flex';

  if (tenant) {
    document.getElementById('modalTitle').textContent = `编辑租客档案 · ${tenant.name}`;
    document.getElementById('tenantId').value = tenant.id;
    document.getElementById('name').value = tenant.name;
    document.getElementById('gender').value = tenant.gender || 'unknown';
    document.getElementById('phone').value = tenant.phone || '';
    document.getElementById('id_card').value = tenant.id_card || '';
    document.getElementById('address').value = tenant.address || '';
    document.getElementById('room_no').value = tenant.room_no;
    document.getElementById('move_in_date').value = tenant.move_in_date ? tenant.move_in_date.slice(0, 10) : '';
    document.getElementById('rent_amount').value = tenant.rent_amount || tenant.base_rent || '';
    document.getElementById('deposit').value = tenant.deposit || tenant.base_deposit || '';
    document.getElementById('is_primary').value = tenant.is_primary ?? 1;
    document.getElementById('status').value = tenant.status || 'active';
  } else {
    document.getElementById('modalTitle').textContent = '录入新租客';
    document.getElementById('tenantId').value = '';
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    document.getElementById('move_in_date').value = `${y}-${m}-${d}`;
    document.getElementById('is_primary').value = '1';
    document.getElementById('status').value = 'active';
  }
}

function closeModal() {
  document.getElementById('modalMask').style.display = 'none';
}

async function submitTenantForm() {
  const id = document.getElementById('tenantId').value;
  const body = {
    name:         document.getElementById('name').value.trim(),
    gender:       document.getElementById('gender').value,
    phone:        document.getElementById('phone').value.trim(),
    id_card:      document.getElementById('id_card').value.trim(),
    address:      document.getElementById('address').value.trim(),
    room_no:      document.getElementById('room_no').value.trim(),
    move_in_date: document.getElementById('move_in_date').value,
    is_primary:   parseInt(document.getElementById('is_primary').value, 10) || 1,
    rent_amount:  parseFloat(document.getElementById('rent_amount').value) || 0,
    deposit:      parseFloat(document.getElementById('deposit').value) || 0,
    status:       document.getElementById('status').value || 'active',
  };

  if (!body.name || !body.room_no || !body.move_in_date || body.rent_amount <= 0) {
    alert('请填写租客姓名、房间号、入住日期，且月租金必须大于0');
    return;
  }

  const res = id
    ? await request('PUT', `/api/tenants/${id}`, body)
    : await request('POST', '/api/tenants', body);

  if (res && res.ok) {
    closeModal();
    loadTenants();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '保存租客档案失败');
  }
}

// -------------------------------------------------------------
// 退租清算流程 (结算押金与扣款)
// -------------------------------------------------------------
function openCheckoutModal(tenant) {
  document.getElementById('checkoutForm').reset();
  document.getElementById('checkoutTenantId').value = tenant.id;
  const dep = parseFloat(tenant.deposit || tenant.base_deposit || 0);
  document.getElementById('checkoutDepositPaid').value = dep;
  document.getElementById('checkoutTenantDesc').textContent = `${tenant.name} (${tenant.room_no} 房)`;
  document.getElementById('checkoutDepositDisplay').textContent = `¥${dep.toFixed(2)}`;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('checkout_date').value = `${y}-${m}-${d}`;

  calcCheckoutRefund();
  document.getElementById('checkoutModalMask').style.display = 'flex';
}

function closeCheckoutModal() {
  document.getElementById('checkoutModalMask').style.display = 'none';
}

function calcCheckoutRefund() {
  const deposit = parseFloat(document.getElementById('checkoutDepositPaid').value) || 0;
  const deductRent = parseFloat(document.getElementById('deduct_rent').value) || 0;
  const deductUtil = parseFloat(document.getElementById('deduct_utility').value) || 0;
  const deductDmg = parseFloat(document.getElementById('deduct_damage').value) || 0;

  const totalDeduct = deductRent + deductUtil + deductDmg;
  const refund = Math.max(0, deposit - totalDeduct);
  document.getElementById('checkoutRefundDisplay').textContent = `¥${refund.toFixed(2)}`;
}

async function submitCheckoutForm() {
  const tenantId = document.getElementById('checkoutTenantId').value;
  const body = {
    tenant_id:      parseInt(tenantId, 10),
    checkout_date:  document.getElementById('checkout_date').value,
    deposit_amount: parseFloat(document.getElementById('checkoutDepositPaid').value) || 0,
    deduct_rent:    parseFloat(document.getElementById('deduct_rent').value) || 0,
    deduct_utility: parseFloat(document.getElementById('deduct_utility').value) || 0,
    deduct_damage:  parseFloat(document.getElementById('deduct_damage').value) || 0,
    note:           document.getElementById('checkout_note').value.trim(),
  };

  if (!body.checkout_date) {
    alert('请选择退租搬离日期');
    return;
  }

  const res = await request('POST', '/api/checkout', body);
  if (res && res.ok) {
    const data = await res.json();
    closeCheckoutModal();
    loadTenants();
    alert(data.message || '退租结算办理成功！');
  } else if (res) {
    const data = await res.json();
    alert(data.error || '办理退租结算失败');
  }
}

async function toggleTenantStatus(id, newStatus) {
  const actionText = newStatus === 'active' ? '恢复在租' : '退租';
  if (!confirm(`确认将该租客设为【${actionText}】状态？`)) return;

  const t = allTenants.find(item => item.id === id);
  if (!t) return;

  const body = {
    name:         t.name,
    gender:       t.gender,
    phone:        t.phone || '',
    id_card:      t.id_card || '',
    address:      t.address || '',
    room_no:      t.room_no,
    move_in_date: t.move_in_date ? t.move_in_date.slice(0, 10) : '',
    rent_amount:  t.rent_amount || t.base_rent,
    deposit:      t.deposit || t.base_deposit,
    is_primary:   t.is_primary,
    status:       newStatus,
  };

  const res = await request('PUT', `/api/tenants/${id}`, body);
  if (res && res.ok) {
    loadTenants();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '状态切换失败');
  }
}

async function deleteTenant(id, name) {
  if (!confirm(`确认永久删除租客「${name}」？注意：有收租账单关联的租客禁止删除，建议办理退租。`)) return;
  const res = await request('DELETE', `/api/tenants/${id}`);
  if (res && res.ok) {
    loadTenants();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '删除失败');
  }
}

function showTenantDetail(t) {
  const genderIcon = getGenderPill(t.gender);
  const genderTag = getGenderTag(t.gender);
  const ageDisplay = (t.age && t.age > 0 && t.age < 120) ? ` · ${t.age}周岁` : '';

  document.getElementById('tenantDetailContent').innerHTML = `
    <div style="background:#f9f9fb;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <span style="font-size:17px;font-weight:700;color:#09090b;">${escapeHtml(t.name)}</span>
          ${genderIcon}
        </div>
        <span class="room-badge">${escapeHtml(t.room_no)} 房</span>
      </div>
      <div style="font-size:12px;color:#71717a;margin-top:6px;display:flex;align-items:center;gap:6px;">
        ${genderTag}
        <span>${ageDisplay ? ageDisplay.slice(3) : ''} · ${t.is_primary === 1 ? '主承租人' : '合租同住人'}</span>
      </div>
    </div>

    <div style="font-size:12.5px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">身份证号</span><span style="font-family:monospace">${escapeHtml(t.id_card || '-')}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">联系手机</span><span style="font-family:monospace">${escapeHtml(t.phone || '-')}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">户籍/原籍地址</span><span>${escapeHtml(t.address || '-')}</span></div>
      <div class="cell-divider"></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">月租金</span><span style="font-weight:600;color:#18181b;">¥${Number(t.rent_amount || t.base_rent || 0).toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">交存押金</span><span>¥${Number(t.deposit || t.base_deposit || 0).toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">起租入住日</span><span>${formatDate(t.move_in_date)}</span></div>
      ${t.move_out_date ? `<div style="display:flex;justify-content:space-between;"><span style="color:#71717a">搬离退租日</span><span>${formatDate(t.move_out_date)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;"><span style="color:#71717a">当前在租状态</span><span>${t.status === 'active' ? '<span class="badge badge-green">在租中</span>' : '<span class="badge badge-gray">已退租</span>'}</span></div>
    </div>
  `;
  document.getElementById('tenantDetailMask').style.display = 'flex';
}

function closeTenantDetail() {
  document.getElementById('tenantDetailMask').style.display = 'none';
}

loadTenants();
