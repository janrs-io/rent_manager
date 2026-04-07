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
  localStorage.clear();
  window.location.href = '/index.html';
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

// 点击页面其他地方关闭下拉
document.addEventListener('click', function(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// 初始化头像首字母
function initUserAvatar() {
  const username = localStorage.getItem('username') || '';
  const el = document.getElementById('topbarUser');
  const av = document.getElementById('userAvatar');
  if (el) el.textContent = username;
  if (av) av.textContent = username ? username.charAt(0).toUpperCase() : '?';
}
