"""Real DOM workspace-archive smoke using fake in-memory cloud responses."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
import subprocess
subprocess.run(['node','tests/build-workspace-archive-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div></body></html>'
PROJECT='33333333-3333-4333-8333-333333333333'
GENERAL='11111111-1111-4111-8111-111111111111'
TASK='44444444-4444-4444-8444-444444444444'

def run(browser,width):
 page=browser.new_page(viewport={'width':width,'height':870})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content(HTML)
 page.evaluate("""() => {const store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}}})}""")
 page.add_style_tag(content=(ROOT/'tests/.harness/archive.css').read_text())
 page.add_script_tag(content=(ROOT/'tests/.harness/archive-app.js').read_text())
 assert 'Make space for what matters' in page.locator('h1').inner_text()

 # General cannot show an Archive action; test both screen sizes.
 page.locator(f'[data-action="workspace"][data-id="{GENERAL}"]').first.click()
 assert page.locator('[data-action="archive-workspace"]').count()==0
 if width<760:
  page.locator('.mobile-nav [data-page="tasks"]').click()
 else:
  page.locator('.sidebar [data-page="tasks"]').click()
 page.locator(f'.task-row [data-action="start"][data-id="{TASK}"]').first.click()
 assert page.locator('.global-timer').count()==1

 # Navigation never loses the global timer.
 if width<760:
  page.locator('.mobile-nav [data-page="home"]').click()
  page.locator('.content [data-page="workspaces"]').first.click()
 else:
  page.locator('.sidebar [data-page="workspaces"]').click()
 page.locator(f'[data-action="workspace"][data-id="{PROJECT}"]').first.click()
 assert page.locator('[data-action="archive-workspace"]').count()==1
 page.locator('[data-action="archive-workspace"]').click()
 assert 'Nothing is deleted' in page.locator('.modal').inner_text()
 assert 'timer' in page.locator('.modal').inner_text().lower()
 page.locator('[data-action="confirm-archive-workspace"]').click()
 page.wait_for_function("() => window.__mockDb.workspaces.find(w=>w.kind==='custom').archivedAt !== null")
 assert page.locator('.global-timer').count()==0
 assert page.locator(f'[data-action="workspace"][data-id="{PROJECT}"]').count()==0
 saved=page.evaluate("() => JSON.parse(localStorage.getItem('dayframe.test.archive'))")
 assert saved['sessions'][-1]['reason']=='workspace_archived'
 assert len(window_tasks:=page.evaluate("() => window.__mockDb.tasks"))==1
 assert window_tasks[0]['title']=='Example workspace task'

 # Archive list and restore are usable with mouse or touch-sized buttons.
 page.locator('[data-page="workspace-archive"]').click()
 page.locator('[data-action="restore-workspace"]').wait_for()
 assert 'Test Project' in page.locator('.archive-workspace-list').inner_text()
 page.locator('[data-action="restore-workspace"]').click()
 page.wait_for_function("() => window.__refreshCount===1")
 assert page.locator(f'[data-action="workspace"][data-id="{PROJECT}"]').count()==1
 assert page.evaluate("() => window.__mockDb.workspaces.find(w=>w.kind==='custom').archivedAt") is None
 for size in [320,390,768,1440]:
  page.set_viewport_size({'width':size,'height':870})
  overflow=page.evaluate('document.documentElement.scrollWidth')
  assert overflow<=size+3,f'Horizontal overflow at {size}px: {overflow}px'
 assert errors==[],errors
 page.close()

with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 run(browser,390)
 run(browser,1440)
 browser.close()
print('PASS: mobile/desktop archive, General protection, preserved tasks, timer stop and restore; no overflow')
