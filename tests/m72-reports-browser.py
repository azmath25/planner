"""M7.2 real account period report UI, staged Playwright regression (not run).
Runs with an isolated in-memory API. Never reads Neon or triggers GitHub Actions.
"""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m72-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'

def open_reports(p,width):
 if width<760:
  p.locator('.mobile-top [data-page="reports"]').click()
 else:
  p.locator('.sidebar [data-page="reports"]').click()

def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':870})
 p.set_default_timeout(14000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const data={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]
  }});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m72.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m72-app.js').read_text())
 open_reports(p,width)
 p.get_by_text('Exact segment overlap').wait_for()
 report=p.locator('.page-reports')
 assert 'Asia/Baku' in report.inner_text()
 assert 'Historical time estimate' in report.inner_text()
 assert 'Long-term task progress' in report.inner_text()
 assert 'Write chapter' in report.inner_text()
 assert 'On-time rate' not in report.inner_text()
 assert '87%' not in report.inner_text()
 assert p.evaluate('window.__mockDb.periodCalls.length')==1
 assert p.evaluate('window.__mockDb.periodCalls[0].period')=='week'
 p.locator('[data-action="report-period"][data-value="month"]').click()
 p.wait_for_function("() => window.__mockDb.periodCalls.some(x=>x.period==='month')")
 p.get_by_text('2026-12-01',exact=False).wait_for()
 p.locator('[data-action="report-period"][data-value="day"]').click()
 p.wait_for_function("() => window.__mockDb.periodCalls.some(x=>x.period==='day')")
 p.locator('#report-anchor').fill('2026-11-07')
 p.locator('#report-anchor').dispatch_event('change')
 p.wait_for_function("() => window.__mockDb.periodCalls.at(-1).period==='day'")
 assert not errors,errors
 assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4'),f'Overflow at {width}px'
 p.close()

with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):
  run(browser,width)
 browser.close()
 print('PASS: M7.2 report filters, timezone, legacy labels, long-term tasks and responsive layout')
