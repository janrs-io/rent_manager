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
  const date = str.slice(0, 10);
  const [y, m, d] = date.split('-');
  return `${y}年${m}月${d}日`;
}

// 初始化日期为今天
document.getElementById('paid_at').value = new Date().toISOString().slice(0, 10);

// 初始化年份下拉（近5年）
function initYearSelect() {
  const now = new Date();
  const sel = document.getElementById('searchYear');
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    sel.appendChild(opt);
  }
  sel.value = now.getFullYear();
  // 默认选中当月
  document.getElementById('searchMonth').value =
    String(now.getMonth() + 1).padStart(2, '0');
}
initYearSelect();

// 根据入住日期自动计算续租日期（当年当月+入住日）
function setRenewDate() {
  const moveInDate = document.getElementById('tenant_id').selectedOptions[0]?.dataset.moveInDate;
  const paidAt = document.getElementById('paid_at').value;
  if (!moveInDate || !paidAt) return;

  const day = moveInDate.slice(8, 10); // 入住日的"日"
  const paidDate = new Date(paidAt);
  const y = paidDate.getFullYear();
  const m = String(paidDate.getMonth() + 1).padStart(2, '0');
  document.getElementById('renew_date').value = `${y}-${m}-${day}`;
}

// 加载租客下拉列表（按房间号去重）
async function loadTenantOptions() {
  const res = await request('GET', '/api/tenants');
  const tenants = await res.json();
  const active = tenants.filter(t => t.status === 'active');

  // 按房间号分组
  const roomMap = {};
  active.forEach(t => {
    if (!roomMap[t.room_no]) roomMap[t.room_no] = [];
    roomMap[t.room_no].push(t);
  });

  const sel = document.getElementById('tenant_id');
  sel.innerHTML = '';

  // 按房间号排序后填入下拉
  Object.keys(roomMap).sort().forEach(roomNo => {
    const group = roomMap[roomNo];
    const names = group.map(t => t.name).join('、');
    const opt = document.createElement('option');
    opt.value = group[0].id;
    opt.textContent = `${roomNo}（${names}）`;
    opt.dataset.rent = group[0].rent_amount;
    opt.dataset.moveInDate = group[0].move_in_date || '';
    sel.appendChild(opt);
  });

  // 选中房间时自动填入月租金和续租日期
  sel.addEventListener('change', () => {
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('amount').value = opt.dataset.rent || '';
    setRenewDate();
  });
  if (sel.options.length > 0) {
    document.getElementById('amount').value = sel.options[0].dataset.rent || '';
    setRenewDate();
  }

  // 收租日期变化时重新计算续租日期
  document.getElementById('paid_at').addEventListener('change', setRenewDate);
}

// 电费自动计算
function calcElectric() {
  const start = parseFloat(document.getElementById('electric_start').value) || 0;
  const end   = parseFloat(document.getElementById('electric_end').value) || 0;
  const price = parseFloat(document.getElementById('electric_price').value) || 0;
  const usage = Math.max(0, end - start);
  const fee   = usage * price;
  document.getElementById('electric_result').value =
    `${usage.toFixed(2)} 度 / ¥${fee.toFixed(2)}`;
}

// 水费自动计算
function calcWater() {
  const start = parseFloat(document.getElementById('water_start').value) || 0;
  const end   = parseFloat(document.getElementById('water_end').value) || 0;
  const price = parseFloat(document.getElementById('water_price').value) || 0;
  const usage = Math.max(0, end - start);
  const fee   = usage * price;
  document.getElementById('water_result').value =
    `${usage.toFixed(2)} 吨 / ¥${fee.toFixed(2)}`;
}

// 加载收租记录列表
async function loadRecords() {
  const year  = document.getElementById('searchYear').value;
  const month = document.getElementById('searchMonth').value;
  let url = '/api/rent-records?year=' + year;
  if (month) url += '&month=' + month;
  const res = await request('GET', url);
  const list = await res.json();
  const tbody = document.getElementById('recordBody');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#999">暂无数据</td></tr>';
    return;
  }

  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.addEventListener('mouseenter', () => tr.classList.add('row-hover'));
    tr.addEventListener('mouseleave', () => tr.classList.remove('row-hover'));
    tr.innerHTML = `
      <td>${r.room_no}</td>
      <td>${r.tenant_name}</td>
      <td class="paid-at-cell">${formatDate(r.paid_at)}</td>
      <td>¥${r.amount.toFixed(2)}</td>
      <td>¥${r.electric_fee.toFixed(2)}</td>
      <td>¥${r.water_fee.toFixed(2)}</td>
      <td>¥${r.broadband_fee.toFixed(2)}</td>
      <td>¥${r.ev_charge_fee.toFixed(2)}</td>
      <td class="total-cell"><strong>¥${r.total.toFixed(2)}</strong></td>
      <td><button class="toggle-collect ${r.is_collected ? 'collected' : ''}" onclick="toggleCollect(${r.id}, this)">${r.is_collected ? '已收租' : '未收租'}</button></td>
      <td>${formatDate(r.renew_date)}</td>
      <td>
        <button class="btn-action btn-action-info" onclick='showDetail(${JSON.stringify(r).replace(/'/g, "&#39;")})'>明细</button>
        <button class="btn-action btn-action-primary" onclick='openEditModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>编辑</button>
        <button class="btn-action btn-action-danger" onclick="deleteRecord(${r.id})">删除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let editingId = null;

function openModal() {
  editingId = null;
  document.querySelector('#modalMask .modal-header span').textContent = '新增收租记录';
  loadTenantOptions();
  calcElectric();
  calcWater();
  document.getElementById('modalMask').style.display = 'flex';
}

async function openEditModal(r) {
  editingId = r.id;
  await loadTenantOptions();
  document.querySelector('#modalMask .modal-header span').textContent = '编辑收租记录';

  // 填充租客（找到对应 option）
  const sel = document.getElementById('tenant_id');
  for (let i = 0; i < sel.options.length; i++) {
    if (parseInt(sel.options[i].value) === r.tenant_id) {
      sel.selectedIndex = i;
      break;
    }
  }

  document.getElementById('amount').value         = r.amount;
  document.getElementById('paid_at').value         = r.paid_at ? r.paid_at.slice(0, 10) : '';
  document.getElementById('electric_start').value  = r.electric_start;
  document.getElementById('electric_end').value    = r.electric_end;
  document.getElementById('electric_price').value  = r.electric_price;
  document.getElementById('water_start').value     = r.water_start;
  document.getElementById('water_end').value       = r.water_end;
  document.getElementById('water_price').value     = r.water_price;
  document.getElementById('broadband_fee').value   = r.broadband_fee;
  document.getElementById('ev_charge_fee').value   = r.ev_charge_fee;
  document.getElementById('is_collected').value    = r.is_collected ? '1' : '0';
  document.getElementById('renew_date').value      = r.renew_date ? r.renew_date.slice(0, 10) : '';
  document.getElementById('note').value            = r.note || '';

  calcElectric();
  calcWater();
  document.getElementById('modalMask').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalMask').style.display = 'none';
  document.getElementById('recordForm').reset();
  document.getElementById('paid_at').value = new Date().toISOString().slice(0, 10);
  document.getElementById('electric_result').value = '';
  document.getElementById('water_result').value = '';
}

async function submitForm() {
  const body = {
    tenant_id:      parseInt(document.getElementById('tenant_id').value),
    amount:         parseFloat(document.getElementById('amount').value) || 0,
    paid_at:        document.getElementById('paid_at').value,
    electric_start: parseFloat(document.getElementById('electric_start').value) || 0,
    electric_end:   parseFloat(document.getElementById('electric_end').value) || 0,
    electric_price: parseFloat(document.getElementById('electric_price').value) || 0,
    water_start:    parseFloat(document.getElementById('water_start').value) || 0,
    water_end:      parseFloat(document.getElementById('water_end').value) || 0,
    water_price:    parseFloat(document.getElementById('water_price').value) || 0,
    broadband_fee:  parseFloat(document.getElementById('broadband_fee').value) || 0,
    ev_charge_fee:  parseFloat(document.getElementById('ev_charge_fee').value) || 0,
    is_collected:   document.getElementById('is_collected').value === '1',
    renew_date:     document.getElementById('renew_date').value,
    note:           document.getElementById('note').value.trim(),
  };

  if (!body.tenant_id || !body.paid_at) {
    alert('请选择租客并填写收租日期');
    return;
  }

  const res = editingId
    ? await request('PUT', `/api/rent-records/${editingId}`, body)
    : await request('POST', '/api/rent-records', body);
  if (res && res.ok) {
    closeModal();
    loadRecords();
  } else {
    const data = await res.json();
    alert(data.error || '保存失败');
  }
}

async function toggleCollect(id, btn) {
  const res = await request('PUT', `/api/rent-records/${id}/collect`);
  if (res && res.ok) {
    const isNowCollected = !btn.classList.contains('collected');
    btn.classList.toggle('collected', isNowCollected);
    btn.textContent = isNowCollected ? '已收租' : '未收租';
  }
}

async function deleteRecord(id) {
  if (!confirm('确认删除该收租记录？')) return;
  const res = await request('DELETE', `/api/rent-records/${id}`);
  if (res && res.ok) loadRecords();
}

// 收租明细弹窗（用于截图发租客）
function showDetail(r) {
  const electricUsage = Math.max(0, r.electric_end - r.electric_start).toFixed(2);
  const waterUsage    = Math.max(0, r.water_end - r.water_start).toFixed(2);

  document.getElementById('detailContent').innerHTML = `
    <div class="receipt">
      <!-- 收据头部 -->
      <div class="receipt-header">
        <div class="receipt-logo">🏠 租房管理系统</div>
        <div class="receipt-title">收租明细单</div>
        <div class="receipt-no">收租日期：${formatDate(r.paid_at)}</div>
      </div>

      <!-- 租客信息 -->
      <div class="receipt-info">
        <div class="receipt-info-item">
          <span class="receipt-info-label">房间号</span>
          <span class="receipt-info-value">${r.room_no}</span>
        </div>
        <div class="receipt-info-item">
          <span class="receipt-info-label">租客姓名</span>
          <span class="receipt-info-value">${r.tenant_name}</span>
        </div>
      </div>

      <!-- 费用明细 -->
      <div class="receipt-section-title">费用明细</div>

      <!-- 电费水费左右表格 -->
      <div class="receipt-meter-grid">
        <div>
          <div class="receipt-meter-title">⚡ 电费</div>
          <table class="receipt-meter-table electric-table">
            <tr><td>初始度数</td><td>${r.electric_start} 度</td></tr>
            <tr><td>结束度数</td><td>${r.electric_end} 度</td></tr>
            <tr><td>用电量</td><td>${electricUsage} 度</td></tr>
            <tr><td>单价</td><td>¥${r.electric_price}/度</td></tr>
            <tr class="meter-total"><td>电费合计</td><td>¥${r.electric_fee.toFixed(2)}</td></tr>
          </table>
        </div>
        <div>
          <div class="receipt-meter-title">💧 水费</div>
          <table class="receipt-meter-table water-table">
            <tr><td>初始度数</td><td>${r.water_start} 吨</td></tr>
            <tr><td>结束度数</td><td>${r.water_end} 吨</td></tr>
            <tr><td>用水量</td><td>${waterUsage} 吨</td></tr>
            <tr><td>单价</td><td>¥${r.water_price}/吨</td></tr>
            <tr class="meter-total"><td>水费合计</td><td>¥${r.water_fee.toFixed(2)}</td></tr>
          </table>
        </div>
      </div>

      <!-- 其他费用 -->
      <table class="receipt-table">
        <thead>
          <tr><th>项目</th><th>金额</th></tr>
        </thead>
        <tbody>
          <tr><td>月租金</td><td>¥${r.amount.toFixed(2)}</td></tr>
          <tr><td>电费</td><td>¥${r.electric_fee.toFixed(2)}</td></tr>
          <tr><td>水费</td><td>¥${r.water_fee.toFixed(2)}</td></tr>
          ${r.broadband_fee > 0 ? `<tr><td>宽带费</td><td>¥${r.broadband_fee.toFixed(2)}</td></tr>` : ''}
          ${r.ev_charge_fee > 0 ? `<tr><td>电动车充电费</td><td>¥${r.ev_charge_fee.toFixed(2)}</td></tr>` : ''}
          ${r.note ? `<tr><td>备注</td><td>${r.note}</td></tr>` : ''}
        </tbody>
      </table>

      <!-- 合计 -->
      <div class="receipt-total">
        <span>合计金额</span>
        <span class="receipt-total-amount">¥${r.total.toFixed(2)}</span>
      </div>

      <!-- 底部 -->
      <div class="receipt-footer">
        ${r.renew_date ? `<div class="receipt-renew">续租日期：${formatDate(r.renew_date)}</div>` : ''}
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
  const target = document.getElementById('detailContent');
  btn.disabled = true;
  btn.textContent = '生成中...';

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: 2,           // 2倍清晰度
      useCORS: true,
    });

    canvas.toBlob(async blob => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        btn.textContent = '✓ 已复制';
        setTimeout(() => {
          btn.textContent = '复制图片';
          btn.disabled = false;
        }, 2000);
      } catch (e) {
        alert('复制失败，请手动截图');
        btn.textContent = '复制图片';
        btn.disabled = false;
      }
    }, 'image/png');
  } catch (e) {
    alert('生成图片失败：' + e.message);
    btn.textContent = '复制图片';
    btn.disabled = false;
  }
}

loadRecords();

// 从租客列表跳转时，自动打开弹窗并预选房间
const urlParams = new URLSearchParams(window.location.search);
const preRoomNo = urlParams.get('room_no');
if (preRoomNo) {
  openModal();
  setTimeout(() => {
    const sel = document.getElementById('tenant_id');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].textContent.startsWith(preRoomNo + '（')) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change'));
        break;
      }
    }
  }, 300);
}
