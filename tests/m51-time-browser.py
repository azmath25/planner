"""M5.1 account-backed stopwatch recovery and switching in actual Dayframe DOM."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m51-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
ROOT_TASK='44444444-4444-4444-8444-444444444444'
SECOND='55555555-5555-4555-8555-555555555555'
def nav(p,page,width):
 selector='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="{page}"]').click()
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(12000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.on('dialog',lambda dialog:dialog.accept())
 p.set_content(HTML)
 p.evaluate("""() => {
  const d={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}
  }});
  let counter=1;
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> '77777777-7777-4777-8777-'+String(counter++).padStart(12,'0')});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m51.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m51-app.js').read_text())
 p.wait_for_function("() => !document.querySelector('.info-banner[role=status]')?.textContent?.includes('Restoring your saved timer')")
 nav(p,'tasks',width)
 start=p.locator(f'.task-row [data-action="start"][data-id="{ROOT_TASK}"]').first
 start.wait_for()
 assert start.is_enabled(),'Server-backed timer should be loaded before enabling Start'
 start.click()
 p.wait_for_function("() => window.__mockDb.activeTimeId!==null")
 p.locator('.global-timer').wait_for()
 assert 'saved in Neon' in p.locator('.global-timer').inner_text()
 p.wait_for_timeout(1100)
 p.locator('.global-timer [data-action="pause"]').click()
 p.wait_for_function("() => window.__mockDb.sessionRecords.get(window.__mockDb.activeTimeId)?.state==='paused'")
 paused=p.locator('.global-time-value').inner_text()
 p.wait_for_timeout(550)
 assert p.locator('.global-time-value').inner_text()==paused
 # A reload must recover the paused session, not revert to browser-local time.
 p.evaluate('() => mountApp()')
 p.wait_for_function("() => document.querySelector('.global-timer [data-action=resume]')!==null")
 p.locator('.global-timer [data-action="resume"]').click()
 p.wait_for_function("() => window.__mockDb.sessionRecords.get(window.__mockDb.activeTimeId)?.state==='running'")
 p.locator(f'.task-row [data-action="start"][data-id="{SECOND}"]').first.click()
 p.wait_for_function("() => window.__mockDb.sessionRecords.get(window.__mockDb.activeTimeId)?.taskId==='"+SECOND+"'")
 assert len([x for x in p.evaluate("() => [...window.__mockDb.sessionRecords.values()].map(s=>s.state)") if x in ['running','paused']])==1
 assert p.evaluate("() => [...window.__mockDb.sessionRecords.values()].some(s=>s.endReason==='switched')")
 # A second reload restores the switched running session.
 p.evaluate('() => mountApp()')
 p.wait_for_function("() => document.querySelector('.global-timer')?.textContent?.includes('Second task for switching')")
 p.locator('.global-timer [data-action="stop"]').click()
 p.wait_for_function('() => window.__mockDb.activeTimeId===null')
 p.wait_for_function("() => document.querySelector('.global-timer')===null")
 assert p.evaluate("() => [...window.__mockDb.sessionRecords.values()].some(s=>s.state==='stopped'&&s.accumulatedMs>0)")
 assert p.evaluate("() => window.__mockDb.tasks.find(t=>t.id==='"+SECOND+"').status==='open'")
 assert not errors,errors
 assert p.evaluate('() => document.documentElement.scrollWidth <= window.innerWidth+2'),f'Overflow at {width}'
 p.close()
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):run(browser,width)
 browser.close()
 print('PASS: M5.1 server-owned timer start/pause/resume/switch/stop, two reload recoveries and mobile widths')
