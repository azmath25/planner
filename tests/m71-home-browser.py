"""M7.1 Home and workspace pins: isolated signed-in browser regression.
Not executed during branch development; no Neon/Actions/Cloud Shell activity.
"""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m71-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
PROJECT='33333333-3333-4333-8333-333333333333'

def go_home(p,width):
 selector='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="home"]').click()

def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':860})
 p.set_default_timeout(14000)
 errors=[]
 p.on('pageerror',lambda e: errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const values={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>values[k]||null,setItem:(k,v)=>values[k]=String(v),removeItem:k=>delete values[k]
  }});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m71.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m71-app.js').read_text())
 p.get_by_text('Pinned workspaces').wait_for()
 assert 'Write chapter' in p.locator('[aria-label="Pinned account shortcuts"]').inner_text()
 assert '2.4h' not in p.locator('.page-home').inner_text()
 assert 'Sample report figures' not in p.locator('.page-home').inner_text()
 assert 'Saved focus time' in p.locator('.page-home').inner_text()

 p.locator(f'.workspace-card[data-id="{PROJECT}"]').click()
 p.locator('[data-action="pin-workspace"]').click()
 p.wait_for_function("() => window.__mockDb.workspaces.find(w=>w.id==='33333333-3333-4333-8333-333333333333').pinned===true")
 assert p.evaluate('window.__mockDb.pinCalls.length')==1
 assert p.evaluate('window.__mockDb.pinCalls[0].revision')==1
 go_home(p,width)
 assert 'Research' in p.locator('[aria-label="Pinned account shortcuts"]').inner_text()
 p.locator(f'[aria-label="Pinned account shortcuts"] [data-action="workspace"][data-id="{PROJECT}"]').click()
 p.locator('[data-action="pin-workspace"]').click()
 p.wait_for_function("() => window.__mockDb.workspaces.find(w=>w.id==='33333333-3333-4333-8333-333333333333').pinned===false")
 assert p.evaluate('window.__mockDb.pinCalls.length')==2
 assert p.evaluate('window.__mockDb.pinCalls[1].revision')==2
 go_home(p,width)
 assert p.locator(f'[aria-label="Pinned account shortcuts"] [data-id="{PROJECT}"]').count()==0
 assert not errors,errors
 assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4'),f'Horizontal overflow at {width}px'
 p.close()

with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):
  run(browser,width)
 browser.close()
 print('PASS: M7.1 account Home uses real metrics, pinned tasks/workspaces and responsive layout')
