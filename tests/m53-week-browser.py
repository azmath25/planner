"""M5.3 signed-in estimates, recurring weekly goals and plan/actual browser flow."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m53-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
ROOT_TASK='44444444-4444-4444-8444-444444444444'
GENERAL='11111111-1111-4111-8111-111111111111'
PROJECT='33333333-3333-4333-8333-333333333333'
def nav(page,kind,width):
 if width<760 and kind=='workspaces':
  page.locator('.mobile-nav [data-page="home"]').click()
  page.locator('.content [data-page="workspaces"]').first.click()
 elif width<760 and kind=='reports':
  page.locator('.mobile-top [data-page="reports"]').click()
 else:
  selector='.mobile-nav' if width<760 else '.sidebar'
  page.locator(f'{selector} [data-page="{kind}"]').click()
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
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m53.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m53-app.js').read_text())
 p.wait_for_function("() => !document.querySelector('.info-banner[role=status]')?.textContent?.includes('Restoring')")
 nav(p,'tasks',width)
 p.locator(f'.task-row [data-action="detail"][data-id="{ROOT_TASK}"]').first.click()
 p.locator('[data-own-remaining]').wait_for()
 assert p.locator('[data-own-remaining]').inner_text()=='00:38:00'
 assert p.locator('[data-subtree-remaining]').inner_text()=='01:56:30'
 assert 'each subtask once' in p.locator('.page-detail').inner_text().lower()

 nav(p,'workspaces',width)
 p.locator('[data-action="workspace"][data-id="general"]').first.click()
 p.locator('#weekly-goal-form [name="hours"]').wait_for(state='visible')
 p.wait_for_function("() => document.querySelector('#weekly-goal-form [name=hours]')?.disabled===false")
 assert p.locator('#weekly-goal-form [name="hours"]').input_value()=='2'
 assert 'Asia/Baku' in p.locator('[aria-label="Weekly time target for General"]').inner_text()
 p.locator('#weekly-goal-form [name="hours"]').fill('3.25')
 p.locator('#weekly-goal-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.weekTargets.get(window.__mockDb.workspaces[0].id)?.targetMinutes===195")
 p.wait_for_function("() => document.querySelector('#weekly-goal-form [name=hours]')?.disabled===false")
 assert p.locator('#weekly-goal-form [name="hours"]').input_value()=='3.25'
 # A background refresh must not erase an in-progress goal draft.
 p.locator('#weekly-goal-form [name="hours"]').fill('5.25')
 p.locator('#weekly-goal-form [name="hours"]').focus()
 p.evaluate("() => window.dispatchEvent(new Event('focus'))")
 p.wait_for_timeout(200)
 assert p.locator('#weekly-goal-form [name="hours"]').input_value()=='5.25'

 # Conflict from another device must be visible, and the updated target loads.
 p.evaluate("() => window.__mockDb.weekTargets.set('"+GENERAL+"',{targetMinutes:180,revision:3})")
 p.locator('#weekly-goal-form [name="hours"]').fill('4')
 p.locator('#weekly-goal-form button[type="submit"]').click()
 p.wait_for_function("() => document.querySelector('#weekly-goal-form [name=hours]')?.value==='3'")
 assert 'changed' in p.locator('[aria-label="Weekly time target for General"] [role="alert"]').inner_text().lower()

 nav(p,'workspaces',width)
 p.locator(f'[data-action="workspace"][data-id="{PROJECT}"]').first.click()
 p.wait_for_function("() => document.querySelector('#weekly-goal-form [name=hours]')?.disabled===false")
 assert p.locator('#weekly-goal-form [name="hours"]').input_value()=='0'
 p.locator('#weekly-goal-form [name="hours"]').fill('1.5')
 p.locator('#weekly-goal-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.weekTargets.get('"+PROJECT+"')?.revision===1")
 assert p.evaluate("() => window.__mockDb.weekTargets.get('"+PROJECT+"').targetMinutes")==90

 nav(p,'reports',width)
 box=p.locator('[aria-label="Current week plan and recorded time"]')
 box.wait_for()
 assert '2026-11-02' in box.inner_text() and 'Asia/Baku' in box.inner_text()
 assert '00:03:30' in box.inner_text() # Recorded this week
 assert '1h 30m' in box.inner_text() or '1h 30' in box.inner_text() # Fixed plan
 assert 'Research' in box.inner_text() and 'General' in box.inner_text()
 assert not errors,errors
 assert p.evaluate('() => document.documentElement.scrollWidth<=window.innerWidth+3'),f'Overflow at {width}px'
 p.close()
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):run(browser,width)
 browser.close()
 print('PASS: M5.3 remaining estimates, recurring goals, stale-revision recovery and weekly plan/actual across viewports')
