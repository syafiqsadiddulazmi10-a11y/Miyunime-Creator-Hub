const QuotaLabel = { FULFILLED: 'Terpenuhi', IN_PROGRESS: 'Dalam progres', LATE: 'Terlambat', NO_QUOTA: 'Belum ada kuota' };
const Day = iso => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function QuotaMeter(progress) {
  const slots = Math.min(progress.TargetCount, 31);
  const filled = Math.min(progress.UploadedCount, slots);
  return `<div class="meter ${progress.QuotaStatus}" role="img" aria-label="${filled} dari ${progress.TargetCount} konten terupload">${
    Array.from({ length: slots }, (_, i) => `<span class="slot${i < filled ? ' on' : ''}"></span>`).join('')
  }</div>`;
}

const Period = p => `${Day(p.StartDate)} sampai ${Day(p.EndDate)}`;

function CreatorProgressText(p) {
  if (p.QuotaStatus === 'FULFILLED') return 'Kuota periode ini terpenuhi.';
  if (p.QuotaStatus === 'LATE') return `Periode sudah berakhir dan kuota belum terpenuhi, kurang ${p.RemainingCount} konten.`;
  return `Sisa ${p.RemainingCount} konten lagi sebelum ${Day(p.EndDate)}.`;
}

RegisterPanel({
  Order: 1,
  Roles: ['CREATOR'],
  Title: () => 'Kuota saya',
  async Render(el) {
    const p = await Api('/api/dashboard/me');
    if (p.QuotaStatus === 'NO_QUOTA') {
      el.innerHTML = '<p class="empty">Admin belum menetapkan kuota untukmu. Hubungi admin Miyunime.</p>';
      return;
    }
    el.innerHTML = `
      <p id="quota-summary">Kamu sudah mengupload <strong>${p.UploadedCount} dari ${p.TargetCount}</strong> konten pada periode ${Period(p)}.</p>
      ${QuotaMeter(p)}
      <p class="status q-${p.QuotaStatus}">${QuotaLabel[p.QuotaStatus]}</p>
      <p class="meta">${CreatorProgressText(p)}</p>`;
  },
});

RegisterPanel({
  Order: 1,
  Roles: ['ADMIN'],
  Title: () => 'Kuota creator',
  async Render(el) {
    const { Summary: s, Creators } = await Api('/api/dashboard/admin');
    if (!s.TotalCreators) {
      el.innerHTML = '<p class="empty">Belum ada creator terdaftar.</p>';
      return;
    }
    const parts = [
      [s.CreatorsLate, 'terlambat'],
      [s.CreatorsInProgress, 'dalam progres'],
      [s.CreatorsFulfilled, 'terpenuhi'],
      [s.CreatorsWithoutQuota, 'belum punya kuota'],
    ].filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    el.innerHTML = `
      <p id="quota-summary">Dari ${s.TotalCreators} creator: ${parts.join(', ')}. Total ${s.TotalContentUploadedThisPeriod} konten sudah diupload pada periode kuota masing-masing.</p>
      <div class="creators">${Creators.map(c => `
        <div class="creator">
          <div><strong>${Esc(c.Name)}</strong><div class="meta"><span>${Esc(c.InstagramHandle ?? '')}</span></div></div>
          <div>${c.QuotaStatus === 'NO_QUOTA' ? '' : QuotaMeter(c)}<div class="meta">${
            c.QuotaStatus === 'NO_QUOTA' ? '<span>Kuota belum ditetapkan</span>' : `<span>${c.UploadedCount} dari ${c.TargetCount} konten</span><span>${Period(c)}</span>`
          }</div></div>
          <span class="status q-${c.QuotaStatus}">${QuotaLabel[c.QuotaStatus]}</span>
        </div>`).join('')}</div>`;
  },
});
