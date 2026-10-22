const State = { UserId: localStorage.getItem('UserId'), Users: [], Me: null };
const Panels = [];

const Esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FormatDate = iso => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

async function Api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': State.UserId ?? '' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.Message ?? 'Terjadi kesalahan');
  return data;
}

function Notify(message, isError = false) {
  const el = document.getElementById('notice');
  el.textContent = message;
  el.className = isError ? 'error' : '';
  el.hidden = false;
  clearTimeout(Notify.timer);
  Notify.timer = setTimeout(() => (el.hidden = true), 6000);
}

function RegisterPanel(panel) {
  Panels.push(panel);
}

async function RenderAll() {
  const main = document.getElementById('panels');
  State.Me = State.Users.find(u => String(u.Id) === State.UserId) ?? null;
  if (!State.Me) {
    main.innerHTML = '<p class="empty">Pilih pengguna di kanan atas untuk mulai. Admin melihat semua creator, creator mengelola kontennya sendiri.</p>';
    return;
  }
  const panels = Panels.filter(p => p.Roles.includes(State.Me.Role)).sort((a, b) => a.Order - b.Order);
  if (!panels.length) {
    main.innerHTML = '<p class="empty">Belum ada panel untuk peran ini.</p>';
    return;
  }
  main.innerHTML = panels
    .map((p, i) => `<section class="panel"><h2>${Esc(p.Title(State.Me))}</h2><div id="body-${i}"></div></section>`)
    .join('');
  await Promise.all(
    panels.map((p, i) => {
      const body = document.getElementById(`body-${i}`);
      return p.Render(body, State.Me).catch(error => (body.innerHTML = `<p class="empty">${Esc(error.message)}</p>`));
    }),
  );
}

async function Start() {
  State.Users = await Api('/api/users');
  const select = document.getElementById('user-select');
  select.innerHTML =
    '<option value="">Pilih pengguna</option>' +
    State.Users.map(u => `<option value="${u.Id}">${Esc(u.Name)} (${u.Role === 'ADMIN' ? 'Admin' : 'Creator'})</option>`).join('');
  if (!State.Users.some(u => String(u.Id) === State.UserId)) State.UserId = null;
  select.value = State.UserId ?? '';
  select.onchange = () => {
    State.UserId = select.value || null;
    if (State.UserId) localStorage.setItem('UserId', State.UserId);
    else localStorage.removeItem('UserId');
    RenderAll();
  };
  RenderAll();
}
