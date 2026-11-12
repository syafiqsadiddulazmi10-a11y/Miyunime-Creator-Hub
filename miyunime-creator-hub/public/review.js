function ReviewItem(content) {
  return `<li class="row">
    <div class="row-head"><strong>${Esc(content.Title)}</strong><span class="status SUBMITTED">Diajukan</span></div>
    <div class="meta"><span>Creator ${Esc(content.CreatorName)}</span><span>${FormatLabel[content.Format]}</span>${
      content.ScheduledAt ? `<span>Jadwal ${FormatDate(content.ScheduledAt)}</span>` : ''
    }</div>
    ${content.Caption ? `<p class="meta">${Esc(content.Caption)}</p>` : ''}
    <form class="inline" data-review="${content.Id}" novalidate>
      <input name="Comment" aria-label="Catatan review" maxlength="1000" placeholder="Catatan (wajib jika meminta revisi)">
      <button class="primary" type="submit" data-decision="APPROVED">Setujui</button>
      <button type="submit" data-decision="REVISION">Minta revisi</button>
    </form>
  </li>`;
}

RegisterPanel({
  Order: 2,
  Roles: ['ADMIN'],
  Title: () => 'Menunggu review',
  async Render(el) {
    const pending = await Api('/api/contents?Status=SUBMITTED');
    if (!pending.length) {
      el.innerHTML = '<p class="empty">Tidak ada konten yang menunggu review.</p>';
      return;
    }
    el.innerHTML = `<ul class="rows">${pending.map(ReviewItem).join('')}</ul>`;
    el.querySelectorAll('[data-review]').forEach(form =>
      form.addEventListener('submit', event => {
        event.preventDefault();
        const decision = event.submitter.dataset.decision;
        const comment = String(new FormData(form).get('Comment') ?? '').trim();
        if (decision === 'REVISION' && !comment) return Notify('Catatan revisi wajib diisi agar creator tahu apa yang perlu diperbaiki', true);
        Guard(event.submitter, async () => {
          await Api(`/api/contents/${form.dataset.review}/review`, { method: 'POST', body: { Decision: decision, Comment: comment } });
          await RenderAll();
          Notify(decision === 'APPROVED' ? 'Konten disetujui' : 'Konten dikembalikan untuk direvisi');
        });
      }),
    );
  },
});
