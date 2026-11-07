"""M7.3 Insights browser check: staged, not executed. Isolated account mocks only."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m73-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(16000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const store={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]
  }});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m73.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m73-app.js').read_text())
 selector='.mobile-top' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="reports"]').click()
 p.get_by_text('Recorded focus time').wait_for()
 assert p.evaluate('window.__mockDb.insightsCalls.length')==0
 p.locator('[data-action="load-insights"]').click()
 p.get_by_text('Completion insights').wait_for()
 assert p.evaluate('window.__mockDb.insightsCalls.length')==1
 report=p.locator('.page-reports').inner_text()
 assert 'On-time completion events' in report
 assert '50%' in report
 assert 'Write chapter' in report
 assert 'incomplete historical segments' in report
 p.locator('[data-action="report-period"][data-value="month"]').click()
 p.wait_for_function("() => window.__mockDb.periodCalls.some(x=>x.period==='month')")
 assert p.locator('section[aria-label="Account completion insights"]').count()==0
 assert p.evaluate('window.__mockDb.insightsCalls.length')==1
 assert not errors,errors
 assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4'),f'Overflow at {width}px'
 p.close()
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 for width in (320,768,1440):run(browser,width)
 browser.close()
 print('PASS: M7.3 on-demand insights, audit labels and responsive regression')
