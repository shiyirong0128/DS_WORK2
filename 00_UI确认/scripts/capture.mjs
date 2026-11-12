import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=path.resolve(root,'../.qa'); fs.mkdirSync(qa,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=spawn(chrome,['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--disable-default-apps','--no-first-run','--no-default-browser-check','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${path.join(qa,'chrome-profile')}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;
try{
 const endpoint=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome startup timeout: '+log.slice(-1500))),20000);browser.stderr.on('data',d=>{log+=d;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});browser.on('error',reject);browser.on('exit',code=>reject(new Error('Chrome exited '+code)));});
 const host=new URL(endpoint).host;
 const target=await (await fetch(`http://${host}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map();
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout: '+method));},15000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');
 await call('Network.enable');await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const results=[];
 for(const theme of manifest.themes){
   const file=path.join(root,'dist',theme.slug+'.html');const source=fs.readFileSync(file,'utf8');
   if(/<script|https?:\/\//i.test(source))throw new Error('Unexpected script or external URL: '+theme.slug);
   await call('Emulation.setDeviceMetricsOverride',{width:1600,height:1040,deviceScaleFactor:1,mobile:false});
   await call('Page.navigate',{url:pathToFileURL(file).href});
   await evaluate(`new Promise(resolve=>{const done=()=>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.readyState==='complete'?done():window.addEventListener('load',done,{once:true})})`);
   const check=await evaluate(`(()=>{const cells=[...document.querySelectorAll('.board .cell')];const r={title:document.title,cells:cells.length,crates:cells.filter(x=>x.dataset.tile==='crate').length,targets:cells.filter(x=>x.dataset.tile==='target').length,players:cells.filter(x=>x.dataset.tile==='player').length,tiles:cells.map(x=>x.dataset.tile),buttons:[...document.querySelectorAll('button')].every(x=>x.disabled),scripts:document.scripts.length,fontStatus:document.fonts.status,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,winStats:[...document.querySelectorAll('.victory .win-stats strong')].map(x=>x.textContent)};return r})()`);
   if(check.cells!==49||check.crates!==5||check.targets!==5||check.players!==1||!check.buttons||check.scripts||check.width>1600||check.winStats.join(',')!=='048,018')throw new Error('Validation failed: '+JSON.stringify(check));
   if(results.length&&JSON.stringify(check.tiles)!==JSON.stringify(results[0].desktop.tiles))throw new Error('Map mismatch');
   const png=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1600,height:Math.max(1040,check.height),scale:1}});
   fs.writeFileSync(path.join(root,'预览图',theme.slug+'.png'),Buffer.from(png.data,'base64'));
   const mobile=[];
   for(const width of [390,768,1024]){
     await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
     await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
     const size=await evaluate(`({viewport:innerWidth,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,overflow:[...document.querySelectorAll('main *')].filter(x=>{const b=x.getBoundingClientRect();return b.width>0&&(b.right>innerWidth+1||b.left< -1)}).map(x=>x.className).slice(0,10)})`);
     mobile.push(size);
     if(width===390){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:size.height,scale:1}});fs.writeFileSync(path.join(qa,theme.slug+'-mobile.png'),Buffer.from(shot.data,'base64'));}
   }
   results.push({slug:theme.slug,desktop:check,responsive:mobile});console.log(theme.slug,check.height,mobile.map(m=>`${m.viewport}:${m.width}`).join(' '));
 }
 fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({offline:true,previewSize:[1600,1040],results},null,2)+'\n');
 const overflow=results.filter(r=>r.responsive.some(m=>m.width>m.viewport));
 if(overflow.length)throw new Error('Responsive overflow: '+overflow.map(x=>x.slug).join(', '));
 await call('Page.navigate',{url:pathToFileURL(path.join(root,'dist/index.html')).href});
 await evaluate(`new Promise(resolve=>{const done=()=>document.fonts.ready.then(resolve);document.readyState==='complete'?done():window.addEventListener('load',done,{once:true})})`);
 const gallery=await evaluate(`({cards:document.querySelectorAll('.card').length,broken:[...document.images].filter(x=>x.complete&&!x.naturalWidth).length})`);
 if(gallery.cards!==10||gallery.broken)throw new Error('Gallery failed: '+JSON.stringify(gallery));
 console.log('PASS: 10 maps, 10 offline pages, 10 PNGs, disabled buttons, completion stats, responsive layouts, gallery.');
 await call('Browser.close');
}finally{if(ws)ws.close();if(browser.exitCode===null)browser.kill();}
