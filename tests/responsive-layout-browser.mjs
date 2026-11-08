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
 <button class="btn small secondary df-doc-download">Download HTML</button>
 <div class="df-doc-zoom-control" role="group">
 <button class="btn small secondary">−</button><button class="btn small secondary df-doc-zoom-value">150%</button>
 <button class="btn small secondary">+</button></div>
 <details class="df-doc-options"><summary class="btn small secondary">More</summary></details>
 </div></div><div class="df-document-editor"><div class="df-doc-zoom-surface" style="zoom:1.5">
 An unfinished document that occupies a very long line of typed text</div></div></div></div></main></div>`,
 home:`<main class="content df-home-dashboard"><nav class="df-home-shortcuts">
 <button class="btn secondary">Today's plan</button>
 <button class="btn secondary">Start focus timer</button></nav>
 <section class="df-home-metrics">
 <div class="card df-home-metric"><span class="tiny">Focus today</span><strong>12h 35m</strong><small>Saved today</small></div>
 <div class="card df-home-metric"><span class="tiny">Today's plan</span><strong>10</strong><small>Selected tasks</small></div>
 <div class="card df-home-metric"><span class="tiny">Completed today</span><strong>5</strong><small>Finished today</small></div>
 <div class="card df-home-metric"><span class="tiny">Due today</span><strong>2</strong><small>Open deadlines</small></div>
 </section>
 <div class="card df-home-focus"><label class="df-home-focus-select">Focus task<select class="field"><option>Long research task requiring narrow viewport handling</option></select></label>
 <button class="btn">Start</button></div></main>`,
 notes:`<main class="content"><section class="df-home-notes">
 <div class="section-head"><h2>Quick Notes</h2><div class="actions">
 <button class="btn small secondary">New</button><button class="text-link">All notes</button></div></div>
 <div class="df-home-note-grid"><article class="note df-home-note df-quick-note-card">
 <div class="df-quick-note-preview" tabindex="0" role="button"><h3>A quick note with a long title that must fit</h3>
 <p>A long note with unformatted incorrect mathematics and preserved words</p></div>
 <div class="df-quick-note-actions"><button class="mini-btn df-note-delete">Delete</button></div></article></div>
 </section></main>`,
 settings:`<main class="content df-settings"><div class="df-settings-group"><h2>Layout</h2>
 <div class="df-settings-row"><div><strong>Information density</strong><p class="tiny">Choose spacing</p></div>
 <select class="field"><option>Compact</option></select></div>
 <div class="df-settings-row"><div><strong>Notifications</strong><p class="tiny">Private device controls</p></div>
 <button class="btn secondary">Open Profile</button></div>
 </div><div class="df-profile-reminder-actions">
 <button class="btn small secondary">Disable browser notifications</button>
 <button class="btn small secondary">Use device time zone</button>
 <button class="btn small secondary">Quiet hours</button></div>
 </main>`,
 reportChoices:`<main class="content"><section class="card df-report-distribution">
 <div class="df-report-options"><div class="actions">
 <button class="filter">Workspaces</button><button class="filter">Workflows</button><button class="filter">Tasks</button>
 </div><div class="actions"><button class="filter">Bars</button>
 <button class="filter">Pie</button><button class="filter">Table</button></div></div>
 <div class="df-report-pie-content"><div class="df-report-large-pie"
 style="background:conic-gradient(#111 0deg 200deg,#ddd 200deg 360deg)"></div>
 <ul class="df-home-pie-legend"><li><span class="df-home-swatch"></span>
 <span>Research and lecture preparation</span><strong>70%</strong></li></ul></div>
 </section></main>`,
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
      kind==='home'?['.df-home-shortcuts','.df-home-shortcuts .btn','.df-home-metrics','.df-home-metric','.df-home-focus']:
      kind==='notes'?['.df-home-note-grid','.df-quick-note-card','.df-note-delete']:
      kind==='settings'?['.df-settings','.df-settings-row','.df-profile-reminder-actions','.df-profile-reminder-actions .btn']:
      kind==='reportChoices'?['.df-report-options','.df-report-options .actions','.df-report-large-pie']:
      ['.df-pie-section','.df-pie-card','.df-pie-content','.df-pie-disc'];
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
   if(kind==='home'){
    const dims=await page.locator('.df-home-shortcuts>.btn').evaluateAll(
     nodes=>nodes.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
    assert.equal(dims.length,2);
    assert.ok(Math.abs(dims[0].w-dims[1].w)<=1,`Home buttons uneven width at ${width}px`);
    assert.ok(Math.abs(dims[0].h-dims[1].h)<=1,`Home buttons uneven height at ${width}px`);
   }
   if(kind==='reportChoices'||kind==='report'){
    const selector=kind==='reportChoices'?'.df-report-large-pie':'.df-pie-disc';
    const pie=await page.locator(selector).evaluate(el=>{
     const r=el.getBoundingClientRect();
     return {w:r.width,h:r.height,radius:getComputedStyle(el).borderRadius};
    });
    assert.ok(Math.abs(pie.w-pie.h)<=1,`Pie aspect ratio not circular at ${width}px: ${JSON.stringify(pie)}`);
    assert.ok(parseFloat(pie.radius)>pie.w*.4,`Pie has square edges at ${width}px`);
   }

  }
  await page.close();
  console.log('PASS responsive width='+width+'px (timer, document toolbar, home symmetry, notes, settings, round pies)');
 }
}finally{await browser.close();}
