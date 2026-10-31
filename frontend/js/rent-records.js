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

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function initYearSelect() {
  const now = new Date();
  const sel = document.getElementById('searchYear');
  sel.innerHTML = '';
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + ' 年';
    if (y === now.getFullYear()) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('searchMonth').value = String(now.getMonth() + 1).padStart(2, '0');
}
initYearSelect();

// 自动计算下次续租日及租期截止
function setRenewDate() {
  const sel = document.getElementById('tenant_id');
  const opt = sel.selectedOptions[0];
  const paidAt = document.getElementById('paid_at').value;
  if (!paidAt) return;

  const [year, month, paidDay] = paidAt.split('-').map(Number);
  if (!year || !month || !paidDay) return;

  // 下个月同日
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  const due = dueDateForMonth(nextYear, nextMonth, paidDay);
  const renewStr = formatDateParts(due);

  if (!document.getElementById('renew_date').value || !editingBillId) {
    document.getElementById('renew_date').value = renewStr;
  }
  if (!document.getElementById('period_start').value || !editingBillId) {
    document.getElementById('period_start').value = paidAt;
  }
  if (!document.getElementById('period_end').value || !editingBillId) {
    document.getElementById('period_end').value = renewStr;
  }
}

// 电费自动算
function calcElectric() {
  const start = parseFloat(document.getElementById('electric_start').value) || 0;
  const end = parseFloat(document.getElementById('electric_end').value) || 0;
  const price = parseFloat(document.getElementById('electric_price').value) || 1.0;

  const elInput = document.getElementById('electric_result');
  const elBadge = document.getElementById('electric_result_badge');

  if (end < start) {
    if (elInput) elInput.value = '止度不能小于起度';
    if (elBadge) {
      elBadge.textContent = '止度不能小于起度';
      elBadge.style.color = '#dc2626';
    }
    updateModalTotal();
    return;
  }
  const usage = Math.max(0, end - start);
  const fee = Math.round(usage * price * 100) / 100;
  const text = `${usage.toFixed(2)} 度 · ¥${fee.toFixed(2)}`;
  if (elInput) elInput.value = text;
  if (elBadge) {
    elBadge.textContent = text;
    elBadge.style.color = 'inherit';
  }
  updateModalTotal();
}

// 水费自动算
function calcWater() {
  const start = parseFloat(document.getElementById('water_start').value) || 0;
  const end = parseFloat(document.getElementById('water_end').value) || 0;
  const price = parseFloat(document.getElementById('water_price').value) || 4.5;

  const elInput = document.getElementById('water_result');
  const elBadge = document.getElementById('water_result_badge');

  if (end < start) {
    if (elInput) elInput.value = '止度不能小于起度';
    if (elBadge) {
      elBadge.textContent = '止度不能小于起度';
      elBadge.style.color = '#dc2626';
    }
    updateModalTotal();
    return;
  }
  const usage = Math.max(0, end - start);
  const fee = Math.round(usage * price * 100) / 100;
  const text = `${usage.toFixed(2)} 吨 · ¥${fee.toFixed(2)}`;
  if (elInput) elInput.value = text;
  if (elBadge) {
    elBadge.textContent = text;
    elBadge.style.color = 'inherit';
  }
  updateModalTotal();
}

function updateModalTotal() {
  const rent = parseFloat(document.getElementById('amount').value) || 0;
  const eStart = parseFloat(document.getElementById('electric_start').value) || 0;
  const eEnd = parseFloat(document.getElementById('electric_end').value) || 0;
  const ePrice = parseFloat(document.getElementById('electric_price').value) || 0;
  const eFee = eEnd >= eStart ? Math.round((eEnd - eStart) * ePrice * 100) / 100 : 0;

  const wStart = parseFloat(document.getElementById('water_start').value) || 0;
  const wEnd = parseFloat(document.getElementById('water_end').value) || 0;
  const wPrice = parseFloat(document.getElementById('water_price').value) || 0;
  const wFee = wEnd >= wStart ? Math.round((wEnd - wStart) * wPrice * 100) / 100 : 0;

  const broadband = parseFloat(document.getElementById('broadband_fee').value) || 0;
  const ev = parseFloat(document.getElementById('ev_charge_fee').value) || 0;
  const addon = broadband + ev;

  const total = rent + eFee + wFee + addon;
  document.getElementById('modalTotalPreview').textContent = `¥${total.toFixed(2)}`;

  const sRent = document.getElementById('summaryRent');
  if (sRent) sRent.textContent = `¥${rent.toFixed(2)}`;
  const sElec = document.getElementById('summaryElec');
  if (sElec) sElec.textContent = `¥${eFee.toFixed(2)}`;
  const sWater = document.getElementById('summaryWater');
  if (sWater) sWater.textContent = `¥${wFee.toFixed(2)}`;
  const sAddon = document.getElementById('summaryAddon');
  if (sAddon) sAddon.textContent = `¥${addon.toFixed(2)}`;
}

document.getElementById('amount').oninput = updateModalTotal;

// 房间选择联动：自动带出上期止度作为起度、带出房间电价水价
let roomsCache = [];

async function loadRoomOptions(selectedRoomNo) {
  const res = await request('GET', '/api/rooms');
  if (!res || !res.ok) return;
  roomsCache = await res.json();

  const sel = document.getElementById('tenant_id');
  sel.innerHTML = '';

  roomsCache.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.room_no} 房 (${r.active_tenants || '空置待租'})`;
    opt.dataset.roomNo = r.room_no;
    opt.dataset.rent = r.base_rent;
    opt.dataset.electricPrice = r.electric_price || 1.0;
    opt.dataset.waterPrice = r.water_price || 4.5;
    opt.dataset.lastElectricEnd = r.last_electric_end != null ? r.last_electric_end : 0;
    opt.dataset.lastElectricMonth = r.last_electric_month || '';
    opt.dataset.lastElectricDate = r.last_electric_date || '';
    opt.dataset.lastWaterEnd = r.last_water_end != null ? r.last_water_end : 0;
    opt.dataset.lastWaterMonth = r.last_water_month || '';
    opt.dataset.lastWaterDate = r.last_water_date || '';
    opt.dataset.lastRenewDate = r.last_renew_date || '';
    if (r.room_no === selectedRoomNo) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.onchange = () => applyRoomDefaultsToForm();

  if (sel.options.length > 0) {
    applyRoomDefaultsToForm();
  }
}

function applyRoomDefaultsToForm() {
  const sel = document.getElementById('tenant_id');
  const opt = sel.selectedOptions[0];
  if (!opt) return;

  document.getElementById('amount').value = opt.dataset.rent || '';
  document.getElementById('electric_price').value = opt.dataset.electricPrice || '1.0';
  document.getElementById('water_price').value = opt.dataset.waterPrice || '4.5';

  const todayStr = formatLocalDate(new Date());

  // 核心业务修复：自动将最后一次非0读数带入本次起度，并标注来源年月份
  if (!editingBillId) {
    const lastE = parseFloat(opt.dataset.lastElectricEnd) || 0;
    const lastW = parseFloat(opt.dataset.lastWaterEnd) || 0;
    document.getElementById('electric_start').value = lastE;
    document.getElementById('electric_end').value = lastE;
    document.getElementById('water_start').value = lastW;
    document.getElementById('water_end').value = lastW;

    const eTag = document.getElementById('electric_origin_tag');
    if (eTag) {
      if (opt.dataset.lastElectricMonth) {
        eTag.textContent = `来自 ${opt.dataset.lastElectricMonth}`;
        eTag.className = 'meter-origin-tag' + (opt.dataset.lastElectricDate?.slice(0, 7) !== todayStr.slice(0, 7) ? ' traced' : '');
      } else {
        eTag.textContent = '初始/无历史读数';
        eTag.className = 'meter-origin-tag';
      }
    }

    const wTag = document.getElementById('water_origin_tag');
    if (wTag) {
      if (opt.dataset.lastWaterMonth) {
        wTag.textContent = `来自 ${opt.dataset.lastWaterMonth}`;
        wTag.className = 'meter-origin-tag' + (opt.dataset.lastWaterDate?.slice(0, 7) !== todayStr.slice(0, 7) ? ' traced' : '');
      } else {
        wTag.textContent = '初始/无历史读数';
        wTag.className = 'meter-origin-tag';
      }
    }

    if (opt.dataset.lastRenewDate) {
      document.getElementById('period_start').value = opt.dataset.lastRenewDate;
    }
  }

  setRenewDate();
  calcElectric();
  calcWater();
  updateModalTotal();
}

let allBills = [];

async function loadRecords() {
  const year = document.getElementById('searchYear').value;
  const month = document.getElementById('searchMonth').value;
  let url = `/api/rent-records?year=${year}`;
  if (month) url += `&month=${month}`;

  const res = await request('GET', url);
  if (!res || !res.ok) return;
  allBills = await res.json();
  renderBillList(allBills);
}

function filterRecordsClient() {
  const kw = document.getElementById('recordKeyword').value.trim().toLowerCase();
  if (!kw) {
    renderBillList(allBills);
    return;
  }
  const filtered = allBills.filter(b => {
    return String(b.room_no || '').toLowerCase().includes(kw) ||
           String(b.tenant_names || b.tenant_name || '').toLowerCase().includes(kw);
  });
  renderBillList(filtered);
}

function renderBillList(list) {
  const tbody = document.getElementById('recordBody');
  tbody.innerHTML = '';
  document.getElementById('recordSummaryBadge').textContent = `共 ${list.length} 笔账单流水`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:36px;color:#a1a1aa">暂无收租账单记录</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'row-hover';

    const eUsage = Number(r.electric_usage || 0);
    const wUsage = Number(r.water_usage || 0);
    const eFee = Number(r.electric_fee || 0);
    const wFee = Number(r.water_fee || 0);
    const other = Number(r.broadband_fee || 0) + Number(r.ev_charge_fee || 0);
    const isCollected = r.is_collected === true || r.is_collected === 1;

    // 账期展示
    let periodHtml = '';
    if (r.period_start && r.period_end) {
      periodHtml = `<div style="font-size:11px;color:#71717a;margin-top:2px;">租期: ${formatDate(r.period_start)} ~ ${formatDate(r.period_end)}</div>`;
    }

    tr.innerHTML = `
      <td><span class="room-badge">${escapeHtml(r.room_no)}</span></td>
      <td style="font-weight: 550; color:#18181b;">${escapeHtml(r.tenant_names || r.tenant_name || '-')}</td>
      <td>
        <div style="color:#18181b;font-weight:500;">${formatDate(r.paid_at)}</div>
        ${periodHtml}
      </td>
      <td style="font-weight: 500;">¥${Number(r.amount || r.rent_amount || 0).toLocaleString()}</td>
      <td>
        <span style="font-weight:500;">¥${eFee.toFixed(2)}</span>
        <span style="font-size:11px;color:#71717a;margin-left:3px;">(${eUsage}度)</span>
      </td>
      <td>
        <span style="font-weight:500;">¥${wFee.toFixed(2)}</span>
        <span style="font-size:11px;color:#71717a;margin-left:3px;">(${wUsage}吨)</span>
      </td>
      <td style="color:#63636e;">${other > 0 ? '¥' + other.toFixed(2) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td style="font-weight: 700; color: #09090b; font-size: 13.5px;">¥${Number(r.total || r.total_amount || 0).toFixed(2)}</td>
      <td>
        <button class="toggle-collect ${isCollected ? 'collected' : ''}" onclick="toggleBillCollected(${r.id}, this)">
          ${isCollected ? '已实收' : '未交租'}
        </button>
      </td>
      <td style="color:#52525b;">${formatDate(r.renew_date)}</td>
      <td style="text-align: right;">
        <div style="display:inline-flex;gap:4px;">
          <button class="btn-action" onclick="showBillDetail(${escapeAttr(JSON.stringify(r))})">明细单</button>
          <button class="btn-action btn-action-primary" onclick="openEditRecordModal(${escapeAttr(JSON.stringify(r))})">编辑</button>
          <button class="btn-action btn-action-danger" onclick="deleteBill(${r.id})">删除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let editingBillId = null;

async function openModal(selectedRoomNo) {
  editingBillId = null;
  document.getElementById('recordForm').reset();
  document.getElementById('paid_at').value = formatLocalDate(new Date());
  document.getElementById('modalRecordTitle').textContent = '新增收租记录';
  await loadRoomOptions(selectedRoomNo);
  document.getElementById('modalMask').style.display = 'flex';
}

async function openEditRecordModal(r) {
  editingBillId = r.id;
  await loadRoomOptions(r.room_no);
  document.getElementById('modalRecordTitle').textContent = `编辑收租账单 · ${r.room_no} 房`;

  const sel = document.getElementById('tenant_id');
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].dataset.roomNo === r.room_no) {
      sel.selectedIndex = i;
      break;
    }
  }

  document.getElementById('amount').value = r.amount || r.rent_amount;
  document.getElementById('paid_at').value = r.paid_at ? r.paid_at.slice(0, 10) : '';
  document.getElementById('period_start').value = r.period_start ? r.period_start.slice(0, 10) : '';
  document.getElementById('period_end').value = r.period_end ? r.period_end.slice(0, 10) : '';
  document.getElementById('electric_start').value = r.electric_start;
  document.getElementById('electric_end').value = r.electric_end;
  document.getElementById('electric_price').value = r.electric_price;
  document.getElementById('water_start').value = r.water_start;
  document.getElementById('water_end').value = r.water_end;
  document.getElementById('water_price').value = r.water_price;
  document.getElementById('broadband_fee').value = r.broadband_fee;
  document.getElementById('ev_charge_fee').value = r.ev_charge_fee;
  document.getElementById('pay_method').value = r.pay_method || 'wechat';
  document.getElementById('is_collected').value = (r.is_collected === true || r.is_collected === 1) ? '1' : '0';
  document.getElementById('renew_date').value = r.renew_date ? r.renew_date.slice(0, 10) : '';
  document.getElementById('note').value = r.note || '';

  calcElectric();
  calcWater();
  updateModalTotal();
  document.getElementById('modalMask').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalMask').style.display = 'none';
  document.getElementById('recordForm').reset();
  document.getElementById('paid_at').value = formatLocalDate(new Date());
}

async function submitRecordForm() {
  const sel = document.getElementById('tenant_id');
  const selectedRoomNo = sel.selectedOptions[0]?.dataset.roomNo || '';
  const roomId = parseInt(sel.value, 10);

  const body = {
    room_id:        roomId,
    room_no:        selectedRoomNo,
    amount:         parseFloat(document.getElementById('amount').value) || 0,
    paid_at:        document.getElementById('paid_at').value,
    period_start:   document.getElementById('period_start').value || null,
    period_end:     document.getElementById('period_end').value || null,
    electric_start: parseFloat(document.getElementById('electric_start').value) || 0,
    electric_end:   parseFloat(document.getElementById('electric_end').value) || 0,
    electric_price: parseFloat(document.getElementById('electric_price').value) || 1.0,
    water_start:    parseFloat(document.getElementById('water_start').value) || 0,
    water_end:      parseFloat(document.getElementById('water_end').value) || 0,
    water_price:    parseFloat(document.getElementById('water_price').value) || 4.5,
    broadband_fee:  parseFloat(document.getElementById('broadband_fee').value) || 0,
    ev_charge_fee:  parseFloat(document.getElementById('ev_charge_fee').value) || 0,
    pay_method:     document.getElementById('pay_method').value,
    is_collected:   document.getElementById('is_collected').value === '1',
    renew_date:     document.getElementById('renew_date').value || null,
    note:           document.getElementById('note').value.trim(),
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

  const res = editingBillId
    ? await request('PUT', `/api/rent-records/${editingBillId}`, body)
    : await request('POST', '/api/rent-records', body);

  if (res && res.ok) {
    closeModal();
    loadRecords();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '保存收租账单失败');
  }
}

async function toggleBillCollected(id, btn) {
  const res = await request('PUT', `/api/rent-records/${id}/collect`);
  if (res && res.ok) {
    const isNowCol = !btn.classList.contains('collected');
    btn.classList.toggle('collected', isNowCol);
    btn.textContent = isNowCol ? '已实收' : '未交租';
  } else if (res) {
    const data = await res.json();
    alert(data.error || '切换收款状态失败');
  }
}

async function deleteBill(id) {
  if (!confirm('确认删除该收租账单流水？')) return;
  const res = await request('DELETE', `/api/rent-records/${id}`);
  if (res && res.ok) {
    loadRecords();
  } else if (res) {
    const data = await res.json();
    alert(data.error || '删除账单失败');
  }
}

function showBillDetail(r) {
  const eUsage = Math.max(0, r.electric_end - r.electric_start).toFixed(2);
  const wUsage = Math.max(0, r.water_end - r.water_start).toFixed(2);
  const eFee = Number(r.electric_fee || 0).toFixed(2);
  const wFee = Number(r.water_fee || 0).toFixed(2);
  const rent = Number(r.amount || r.rent_amount || 0).toFixed(2);
  const total = Number(r.total || r.total_amount || 0).toFixed(2);

  const payMap = { wechat: '微信支付', alipay: '支付宝', cash: '现金', bank: '银行转账' };
  const payText = payMap[r.pay_method] || '微信支付';

  let periodStr = '-';
  if (r.period_start && r.period_end) {
    periodStr = `${formatDate(r.period_start)} ~ ${formatDate(r.period_end)}`;
  } else if (r.paid_at && r.renew_date) {
    periodStr = `${formatDate(r.paid_at)} ~ ${formatDate(r.renew_date)}`;
  }

  document.getElementById('detailContent').innerHTML = `
    <div class="receipt" id="receiptCard">
      <div class="receipt-header">
        <div class="receipt-title">🏠 租房收租明细单</div>
        <div class="receipt-no">收款记账日：${formatDate(r.paid_at)} · 结算方式：${payText}</div>
      </div>

      <div class="receipt-meta-grid">
        <div class="receipt-meta-item"><span>承租房间</span><strong>${escapeHtml(r.room_no)} 房</strong></div>
        <div class="receipt-meta-item"><span>租客姓名</span><strong>${escapeHtml(r.tenant_names || r.tenant_name)}</strong></div>
        <div class="receipt-meta-item" style="grid-column: 1 / -1;"><span>计费租期</span><strong>${periodStr}</strong></div>
      </div>

      <div class="receipt-meter-box">
        <div class="meter-card">
          <div class="meter-card-title">⚡ 电费结算</div>
          <div class="meter-row"><span>起度</span><span>${r.electric_start} 度</span></div>
          <div class="meter-row"><span>止度</span><span>${r.electric_end} 度</span></div>
          <div class="meter-row"><span>用量</span><span>${eUsage} 度</span></div>
          <div class="meter-row meter-highlight"><span>电费</span><span>¥${eFee}</span></div>
        </div>
        <div class="meter-card">
          <div class="meter-card-title">💧 水费结算</div>
          <div class="meter-row"><span>起度</span><span>${r.water_start} 吨</span></div>
          <div class="meter-row"><span>止度</span><span>${r.water_end} 吨</span></div>
          <div class="meter-row"><span>用量</span><span>${wUsage} 吨</span></div>
          <div class="meter-row meter-highlight"><span>水费</span><span>¥${wFee}</span></div>
        </div>
      </div>

      <table class="receipt-table">
        <tbody>
          <tr><td>月租金</td><td>¥${rent}</td></tr>
          <tr><td>电费 (${eUsage}度 × ¥${r.electric_price}/度)</td><td>¥${eFee}</td></tr>
          <tr><td>水费 (${wUsage}吨 × ¥${r.water_price}/吨)</td><td>¥${wFee}</td></tr>
          ${r.broadband_fee > 0 ? `<tr><td>宽带网费</td><td>¥${Number(r.broadband_fee).toFixed(2)}</td></tr>` : ''}
          ${r.ev_charge_fee > 0 ? `<tr><td>电动车充电费</td><td>¥${Number(r.ev_charge_fee).toFixed(2)}</td></tr>` : ''}
          ${r.note ? `<tr><td style="color:#71717a">备注说明</td><td style="color:#71717a">${escapeHtml(r.note)}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="receipt-total">
        <span>本期应收总计</span>
        <span class="receipt-total-num">¥${total}</span>
      </div>

      <div class="receipt-footer-text">
        ${r.renew_date ? `下次缴费续租日：${formatDate(r.renew_date)}` : '感谢配合，祝生活愉快！'}
      </div>
    </div>
  `;
  document.getElementById('detailMask').style.display = 'flex';
}

function closeDetail() {
  document.getElementById('detailMask').style.display = 'none';
}

async function copyReceiptImage() {
  const btn = document.getElementById('copyImgBtn');
  const target = document.getElementById('receiptCard');
  if (!target) return;

  btn.disabled = true;
  btn.textContent = '生成图片中...';

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    canvas.toBlob(async blob => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        btn.textContent = '✓ 已复制到剪贴板';
        setTimeout(() => {
          btn.textContent = '📋 复制收据图片';
          btn.disabled = false;
        }, 2500);
      } catch (e) {
        alert('浏览器限制剪贴板写入，请直接截图保存');
        btn.textContent = '📋 复制收据图片';
        btn.disabled = false;
      }
    }, 'image/png');
  } catch (err) {
    alert('生成图片失败：' + err.message);
    btn.textContent = '📋 复制收据图片';
    btn.disabled = false;
  }
}

loadRecords();

const urlParams = new URLSearchParams(window.location.search);
const preRoomNo = urlParams.get('room_no');
if (preRoomNo) {
  openModal(preRoomNo);
}
