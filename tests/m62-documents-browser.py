"""M6.2b real BlockNote browser regression, staged but NOT YET EXECUTED.
Run only after installing pinned editor dependencies in an isolated local environment.
No GitHub Actions, live Neon, Cloud Shell or deployed app is used by this harness.
"""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m62-documents-harness.mjs'],cwd=ROOT,check=True)
BUNDLE=(ROOT/'tests/.harness/m62-documents.js').read_text(encoding='utf8')
CSS_PATH=ROOT/'tests/.harness/m62-documents.css'
HTML='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><main id="documents-root"></main></body></html>'

def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(25000)
 errors=[]
 p.on('pageerror',lambda e: errors.append(str(e)))
 p.set_content(HTML)
 if CSS_PATH.exists():
  p.add_style_tag(content=CSS_PATH.read_text(encoding='utf8'))
 p.add_script_tag(content=BUNDLE)
 p.evaluate('window.startDayframeDocuments()')

 p.get_by_role('button',name='Seed document').wait_for()
 p.get_by_role('button',name='Seed document').click()
 p.get_by_label('Document title').wait_for()
 assert p.get_by_label('Document title').input_value()=='Seed document'
 p.get_by_label('Document title').fill('Edited research plan')
 assert p.evaluate('window.__documentDirty') is True

 editable=p.locator('.df-document-editor [contenteditable="true"]').first
 editable.wait_for()
 editable.click()
 editable.press('End')
 editable.type(' Additional text')
 p.get_by_role('button',name='Save changes').click()
 p.wait_for_function('window.__docMock.updates.length===1')
 assert p.evaluate('window.__docMock.items.find(x=>x.id===window.__docMock.seed).revision')==2
 assert p.evaluate('window.__documentDirty') is False

 p.get_by_role('button',name='New child page').click()
 p.wait_for_function('window.__docMock.creations.length===1')
 created=p.evaluate('window.__docMock.creations[0]')
 assert created['body']['parentId']==p.evaluate('window.__docMock.seed')
 child_id=created['id']
 assert p.evaluate('window.__docMock.items.filter(x=>x.id==="'+child_id+'").length')==1

 p.once('dialog',lambda dlg:dlg.accept())
 p.get_by_role('button',name='Delete',exact=True).click()
 p.wait_for_function('window.__docMock.items.some(x=>x.parentId===window.__docMock.seed&&x.deletedAt!==null)')
 p.get_by_role('button',name='Recently Deleted').click()
 p.get_by_role('button',name='Restore').click()
 p.wait_for_function('window.__docMock.items.some(x=>x.parentId===window.__docMock.seed&&x.deletedAt===null)')
 assert not errors,errors
 assert p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4'),f'Horizontal overflow at {width}px'
 p.evaluate('window.stopDayframeDocuments()')
 p.close()

with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,768,1440):
  run(browser,width)
 browser.close()
 print('M6.2b document editor, nesting, Save, Trash, restore and responsive regressions passed')
