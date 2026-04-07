document.addEventListener('DOMContentLoaded', function () {
  // 已登录则跳转到首页
  if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorMsg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';

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
        errorMsg.textContent = data.error || '登录失败';
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      window.location.href = '/dashboard.html';
    } catch (err) {
      errorMsg.textContent = '网络错误，请重试';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '登录';
    }
  });
});
