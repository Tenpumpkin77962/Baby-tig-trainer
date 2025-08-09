
// Basic TIG Trainer PWA app.js
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', {alpha:false});
  let W = 1200, H = 600;
  function resize(){
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = Math.max(600, Math.floor(rect.width*ratio));
    H = Math.max(300, Math.floor(rect.height*ratio));
    canvas.width = W; canvas.height = H; ctx.setTransform(1,0,0,1,0,0);
    draw();
  }
  window.addEventListener('resize', resize);
  resize();

  // Elements
  const ampControl = document.getElementById('amp');
  const ampVal = document.getElementById('ampVal');
  const statustext = document.getElementById('statustext');
  const fillBtn = document.getElementById('fillBtn');
  const resetBtn = document.getElementById('resetBtn');
  const finishBtn = document.getElementById('finishBtn');
  const scoreEl = document.getElementById('score');
  const speedMeter = document.getElementById('speedMeter');
  const toggleGhost = document.getElementById('toggleGhost');
  const installBtn = document.getElementById('installBtn');
  let ghostOn = false;
  ampVal.textContent = ampControl.value + 'A';
  ampControl.addEventListener('input', ()=> ampVal.textContent = ampControl.value + 'A');

  // state
  let welding=false, lastPos=null, path=[], heatMap=[], lastTime=0, speedHistory=[];

  function pointDist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

  // input handling - touch + mouse unified
  function getPosFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if (e.touches && e.touches.length>0){
      x = e.touches[0].clientX - rect.left; y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left; y = e.clientY - rect.top;
    }
    const ratio = canvas.width / rect.width;
    return {x: x*ratio, y: y*ratio};
  }
  canvas.addEventListener('pointerdown', (e)=>{ canvas.setPointerCapture(e.pointerId); welding=true; lastPos=getPosFromEvent(e); lastTime=performance.now(); statustext.textContent='Welding'; });
  canvas.addEventListener('pointerup', (e)=>{ try{canvas.releasePointerCapture(e.pointerId);}catch(e){} welding=false; lastPos=null; statustext.textContent='Idle'; });
  canvas.addEventListener('pointercancel', ()=>{ welding=false; lastPos=null; statustext.textContent='Idle'; });
  canvas.addEventListener('pointermove', (e)=>{ if(!welding) return; handleMove(getPosFromEvent(e)); });

  function handleMove(p){
    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    const speed = lastPos ? pointDist(p,lastPos) / dt : 0;
    speedHistory.push(speed); if (speedHistory.length>40) speedHistory.shift();
    const s = Math.min(1, Math.log10(1+speed*0.5));
    speedMeter.style.width = (s*100)+'%';
    const amp = Number(ampControl.value);
    path.push({x:p.x, y:p.y, t:now, amp:amp, filler:false, pos:document.getElementById('position').value});
    heatMap.push({x:p.x,y:p.y,temp:estimateTemp(amp, speed, path[path.length-1].pos)});
    lastPos = p; lastTime = now;
  }

  function estimateTemp(amp, speed, pos){
    const base = amp / 250;
    const speedEffect = 1 / (1 + speed*0.06);
    let posFactor = 1;
    if (pos==='vertical') posFactor=1.05;
    if (pos==='overhead') posFactor=1.15;
    return base * speedEffect * posFactor;
  }

  function addFiller(){
    if (!path.length) return;
    const now = performance.now();
    let added=false;
    for (let i=path.length-1;i>=0 && i>path.length-30;i--){
      if (now - path[i].t < 300){ path[i].filler = true; added=true; }
    }
    if (added){
      for (let i=heatMap.length-1;i>=0 && i>heatMap.length-40;i--){
        heatMap[i].temp = Math.max(0, heatMap[i].temp - 0.08);
      }
    }
  }
  fillBtn.addEventListener('click', addFiller);
  resetBtn.addEventListener('click', ()=>{ path=[]; heatMap=[]; scoreEl.textContent='—'; draw(); });

  finishBtn.addEventListener('click', finishAndScore);
  toggleGhost.addEventListener('click', ()=>{ ghostOn = !ghostOn; draw(); });

  function heatTint(t){
    if (t < 0.18) return '#cfcfcf';
    if (t < 0.28) return '#f2d58a';
    if (t < 0.45) return '#c59ee6';
    if (t < 0.7) return '#7fb8ff';
    if (t < 0.9) return '#5577aa';
    return '#333333';
  }

  function finishAndScore(){
    if (path.length < 10){ alert('Weld path too short — drag across the joint to weld.'); return; }
    const speeds = [];
    for (let i=1;i<path.length;i++){
      const d = pointDist(path[i], path[i-1]);
      const dt = Math.max(1, path[i].t - path[i-1].t);
      speeds.push(d/dt);
    }
    const avgSpeed = speeds.reduce((a,b)=>a+b,0)/speeds.length;
    const mean = avgSpeed;
    const variance = speeds.reduce((a,b)=>a+(b-mean)*(b-mean),0)/speeds.length;
    const sd = Math.sqrt(variance); const speedCv = sd / (mean || 1);
    const temps = heatMap.map(h=>h.temp); const avgTemp = temps.reduce((a,b)=>a+b,0)/temps.length;
    const hotFraction = temps.filter(t=>t>0.6).length / temps.length;
    const fillerFraction = path.filter(p=>p.filler).length / path.length;
    const speedScore = Math.max(0, 1 - speedCv*3);
    const tempScore = 1 - Math.min(1, Math.abs(avgTemp - 0.32)/0.35);
    const hotPenalty = Math.max(0, 1 - hotFraction*2.5);
    const fillerScore = Math.max(0, 1 - Math.abs(fillerFraction - 0.25)*3);
    const raw = (speedScore*0.35 + tempScore*0.35*hotPenalty + fillerScore*0.3);
    const final = Math.round(raw*100);
    scoreEl.textContent = final + ' / 100';
    const report = `Avg temp: ${avgTemp.toFixed(2)} (ideal ~0.32)\\nHot fraction: ${(hotFraction*100).toFixed(1)}%\\nSpeed CV: ${speedCv.toFixed(2)}\\nFiller use: ${(fillerFraction*100).toFixed(1)}%`;
    alert('Weld scored: ' + final + '/100 +\\n\\n' + report);
  }

  // Drawing
  function draw(){
    ctx.clearRect(0,0,W,H);
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#121418'); g.addColorStop(1,'#0b0f12'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#2a2d31'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(W*0.07, H*0.5); ctx.lineTo(W*0.93, H*0.5); ctx.stroke();
    if (ghostOn){ ctx.strokeStyle = 'rgba(160,220,255,0.08)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(W*0.07, H*0.5); ctx.lineTo(W*0.93, H*0.5); ctx.stroke(); }
    if (path.length>1){
      for (let i=1;i<path.length;i++){
        const a = path[i-1], b = path[i];
        let width = 6 + (a.amp/40); if (a.filler) width += 4;
        const hm = heatMap[i] ? heatMap[i].temp : estimateTemp(a.amp, pointDist(a,b)/Math.max(1,b.t - a.t), a.pos);
        const col = heatTint(hm);
        ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
    }
    if (welding && lastPos){
      const last = heatMap[heatMap.length-1] || {temp:0.2};
      const r = 18 + (last.temp*36);
      const glow = ctx.createRadialGradient(lastPos.x,lastPos.y,1,lastPos.x,lastPos.y,r*1.6);
      glow.addColorStop(0, 'rgba(255,255,230,0.9)');
      glow.addColorStop(0.3, 'rgba(255,200,140,0.6)');
      glow.addColorStop(0.6, 'rgba(255,140,80,0.18)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(lastPos.x,lastPos.y,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,245,0.95)'; ctx.beginPath(); ctx.arc(lastPos.x,lastPos.y,6,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(()=>{});
  }
  requestAnimationFrame(draw);
  setInterval(draw, 90);

  // keyboard
  window.addEventListener('keydown', (e)=>{ if (e.key===' '){ addFiller(); e.preventDefault(); } });

  // PWA Installation prompt handling
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
  });
  installBtn.addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });

  // Service worker registration
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(err=>console.log('SW reg failed', err));
  }
})();
