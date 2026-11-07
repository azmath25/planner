"""M4.1 daily pool: actual DOM controls with fake versioned Neon state, no real account data."""
from pathlib import Path
from datetime import date,timedelta
from playwright.sync_api import sync_playwright
import subprocess
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m4-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
A='44444444-4444-4444-8444-444444444444'

def nav(p,width,page):
 root='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{root} [data-page="{page}"]').click()

def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':870})
 p.set_default_timeout(9000)
 errors=[]
 p.on('pageerror',lambda error:errors.append(str(error)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const d={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}
  }});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m4.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m4-app.js').read_text())
 nav(p,width,'tasks')
 p.locator('[data-action="modal-task"]').first.click()
 p.locator('#title').fill('Second workspace task')
 p.locator('#workspace').select_option('33333333-3333-4333-8333-333333333333')
 p.locator('#task-form [type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.tasks.some(t=>t.title==='Second workspace task')")
 B=p.evaluate("() => window.__mockDb.tasks.find(t=>t.title==='Second workspace task').id")
 nav(p,width,'plan')
 p.locator('.pool-sync-status').get_by_text('Daily pool saved in Neon').wait_for()
 day=p.locator('#plan-day').input_value()
 for task_id in (A,B):
  p.locator('[data-action="modal-plan-add"]').first.click()
  p.locator(f'[data-action="pool-add"][data-id="{task_id}"]').click()
 p.wait_for_function("(day) => window.__mockDb.pools.get(day)?.taskIds.length===2",arg=day)
 saved=p.evaluate("(day) => window.__mockDb.pools.get(day)",day)
 assert saved['taskIds']==[A,B] and saved['revision']==2
 assert p.locator('.pool-item').count()==2
 assert p.locator('[data-action="modal-plan-add"]').first.is_enabled()
 # Move Research ahead of General without altering task deadlines.
 p.locator(f'[data-action="pool-up"][data-id="{B}"]').click()
 p.wait_for_function("(day) => window.__mockDb.pools.get(day)?.revision===3",arg=day)
 assert p.evaluate("(day) => window.__mockDb.pools.get(day).taskIds",day)==[B,A]
 p.evaluate("() => mountApp()")
 nav(p,width,'plan')
 p.locator('.pool-sync-status').get_by_text('Daily pool saved in Neon').wait_for()
 assert p.locator('.pool-item strong').all_inner_texts()==['Second workspace task','Write chapter']
 # Another day is independent; the first day remains unchanged.
 other=(date.fromisoformat(day)+timedelta(days=1)).isoformat()
 p.locator('#plan-day').fill(other)
 p.locator('.pool-sync-status').get_by_text('Daily pool saved in Neon').wait_for()
 assert p.locator('.pool-item').count()==0
 p.locator('[data-action="modal-plan-add"]').first.click()
 p.locator(f'[data-action="pool-add"][data-id="{A}"]').click()
 p.wait_for_function("(day) => window.__mockDb.pools.get(day)?.revision===1",arg=other)
 assert p.evaluate("(day) => window.__mockDb.pools.get(day).taskIds",other)==[A]
 p.locator('#plan-day').fill(day)
 p.locator('.pool-sync-status').get_by_text('Daily pool saved in Neon').wait_for()
 assert p.locator('.pool-item').count()==2
 # Stale edit is rejected; the UI refreshes, preserving the server's order.
 p.evaluate("(day) => {window.__mockDb.pools.get(day).revision++;}",day)
 p.locator(f'[data-action="pool-remove"][data-id="{A}"]').click()
 p.get_by_text('Pool changed on another device',exact=False).wait_for()
 assert p.evaluate("(day) => window.__mockDb.pools.get(day).taskIds",day)==[B,A]
 p.locator(f'[data-action="pool-remove"][data-id="{A}"]').click()
 p.wait_for_function("(day) => window.__mockDb.pools.get(day)?.taskIds.length===1",arg=day)
 assert p.evaluate("(day) => window.__mockDb.pools.get(day).taskIds",day)==[B]
 assert p.evaluate("() => window.__mockDb.tasks.some(t=>t.id==='44444444-4444-4444-8444-444444444444')"),'Removing a pool item must never delete its task'
 local=p.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m3.mock'))")
 assert not local.get('pools'),'Signed-in pool must not be copied to localStorage'
 for size in [320,390,768,1440]:
  p.set_viewport_size({'width':size,'height':870})
  assert p.evaluate('document.documentElement.scrollWidth')<=size+4, f'Horizontal overflow at {size}px'
 assert not errors,errors
 p.close()

with sync_playwright() as playwright:
 b=playwright.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 run(b,390)
 run(b,1440)
 b.close()
print('PASS: M4.1 pool cross-workspace selection, save, reorder, reload, date separation, conflict and mobile')
