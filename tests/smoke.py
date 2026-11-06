from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 page=browser.new_page(viewport={'width':390,'height':844})
 errs=[]
 page.on('pageerror',lambda e: errs.append(str(e)))
 page.set_content('<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>')
 page.evaluate("""() => { const db = {}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]||null,setItem:(k,v)=>{db[k]=String(v)},removeItem:k=>{delete db[k]}}}) }""")
 page.add_style_tag(content=(root/'styles.css').read_text())
 page.add_script_tag(content=(root/'app.js').read_text())
 assert 'Make space' in page.locator('h1').inner_text()
 page.locator('.mobile-nav [data-page="tasks"]').click()
 assert page.locator('h1').inner_text()=='Your tasks'
 page.locator('[data-action="modal-task"]').first.click()
 form=page.locator('#task-form')
 form.locator('[name="title"]').fill('Buy notebook')
 form.locator('[name="reminder"]').fill('2026-11-09')
 form.locator('[name="reminderTime"]').fill('09:30')
 form.locator('[type="submit"]').click()
 assert page.get_by_text('Buy notebook').count()>=1
 page.locator('.mobile-nav [data-page="plan"]').click()
 page.locator('[data-action="modal-plan-add"]').first.click()
 task=page.locator('[data-action="pool-add"]').filter(has_text='Buy notebook')
 task.click()
 assert 'Buy notebook' in page.locator('.pool-item').all_text_contents().__str__()
 page.locator('.pool-item [data-action="modal-schedule"]').last.click()
 sf=page.locator('#schedule-form')
 sf.locator('[name="task"]').select_option(label='Buy notebook')
 sf.locator('[name="start"]').fill('16:00')
 sf.locator('[name="end"]').fill('16:30')
 sf.locator('[type="submit"]').click()
 assert 'Buy notebook' in page.locator('.time-card').all_text_contents().__str__()
 page.locator('.mobile-nav [data-page="notes"]').click()
 page.locator('[data-action="modal-note"]').first.click()
 nf=page.locator('#note-form')
 nf.locator('[name="title"]').fill('Remember a detail')
 nf.locator('[name="content"]').fill('Bring the notebook')
 nf.locator('[type="submit"]').click()
 assert page.get_by_text('Remember a detail').count()>=1
 page.locator('.mobile-top [data-page="settings"]').click()
 page.locator('[data-action="theme"][data-id="midnight"]').click()
 assert page.locator('html').get_attribute('data-theme')=='midnight'
 page.locator('.mobile-nav [data-page="tasks"]').click()
 page.locator('[data-action="detail"]').filter(has_text='Buy notebook').click()
 assert page.locator('h1').inner_text()=='Buy notebook'
 page.locator('[data-action="modal-delete-task"]').click()
 assert page.locator('[data-action="confirm-delete-task"]').is_visible()
 page.get_by_role("button",name="Keep task").click()
 assert page.locator('h1').inner_text()=='Buy notebook'
 assert not errs, errs
 print('PASS: mobile home, task+reminder/time, day pool, interval, quick note, theme, task detail and delete confirmation')
 browser.close()
