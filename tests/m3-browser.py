"""Dayframe M3 end-to-end DOM interactions against in-memory Neon mock; no real users."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m3-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(7000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
 const d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}}});
 if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>'88888888-8888-4888-8888-'+Math.floor(Math.random()*1e12).toString().padStart(12,'0')});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m3.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m3-app.js').read_text())
 assert p.locator('h1').count()>0,errors
 nav='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{nav} [data-page="tasks"]').click()
 assert p.locator('#task-sort').count()==1
 p.locator('#task-sort').select_option('priority')
 p.locator('[data-action="filter"][data-value="pinned"]').click()
 p.locator('[data-action="filter"][data-value="all"]').click()
 p.locator('[data-action="modal-task"]').first.click()
 p.locator('#title').fill('M3 new task')
 p.locator('#task-priority').select_option('high')
 p.locator('#task-tags').fill('Urgent, Research')
 p.locator('[name="pinned"]').check()
 p.locator('#task-form [type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.some(t=>t.title==='M3 new task')")
 tid=p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task').id")
 current=p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task')")
 assert current['priority']=='high' and current['pinned'] and current['tags']==['Urgent','Research']
 p.locator(f'[data-action="detail"][data-id="{tid}"]').first.click()
 p.locator('[data-action="add-subtask"]').click()
 p.locator('#title').fill('M3 nested child')
 p.locator('#task-form [type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.some(t=>t.title==='M3 nested child')")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 nested child').parent")==tid
 p.once('dialog',lambda dialog:dialog.accept())
 p.locator('[data-action="cancel-task"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task').status==='cancelled'")
 p.locator('[data-action="reopen-task"]').first.click()
 p.wait_for_function("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task').status==='open'")
 p.locator('[data-action="task-tab"][data-value="history"]').click()
 p.get_by_text('Task changes in Neon').wait_for()
 p.locator('[data-action="modal-move-task"]').click()
 p.locator('#move-workspace').select_option('33333333-3333-4333-8333-333333333333')
 p.locator('#move-task-form [type="submit"]').click()
 p.wait_for_function("() => window.__refreshCount>=1")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 nested child').workspace")=='33333333-3333-4333-8333-333333333333'
 p.locator(f'{nav} [data-page="tasks"]').click()
 p.locator(f'[data-action="detail"][data-id="{tid}"]').first.click()
 p.locator('[data-action="modal-archive-task"]').click()
 p.locator('[data-action="confirm-archive-task"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task').archivedAt!==null")
 p.locator('[data-page="task-archive"]').first.click()
 p.locator(f'[data-action="unarchive-task"][data-id="{tid}"]').click()
 p.wait_for_function("() => window.__refreshCount>=2")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 nested child').archivedAt") is None
 p.locator(f'{nav} [data-page="tasks"]').click()
 p.locator(f'[data-action="detail"][data-id="{tid}"]').first.click()
 p.locator('[data-action="modal-delete-task"]').click()
 p.locator('[data-action="confirm-delete-task"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.find(t=>t.title==='M3 new task').deletedAt!==null")
 p.locator('[data-page="trash"]').first.click()
 p.locator(f'[data-action="restore-task"][data-id="{tid}"]').click()
 p.wait_for_function("() => window.__refreshCount>=3")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='M3 nested child').deletedAt") is None
 for width2 in (320,390,768,1440):
  p.set_viewport_size({'width':width2,'height':850})
  assert p.evaluate('document.documentElement.scrollWidth')<=width2+4,f'Horizontal overflow {width2}px'
 assert not errors,errors
 p.close()
with sync_playwright() as playwright:
 b=playwright.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 run(b,390)
 run(b,1440)
 b.close()
print('PASS: M3 task forms, filters, nested work, cancel/reopen, audit, move, archive and Trash on mobile/desktop')
