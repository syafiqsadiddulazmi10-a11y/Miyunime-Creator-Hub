RegisterPanel({
  Order: 0,
  Roles: ['CREATOR', 'ADMIN'],
  Title: () => 'Pengingat',
  async Render(el) {
    const notices = await Api('/api/notifications');
    if (!notices.length) {
      el.innerHTML = '<p class="empty">Tidak ada pengingat. Semua aman.</p>';
      return;
    }
    el.innerHTML = `<ul class="notices">${notices.map(n => `<li class="notice-item ${n.Level}" role="note">${Esc(n.Message)}</li>`).join('')}</ul>`;
  },
});
