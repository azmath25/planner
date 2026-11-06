from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content('<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>')
 page.evaluate("""() => {const d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}}})}""")
 page.add_style_tag(content=(ROOT/'styles.css').read_text())
 page.add_script_tag(content=(ROOT/'app.js').read_text())
 page.wait_for_selector('h1')
 page.screenshot(path=str(ROOT/'mobile-home.png'),full_page=True)
 page.locator('.mobile-nav [data-page="plan"]').click()
 page.screenshot(path=str(ROOT/'mobile-planner.png'),full_page=True)
 page.locator('.mobile-top [data-page="settings"]').click()
 page.screenshot(path=str(ROOT/'mobile-appearance.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':900})
 page.screenshot(path=str(ROOT/'desktop-appearance.png'),full_page=True)
 assert not errs,errs
 print('PASS: mobile+desktop screenshots via injected source, no browser errors (local URL blocked by environment)')
 b.close()
