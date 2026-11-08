// Manual Playwright viewport regression. Run after npm run build with
// Playwright + Chromium installed in a disposable test environment.
// No authentication, live Neon calls or real account data are used.
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const {chromium}=await import('playwright');
const css=readdirSync('dist/assets').find(x=>/^index-.*\.css$/.test(x));
assert.ok(css,'Build the Vite frontend before running responsive checks');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const widths=[320,360,390,430,600,768,1024,1440];
const prefix='<meta name="viewport" content="width=device-width,initial-scale=1">';
const cases={
 timer:`<div class="shell"><div class="main"><section class="global-timer">
 <div class="global-timer-task"><span class="timer-pulse live"></span><div class="timer-task-name">
 <button class="timer-task-link">A very long task title that must never break the mobile floating timer frame even in landscape</button>
 <small>Counting time · Very long workspace title · saved in Neon</small></div></div>
 <time class="global-time-value">12345:59:59</time>
 <div class="global-timer-actions">
 <button class="timer-compact-button"><span>Pause</span>⏸</button>
 <button class="timer-compact-button"><span>Stop</span>◼</button>
 <button class="timer-compact-button"><span>Finish</span>✓</button></div>
 </section><main class="content">Sample task</main></div></div>`,
 document:`<div class="shell"><main class="main"><div class="content"><div class="df-doc-content">
 <div class="df-doc-controls"><div class="df-doc-writing-bar">
 <button class="btn small secondary df-doc-back">← Documents</button>
 <p class="tiny df-doc-save-status">Draft backed up — cloud save soon</p>
 <button class="btn small">Save now</button>
 <div class="df-doc-zoom-control" role="group">
 <button class="btn small secondary">−</button><button class="btn small secondary df-doc-zoom-value">150%</button>
 <button class="btn small secondary">+</button></div>
 <details class="df-doc-options"><summary class="btn small secondary">More</summary></details>
 </div></div><div class="df-document-editor"><div class="df-doc-zoom-surface" style="zoom:1.5">
 An unfinished document that occupies a very long line of typed text</div></div></div></div></main></div>`,
 report:`<main class="content"><section class="df-pie-section">
 <section class="card df-pie-card"><h3>Recorded focus by workspace</h3>
 <div class="df-pie-content"><div class="df-pie-disc" style="background:conic-gradient(#327d70 0deg 200deg,#b386cf 200deg 360deg)"></div>
 <ul class="df-pie-legend"><li class="df-pie-legend-item"><span class="df-pie-key"></span>
 <span class="df-pie-name">Extremely long research workspace display name used for responsive testing</span>
 <strong>55.6%</strong><small>19h 50m</small></li></ul></div></section>
 <section class="card df-pie-card"><h3>Planned minutes</h3><p class="df-pie-empty">No saved time for this period yet.</p></section>
 </section></main>`
};
try{
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<601});
  for(const [kind,body] of Object.entries(cases)){
   await page.setContent(prefix+body);
   await page.addStyleTag({path:resolve('dist/assets',css)});
   if(kind==='document')
    await page.evaluate(()=>document.documentElement.classList.add('df-writing-open'));
   const bounds=await page.evaluate((kind)=>{
    const targets=kind==='timer'?['.global-timer','.global-time-value','.global-timer-actions','.timer-compact-button']:
      kind==='document'?['.df-doc-writing-bar','.df-doc-zoom-control','.df-doc-zoom-value']:
      ['.df-pie-section','.df-pie-card','.df-pie-content'];
    const selected=targets.flatMap(q=>[...document.querySelectorAll(q)].map(el=>{
     const r=el.getBoundingClientRect();
     return {q,left:r.left,right:r.right,width:r.width};
    }));
    return {selected,overflow:document.documentElement.scrollWidth-innerWidth};
   },kind);
   assert.ok(bounds.overflow<=2,`${kind} page horizontal overflow at ${width}px: ${JSON.stringify(bounds)}`);
   for(const b of bounds.selected){
    assert.ok(b.left>=-2&&b.right<=width+2,
     `${kind} ${b.q} left or right exceeds viewport ${width}px: ${JSON.stringify(b)}`);
   }
  }
  await page.close();
  console.log('PASS responsive layout width='+width+'px (timer, document toolbar/zoom, report pies)');
 }
}finally{await browser.close();}
