const StatusLabel = {
  DRAFT: 'Draft', SUBMITTED: 'Diajukan', REVISION: 'Perlu revisi', APPROVED: 'Disetujui', SCHEDULED: 'Terjadwal', UPLOADED: 'Sudah diupload',
};
const FormatLabel = { FEED: 'Feed', REELS: 'Reels', STORY: 'Story', CAROUSEL: 'Carousel' };
const ContentFilter = {};

const Options = (map, current) => Object.entries(map).map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');

const ContentForm = () => `
  <form id="content-form" class="form" novalidate>
    <label>Judul konten<input name="Title" maxlength="120" autocomplete="off"></label>
    <label>Format<select name="Format">${Options(FormatLabel)}</select></label>
    <label>Jadwal upload (opsional)<input type="datetime-local" name="ScheduledAt"></label>
    <label>Tautan aset/draft (opsional)<input name="LinkDraft" type="url" maxlength="500" placeholder="https://drive.google.com/..."></label>
    <label>Caption (opsional)<textarea name="Caption" rows="2" maxlength="2200"></textarea></label>
    <button class="primary" type="submit">Simpan konten</button>
  </form>`;

const FilterForm = me => `
  <form id="filter-form" class="filters" novalidate aria-label="Filter konten">
    <input name="Q" placeholder="Cari judul" aria-label="Cari judul" value="${Esc(ContentFilter.Q ?? '')}">
    <select name="Status" aria-label="Status"><option value="">Semua status</option>${Options(StatusLabel, ContentFilter.Status)}</select>
    <select name="Format" aria-label="Format"><option value="">Semua format</option>${Options(FormatLabel, ContentFilter.Format)}</select>
    <input type="date" name="From" aria-label="Dari tanggal" value="${Esc(ContentFilter.From ?? '')}">
    <input type="date" name="To" aria-label="Sampai tanggal" value="${Esc(ContentFilter.To ?? '')}">
    <button type="submit">Terapkan</button>
    <button type="button" id="filter-reset">Reset</button>
  </form>
  ${me.Role === 'CREATOR' ? '<p class="meta">Riwayat berdasarkan waktu upload, atau waktu dibuat jika belum diupload.</p>' : ''}`;

const DraftLink = content =>
  content.LinkDraft ? `<span><a href="${Esc(content.LinkDraft)}" target="_blank" rel="noopener noreferrer">Aset/draft</a></span>` : '';

const UploadForm = (content, canSubmit) => `
  <form class="inline" data-upload="${content.Id}" novalidate>
    <input name="InstagramLink" aria-label="Tautan postingan Instagram" placeholder="https://www.instagram.com/p/...">
    <button class="primary" type="submit">Tandai sudah diupload</button>
    ${canSubmit ? `<button type="button" data-submit="${content.Id}">Ajukan review</button>` : ''}
    <button type="button" data-delete="${content.Id}">Hapus</button>
  </form>`;

const RevisionForm = content => `
  <p class="review-note" role="note"><strong>Catatan admin:</strong> ${Esc(content.ReviewComment)}</p>
  <form class="inline" data-resubmit="${content.Id}" novalidate>
    <input name="Title" aria-label="Judul konten" maxlength="120" value="${Esc(content.Title)}">
    <input name="Caption" aria-label="Caption" maxlength="2200" value="${Esc(content.Caption)}" placeholder="Caption">
    <input name="LinkDraft" aria-label="Tautan aset/draft" maxlength="500" value="${Esc(content.LinkDraft)}" placeholder="Tautan aset/draft">
    <button class="primary" type="submit">Ajukan ulang</button>
    <button type="button" data-delete="${content.Id}">Hapus</button>
  </form>`;

function CreatorActions(content) {
  switch (content.Status) {
    case 'UPLOADED': return `<p class="meta"><a href="${Esc(content.InstagramLink)}" target="_blank" rel="noopener noreferrer">Lihat postingan</a></p>`;
    case 'SUBMITTED': return '<p class="meta">Menunggu review admin. Konten tidak bisa diubah, diupload, atau dihapus sampai ada keputusan.</p>';
    case 'REVISION': return RevisionForm(content);
    case 'APPROVED': return UploadForm(content, false);
    default: return UploadForm(content, true);
  }
}

function ContentRow(content, me) {
  const owner = me.Role === 'ADMIN' ? `<span>Creator ${Esc(content.CreatorName)}</span>` : '';
  const dates = content.Status === 'UPLOADED'
    ? `<span>Diupload ${FormatDate(content.UploadedAt)}</span>`
    : content.ScheduledAt ? `<span>Jadwal ${FormatDate(content.ScheduledAt)}</span>` : `<span>Dibuat ${FormatDate(content.CreatedAt)}</span>`;
  const actions = me.Role === 'CREATOR'
    ? CreatorActions(content)
    : content.Status === 'UPLOADED' ? `<p class="meta"><a href="${Esc(content.InstagramLink)}" target="_blank" rel="noopener noreferrer">Lihat postingan</a></p>` : '';
  return `<li class="row">
    <div class="row-head"><strong>${Esc(content.Title)}</strong><span class="status ${content.Status}">${StatusLabel[content.Status]}</span></div>
    <div class="meta"><span>${FormatLabel[content.Format]}</span>${dates}${owner}${DraftLink(content)}</div>${actions}</li>`;
}

/** Satu pola untuk semua aksi: kunci tombol, panggil API, muat ulang, beri tahu hasilnya. */
const Act = (button, path, options, successMessage) =>
  Guard(button, async () => {
    await Api(path, options);
    await RenderAll();
    Notify(successMessage);
  });

function BindContentActions(el) {
  el.querySelector('#content-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const scheduled = form.get('ScheduledAt');
    const title = String(form.get('Title') ?? '').trim();
    if (!title) return Notify('Judul wajib diisi dan maksimal 120 karakter', true);
    Act(event.submitter, '/api/contents', {
      method: 'POST',
      body: {
        Title: title,
        Format: form.get('Format'),
        Caption: form.get('Caption') || null,
        LinkDraft: form.get('LinkDraft') || null,
        ScheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
      },
    }, 'Konten disimpan');
  });
  el.querySelectorAll('[data-upload]').forEach(form =>
    form.addEventListener('submit', event => {
      event.preventDefault();
      Act(event.submitter, `/api/contents/${form.dataset.upload}/upload`, {
        method: 'POST', body: { InstagramLink: new FormData(form).get('InstagramLink') },
      }, 'Konten ditandai sudah diupload');
    }),
  );
  el.querySelectorAll('[data-submit]').forEach(button =>
    button.addEventListener('click', () => Act(button, `/api/contents/${button.dataset.submit}/submit`, { method: 'POST', body: {} }, 'Konten diajukan untuk direview')),
  );
  el.querySelectorAll('[data-resubmit]').forEach(form =>
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      Act(event.submitter, `/api/contents/${form.dataset.resubmit}/submit`, {
        method: 'POST', body: { Title: data.get('Title'), Caption: data.get('Caption') || null, LinkDraft: data.get('LinkDraft') || null },
      }, 'Konten diajukan ulang untuk direview');
    }),
  );
  el.querySelectorAll('[data-delete]').forEach(button =>
    button.addEventListener('click', () => {
      if (confirm('Hapus konten ini?')) Act(button, `/api/contents/${button.dataset.delete}`, { method: 'DELETE' }, 'Konten dihapus');
    }),
  );
}

function BindFilter(el) {
  el.querySelector('#filter-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    for (const key of ['Q', 'Status', 'Format', 'From', 'To']) ContentFilter[key] = String(data.get(key) ?? '').trim();
    RenderAll();
  });
  el.querySelector('#filter-reset').addEventListener('click', () => {
    for (const key of Object.keys(ContentFilter)) delete ContentFilter[key];
    RenderAll();
  });
}

RegisterPanel({
  Order: 9,
  Roles: ['CREATOR', 'ADMIN'],
  Title: me => (me.Role === 'ADMIN' ? 'Semua konten' : 'Konten saya'),
  async Render(el, me) {
    const query = new URLSearchParams(Object.entries(ContentFilter).filter(([, v]) => v));
    const contents = await Api(`/api/contents${query.size ? `?${query}` : ''}`);
    const filtered = query.size > 0;
    const empty = filtered
      ? 'Tidak ada konten yang cocok dengan filter.'
      : me.Role === 'ADMIN' ? 'Belum ada konten dari creator.' : 'Belum ada konten. Catat ide pertamamu lewat formulir di atas.';
    el.innerHTML =
      (me.Role === 'CREATOR' ? ContentForm() : '') +
      FilterForm(me) +
      (contents.length ? `<ul class="rows">${contents.map(c => ContentRow(c, me)).join('')}</ul>` : `<p class="empty">${empty}</p>`);
    if (me.Role === 'CREATOR') BindContentActions(el);
    BindFilter(el);
  },
});
