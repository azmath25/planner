"""M7.2 authenticated period reports UI; staged, not run in this session."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m72-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(14000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const values={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>values[k]||null,setItem:(k,v)=>values[k]=String(v),removeItem:k=>delete values[k]
  }});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m72.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m72-app.js').read_text())
 selector='.mobile-top' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="reports"]').click()
 p.get_by_text('Recorded focus time').wait_for()
 assert 'Asia/Baku' in p.locator('.content').inner_text()
 assert 'Historical time estimate' in p.locator('.content').inner_text()
 assert 'Fixed plan' in p.locator('.content').inner_text()
 assert p.evaluate('window.__mockDb.periodCalls.length')==1
 assert p.evaluate('window.__mockDb.periodCalls[0].period')=='week'
 p.locator('[data-action="report-period"][data-value="month"]').click()
 p.wait_for_function("window.__mockDb.periodCalls.some(x=>x.period==='month')")
 p.locator('#report-anchor').fill('2026-10-14')
 p.locator('#report-anchor').dispatch_event('change')
 p.wait_for_function("window.__mockDb.periodCalls.some(x=>x.anchor==='2026-10-14')")
 assert p.get_by_text('Long-term task progress').count()==1
 assert 'Write chapter' in p.locator('.content').inner_text()
 assert not errors,errors
 assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4')
 p.close()
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 for width in (320,768,1440):
  run(browser,width)
 browser.close()
 print('M7.2 browser regression passed')
