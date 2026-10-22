const StatusLabel = { DRAFT: 'Draft', SCHEDULED: 'Terjadwal', UPLOADED: 'Sudah diupload' };
const FormatLabel = { FEED: 'Feed', REELS: 'Reels', STORY: 'Story', CAROUSEL: 'Carousel' };

const ContentForm = () => `
  <form id="content-form" class="form" novalidate>
    <label>Judul konten<input name="Title" maxlength="120" autocomplete="off"></label>
    <label>Format
      <select name="Format">${Object.entries(FormatLabel).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    </label>
    <label>Jadwal upload (opsional)<input type="datetime-local" name="ScheduledAt"></label>
    <label>Caption (opsional)<textarea name="Caption" rows="2" maxlength="2200"></textarea></label>
    <button class="primary" type="submit">Simpan konten</button>
  </form>`;

function ContentRow(content, me) {
  const owner = me.Role === 'ADMIN' ? `<span>Creator ${Esc(content.CreatorName)}</span>` : '';
  const dates = content.Status === 'UPLOADED'
    ? `<span>Diupload ${FormatDate(content.UploadedAt)}</span>`
    : content.ScheduledAt ? `<span>Jadwal ${FormatDate(content.ScheduledAt)}</span>` : '';
  const actions = content.Status === 'UPLOADED'
    ? `<p class="meta"><a href="${Esc(content.InstagramLink)}" target="_blank" rel="noopener">Lihat postingan</a></p>`
    : me.Role === 'CREATOR'
      ? `<form class="inline" data-upload="${content.Id}" novalidate>
           <input name="InstagramLink" aria-label="Tautan postingan Instagram" placeholder="https://www.instagram.com/p/...">
           <button class="primary" type="submit">Tandai sudah diupload</button>
           <button type="button" data-delete="${content.Id}">Hapus</button>
         </form>`
      : '';
  return `<li class="row">
    <div class="row-head"><strong>${Esc(content.Title)}</strong><span class="status ${content.Status}">${StatusLabel[content.Status]}</span></div>
    <div class="meta"><span>${FormatLabel[content.Format]}</span>${dates}${owner}</div>${actions}</li>`;
}

function BindContentActions(el) {
  el.querySelector('#content-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const scheduled = form.get('ScheduledAt');
    try {
      await Api('/api/contents', {
        method: 'POST',
        body: {
          Title: form.get('Title'),
          Format: form.get('Format'),
          Caption: form.get('Caption') || null,
          ScheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
        },
      });
      await RenderAll();
      Notify('Konten disimpan');
    } catch (error) {
      Notify(error.message, true);
    }
  });
  el.querySelectorAll('[data-upload]').forEach(form =>
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await Api(`/api/contents/${form.dataset.upload}/upload`, {
          method: 'POST',
          body: { InstagramLink: new FormData(form).get('InstagramLink') },
        });
        await RenderAll();
        Notify('Konten ditandai sudah diupload');
      } catch (error) {
        Notify(error.message, true);
      }
    }),
  );
  el.querySelectorAll('[data-delete]').forEach(button =>
    button.addEventListener('click', async () => {
      if (!confirm('Hapus konten ini?')) return;
      try {
        await Api(`/api/contents/${button.dataset.delete}`, { method: 'DELETE' });
        await RenderAll();
        Notify('Konten dihapus');
      } catch (error) {
        Notify(error.message, true);
      }
    }),
  );
}

RegisterPanel({
  Order: 2,
  Roles: ['CREATOR', 'ADMIN'],
  Title: me => (me.Role === 'ADMIN' ? 'Semua konten' : 'Konten saya'),
  async Render(el, me) {
    const contents = await Api('/api/contents');
    const empty = me.Role === 'ADMIN' ? 'Belum ada konten dari creator.' : 'Belum ada konten. Catat ide pertamamu lewat formulir di atas.';
    el.innerHTML =
      (me.Role === 'CREATOR' ? ContentForm() : '') +
      (contents.length ? `<ul class="rows">${contents.map(c => ContentRow(c, me)).join('')}</ul>` : `<p class="empty">${empty}</p>`);
    if (me.Role === 'CREATOR') BindContentActions(el);
  },
});
