const ReportStatuses = { DRAFT: 'Draft', SUBMITTED: 'Diajukan', REVISION: 'Perlu revisi', APPROVED: 'Disetujui', SCHEDULED: 'Terjadwal', UPLOADED: 'Sudah diupload' };

RegisterPanel({
  Order: 4,
  Roles: ['ADMIN'],
  Title: () => 'Laporan',
  async Render(el) {
    const users = await Api('/api/users');
    const options = map => Object.entries(map).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    el.innerHTML = `
      <form id="report-form" class="form" novalidate>
        <label>Creator<select name="CreatorId"><option value="">Semua creator</option>${
          users.filter(u => u.Role === 'CREATOR').map(u => `<option value="${u.Id}">${Esc(u.Name)}</option>`).join('')
        }</select></label>
        <label>Status<select name="Status"><option value="">Semua status</option>${options(ReportStatuses)}</select></label>
        <label>Format<select name="Format"><option value="">Semua format</option>${options(FormatLabel)}</select></label>
        <label>Dari tanggal<input type="date" name="From"></label>
        <label>Sampai tanggal<input type="date" name="To"></label>
        <label>Cari judul<input name="Q" autocomplete="off"></label>
        <p class="meta">Tanggal laporan adalah waktu upload, atau waktu dibuat jika belum diupload.</p>
        <div class="inline">
          <button class="primary" type="submit">Unduh laporan konten (CSV)</button>
          <button type="button" id="quota-report">Unduh laporan kuota (CSV)</button>
        </div>
      </form>`;
    const run = (button, path) => Guard(button, async () => Notify(`Laporan diunduh: ${await Download(path)}`));
    el.querySelector('#report-form').addEventListener('submit', event => {
      event.preventDefault();
      const query = new URLSearchParams();
      for (const [key, value] of new FormData(event.target)) if (String(value).trim()) query.set(key, String(value).trim());
      run(event.submitter, `/api/reports/contents.csv${query.size ? `?${query}` : ''}`);
    });
    el.querySelector('#quota-report').addEventListener('click', event => run(event.currentTarget, '/api/reports/quota.csv'));
  },
});
