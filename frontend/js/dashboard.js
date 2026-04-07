requireAuth();
initUserAvatar();

const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// 初始化年份下拉
function initYearSelect() {
  const now = new Date();
  const sel = document.getElementById('filterYear');
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    sel.appendChild(opt);
  }
  sel.value = now.getFullYear();
}
initYearSelect();

function fmt(val) {
  return (val || 0).toFixed(2);
}

async function loadDashboard() {
  const year = document.getElementById('filterYear').value;
  const res = await request('GET', '/api/dashboard?year=' + year);
  const data = await res.json();

  const t = data.total;
  document.getElementById('totalRent').textContent         = '¥' + fmt(t.rent);
  document.getElementById('totalElectricFee').textContent  = '¥' + fmt(t.electric_fee);
  document.getElementById('totalElectricUsage').textContent = fmt(t.electric_usage) + ' 度';
  document.getElementById('totalWaterFee').textContent     = '¥' + fmt(t.water_fee);
  document.getElementById('totalWaterUsage').textContent   = fmt(t.water_usage) + ' 吨';

  const tbody = document.getElementById('monthlyBody');
  tbody.innerHTML = '';

  data.monthly.forEach((m, i) => {
    const hasData = m.rent > 0 || m.electric_usage > 0 || m.water_usage > 0;
    const tr = document.createElement('tr');
    tr.addEventListener('mouseenter', () => tr.classList.add('row-hover'));
    tr.addEventListener('mouseleave', () => tr.classList.remove('row-hover'));
    tr.innerHTML = `
      <td>${monthNames[i]}</td>
      <td class="total-cell">${hasData ? '¥' + fmt(m.rent) : '-'}</td>
      <td>${hasData ? fmt(m.electric_usage) : '-'}</td>
      <td>${hasData ? '¥' + fmt(m.electric_fee) : '-'}</td>
      <td>${hasData ? fmt(m.water_usage) : '-'}</td>
      <td>${hasData ? '¥' + fmt(m.water_fee) : '-'}</td>
    `;
    tbody.appendChild(tr);
  });

  // 合计行
  document.getElementById('monthlyFoot').innerHTML = `
    <tr class="table-foot-row">
      <td><strong>合计</strong></td>
      <td><strong>¥${fmt(t.rent)}</strong></td>
      <td><strong>${fmt(t.electric_usage)} 度</strong></td>
      <td><strong>¥${fmt(t.electric_fee)}</strong></td>
      <td><strong>${fmt(t.water_usage)} 吨</strong></td>
      <td><strong>¥${fmt(t.water_fee)}</strong></td>
    </tr>
  `;
}

loadDashboard();
