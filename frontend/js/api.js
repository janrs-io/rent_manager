async function request(method, url, body) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/index.html';
    return;
  }

  return res;
}

function logout() {
  if (confirm('确认退出登录？')) {
    localStorage.clear();
    window.location.href = '/index.html';
  }
}

function ensureChangePasswordModal() {
  if (document.getElementById('changePasswordMask')) return;

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'changePasswordMask';
  mask.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <span>修改密码</span>
        <span class="modal-close" onclick="closeChangePasswordModal()">✕</span>
      </div>
      <div class="modal-body">
        <form id="changePasswordForm">
          <div class="form-group">
            <label>原密码 <span class="required">*</span></label>
            <input type="password" id="old_password" autocomplete="current-password" required />
          </div>
          <div class="form-group">
            <label>新密码（最少6位） <span class="required">*</span></label>
            <input type="password" id="new_password" autocomplete="new-password" minlength="6" required />
          </div>
          <div class="form-group">
            <label>确认新密码 <span class="required">*</span></label>
            <input type="password" id="confirm_password" autocomplete="new-password" minlength="6" required />
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default btn-sm" onclick="closeChangePasswordModal()">取消</button>
        <button class="btn btn-primary btn-sm" onclick="submitChangePassword()">确认保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
}

function openChangePasswordModal() {
  ensureChangePasswordModal();
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordMask').style.display = 'flex';
}

function closeChangePasswordModal() {
  const mask = document.getElementById('changePasswordMask');
  if (mask) mask.style.display = 'none';
}

async function submitChangePassword() {
  const oldPassword = document.getElementById('old_password').value;
  const newPassword = document.getElementById('new_password').value;
  const confirmPassword = document.getElementById('confirm_password').value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    alert('请填写完整密码信息');
    return;
  }
  if (newPassword.length < 6) {
    alert('新密码不能少于6位');
    return;
  }
  if (newPassword !== confirmPassword) {
    alert('两次输入的新密码不一致');
    return;
  }

  const res = await request('POST', '/api/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  if (res && res.ok) {
    closeChangePasswordModal();
    alert('密码修改成功，请使用新密码重新登录');
    localStorage.clear();
    window.location.href = '/index.html';
  } else if (res) {
    const data = await res.json();
    alert(data.error || '修改密码失败');
  }
}

function requireAuth() {
  if (!localStorage.getItem('token')) {
    window.location.href = '/index.html';
  }
}

function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.toggle('open');
}

// 点击外部关闭下拉
document.addEventListener('click', function(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// 初始化头像及用户信息
function initUserAvatar() {
  const username = localStorage.getItem('username') || '';
  const el = document.getElementById('topbarUser');
  const av = document.getElementById('userAvatar');
  if (el) el.textContent = username;
  if (av) av.textContent = username ? username.charAt(0).toUpperCase() : 'U';
}
