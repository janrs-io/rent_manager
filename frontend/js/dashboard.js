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

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function initYearSelect() {
  const now = new Date();
  const sel = document.getElementById('filterYear');
  sel.innerHTML = '';
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + ' 年统计';
    if (y === now.getFullYear()) opt.selected = true;
    sel.appendChild(opt);
  }
}
initYearSelect();

function fmt(val) {
  return Number(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadDashboard() {
  const year = document.getElementById('filterYear').value;
  document.getElementById('currentYearBadge').textContent = year + ' 年';

  const res = await request('GET', '/api/dashboard?year=' + year);
  if (!res || !res.ok) return;

  const data = await res.json();
  const t = data.total;

  const totalOther = (t.broadband_fee || 0) + (t.ev_charge_fee || 0);

  document.getElementById('totalIncome').textContent = '¥' + fmt(t.total_income || (t.rent + t.electric_fee + t.water_fee + totalOther));
  document.getElementById('totalRent').textContent = '¥' + fmt(t.rent);
  document.getElementById('totalElectricFee').textContent = '¥' + fmt(t.electric_fee);
  document.getElementById('totalElectricUsage').textContent = '用量：' + fmt(t.electric_usage) + ' 度';
  document.getElementById('totalWaterFee').textContent = '¥' + fmt(t.water_fee);
  document.getElementById('totalWaterUsage').textContent = '用量：' + fmt(t.water_usage) + ' 吨';
  document.getElementById('totalOtherFee').textContent = '¥' + fmt(totalOther);

  const tbody = document.getElementById('monthlyBody');
  tbody.innerHTML = '';

  data.monthly.forEach((m, i) => {
    const hasData = m.total > 0 || m.rent > 0 || m.electric_usage > 0 || m.water_usage > 0;
    const tr = document.createElement('tr');
    tr.className = 'row-hover';
    tr.innerHTML = `
      <td style="font-weight: 550; color: #27272a;">${monthNames[i]}</td>
      <td>${hasData && m.rent > 0 ? '¥' + fmt(m.rent) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td>${hasData && m.electric_usage > 0 ? fmt(m.electric_usage) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td>${hasData && m.electric_fee > 0 ? '¥' + fmt(m.electric_fee) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td>${hasData && m.water_usage > 0 ? fmt(m.water_usage) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td>${hasData && m.water_fee > 0 ? '¥' + fmt(m.water_fee) : '<span style="color:#a1a1aa">-</span>'}</td>
      <td style="font-weight: 600; color: #09090b;">${hasData ? '¥' + fmt(m.total || (m.rent + m.electric_fee + m.water_fee)) : '<span style="color:#a1a1aa">-</span>'}</td>
    `;
    tbody.appendChild(tr);
  });

  // 合计行
  document.getElementById('monthlyFoot').innerHTML = `
    <tr style="background: #fafafc; font-weight: 600; border-top: 2px solid #e4e4e7;">
      <td>年度合计</td>
      <td>¥${fmt(t.rent)}</td>
      <td>${fmt(t.electric_usage)} 度</td>
      <td>¥${fmt(t.electric_fee)}</td>
      <td>${fmt(t.water_usage)} 吨</td>
      <td>¥${fmt(t.water_fee)}</td>
      <td style="font-size: 14px; color: #18181b;">¥${fmt(t.total_income || (t.rent + t.electric_fee + t.water_fee + totalOther))}</td>
    </tr>
  `;
}

loadDashboard();
