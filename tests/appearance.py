"""M1.2 mobile UI and local-only photo personalization smoke test."""
from pathlib import Path
from io import BytesIO
import subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-demo-harness.mjs'],cwd=ROOT,check=True)
b=BytesIO()
Image.new('RGB', (840, 460), (56, 113, 151)).save(b,format='PNG')
photo=b.getvalue()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>')
    page.evaluate("""() => { const db = {}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]||null,setItem:(k,v)=>{db[k]=String(v)},removeItem:k=>{delete db[k]}}}) }""")
    page.add_style_tag(content=(ROOT/'tests/.harness/styles.css').read_text())
    page.add_script_tag(content=(ROOT/'tests/.harness/app.js').read_text())

    page.locator('.mobile-top [data-page="settings"]').click()
    page.locator('[data-action="theme"][data-id="midnight"]').click()
    page.locator('[data-action="accent"][data-id="ocean"]').click()
    page.locator('#density-select').select_option('compact')
    page.locator('#cover-style-select').select_option('immersive')
    assert page.locator('html').get_attribute('data-theme')=='midnight'
    assert page.locator('html').get_attribute('data-accent')=='ocean'
    assert page.locator('html').get_attribute('data-density')=='compact'
    assert page.locator('html').get_attribute('data-cover-style')=='immersive'

    page.locator('.mobile-nav [data-page="home"]').click()
    page.locator('[data-action="workspace"][data-id="research"]').first.click()
    assert 'Research' in page.locator('h1').inner_text()
    page.locator('[data-action="edit-image"][data-kind="workspace"][data-slot="cover"]').click()
    page.locator('#media-file').set_input_files({'name':'example.png','mimeType':'image/png','buffer':photo})
    page.wait_for_function("() => document.querySelector('.workspace-detail-cover.has-photo') !== null")
    assert page.locator('.workspace-detail-cover').get_attribute('style').startswith('background-image:url(')
    page.locator('[data-action="edit-image"][data-kind="workspace"][data-slot="cover"]').click()
    page.locator('#media-position').evaluate("el => { el.value = '70'; el.dispatchEvent(new Event('change', {bubbles:true})); }")
    assert '70%' in page.locator('.workspace-detail-cover').get_attribute('style')
    page.locator('.modal [data-action="close"]').first.click()
    page.locator('[data-action="edit-image"][data-kind="workspace"][data-slot="avatar"]').click()
    page.locator('#media-file').set_input_files({'name':'example.png','mimeType':'image/png','buffer':photo})
    page.wait_for_function("() => document.querySelector('.workspace-avatar.has-photo') !== null")

    page.locator('.mobile-nav [data-page="tasks"]').click()
    page.locator('[data-action="detail"][data-id="t1"]').click()
    page.locator('[data-action="edit-image"][data-kind="task"][data-slot="cover"]').click()
    page.locator('#media-file').set_input_files({'name':'example.png','mimeType':'image/png','buffer':photo})
    page.wait_for_function("() => document.querySelector('.workspace-detail-cover.has-photo') !== null")
    page.locator('[data-action="edit-image"][data-kind="task"][data-slot="avatar"]').click()
    page.locator('#media-file').set_input_files({'name':'example.png','mimeType':'image/png','buffer':photo})
    page.wait_for_function("() => document.querySelector('.workspace-avatar.has-photo') !== null")
    page.locator('[data-action="edit-image"][data-kind="task"][data-slot="avatar"]').click()
    page.locator('[data-action="remove-image"]').click()
    assert page.locator('.workspace-avatar.has-photo').count()==0
    assert page.locator('.workspace-detail-cover.has-photo').count()==1

    stored=page.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m1.design-demo.1'))")
    assert 'workspace:research:cover' in stored['media']
    assert 'workspace:research:avatar' in stored['media']
    assert 'task:t1:cover' in stored['media']
    assert 'task:t1:avatar' not in stored['media']
    assert stored['mediaPos']['workspace:research:cover']==70
    for width in (320,390,768,1440):
        page.set_viewport_size({'width':width,'height':840})
        scroll=page.evaluate('document.documentElement.scrollWidth')
        assert scroll<=width+3,f'Horizontal overflow: {width}px viewport, {scroll}px document'
    assert not errors,errors
    browser.close()
print('PASS: M1.2 mobile themes, accents, density, covers, image upload/position/remove, no horizontal overflow')
