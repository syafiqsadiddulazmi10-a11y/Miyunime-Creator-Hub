const ActivityLabel = {
  LOGIN: 'Masuk', CONTENT_CREATED: 'Konten dibuat', CONTENT_SUBMITTED: 'Konten diajukan', CONTENT_RESUBMITTED: 'Konten diajukan ulang',
  CONTENT_APPROVED: 'Konten disetujui', CONTENT_REVISION_REQUESTED: 'Revisi diminta', CONTENT_UPLOADED: 'Konten diupload',
  CONTENT_DELETED: 'Konten dihapus', QUOTA_CREATED: 'Kuota dibuat', QUOTA_DELETED: 'Kuota dihapus',
};

RegisterPanel({
  Order: 20,
  Roles: ['CREATOR', 'ADMIN'],
  Title: me => (me.Role === 'ADMIN' ? 'Log aktivitas' : 'Aktivitas saya'),
  async Render(el, me) {
    const items = await Api('/api/activity?Limit=15');
    if (!items.length) {
      el.innerHTML = '<p class="empty">Belum ada aktivitas tercatat.</p>';
      return;
    }
    el.innerHTML = `<ul class="rows">${items.map(a => `<li class="row">
      <div class="row-head"><strong>${Esc(ActivityLabel[a.Action] ?? a.Action)}</strong><span class="meta">${FormatDate(a.CreatedAt)}</span></div>
      <div class="meta"><span>${Esc(a.Target)}</span>${me.Role === 'ADMIN' ? `<span>Oleh ${Esc(a.UserName ?? '-')}</span>` : ''}</div></li>`).join('')}</ul>`;
  },
});
