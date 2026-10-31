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

let allRooms = [];

async function loadRooms() {
  const res = await request('GET', '/api/rooms');
  if (!res || !res.ok) return;
  allRooms = await res.json();
  renderRoomList(allRooms);
}

function filterRooms() {
  const kw = document.getElementById('roomKeyword').value.trim().toLowerCase();
  const statusFilter = document.getElementById('roomStatusFilter').value;

  const filtered = allRooms.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (kw) {
      const matchRoom = String(r.room_no || '').toLowerCase().includes(kw);
      const matchTenants = String(r.active_tenants || '').toLowerCase().includes(kw);
      if (!matchRoom && !matchTenants) return false;
    }
    return true;
  });

  renderRoomList(filtered);
}

function renderRoomList(list) {
  const tbody = document.getElementById('roomBody');
  tbody.innerHTML = '';

  const totalRooms = allRooms.length;
  const occupiedCount = allRooms.filter(r => r.status === 'occupied').length;
  const vacantCount = allRooms.filter(r => r.status === 'vacant').length;
  document.getElementById('roomSummaryBadge').textContent = `共 ${totalRooms} 间 · ${occupiedCount} 间在租 · ${vacantCount} 间空置`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:36px;color:#a1a1aa">暂无符合条件的房间记录</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'row-hover';

    // 状态标签
    let statusBadge = '<span class="badge badge-green">在租</span>';
    if (r.status === 'vacant') {
      statusBadge = '<span class="badge badge-amber">空置待租</span>';
    } else if (r.status === 'maintenance') {
      statusBadge = '<span class="badge badge-gray">维修中</span>';
    }

    // 租客名称
    let tenantsHtml = `<span style="font-weight: 550; color:#18181b;">${escapeHtml(r.active_tenants || '')}</span>`;
    if (!r.active_tenants) {
      tenantsHtml = '<span style="color:#a1a1aa;font-style:italic;">暂无租客</span>';
    }

    // 最近收租情况
    let collectBadge = '<span style="color:#a1a1aa">-</span>';
    if (r.last_paid_at) {
      const isCol = r.last_is_collected === 1;
      collectBadge = `
        <div style="font-size:12px;font-weight:500;">${formatDate(r.last_paid_at)}</div>
        <div style="margin-top:2px;">
          <span class="badge ${isCol ? 'badge-green' : 'badge-amber'}">${isCol ? '已实收' : '未交租'}</span>
        </div>
      `;
    }

    // 操作栏 (点击 + 记收租 直接在当前页唤起宽屏弹窗记账，不发生页面跳转)
    const collectBtn = `<button class="btn-action btn-action-success" onclick="openRecordModalForRoom(${escapeAttr(JSON.stringify(r))})">+ 记收租</button>`;
    const checkinBtn = `<button class="btn-action" onclick="openCheckinModal(${escapeAttr(JSON.stringify(r))})">+ 入住</button>`;
    const editBtn = `<button class="btn-action btn-action-primary" onclick="openRoomModal(${escapeAttr(JSON.stringify(r))})">编辑</button>`;
    const deleteBtn = `<button class="btn-action btn-action-danger" onclick="deleteRoom(${r.id}, '${escapeAttr(r.room_no)}')">删除</button>`;

    // 水电抄表读数（标注非0来源年月份）
    const eMonthInfo = r.last_electric_month ? ` (${r.last_electric_month})` : '';
    const wMonthInfo = r.last_water_month ? ` (${r.last_water_month})` : '';

    tr.innerHTML = `
      <td><span class="room-badge">${escapeHtml(r.room_no)}</span></td>
      <td>${tenantsHtml}</td>
      <td style="color:#52525b;">${r.tenant_count > 0 ? r.tenant_count + ' 人' : '-'}</td>
      <td style="font-weight: 600; color: #18181b;">¥${Number(r.base_rent || 0).toLocaleString()}</td>
      <td style="color: #63636e;">¥${Number(r.base_deposit || 0).toLocaleString()}</td>
      <td>
        <div>⚡ ¥${r.electric_price}/度 · 💧 ¥${r.water_price}/吨</div>
        <div style="font-size:11px;color:#71717a;margin-top:2px;">上次抄表: ⚡ ${r.last_electric_end ?? 0}度${eMonthInfo} · 💧 ${r.last_water_end ?? 0}吨${wMonthInfo}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${collectBadge}</td>
      <td style="text-align: right;">
        <div style="display:inline-flex;gap:4px;">
          ${collectBtn}
          ${checkinBtn}
          ${editBtn}
          ${deleteBtn}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// 新增 / 编辑房间
// -------------------------------------------------------------
function openRoomModal(room) {
  document.getElementById('roomForm').reset();
  document.getElementById('roomModalMask').style.display = 'flex';

  if (room) {
    document.getElementById('roomModalTitle').textContent = `编辑房间档案 · ${room.room_no} 房`;
    document.getElementById('roomId').value = room.id;
    document.getElementById('room_no').value = room.room_no;
    document.getElementById('base_rent').value = room.base_rent;
    document.getElementById('base_deposit').value = room.base_deposit;
    document.getElementById('electric_price').value = room.electric_price;
    document.getElementById('water_price').value = room.water_price;
    document.getElementById('room_status').value = room.status || 'occupied';
    document.getElementById('room_note').value = room.note || '';
  } else {
    document.getElementById('roomModalTitle').textContent = '新增物理房间';
    document.getElementById('roomId').value = '';
    document.getElementById('electric_price').value = '1.0';
    document.getElementById('water_price').value = '4.5';
    document.getElementById('room_status').value = 'vacant';
  }
}

function closeRoomModal() {
  document.getElementById('roomModalMask').style.display = 'none';
}

async function submitRoomForm() {
  const id = document.getElementById('roomId').value;
  const body = {
    room_no:        document.getElementById('room_no').value.trim(),
    base_rent:      parseFloat(document.getElementById('base_rent').value) || 0,
    base_deposit:   parseFloat(document.getElementById('base_deposit').value) || 0,
    electric_price: parseFloat(document.getElementById('electric_price').value) || 1.0,
    water_price:    parseFloat(document.getElementById('water_price').value) || 4.5,
    status:         document.getElementById('room_status').value,
    note:           document.getElementById('room_note').value.trim(),
  };

  if (!body.room_no || body.base_rent <= 0) {
    alert('请填写房间号，且月租金必须大于0');
    return;
  }

  const res = id
    ? await request('PUT', `/api/rooms/${id}`, body)
    : await request('POST', '/api/rooms', body);

  if (res && res.ok) {
    closeRoomModal();
    loadRooms();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '保存房间失败');
  }
}

async function deleteRoom(id, roomNo) {
  if (!confirm(`确认删除房间「${roomNo}」？注意：有租客或历史账单的房间禁止删除！`)) return;
  const res = await request('DELETE', `/api/rooms/${id}`);
  if (res && res.ok) {
    loadRooms();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '删除房间失败');
  }
}

// -------------------------------------------------------------
// 快速为房间办理入住
// -------------------------------------------------------------
function openCheckinModal(room) {
  document.getElementById('checkinForm').reset();
  document.getElementById('checkinRoomNo').textContent = room.room_no;
  document.getElementById('checkinRoomNoInput').value = room.room_no;
  document.getElementById('checkinRent').value = room.base_rent;
  document.getElementById('checkinDeposit').value = room.base_deposit;
  
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('checkinMoveInDate').value = `${y}-${m}-${d}`;

  document.getElementById('checkinModalMask').style.display = 'flex';
}

function closeCheckinModal() {
  document.getElementById('checkinModalMask').style.display = 'none';
}

async function submitCheckinForm() {
  const roomNo = document.getElementById('checkinRoomNoInput').value;
  const body = {
    name:         document.getElementById('checkinName').value.trim(),
    gender:       document.getElementById('checkinGender').value,
    phone:        document.getElementById('checkinPhone').value.trim(),
    id_card:      document.getElementById('checkinIdCard').value.trim(),
    address:      document.getElementById('checkinAddress').value.trim(),
    room_no:      roomNo,
    move_in_date: document.getElementById('checkinMoveInDate').value,
    is_primary:   parseInt(document.getElementById('checkinIsPrimary').value, 10) || 1,
    rent_amount:  parseFloat(document.getElementById('checkinRent').value) || 0,
    deposit:      parseFloat(document.getElementById('checkinDeposit').value) || 0,
    status:       'active',
  };

  if (!body.name || !body.move_in_date || body.rent_amount <= 0) {
    alert('请填写租客姓名、入住日期及有效月租金');
    return;
  }

  const res = await request('POST', '/api/tenants', body);
  if (res && res.ok) {
    closeCheckinModal();
    loadRooms();
    alert(`入住办理成功！租客「${body.name}」已成功登记在 ${roomNo} 房。`);
  } else if (res) {
    const data = await res.json();
    alert(data.error || '入住办理失败');
  }
}

// -------------------------------------------------------------
// 就地收租记账 (零页面跳转)
// -------------------------------------------------------------
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function dueDateForMonth(year, month, moveInDay) {
  const day = Math.min(moveInDay, daysInMonth(year, month));
  return { year, month, day };
}

function formatDateParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function setRecordRenewDate() {
  const paidAt = document.getElementById('rr_paid_at').value;
  if (!paidAt) return;

  const [year, month, paidDay] = paidAt.split('-').map(Number);
  if (!year || !month || !paidDay) return;

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  const due = dueDateForMonth(nextYear, nextMonth, paidDay);
  const renewStr = formatDateParts(due);

  document.getElementById('rr_renew_date').value = renewStr;
  if (!document.getElementById('rr_period_end').value) {
    document.getElementById('rr_period_end').value = renewStr;
  }
}

function calcRecordElectric() {
  const start = parseFloat(document.getElementById('rr_electric_start').value) || 0;
  const end = parseFloat(document.getElementById('rr_electric_end').value) || 0;
  const price = parseFloat(document.getElementById('rr_electric_price').value) || 1.0;
  const badge = document.getElementById('rr_electric_badge');

  if (end < start) {
    if (badge) {
      badge.textContent = '止度不能小于起度';
      badge.style.color = '#dc2626';
    }
    updateRecordTotal();
    return;
  }
  const usage = Math.max(0, end - start);
  const fee = Math.round(usage * price * 100) / 100;
  if (badge) {
    badge.textContent = `${usage.toFixed(2)} 度 · ¥${fee.toFixed(2)}`;
    badge.style.color = 'inherit';
  }
  updateRecordTotal();
}

function calcRecordWater() {
  const start = parseFloat(document.getElementById('rr_water_start').value) || 0;
  const end = parseFloat(document.getElementById('rr_water_end').value) || 0;
  const price = parseFloat(document.getElementById('rr_water_price').value) || 4.5;
  const badge = document.getElementById('rr_water_badge');

  if (end < start) {
    if (badge) {
      badge.textContent = '止度不能小于起度';
      badge.style.color = '#dc2626';
    }
    updateRecordTotal();
    return;
  }
  const usage = Math.max(0, end - start);
  const fee = Math.round(usage * price * 100) / 100;
  if (badge) {
    badge.textContent = `${usage.toFixed(2)} 吨 · ¥${fee.toFixed(2)}`;
    badge.style.color = 'inherit';
  }
  updateRecordTotal();
}

function updateRecordTotal() {
  const rent = parseFloat(document.getElementById('rr_amount').value) || 0;
  const eStart = parseFloat(document.getElementById('rr_electric_start').value) || 0;
  const eEnd = parseFloat(document.getElementById('rr_electric_end').value) || 0;
  const ePrice = parseFloat(document.getElementById('rr_electric_price').value) || 0;
  const eFee = eEnd >= eStart ? Math.round((eEnd - eStart) * ePrice * 100) / 100 : 0;

  const wStart = parseFloat(document.getElementById('rr_water_start').value) || 0;
  const wEnd = parseFloat(document.getElementById('rr_water_end').value) || 0;
  const wPrice = parseFloat(document.getElementById('rr_water_price').value) || 0;
  const wFee = wEnd >= wStart ? Math.round((wEnd - wStart) * wPrice * 100) / 100 : 0;

  const broadband = parseFloat(document.getElementById('rr_broadband_fee').value) || 0;
  const ev = parseFloat(document.getElementById('rr_ev_charge_fee').value) || 0;
  const addon = broadband + ev;

  const total = rent + eFee + wFee + addon;
  document.getElementById('rr_totalPreview').textContent = `¥${total.toFixed(2)}`;

  const sRent = document.getElementById('rr_summaryRent');
  if (sRent) sRent.textContent = `¥${rent.toFixed(2)}`;
  const sElec = document.getElementById('rr_summaryElec');
  if (sElec) sElec.textContent = `¥${eFee.toFixed(2)}`;
  const sWater = document.getElementById('rr_summaryWater');
  if (sWater) sWater.textContent = `¥${wFee.toFixed(2)}`;
  const sAddon = document.getElementById('rr_summaryAddon');
  if (sAddon) sAddon.textContent = `¥${addon.toFixed(2)}`;
}

function openRecordModalForRoom(room) {
  const sel = document.getElementById('rr_room_id');
  sel.innerHTML = '';

  allRooms.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.room_no} 房 (${r.active_tenants || '空置待租'})`;
    opt.dataset.roomNo = r.room_no;
    sel.appendChild(opt);
  });

  const targetRoom = room || allRooms[0];
  if (targetRoom) {
    sel.value = targetRoom.id;
    applyRecordRoomDefaults(targetRoom);
  }

  document.getElementById('recordModalMask').style.display = 'flex';
}

function onRecordRoomChange() {
  const sel = document.getElementById('rr_room_id');
  const roomId = parseInt(sel.value, 10);
  const targetRoom = allRooms.find(r => r.id === roomId);
  if (targetRoom) {
    applyRecordRoomDefaults(targetRoom);
  }
}

function applyRecordRoomDefaults(room) {
  document.getElementById('recordModalTitle').textContent = `办理收租记账 · ${room.room_no} 房`;
  document.getElementById('rr_amount').value = room.base_rent || '';
  document.getElementById('rr_electric_price').value = room.electric_price || 1.0;
  document.getElementById('rr_water_price').value = room.water_price || 4.5;

  const lastE = parseFloat(room.last_electric_end) || 0;
  const lastW = parseFloat(room.last_water_end) || 0;
  document.getElementById('rr_electric_start').value = lastE;
  document.getElementById('rr_electric_end').value = lastE;
  document.getElementById('rr_water_start').value = lastW;
  document.getElementById('rr_water_end').value = lastW;

  const todayStr = formatLocalDate(new Date());

  // 标注获取数据的年月份
  const eTag = document.getElementById('rr_electric_origin_tag');
  if (eTag) {
    if (room.last_electric_month) {
      eTag.textContent = `来自 ${room.last_electric_month}`;
      eTag.className = 'meter-origin-tag' + (room.last_electric_date?.slice(0, 7) !== todayStr.slice(0, 7) ? ' traced' : '');
    } else {
      eTag.textContent = '初始/无历史读数';
      eTag.className = 'meter-origin-tag';
    }
  }

  const wTag = document.getElementById('rr_water_origin_tag');
  if (wTag) {
    if (room.last_water_month) {
      wTag.textContent = `来自 ${room.last_water_month}`;
      wTag.className = 'meter-origin-tag' + (room.last_water_date?.slice(0, 7) !== todayStr.slice(0, 7) ? ' traced' : '');
    } else {
      wTag.textContent = '初始/无历史读数';
      wTag.className = 'meter-origin-tag';
    }
  }

  document.getElementById('rr_paid_at').value = todayStr;
  document.getElementById('rr_period_start').value = room.last_renew_date ? room.last_renew_date.slice(0, 10) : todayStr;
  document.getElementById('rr_period_end').value = '';
  document.getElementById('rr_broadband_fee').value = '0';
  document.getElementById('rr_ev_charge_fee').value = '0';
  document.getElementById('rr_pay_method').value = 'wechat';
  document.getElementById('rr_is_collected').value = '1';
  document.getElementById('rr_note').value = '';

  setRecordRenewDate();
  calcRecordElectric();
  calcRecordWater();
  updateRecordTotal();
}

function closeRecordModal() {
  document.getElementById('recordModalMask').style.display = 'none';
}

async function submitRecordForm() {
  const sel = document.getElementById('rr_room_id');
  const roomId = parseInt(sel.value, 10);
  const targetRoom = allRooms.find(r => r.id === roomId);
  const roomNo = targetRoom?.room_no || sel.selectedOptions[0]?.dataset.roomNo || '';

  const body = {
    room_id:        roomId,
    room_no:        roomNo,
    amount:         parseFloat(document.getElementById('rr_amount').value) || 0,
    paid_at:        document.getElementById('rr_paid_at').value,
    period_start:   document.getElementById('rr_period_start').value || null,
    period_end:     document.getElementById('rr_period_end').value || null,
    electric_start: parseFloat(document.getElementById('rr_electric_start').value) || 0,
    electric_end:   parseFloat(document.getElementById('rr_electric_end').value) || 0,
    electric_price: parseFloat(document.getElementById('rr_electric_price').value) || 1.0,
    water_start:    parseFloat(document.getElementById('rr_water_start').value) || 0,
    water_end:      parseFloat(document.getElementById('rr_water_end').value) || 0,
    water_price:    parseFloat(document.getElementById('rr_water_price').value) || 4.5,
    broadband_fee:  parseFloat(document.getElementById('rr_broadband_fee').value) || 0,
    ev_charge_fee:  parseFloat(document.getElementById('rr_ev_charge_fee').value) || 0,
    pay_method:     document.getElementById('rr_pay_method').value,
    is_collected:   document.getElementById('rr_is_collected').value === '1',
    renew_date:     document.getElementById('rr_renew_date').value || null,
    note:           document.getElementById('rr_note').value.trim(),
  };

  if (!body.room_id || !body.room_no || !body.paid_at) {
    alert('请选择房间并填写收租收款日期');
    return;
  }
  if (body.amount <= 0) {
    alert('月租金必须大于0');
    return;
  }
  if (body.electric_end < body.electric_start) {
    alert('电表本次止度不能小于起度');
    return;
  }
  if (body.water_end < body.water_start) {
    alert('水表本次止度不能小于起度');
    return;
  }

  const res = await request('POST', '/api/rent-records', body);
  if (res && res.ok) {
    closeRecordModal();
    await loadRooms();
    alert(`收租记账成功！${roomNo} 房的收租状态及水电抄表数据已即时更新。`);
  } else if (res) {
    const data = await res.json();
    alert(data.error || '保存收租账单失败');
  }
}

loadRooms();
