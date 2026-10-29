const State = { Token: localStorage.getItem('Token'), Me: null };
const Panels = [];

const Esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FormatDate = iso => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

class SessionError extends Error {}

async function Request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(State.Token ? { Authorization: `Bearer ${State.Token}` } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
  }
  if (response.status === 401 && State.Token) {
    ClearSession();
    throw new SessionError('Sesi berakhir, silakan masuk lagi');
  }
  return response;
}

async function Api(path, options = {}) {
  const response = await Request(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.Message ?? 'Terjadi kesalahan');
  return data;
}

async function Download(path) {
  const response = await Request(path);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).Message ?? 'Unduhan gagal');
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'laporan.csv';
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await response.blob()), download: name });
  link.click();
  URL.revokeObjectURL(link.href);
  return name;
}

function Notify(message, isError = false) {
  const el = document.getElementById('notice');
  el.textContent = message;
  el.className = isError ? 'error' : '';
  el.hidden = false;
  clearTimeout(Notify.timer);
  Notify.timer = setTimeout(() => (el.hidden = true), 6000);
}

/** Menjalankan aksi UI: tombol dikunci selama permintaan berjalan supaya tidak terkirim dua kali. */
async function Guard(button, action) {
  if (button) button.disabled = true;
  try {
    await action();
  } catch (error) {
    if (error instanceof SessionError) return ShowLogin(error.message);
    Notify(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function RegisterPanel(panel) {
  Panels.push(panel);
}

function ClearSession() {
  State.Token = null;
  State.Me = null;
  localStorage.removeItem('Token');
}

function ShowLogin(message) {
  ClearSession();
  document.getElementById('who').hidden = true;
  document.getElementById('panels').innerHTML = '';
  document.getElementById('login').hidden = false;
  if (message) Notify(message, true);
}

async function RenderAll() {
  const main = document.getElementById('panels');
  if (!State.Me) return;
  const panels = Panels.filter(p => p.Roles.includes(State.Me.Role)).sort((a, b) => a.Order - b.Order);
  main.innerHTML = panels
    .map((p, i) => `<section class="panel"><h2>${Esc(p.Title(State.Me))}</h2><div id="body-${i}" aria-busy="true"><p class="empty loading">Memuat...</p></div></section>`)
    .join('');
  await Promise.all(
    panels.map(async (p, i) => {
      const body = document.getElementById(`body-${i}`);
      try {
        await p.Render(body, State.Me);
      } catch (error) {
        if (error instanceof SessionError) return ShowLogin(error.message);
        body.innerHTML = `<p class="empty">${Esc(error.message)} <button type="button" data-retry>Coba lagi</button></p>`;
        body.querySelector('[data-retry]').addEventListener('click', RenderAll);
      }
      body.removeAttribute('aria-busy');
    }),
  );
}

async function EnterApp(user) {
  State.Me = user;
  document.getElementById('login').hidden = true;
  document.getElementById('who-name').textContent = `${user.Name} (${user.Role === 'ADMIN' ? 'Admin' : 'Creator'})`;
  document.getElementById('who').hidden = false;
  await RenderAll();
}

async function Start() {
  document.getElementById('logout').addEventListener('click', async () => {
    await Request('/api/logout', { method: 'POST' }).catch(() => {});
    ShowLogin();
    Notify('Kamu sudah keluar');
  });
  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const email = String(form.get('Email') ?? '').trim();
    const password = String(form.get('Password') ?? '');
    if (!email || !password) return Notify('Email dan kata sandi wajib diisi', true);
    await Guard(event.submitter, async () => {
      const { Token, User } = await Api('/api/login', { method: 'POST', body: { Email: email, Password: password } });
      State.Token = Token;
      localStorage.setItem('Token', Token);
      event.target.reset();
      await EnterApp(User);
    });
  });
  if (!State.Token) return ShowLogin();
  try {
    await EnterApp(await Api('/api/me'));
  } catch (error) {
    ShowLogin(error instanceof SessionError ? undefined : error.message);
  }
}
