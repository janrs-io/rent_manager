requireAuth();
initUserAvatar();

// 显示今天日期
(function() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('todayDate').textContent = `${y}年${m}月${d}日`;
})();

function formatDate(str) {
  if (!str) return '-';
  const date = str.slice(0, 10); // 只取 YYYY-MM-DD 部分
  const [y, m, d] = date.split('-');
  return `${y}年${m}月${d}日`;
}

const genderMap = { male: '男', female: '女', unknown: '未知' };
const statusMap = { active: '在租', inactive: '已退租' };

async function loadTenants() {
  const res = await request('GET', '/api/tenants');
  const list = await res.json();
  const tbody = document.getElementById('tenantBody');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#999">暂无数据</td></tr>';
    return;
  }

  // 按房间号分组
  const groups = [];
  const groupMap = {};
  list.forEach(t => {
    if (!groupMap[t.room_no]) {
      groupMap[t.room_no] = [];
      groups.push(t.room_no);
    }
    groupMap[t.room_no].push(t);
  });

  groups.forEach(roomNo => {
    const tenants = groupMap[roomNo];
    const first = tenants[0];

    const inline = (arr) => arr.join(' ');
    const stack  = (arr) => arr.join('<div class="cell-divider"></div>');

    const names   = stack(tenants.map(t => t.name));
    const genders = stack(tenants.map(t => `<span class="badge ${t.gender === 'male' ? 'badge-blue' : t.gender === 'female' ? 'badge-pink' : 'badge-gray'}">${genderMap[t.gender] || '-'}</span>`));
    const ages    = stack(tenants.map(t => t.age || '-'));
    const idCards = stack(tenants.map(t => t.id_card || '-'));
    const phones  = stack(tenants.map(t => t.phone || '-'));

    // 状态：按租客分行显示
    const statuses = stack(tenants.map(t => `<span class="badge ${t.status === 'active' ? 'badge-green' : 'badge-gray'}">${statusMap[t.status]}</span>`));

    // 收租按钮：仅在续租日期前5天内显示
    const renewDate = first.last_renew_date ? first.last_renew_date.slice(0, 10) : null;
    const showRentBtn = renewDate && (() => {
      const diff = (new Date(renewDate) - new Date()) / 86400000;
      return diff >= 0 && diff <= 5;
    })();
    const rentBtn = showRentBtn
      ? `<button class="btn-action btn-action-success" onclick="location.href='/rent-records.html?room_no=${encodeURIComponent(roomNo)}'">收租</button>`
      : '';

    // 操作：按租客分行显示
    const actions = (rentBtn ? rentBtn + '<div class="cell-divider"></div>' : '') + stack(tenants.map(t => `
      <button class="btn-action btn-action-info" onclick='showDetail(${JSON.stringify(t).replace(/'/g, "&#39;")})'>明细</button>
      <button class="btn-action btn-action-primary" onclick="openModal(${JSON.stringify(t).replace(/"/g, '&quot;')})">编辑</button>
      <button class="btn-action btn-action-danger" onclick="deleteTenant(${t.id}, '${t.name}')">删除</button>
    `));

    const tr = document.createElement('tr');
    tr.dataset.room = roomNo;
    tr.addEventListener('mouseenter', () => tr.classList.add('row-hover'));
    tr.addEventListener('mouseleave', () => tr.classList.remove('row-hover'));

    tr.innerHTML = `
      <td class="room-cell">${roomNo}</td>
      <td>${names}</td>
      <td>${genders}</td>
      <td>${ages}</td>
      <td>${idCards}</td>
      <td>${phones}</td>
      <td>¥${first.rent_amount.toLocaleString()}</td>
      <td>¥${first.deposit.toLocaleString()}</td>
      <td>${formatDate(first.move_in_date)}</td>
      <td class="last-paid-cell">
        ${first.last_paid_at ? formatDate(first.last_paid_at) : '<span class="no-data">暂无</span>'}
        ${first.last_paid_at
          ? `<div class="collect-status ${first.last_is_collected === 1 ? 'collected' : 'uncollected'}">${first.last_is_collected === 1 ? '已收租' : '未收租'}</div>`
          : ''}
      </td>
      <td>${statuses}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
}

function openModal(tenant) {
  document.getElementById('modalMask').style.display = 'flex';
  document.getElementById('tenantForm').reset();

  if (tenant) {
    document.getElementById('modalTitle').textContent = '编辑租客';
    document.getElementById('tenantId').value = tenant.id;
    document.getElementById('name').value = tenant.name;
    document.getElementById('gender').value = tenant.gender;
    document.getElementById('phone').value = tenant.phone || '';
    document.getElementById('id_card').value = tenant.id_card || '';
    document.getElementById('address').value = tenant.address || '';
    document.getElementById('room_no').value = tenant.room_no;
    document.getElementById('move_in_date').value = tenant.move_in_date ? tenant.move_in_date.slice(0, 10) : '';
    document.getElementById('rent_amount').value = tenant.rent_amount;
    document.getElementById('deposit').value = tenant.deposit;
    document.getElementById('status').value = tenant.status;
    document.getElementById('statusGroup').style.display = '';
  } else {
    document.getElementById('modalTitle').textContent = '新增租客';
    document.getElementById('tenantId').value = '';
    document.getElementById('statusGroup').style.display = 'none';
  }
}

function closeModal() {
  document.getElementById('modalMask').style.display = 'none';
}

async function submitForm() {
  const id = document.getElementById('tenantId').value;
  const body = {
    name:         document.getElementById('name').value.trim(),
    gender:       document.getElementById('gender').value,
    phone:        document.getElementById('phone').value.trim(),
    id_card:      document.getElementById('id_card').value.trim(),
    address:      document.getElementById('address').value.trim(),
    room_no:      document.getElementById('room_no').value.trim(),
    move_in_date: document.getElementById('move_in_date').value,
    rent_amount:  parseFloat(document.getElementById('rent_amount').value) || 0,
    deposit:      parseFloat(document.getElementById('deposit').value) || 0,
    status:       document.getElementById('status').value || 'active',
  };

  if (!body.name || !body.room_no || !body.move_in_date || !body.rent_amount) {
    alert('请填写必填项');
    return;
  }

  const res = id
    ? await request('PUT', `/api/tenants/${id}`, body)
    : await request('POST', '/api/tenants', body);

  if (res && res.ok) {
    closeModal();
    loadTenants();
  } else {
    const data = await res.json();
    alert(data.error || '保存失败');
  }
}

async function deleteTenant(id, name) {
  if (!confirm(`确认删除租客「${name}」？`)) return;
  const res = await request('DELETE', `/api/tenants/${id}`);
  if (res && res.ok) {
    loadTenants();
  }
}


function showDetail(t) {
  const genderText = genderMap[t.gender] || '-';
  const statusText = statusMap[t.status] || '-';
  document.getElementById('tenantDetailContent').innerHTML = `
    <div class="detail-card">
      <div class="detail-title">${t.name}</div>
      <div class="detail-subtitle">${t.room_no} · ${genderText}${t.age ? ' · ' + t.age + '岁' : ''}</div>
      <div class="detail-divider"></div>
      <div class="detail-row"><span>身份证号</span><span>${t.id_card || '-'}</span></div>
      <div class="detail-row"><span>联系电话</span><span>${t.phone || '-'}</span></div>
      <div class="detail-row"><span>现居地址</span><span>${t.address || '-'}</span></div>
      <div class="detail-divider"></div>
      <div class="detail-row"><span>月租金</span><span>¥${t.rent_amount.toLocaleString()}</span></div>
      <div class="detail-row"><span>押金</span><span>¥${t.deposit.toLocaleString()}</span></div>
      <div class="detail-row"><span>入住日期</span><span>${formatDate(t.move_in_date)}</span></div>
      <div class="detail-row"><span>状态</span><span><span class="badge ${t.status === 'active' ? 'badge-green' : 'badge-gray'}">${statusText}</span></span></div>
    </div>
  `;
  document.getElementById('tenantDetailMask').style.display = 'flex';
}

function closeTenantDetail() {
  document.getElementById('tenantDetailMask').style.display = 'none';
}

loadTenants();
