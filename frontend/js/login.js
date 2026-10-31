document.addEventListener('DOMContentLoaded', function () {
  // 已登录则直接跳转首页
  if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = '验证中...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorMsg.textContent = data.error || '登录失败，请检查账号密码';
        errorMsg.style.display = 'block';
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorMsg.textContent = '无法连接到服务器，请检查网络';
      errorMsg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登录系统';
    }
  });
});
