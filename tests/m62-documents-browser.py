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

 # Autosave debounces ordinary title changes without another click.
 p.get_by_label('Document title').fill('Autosaved research plan')
 p.evaluate("window.__editorBeforeAutosave=document.querySelector('.df-document-editor [contenteditable=true]')")
 p.wait_for_function('window.__docMock.updates.length===2',timeout=8500)
 assert p.evaluate("window.__editorBeforeAutosave===document.querySelector('.df-document-editor [contenteditable=true]')"),'Autosave remounted editor'
 assert p.evaluate('window.__docMock.items.find(x=>x.id===window.__docMock.seed).title')=='Autosaved research plan'
 p.wait_for_function('window.__documentDirty===false')

 # Backend search only returns document metadata.
 p.get_by_label('Search private documents').fill('Autosaved')
 p.wait_for_function('window.__docMock.searches.length>=1',timeout=8500)
 assert p.evaluate('window.__docMock.searches.at(-1).q')=='Autosaved'
 assert p.get_by_role('button',name='Autosaved research plan').count()==1
 p.get_by_label('Search private documents').fill('')

 # JSON export is explicit and authenticated through the mock API.
 with p.expect_download() as saved_file:
  p.get_by_role('button',name='Download saved JSON').click()
 assert saved_file.value.suggested_filename.startswith('dayframe-document-')
 assert p.evaluate('window.__docMock.exports.length')==1

 # A second-device edit causes a conflict; the draft stays copyable/exportable.
 p.evaluate('window.__docMock.items.find(x=>x.id===window.__docMock.seed).revision++')
 p.get_by_label('Document title').fill('My unsaved conflicting version')
 p.get_by_text('Conflict — local draft preserved').wait_for(timeout=8500)
 assert p.get_by_label('Document title').input_value()=='My unsaved conflicting version'
 assert p.evaluate('window.__docMock.items.find(x=>x.id===window.__docMock.seed).title')=='Autosaved research plan'
 with p.expect_download() as draft_file:
  p.get_by_role('button',name='Download local draft').click()
 assert draft_file.value.suggested_filename.startswith('dayframe-unsaved-draft-')
 p.once('dialog',lambda dlg:dlg.accept())
 p.get_by_role('button',name='Reload server version').click()
 p.wait_for_function("() => document.querySelector('[aria-label=\"Document title\"]')?.value==='Autosaved research plan'")
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
 # M8.1: a committed creation loses its HTTP reply. A retry must reuse the
 # same UUID and never create a duplicate document.
 p.evaluate('window.__docMock.failNextCreateAfterCommit=true')
 before=p.evaluate('window.__docMock.creations.length')
 p.get_by_role('button',name='New document').click()
 p.get_by_role('button',name='Retry creation').wait_for(timeout=8500)
 attempt=p.evaluate('window.__docMock.creations.at(-1).id')
 assert p.evaluate('(id)=>window.__docMock.items.filter(x=>x.id===id).length',attempt)==1
 p.get_by_role('button',name='Retry creation').click()
 p.wait_for_function('(count)=>window.__docMock.creations.length===count+2',before)
 assert p.evaluate('(id)=>window.__docMock.creations.at(-1).id===id',attempt)
 assert p.evaluate('(id)=>window.__docMock.items.filter(x=>x.id===id).length',attempt)==1
 assert p.get_by_label('Document title').input_value()=='Untitled document'

 # A definite rejection must not permanently trap the document library.
 # Abandonment explicitly warns that an uncertain request might have committed.
 p.evaluate('window.__docMock.failNextCreateBeforeCommit=true')
 before=p.evaluate('window.__docMock.creations.length')
 p.get_by_role('button',name='New document').click()
 p.get_by_role('button',name='Abandon retry').wait_for(timeout=8500)
 rejected=p.evaluate('window.__docMock.creations.at(-1).id')
 assert p.evaluate('(id)=>window.__docMock.items.some(x=>x.id===id)',rejected) is False
 p.once('dialog',lambda dialog:dialog.dismiss())
 p.get_by_role('button',name='Abandon retry').click()
 assert p.get_by_role('button',name='Retry creation').count()==1
 p.once('dialog',lambda dialog:dialog.accept())
 p.get_by_role('button',name='Abandon retry').click()
 p.get_by_role('button',name='Retry creation').wait_for(state='detached')
 p.get_by_role('button',name='New document').click()
 p.wait_for_function('(count)=>window.__docMock.creations.length===count+2',before)
 assert p.evaluate('(id)=>window.__docMock.creations.at(-1).id!==id',rejected)
 assert p.evaluate('window.__docMock.items.filter(x=>x.id===window.__docMock.creations.at(-1).id).length')==1
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
