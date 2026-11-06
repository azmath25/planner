"""Browser-level time-tracker smoke checks against the DOM mounted by the React bridge."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-demo-harness.mjs'],cwd=ROOT,check=True)
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page=browser.new_page(viewport={'width':390,'height':844})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>')
    page.evaluate("""() => { const db = {}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]||null,setItem:(k,v)=>{db[k]=String(v)},removeItem:k=>{delete db[k]}}}) }""")
    page.add_style_tag(content=(ROOT/'tests/.harness/styles.css').read_text())
    page.add_script_tag(content=(ROOT/'tests/.harness/app.js').read_text())
    page.locator('.mobile-nav [data-page="tasks"]').click()
    page.locator('.task-row [data-action="start"][data-id="t1"]').first.click()
    assert page.locator('.global-timer').count()==1
    assert 'Review research paper' in page.locator('.global-timer').inner_text()
    page.wait_for_timeout(1100)
    page.locator('.global-timer [data-action="pause"]').click()
    paused=page.locator('.global-time-value').inner_text()
    page.wait_for_timeout(1100)
    assert page.locator('.global-time-value').inner_text()==paused
    page.locator('.mobile-nav [data-page="notes"]').click()
    assert page.locator('.global-timer').count()==1
    page.locator('.global-timer [data-action="resume"]').click()
    page.wait_for_timeout(1100)
    assert page.locator('.global-time-value').inner_text()!=paused
    page.locator('.global-timer [data-action="stop"]').click()
    assert page.locator('.global-timer').count()==0
    stored=page.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m1.design-demo.1'))")
    assert len(stored['sessions'])==1, stored['sessions']
    assert stored['sessions'][0]['reason']=='stopped'
    assert stored['tasks'][0]['status']=='open'
    assert stored['tasks'][0]['spentMs']>0
    page.locator('.mobile-nav [data-page="tasks"]').click()
    page.locator('.task-row [data-action="start"][data-id="t2"]').click()
    assert page.locator('.global-timer').count()==1
    page.locator('.global-timer [data-action="finish-task"]').click()
    assert page.locator('.global-timer').count()==0
    store=page.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m1.design-demo.1'))")
    assert next(t for t in store['tasks'] if t['id']=='t2')['status']=='done'
    assert len(store['sessions'])==2
    assert store['sessions'][-1]['reason']=='completed'
    # Starting another task requires approval and records the old session on switch.
    page.locator('.task-row [data-action="start"][data-id="t1"]').click()
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.locator('.task-row [data-action="start"][data-id="t3"]').click()
    assert 'Review research paper' in page.locator('.global-timer').inner_text()
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('.task-row [data-action="start"][data-id="t3"]').click()
    assert 'Improve the dashboard layout' in page.locator('.global-timer').inner_text()
    page.locator('.global-timer [data-action="stop"]').click()
    page.locator('.task-row [data-action="detail"][data-id="t1"]').click()
    page.locator('[data-action="task-tab"][data-value="history"]').click()
    assert 'Recorded sessions' in page.locator('.page-detail').inner_text()
    assert page.locator('.session-item').count()==2
    history=page.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m1.design-demo.1')).sessions")
    assert 'switched' in [session['reason'] for session in history]

    # A persisted running timestamp restores on reopening the UI.
    page.locator('.mobile-nav [data-page="tasks"]').click()
    page.locator('.task-row [data-action="start"][data-id="t1"]').click()
    snapshot=page.evaluate("() => localStorage.getItem('dayframe.m1.design-demo.1')")
    fresh=browser.new_page(viewport={'width':390,'height':844})
    fresh.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>')
    fresh.evaluate("""snapshot => { const db={'dayframe.m1.design-demo.1': snapshot}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]||null,setItem:(k,v)=>{db[k]=String(v)},removeItem:k=>{delete db[k]}}}) }""",snapshot)
    fresh.add_style_tag(content=(ROOT/'tests/.harness/styles.css').read_text())
    fresh.add_script_tag(content=(ROOT/'tests/.harness/app.js').read_text())
    assert fresh.locator('.global-timer').count()==1
    assert 'Review research paper' in fresh.locator('.global-timer').inner_text()
    fresh.locator('.global-timer [data-action="stop"]').click()
    fresh.close()
    page.locator('.global-timer [data-action="stop"]').click()
    for width in (320,390,768,1440):
        page.set_viewport_size({'width':width,'height':840})
        scroll=page.evaluate('document.documentElement.scrollWidth')
        assert scroll<=width+3,f'Horizontal overflow at {width}px: {scroll}px'
    assert not errors,errors
    browser.close()
print('PASS: Mobile start/pause/resume/stop/finish, global timer, real session history, no overflow')
