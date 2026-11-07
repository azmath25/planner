"""M4.3 signed-in reminder inbox regression with mock cloud, zero real account writes."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m43-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':840})
 p.set_default_timeout(10000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {const d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}
 }});}""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m43.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m43-app.js').read_text())
 p.get_by_text('Reminder inbox',exact=True).wait_for()
 p.locator('[data-action="alert-ack"]').first.wait_for()
 assert p.locator('[data-action="alert-ack"]').count()==2,errors
 p.locator('[data-action="alert-ack"]').first.click()
 p.wait_for_function("() => window.__mockDb.alerts.some(x=>x.kind==='reminder'&&x.acknowledgedAt!==null)")
 p.wait_for_function("() => document.querySelectorAll('[data-action=alert-ack]').length===1")
 assert p.locator('[data-action="alert-ack"]').count()==1
 p.locator('[data-action="alert-snooze"]').first.click()
 p.wait_for_function("() => window.__mockDb.alerts.some(x=>x.kind==='deadline'&&x.snoozedUntil!==null)")
 p.wait_for_function("() => document.querySelectorAll('[data-action=alert-ack]').length===0")
 assert p.locator('[data-action="enable-push"]').count()==1
 assert not errors, errors
 over=p.evaluate('() => document.documentElement.scrollWidth>window.innerWidth+1')
 assert not over,f'Horizontal overflow at {width}px'
 p.close()
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in [320,390,768,1440]:run(browser,width)
 browser.close()
 print('PASS: M4.3 inbox acknowledge, snooze, account controls, and responsive widths')
