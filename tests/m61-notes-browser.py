"""M6.1 Quick Notes final-gate browser regression. Not executed during branch development."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m61-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
NOTE='d1111111-1111-4111-8111-111111111111'
PROJECT='33333333-3333-4333-8333-333333333333'
def notes_nav(p,width):
 selector='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{selector} [data-page="notes"]').click()
def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(14000)
 errors=[]
 p.on('pageerror',lambda e: errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {
  const d={};
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
   getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>delete d[k]
  }});
  let next=1;
  Object.defineProperty(crypto,'randomUUID',{configurable:true,
   value:()=> 'e9999999-9999-4999-8999-'+String(next++).padStart(12,'0')});
 }""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m61.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m61-app.js').read_text())
 notes_nav(p,width)
 p.locator('[aria-label="Pin Draft outline"]').wait_for()
 assert p.locator('article.note').count()==2
 assert 'Remember graph proof' in p.locator('article.note').first.inner_text()

 p.locator('#note-filter').select_option(PROJECT)
 assert p.locator('article.note').count()==1
 assert 'Draft outline' in p.locator('.content').inner_text()
 p.locator('#note-filter').select_option('all')
 p.locator('#note-search').fill('graph proof')
 assert p.locator('article.note').count()==1
 assert 'Remember graph proof' in p.locator('.content').inner_text()
 p.locator('#note-search').fill('')

 p.locator('button[data-action="modal-note"]').first.click()
 p.locator('#note-form [name="title"]').fill('Saved to my account')
 p.locator('#note-form [name="content"]').fill('Keep this private')
 p.locator('#note-form [name="reminder"]').fill('2026-12-12')
 p.locator('#note-form [name="reminderTime"]').fill('10:30')
 p.locator('#note-form [name="pinned"]').check()
 p.locator('#note-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.notes.some(n=>n.title==='Saved to my account')")
 note_id=p.evaluate("() => window.__mockDb.notes.find(n=>n.title==='Saved to my account').id")
 assert 'account reminder; browser push requires permission' in p.locator('.content').inner_text()

 # A lost response after the server commit must reuse the same create ID.
 p.locator('button[data-action="modal-note"]').first.click()
 p.locator('#note-form [name="title"]').fill('Retry note')
 p.locator('#note-form button[type="submit"]').click()
 p.get_by_text('Connection lost after save').wait_for()
 assert p.evaluate("() => window.__mockDb.notes.filter(n=>n.title==='Retry note').length")==1
 p.locator('#note-form button[type="submit"]').click()
 p.wait_for_function("() => !document.querySelector('#note-form')")
 attempts=p.evaluate("() => window.__mockDb.noteCreateCalls.filter(x=>x.title==='Retry note')")
 assert len(attempts)==2 and attempts[0]['id']==attempts[1]['id'],attempts
 assert p.evaluate("() => window.__mockDb.notes.filter(n=>n.title==='Retry note').length")==1

 p.locator(f'[data-action="edit-note"][data-id="{note_id}"]').click()
 p.locator('#note-form [name="content"]').fill('Updated account note')
 p.locator('#note-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.notes.find(n=>n.id==='"+note_id+"')?.content==='Updated account note'")

 p.locator(f'[data-action="toggle-note-pin"][data-id="{note_id}"]').click()
 p.wait_for_function("() => window.__mockDb.notes.find(n=>n.id==='"+note_id+"')?.pinned===false")

 p.locator(f'[data-action="convert-note"][data-id="{note_id}"]').click()
 p.locator('#note-convert-form [name="estimate"]').fill('75')
 p.locator('#note-convert-form button[type="submit"]').click()
 p.wait_for_function("() => window.__mockDb.notes.find(n=>n.id==='"+note_id+"')?.convertedTaskId")
 assert p.evaluate("() => window.__mockDb.tasks.filter(t=>t.title==='Saved to my account').length")==1
 assert p.evaluate("() => window.__mockDb.notes.find(n=>n.id==='"+note_id+"').convertedTaskId")==note_id
 assert p.evaluate("() => window.__mockDb.noteConvertCalls.length")==1
 assert 'Converted to task' in p.locator('.content').inner_text()

 p.locator(f'[data-action="delete-note"][data-id="{note_id}"]').click()
 p.locator('[data-action="confirm-delete-note"]').click()
 p.wait_for_function("() => !!window.__mockDb.notes.find(n=>n.id==='"+note_id+"')?.deletedAt")
 assert not p.locator(f'[data-action="edit-note"][data-id="{note_id}"]').count()
 p.locator('[data-action="show-note-trash"]').click()
 p.locator(f'[data-action="restore-note"][data-id="{note_id}"]').wait_for()
 p.locator(f'[data-action="restore-note"][data-id="{note_id}"]').click()
 p.wait_for_function("() => window.__mockDb.notes.find(n=>n.id==='"+note_id+"')?.deletedAt===null")
 p.locator('[data-action="show-active-notes"]').click()
 p.locator(f'[data-action="edit-note"][data-id="{note_id}"]').wait_for()
 assert p.locator(f'[data-action="edit-note"][data-id="{note_id}"]').count()==1
 assert not errors,errors
 assert p.evaluate('() => document.documentElement.scrollWidth<=window.innerWidth+3'), f'overflow at {width}'
 p.close()
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True)
 for width in (320,390,768,1440):run(browser,width)
 browser.close()
 print('PASS: M6.1 notes auth mocks, CRUD, pin, search, conversion, soft-delete and mobile widths')
