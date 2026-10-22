const PeriodLabel = { WEEKLY: 'Mingguan', MONTHLY: 'Bulanan' };

function QuotaForm(creators) {
  return `
  <form id="quota-form" class="form" novalidate>
    <label>Creator<select name="UserId">${creators.map(c => `<option value="${c.Id}">${Esc(c.Name)}</option>`).join('')}</select></label>
    <label>Periode<select name="PeriodType">${Object.entries(PeriodLabel).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <label>Target posting<input name="TargetCount" type="number" min="1" max="100" value="4"></label>
    <label>Tanggal mulai<input name="StartDate" type="date"></label>
    <p class="meta">Tanggal berakhir dihitung otomatis: 7 hari untuk mingguan, satu bulan untuk bulanan.</p>
    <button class="primary" type="submit">Simpan kuota</button>
  </form>`;
}

function QuotaRowHtml(q, now) {
  const started = new Date(q.StartDate) <= now;
  return `<li class="row">
    <div class="row-head"><strong>${Esc(q.CreatorName)}</strong><span class="meta"><span>${PeriodLabel[q.PeriodType]}</span><span>Target ${q.TargetCount}</span></span></div>
    <div class="meta"><span>${Day(q.StartDate)} sampai ${Day(q.EndDate)}</span>${
      started ? '<span>Sudah berjalan</span>' : `<button type="button" data-delete-quota="${q.Id}">Hapus</button>`
    }</div></li>`;
}

RegisterPanel({
  Order: 3,
  Roles: ['ADMIN'],
  Title: () => 'Pengaturan kuota',
  async Render(el) {
    const [quotas, users] = await Promise.all([Api('/api/quotas'), Api('/api/users')]);
    const creators = users.filter(u => u.Role === 'CREATOR');
    const now = new Date();
    el.innerHTML = QuotaForm(creators) + (quotas.length ? `<ul class="rows">${quotas.map(q => QuotaRowHtml(q, now)).join('')}</ul>` : '<p class="empty">Belum ada kuota.</p>');
    el.querySelector('#quota-form').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        await Api('/api/quotas', {
          method: 'POST',
          body: {
            UserId: Number(data.get('UserId')),
            PeriodType: data.get('PeriodType'),
            TargetCount: Number(data.get('TargetCount')),
            StartDate: data.get('StartDate'),
          },
        });
        await RenderAll();
        Notify('Kuota disimpan');
      } catch (error) {
        Notify(error.message, true);
      }
    });
    el.querySelectorAll('[data-delete-quota]').forEach(button =>
      button.addEventListener('click', async () => {
        if (!confirm('Hapus kuota ini?')) return;
        try {
          await Api(`/api/quotas/${button.dataset.deleteQuota}`, { method: 'DELETE' });
          await RenderAll();
          Notify('Kuota dihapus');
        } catch (error) {
          Notify(error.message, true);
        }
      }),
    );
  },
});
