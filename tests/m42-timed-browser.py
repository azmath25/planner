"""M4.2 planner & calendar flows with the real DOM, mock Neon state and no personal data."""
from datetime import date,timedelta
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node','tests/build-m42-harness.mjs'],cwd=ROOT,check=True)
HTML='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>'
TASK='44444444-4444-4444-8444-444444444444'

def navigation(p,width,page):
 nav='.mobile-nav' if width<760 else '.sidebar'
 p.locator(f'{nav} [data-page="{page}"]').click()

def new_interval(p,day,start,end):
 p.locator('[data-action="modal-schedule"]').first.click()
 p.locator('#schedule-task').select_option(TASK)
 p.locator('#schedule-day').fill(day)
 p.locator('#start').fill(start)
 p.locator('#end').fill(end)
 p.locator('#schedule-form button[type="submit"]').click()

def run(browser,width):
 p=browser.new_page(viewport={'width':width,'height':850})
 p.set_default_timeout(9000)
 errors=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content(HTML)
 p.evaluate("""() => {const d={};Object.defineProperty(window,'localStorage',{configurable:true,value:{
 getItem:k=>d[k]||null,setItem:(k,v)=>{d[k]=String(v)},removeItem:k=>{delete d[k]}
 }});if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>'88888888-8888-4888-8888-'+Math.floor(Math.random()*1e12).toString().padStart(12,'0')});}""")
 p.add_style_tag(content=(ROOT/'tests/.harness/m42.css').read_text())
 p.add_script_tag(content=(ROOT/'tests/.harness/m42-app.js').read_text())
 assert p.locator('h1').count()>0,errors
 navigation(p,width,'plan')
 p.get_by_text('Timed blocks saved in Neon',exact=True).wait_for()
 day=p.locator('#plan-day').input_value()
 other=(date.fromisoformat(day)+timedelta(days=1)).isoformat()
 new_interval(p,day,'09:00','10:00')
 p.wait_for_function('() => window.__mockDb.intervals.size===1')
 first=p.evaluate("() => [...window.__mockDb.intervals.keys()][0]")
 assert p.locator('.time-card-actions [data-action="edit-interval"]').count()==1
 new_interval(p,day,'10:00','11:00')
 p.wait_for_function('() => window.__mockDb.intervals.size===2')
 second=p.evaluate("() => [...window.__mockDb.intervals.keys()].find(id=>id!==[...window.__mockDb.intervals.keys()][0])")
 assert p.locator('.time-card-actions [data-action="edit-interval"]').count()==2
 # The client warns on overlap; an atomic DB trigger provides the real guarantee.
 p.locator('[data-action="modal-schedule"]').first.click()
 p.locator('#start').fill('09:30')
 p.locator('#end').fill('10:30')
 p.locator('#schedule-form button[type="submit"]').click()
 p.get_by_text('overlaps another scheduled block',exact=False).wait_for()
 assert p.evaluate("() => window.__mockDb.intervals.size")==2
 p.locator('#schedule-form [data-action="close"]').click()
 # Move the second interval to tomorrow. Task identity remains unchanged.
 p.locator(f'[data-action="edit-interval"][data-id="{second}"]').click()
 p.locator('#schedule-day').fill(other)
 p.locator('#start').fill('13:00')
 p.locator('#end').fill('14:00')
 p.locator('#schedule-form button[type="submit"]').click()
 p.wait_for_function("(id)=>window.__mockDb.intervals.get(id)?.day!==undefined",arg=second)
 assert p.evaluate("(id)=>window.__mockDb.intervals.get(id).day",second)==other
 assert p.evaluate("(id)=>window.__mockDb.intervals.get(id).revision",second)==2
 p.locator('#plan-day').fill(other)
 p.get_by_text('Timed blocks saved in Neon',exact=True).wait_for()
 p.locator('.time-card-actions [data-action="edit-interval"]').first.wait_for()
 assert p.locator('.time-card').count()==1
 # A long block gives a capacity warning, not a hard scheduling failure.
 new_interval(p,other,'01:00','08:00')
 p.once('dialog',lambda dialog:dialog.accept())
 p.wait_for_function('() => window.__mockDb.intervals.size===3')
 assert p.get_by_text('over capacity',exact=False).count()>=1
 # Browser remount and calendar views use the same saved intervals.
 p.evaluate('() => mountApp()')
 navigation(p,width,'calendar')
 p.locator('[data-action="calendar-view"][data-value="month"]').click()
 p.locator('#calendar-anchor').fill(other)
 p.locator(f'.calendar-day-card[aria-label="{other}"]').wait_for()
 p.locator('.calendar-block').first.wait_for()
 p.locator('[data-action="calendar-view"][data-value="week"]').click()
 p.locator('[data-action="calendar-view"][data-value="day"]').click()
 p.locator(f'.calendar-day-card[aria-label="{other}"]').wait_for()
 p.locator('[data-action="calendar-open-day"]').first.click()
 assert p.locator('#plan-day').input_value()==other
 # Delete a timed block without deleting its underlying task.
 p.once('dialog',lambda dialog:dialog.accept())
 p.locator(f'[data-action="unschedule"][data-id="{second}"]').click()
 p.wait_for_function("(id)=>!window.__mockDb.intervals.has(id)",arg=second)
 assert p.evaluate("() => window.__mockDb.tasks.some(x=>x.id==='44444444-4444-4444-8444-444444444444')")
 saved=p.evaluate("() => JSON.parse(localStorage.getItem('dayframe.m3.mock'))")
 assert not saved.get('scheduled'),'Signed-in intervals must not persist to localStorage'
 for size in [320,390,768,1440]:
  p.set_viewport_size({'width':size,'height':850})
  assert p.evaluate('document.documentElement.scrollWidth')<=size+4, f'Horizontal overflow at {size}px'
 assert not errors,errors
 p.close()

with sync_playwright() as playwright:
 b=playwright.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 run(b,390)
 run(b,1440)
 b.close()
print('PASS: M4.2 mobile/desktop save, adjacent, conflicts, move day, capacity, calendar and delete')
