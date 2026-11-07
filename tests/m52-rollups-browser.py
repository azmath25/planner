"""M5.2 multi-level task time rollups + workspace Add task via actual Dayframe DOM."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m52-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
ROOT_ID='44444444-4444-4444-8444-444444444444'
CHILD='66666666-6666-4666-8666-666666666666'
GRAND='99999999-9999-4999-8999-999999999999'
PROJECT='33333333-3333-4333-8333-333333333333'
GENERAL_ID='11111111-1111-4111-8111-111111111111'
def nav(p,page,width):
 if width<760:
  if page=='workspaces':
   p.locator('.mobile-nav [data-page="home"]').click()
   p.locator('.content [data-page="workspaces"]').first.click()
   return
  if page=='reports':
   p.locator('.mobile-top [data-page="reports"]').click()
   return
 selector='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="{page}"]').click()
def task_detail(p,id,width):
 nav(p,'tasks',width)
 p.locator(f'.task-row [data-action="detail"][data-id="{id}"]').first.click()
 p.locator('.page-detail [data-current-task-time]').wait_for()
def assert_time(p,expected,own,subtasks):
 assert p.locator('[data-current-task-time]').inner_text()==expected
 details=p.locator('[data-task-time-breakdown]').inner_text()
 assert own in details and subtasks in details,details
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':870})
 p.set_default_timeout(12000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const d={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}
  }});
  let counter=1;
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> '77777777-7777-4777-8777-'+String(counter++).padStart(12,'0')});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m52.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m52-app.js').read_text())
 p.wait_for_function("() => document.querySelector('.info-banner[role=status]')===null")
 task_detail(p,ROOT_ID,width)
 assert_time(p,'00:03:30','00:02:00','00:01:30')
 task_detail(p,CHILD,width)
 assert_time(p,'00:01:30','00:01:00','00:00:30')
 task_detail(p,GRAND,width)
 assert_time(p,'00:00:30','00:00:30','00:00:00')

 nav(p,'workspaces',width)
 p.locator('[data-action="workspace"][data-id="general"]').first.click()
 p.locator('[data-current-workspace-time]').wait_for()
 assert p.locator('[data-current-workspace-time]').inner_text()=='00:03:30'
 p.locator('[data-action="modal-task"][aria-label="Add task to General"]').first.click()
 p.locator('#task-form').wait_for()
 assert p.locator('#task-form [name="workspace"]').input_value()=='general'
 p.locator('#task-form [name="title"]').fill('Created in General workspace')
 p.locator('#task-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.some(t=>t.title==='Created in General workspace')")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='Created in General workspace').workspace") == GENERAL_ID

 nav(p,'workspaces',width)
 p.locator(f'[data-action="workspace"][data-id="{PROJECT}"]').first.click()
 p.locator('[data-action="modal-task"][aria-label="Add task to Research"]').first.click()
 assert p.locator('#task-form [name="workspace"]').input_value()==PROJECT
 p.locator('#task-form [name="title"]').fill('Created inside Research')
 p.locator('#task-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.some(t=>t.title==='Created inside Research')")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='Created inside Research').workspace")==PROJECT
 assert 'Created inside Research' in p.locator('.content').inner_text()

 nav(p,'reports',width)
 p.locator('[data-current-account-time]').wait_for()
 assert p.locator('[data-current-account-time]').inner_text()=='00:03:30'
 assert '00:03:30' in p.locator('.report-table').inner_text()
 assert 'time-series charts' in p.locator('.content').inner_text().lower()
 assert not errors,errors
 assert p.evaluate('() => document.documentElement.scrollWidth<=window.innerWidth+3'),f'Overflow at {width}'
 p.close()
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):run(browser,width)
 browser.close()
 print('PASS: nested task time 3 levels; workspace Add task default and submit; global deduplicated totals; mobile widths')
