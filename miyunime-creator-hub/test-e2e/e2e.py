# Uji UI end-to-end (Playwright, Python). Butuh server berjalan dengan data seed baru: npm run seed && PORT=3100 npm start
# Jalankan: python3 test-e2e/e2e.py   (pip install playwright && playwright install chromium)
from playwright.sync_api import sync_playwright, expect
import sys
B=os.environ.get('BASE_URL','http://localhost:3100')
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','docs','bukti')+'/'
results=[]
def check(name, cond):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name)
def notice(page): 
    return page.locator('#notice').inner_text()
def login(page,email,pw='miyunime123'):
    page.fill('input[name=Email]',email); page.fill('input[name=Password]',pw); page.click('#login-form button[type=submit]')

with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1000,'height':900}, accept_downloads=True); page=ctx.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.goto(B)
    check('layar login tampil saat belum masuk', page.locator('#login').is_visible() and page.locator('#panels').inner_text()=='')
    # validasi kosong
    page.click('#login-form button[type=submit]'); page.wait_for_timeout(200)
    check('login kosong ditolak di UI', 'wajib diisi' in notice(page))
    login(page,'aiko@miyunime.id','salah'); page.wait_for_timeout(400)
    check('sandi salah ditolak server', 'Email atau kata sandi salah' in notice(page))
    page.screenshot(path=OUT+'mvp-01-login-gagal.png')
    # admin
    login(page,'admin@miyunime.id'); page.wait_for_selector('#who-name:visible')
    page.wait_for_selector('#quota-summary')
    check('admin: header menampilkan nama dan peran', 'Admin' in page.inner_text('#who-name'))
    txt=page.inner_text('#panels')
    check('admin: dashboard menampilkan Sari terlambat', 'Sari' in txt and 'Terlambat' in txt)
    check('admin: pengingat tampil (review menunggu & terlambat)', 'menunggu review' in txt and 'terlambat' in txt)
    check('admin: panel review, kuota, laporan, log tampil', all(t in txt for t in ['Menunggu review','Pengaturan kuota','Laporan','Log aktivitas']))
    page.screenshot(path=OUT+'mvp-02-admin.png', full_page=True)
    # review: minta revisi tanpa catatan
    page.locator('[data-review] button[data-decision=REVISION]').first.click(); page.wait_for_timeout(200)
    check('admin: revisi tanpa catatan ditolak', 'Catatan revisi wajib' in notice(page))
    page.locator('[data-review] input[name=Comment]').first.fill('Sudah bagus')
    page.locator('[data-review] button[data-decision=APPROVED]').first.click(); page.wait_for_timeout(500)
    check('admin: setujui konten berhasil', 'disetujui' in notice(page))
    # kuota untuk Dewi
    page.select_option('#quota-form select[name=UserId]', label='Dewi')
    page.fill('#quota-form input[name=StartDate]','2026-10-01'); page.fill('#quota-form input[name=TargetCount]','0')
    page.click('#quota-form button[type=submit]'); page.wait_for_timeout(200)
    check('admin: target kuota 0 ditolak', 'antara 1 dan 100' in notice(page))
    page.fill('#quota-form input[name=TargetCount]','3'); page.click('#quota-form button[type=submit]'); page.wait_for_timeout(600)
    check('admin: kuota Dewi tersimpan & dashboard berubah', 'Kuota disimpan' in notice(page) and 'belum punya kuota' not in page.inner_text('#quota-summary'))
    # tumpang tindih
    page.select_option('#quota-form select[name=UserId]', label='Dewi'); page.fill('#quota-form input[name=StartDate]','2026-10-05'); page.click('#quota-form button[type=submit]'); page.wait_for_timeout(400)
    check('admin: kuota tumpang tindih ditolak', 'bertabrakan' in notice(page))
    # laporan
    with page.expect_download() as d: page.click('#report-form button.primary')
    check('admin: unduh laporan konten CSV', d.value.suggested_filename.endswith('.csv'))
    with page.expect_download() as d2: page.click('#quota-report')
    check('admin: unduh laporan kuota CSV', 'laporan-kuota' in d2.value.suggested_filename)
    # filter admin
    page.select_option('#filter-form select[name=Status]','UPLOADED'); page.click('#filter-form button[type=submit]'); page.wait_for_timeout(500)
    rows=page.locator('.panel:has(h2:text("Semua konten")) li.row')
    check('admin: filter status UPLOADED bekerja', rows.count()>0 and all('Sudah diupload' in rows.nth(i).inner_text() for i in range(rows.count())))
    page.fill('#filter-form input[name=Q]','tidak-ada-judul-ini'); page.click('#filter-form button[type=submit]'); page.wait_for_timeout(400)
    check('admin: filter tanpa hasil menampilkan pesan kosong', 'Tidak ada konten yang cocok' in page.inner_text('#panels'))
    page.click('#filter-reset'); page.wait_for_timeout(400)
    page.screenshot(path=OUT+'mvp-03-admin-setelah.png', full_page=True)
    page.click('#logout'); page.wait_for_selector('#login:visible')
    check('logout kembali ke layar login & panel kosong', page.locator('#panels').inner_text()=='')
    # creator
    login(page,'aiko@miyunime.id'); page.wait_for_selector('#quota-summary')
    check('creator: kuota 3 dari 4', '3 dari 4' in page.inner_text('#quota-summary'))
    check('creator: tidak melihat panel admin', 'Pengaturan kuota' not in page.inner_text('#panels') and 'Menunggu review' not in page.inner_text('#panels'))
    page.click('#content-form button[type=submit]'); page.wait_for_timeout(200)
    check('creator: judul kosong ditolak', 'Judul wajib diisi' in notice(page))
    page.fill('#content-form input[name=Title]','Konten uji MVP'); page.fill('#content-form input[name=LinkDraft]','javascript:alert(1)')
    page.evaluate("document.querySelector('#content-form input[name=LinkDraft]').type='text'")
    page.click('#content-form button[type=submit]'); page.wait_for_timeout(400)
    check('creator: tautan draft berbahaya ditolak server', 'Tautan aset/draft' in notice(page))
    page.fill('#content-form input[name=LinkDraft]','https://drive.google.com/file/d/uji'); page.click('#content-form button[type=submit]'); page.wait_for_timeout(600)
    check('creator: konten tersimpan dengan tautan draft', 'Konten uji MVP' in page.inner_text('#panels') and 'Aset/draft' in page.inner_text('#panels'))
    item=page.locator('li.row:has-text("Konten uji MVP")')
    item.locator('input[name=InstagramLink]').fill('https://example.com'); item.locator('button.primary').click(); page.wait_for_timeout(400)
    check('creator: tautan bukan Instagram ditolak', 'Tautan Instagram tidak valid' in notice(page))
    page.locator('li.row:has-text("Konten uji MVP") input[name=InstagramLink]').fill('https://www.instagram.com/p/UjiMvp1/')
    page.locator('li.row:has-text("Konten uji MVP") button.primary').click(); page.wait_for_timeout(700)
    check('creator: upload sukses', 'sudah diupload' in notice(page).lower())
    # Aiko punya 'Rekap episode minggu ini' -> 5 dari 4? target 4; 3 + 1 = 4
    check('creator: kuota terpenuhi 4 dari 4', '4 dari 4' in page.inner_text('#quota-summary') and 'Terpenuhi' in page.inner_text('#panels'))
    check('creator: log aktivitas pribadi tampil', 'Konten diupload' in page.inner_text('#panels'))
    page.screenshot(path=OUT+'mvp-04-creator.png', full_page=True)
    # ajukan review
    page.locator('.panel:has(h2:text("Konten saya")) li.row:has-text("Ide thumbnail baru") button[data-submit]').click(); page.wait_for_timeout(500)
    check('creator: ajukan review -> status Diajukan & terkunci', 'Menunggu review admin' in page.locator('.panel:has(h2:text("Konten saya")) li.row:has-text("Ide thumbnail baru")').inner_text())
    # sesi kedaluwarsa -> token rusak
    page.evaluate("localStorage.setItem('Token','palsu')"); page.reload(); page.wait_for_selector('#login:visible')
    check('token tidak valid -> kembali ke login tanpa error', len(errors)==0)
    # server mati -> pesan gagal
    page.close(); br.close()
    print('JS errors:', errors)
fails=[n for n,ok in results if not ok]
print(f'\n{len(results)-len(fails)}/{len(results)} lulus'); 
if fails: print('GAGAL:',fails); sys.exit(1)
