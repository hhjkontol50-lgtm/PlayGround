(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startScreen = document.getElementById('startScreen');
  const endScreen = document.getElementById('endScreen');
  const helpScreen = document.getElementById('helpScreen');
  const hud = document.getElementById('hud');
  const pauseCover = document.getElementById('pauseCover');
  const mobileControls = document.getElementById('mobileControls');
  const W = 960, H = 540, world = { w: 1560, h: 960 };
  let dpr = 1, scaleX = 1, scaleY = 1, last = 0, running = false, paused = false;
  let remaining = 90, delivered = 0, carried = [], soundOn = false, audioCtx = null;
  let keys = new Set(), touchDirs = new Set(), particles = [], floaters = [], items = [], decor = [];
  const player = { x: 780, y: 530, r: 15, speed: 205, face: 1, walk: 0, bob: 0 };
  const camera = { x: 0, y: 0 };
  const treatTypes = [
    { icon: '🍓', name: 'berry', color: '#e67d67' },
    { icon: '🍎', name: 'apple', color: '#e16b58' },
    { icon: '🍋', name: 'lemon', color: '#e9c752' },
    { icon: '🌼', name: 'flower', color: '#e7bf55' },
    { icon: '🧁', name: 'cake', color: '#c98cbd' },
    { icon: '🫐', name: 'berry', color: '#867fbb' }
  ];
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (n,a,b) => Math.max(a, Math.min(b,n));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scaleX = canvas.width / W; scaleY = canvas.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);

  function initGarden() {
    decor = []; items = [];
    for (let i=0;i<330;i++) {
      const x=rand(28,world.w-28), y=rand(28,world.h-28);
      if (Math.hypot(x-world.w/2,y-world.h/2)<185) continue;
      const flower = Math.random() < .28;
      decor.push({x,y,type:flower?'flower':'grass',s:rand(.6,1.35),c:Math.random()<.5?'#e7d77e':'#f3e7ad',phase:rand(0,6.28)});
    }
    for(let i=0;i<24;i++){
      let x,y,tries=0;
      do { x=rand(95,world.w-95); y=rand(100,world.h-100); tries++; }
      while((Math.hypot(x-world.w/2,y-world.h/2)<215 || (x<180 && y<170)) && tries<80);
      const t=treatTypes[Math.floor(Math.random()*treatTypes.length)];
      items.push({x,y,type:t,phase:rand(0,6.28),active:true});
    }
    for(let i=0;i<33;i++){
      const x=rand(55,world.w-55), y=rand(55,world.h-55);
      if(Math.hypot(x-world.w/2,y-world.h/2)<230) continue;
      decor.push({x,y,type:Math.random()<.66?'bush':'rock',s:rand(.75,1.25),phase:rand(0,6.28)});
    }
  }

  function startGame() {
    initGarden(); player.x=world.w/2; player.y=world.h/2+105; player.face=1;
    remaining=90; delivered=0; carried=[]; particles=[]; floaters=[]; paused=false; running=true;
    updateHud(); startScreen.classList.add('hidden'); endScreen.classList.add('hidden'); helpScreen.classList.add('hidden');
    hud.classList.remove('hidden'); mobileControls.classList.remove('hidden'); pauseCover.classList.add('hidden');
    last=performance.now(); requestAnimationFrame(loop);
  }
  function updateHud() {
    document.getElementById('delivered').textContent=delivered;
    document.getElementById('progressFill').style.width=`${Math.min(100,delivered/12*100)}%`;
    document.getElementById('timer').textContent=`${Math.floor(remaining/60)}:${String(Math.ceil(remaining%60)).padStart(2,'0')}`;
    document.getElementById('carriedIcons').textContent=carried.length?carried.map(x=>x.icon).join(' '):'—';
    document.getElementById('carryPill').style.borderColor=carried.length?'#e1c98a':'#f5f0d9';
  }
  function endGame(won) {
    running=false; paused=false; hud.classList.add('hidden'); mobileControls.classList.add('hidden');
    const best=Number(localStorage.getItem('picnicBest')||0);
    if(delivered>best) localStorage.setItem('picnicBest',String(delivered));
    document.getElementById('bestScore').innerHTML=`BEST PICNIC <b>${Math.max(delivered,best)} / 12</b>`;
    document.getElementById('endEyebrow').textContent=won?'PICNIC COMPLETE!':'TIME FOR A TINY REST';
    document.getElementById('endTitle').textContent=won?'Well gathered!':'A lovely try!';
    document.getElementById('endCopy').textContent=won?'You made a wonderful picnic together.':'Every treat you shared made the day a little sweeter.';
    document.getElementById('resultEmoji').textContent=won?'🧺':'🌷';
    document.getElementById('resultScore').textContent=delivered;
    endScreen.classList.remove('hidden'); playTone(won?660:440,.13);
  }
  function showHome() { running=false; hud.classList.add('hidden'); mobileControls.classList.add('hidden'); endScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); }
  function playTone(freq,duration=.08) {
    if(!soundOn) return;
    try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.055,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration); } catch(_){}
  }
  function collect(item) {
    if(carried.length>=4) { floaters.push({x:player.x,y:player.y-28,text:'Basket is full!',life:1,color:'#b66b4c'}); return; }
    item.active=false; carried.push(item.type); playTone(560+carried.length*55,.09);
    for(let i=0;i<9;i++) particles.push({x:item.x,y:item.y,vx:rand(-75,75),vy:rand(-100,-15),life:rand(.35,.7),max:.7,color:item.type.color,size:rand(2,5)});
    floaters.push({x:item.x,y:item.y-20,text:`${item.type.icon} +1`,life:1.05,color:'#55764f'});
  }
  function dropoff() {
    if(!carried.length) return;
    delivered=Math.min(12,delivered+carried.length); carried=[]; updateHud(); playTone(740,.2);
    floaters.push({x:player.x,y:player.y-34,text:'Lovely sharing! ✨',life:1.35,color:'#4b7952'});
    for(let i=0;i<20;i++)particles.push({x:player.x+rand(-35,35),y:player.y+rand(-28,15),vx:rand(-85,85),vy:rand(-120,10),life:rand(.5,1),max:1,color:['#edbe53','#e57a63','#6e9a61','#fff1ad'][i%4],size:rand(2,5)});
    if(delivered>=12) setTimeout(()=>endGame(true),500);
  }

  function loop(now) {
    if(!running) return;
    const dt=Math.min(.04,(now-last)/1000); last=now;
    if(!paused) update(dt);
    draw();
    if(running) requestAnimationFrame(loop);
  }
  function update(dt) {
    remaining=Math.max(0,remaining-dt);
    const up=keys.has('ArrowUp')||keys.has('w')||keys.has('W')||touchDirs.has('up');
    const down=keys.has('ArrowDown')||keys.has('s')||keys.has('S')||touchDirs.has('down');
    const left=keys.has('ArrowLeft')||keys.has('a')||keys.has('A')||touchDirs.has('left');
    const right=keys.has('ArrowRight')||keys.has('d')||keys.has('D')||touchDirs.has('right');
    let dx=(right?1:0)-(left?1:0),dy=(down?1:0)-(up?1:0),len=Math.hypot(dx,dy);
    if(len){dx/=len;dy/=len;player.x=clamp(player.x+dx*player.speed*dt,35,world.w-35);player.y=clamp(player.y+dy*player.speed*dt,45,world.h-35);player.face=dx<0?-1:dx>0?1:player.face;player.walk+=dt*12;}
    else player.walk*=.88;
    player.bob=Math.sin(player.walk)*Math.min(2.2,len*2.2);
    camera.x=clamp(player.x-W/2,0,world.w-W); camera.y=clamp(player.y-H/2,0,world.h-H);
    items.forEach(item=>{if(item.active&&Math.hypot(item.x-player.x,item.y-player.y)<27)collect(item)});
    const homeX=world.w/2,homeY=world.h/2;
    if(Math.hypot(player.x-homeX,player.y-homeY)<76) dropoff();
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=115*dt;p.life-=dt}); particles=particles.filter(p=>p.life>0);
    floaters.forEach(f=>{f.y-=25*dt;f.life-=dt});floaters=floaters.filter(f=>f.life>0);
    updateHud();
    if(remaining<=0)endGame(false);
  }

  function roundedRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function drawBackground() {
    ctx.fillStyle='#a8c88f';ctx.fillRect(0,0,W,H);
    // Rolling bands of meadow with a subtle warm wash.
    for(let i=0;i<8;i++){const y=((i*151-camera.y*.12)%780)-100;ctx.fillStyle=i%2?'#a4c68a':'#acce93';ctx.beginPath();ctx.ellipse(470,y,660,85,0,0,Math.PI*2);ctx.fill()}
    // winding path curves past the picnic spot
    ctx.save();ctx.translate(-camera.x,-camera.y);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(1320,70);ctx.bezierCurveTo(1210,225,1290,345,1130,440);ctx.bezierCurveTo(1010,510,990,700,795,810);ctx.lineWidth=106;ctx.strokeStyle='#d9c99a';ctx.stroke();
    ctx.beginPath();ctx.moveTo(1320,70);ctx.bezierCurveTo(1210,225,1290,345,1130,440);ctx.bezierCurveTo(1010,510,990,700,795,810);ctx.lineWidth=86;ctx.strokeStyle='#e7d8ac';ctx.stroke();
    // Outer hedge at the boundary
    ctx.strokeStyle='#7fa878';ctx.lineWidth=27;ctx.strokeRect(12,12,world.w-24,world.h-24);
    // Scatter small meadow marks
    for(const d of decor){if(d.type==='grass'||d.type==='flower')drawMeadow(d);}
    // Bushes and stones
    for(const d of decor){if(d.type==='bush')drawBush(d);else if(d.type==='rock')drawRock(d);}
    drawBlanket(world.w/2,world.h/2);
    items.forEach(item=>{if(item.active)drawTreat(item)});
    drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
    floaters.forEach(f=>{ctx.globalAlpha=Math.min(1,f.life*2);ctx.font='600 15px "DM Sans", sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#fff9e8';ctx.strokeText(f.text,f.x,f.y);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y)});ctx.globalAlpha=1;
    ctx.restore();
    // Sunshine and soft edge vignette
    const grd=ctx.createRadialGradient(W*.5,H*.44,60,W*.5,H*.5,560);grd.addColorStop(0,'#fff6d100');grd.addColorStop(1,'#506c3b19');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  }
  function drawMeadow(d){
    const x=d.x,y=d.y,s=d.s;ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    if(d.type==='flower'){
      ctx.strokeStyle='#82a970';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(1,10);ctx.stroke();
      ctx.fillStyle=d.c;for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.ellipse(Math.cos(a)*3,Math.sin(a)*3,2,3,a,0,Math.PI*2);ctx.fill()}
      ctx.fillStyle='#e7a744';ctx.beginPath();ctx.arc(0,0,1.8,0,Math.PI*2);ctx.fill();
    }else{ctx.strokeStyle='#8cb177';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-2,4);ctx.quadraticCurveTo(-3,0,-1,-2);ctx.moveTo(1,4);ctx.quadraticCurveTo(0,1,3,-2);ctx.stroke()}
    ctx.restore();
  }
  function drawBush(d){
    const s=d.s;ctx.save();ctx.translate(d.x,d.y);ctx.scale(s,s);
    ctx.fillStyle='#5e895c';ctx.beginPath();ctx.ellipse(0,7,26,13,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#6f9c68';ctx.beginPath();ctx.arc(-13,0,13,0,Math.PI*2);ctx.arc(0,-5,16,0,Math.PI*2);ctx.arc(14,1,12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8bb67b';ctx.beginPath();ctx.arc(-4,-10,5,0,Math.PI*2);ctx.arc(12,-4,4,0,Math.PI*2);ctx.fill();
    if(Math.sin(d.phase)>.35){ctx.fillStyle='#d96560';ctx.beginPath();ctx.arc(7,3,2.4,0,Math.PI*2);ctx.arc(-10,-2,2,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function drawRock(d){ctx.save();ctx.translate(d.x,d.y);ctx.scale(d.s,d.s);ctx.fillStyle='#8f9b7d';ctx.beginPath();ctx.ellipse(0,4,12,8,-.25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#bac09b';ctx.beginPath();ctx.ellipse(-3,1,6,3,-.25,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawBlanket(x,y){
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='#5c784d22';ctx.beginPath();ctx.ellipse(0,48,105,24,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f0e2bd';ctx.beginPath();ctx.roundRect(-91,-57,182,117,13);ctx.fill();
    ctx.save();ctx.beginPath();ctx.roundRect(-86,-52,172,107,9);ctx.clip();ctx.fillStyle='#e78269';ctx.fillRect(-87,-1,174,20);ctx.fillRect(-23,-53,18,108);ctx.fillStyle='#f0e2bd';ctx.fillRect(-87,6,174,7);ctx.fillRect(-17,-53,7,108);ctx.restore();
    ctx.strokeStyle='#fff3d4';ctx.lineWidth=3;ctx.setLineDash([3,5]);ctx.beginPath();ctx.roundRect(-82,-48,164,99,7);ctx.stroke();ctx.setLineDash([]);
    // small shared picnic spread
    ctx.fillStyle='#f6d987';ctx.beginPath();ctx.ellipse(-42,-23,14,9,0,0,Math.PI*2);ctx.fill();ctx.font='18px serif';ctx.textAlign='center';ctx.fillText('🍓',-42,-17);ctx.fillText('🧺',43,-17);
    ctx.font='9px "DM Sans"';ctx.fillStyle='#fff9e7';ctx.fillText('PICNIC',10,35);
    ctx.restore();
  }
  function drawTreat(item){
    const bob=Math.sin(performance.now()/400+item.phase)*3;
    ctx.save();ctx.translate(item.x,item.y+bob);
    ctx.fillStyle='#516a3c26';ctx.beginPath();ctx.ellipse(0,12,13,5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e8dfc7';ctx.lineWidth=1;ctx.stroke();
    ctx.font='20px "Apple Color Emoji","Segoe UI Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.type.icon,0,1);
    ctx.fillStyle='#ffdf77';ctx.beginPath();ctx.arc(11,-11,3,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawPlayer(){
    const x=player.x,y=player.y+player.bob;
    ctx.save();ctx.translate(x,y);ctx.fillStyle='#41583d34';ctx.beginPath();ctx.ellipse(0,16,15,6,0,0,Math.PI*2);ctx.fill();
    // little shoes and legs
    const step=Math.sin(player.walk)*3;
    ctx.fillStyle='#795641';ctx.beginPath();ctx.ellipse(-5+step,11,4,6,0,0,Math.PI*2);ctx.ellipse(5-step,11,4,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e88065';ctx.beginPath();ctx.roundRect(-10,-1,20,16,7);ctx.fill();
    // head and hair cap
    ctx.fillStyle='#f4c18c';ctx.beginPath();ctx.arc(0,-10,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#7c583e';ctx.beginPath();ctx.arc(0,-14,11,Math.PI,Math.PI*2);ctx.quadraticCurveTo(12,-8,7,-7);ctx.quadraticCurveTo(4,-11,0,-11);ctx.quadraticCurveTo(-5,-6,-10,-9);ctx.closePath();ctx.fill();
    ctx.fillStyle='#344d3c';ctx.beginPath();ctx.arc(player.face*4,-9,1.2,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#bd755f';ctx.lineWidth=1;ctx.beginPath();ctx.arc(player.face*4,-6,2,.2,1.8);ctx.stroke();
    if(carried.length){ctx.font='15px serif';ctx.textAlign='center';ctx.fillText(carried[carried.length-1].icon,0,-31)}
    ctx.restore();
  }
  function draw(){if(!ctx)return;ctx.setTransform(scaleX,0,0,scaleY,0,0);drawBackground()}

  document.getElementById('playBtn').addEventListener('click',startGame);
  document.getElementById('againBtn').addEventListener('click',startGame);
  document.getElementById('homeBtn').addEventListener('click',showHome);
  document.getElementById('helpBtn').addEventListener('click',()=>helpScreen.classList.remove('hidden'));
  document.getElementById('closeHelp').addEventListener('click',()=>helpScreen.classList.add('hidden'));
  document.getElementById('soundBtn').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.classList.toggle('active',soundOn);e.currentTarget.textContent=soundOn?'♫':'♩';if(soundOn)playTone(620)});
  document.getElementById('pauseBtn').addEventListener('click',()=>{if(!running)return;paused=true;pauseCover.classList.remove('hidden')});
  document.getElementById('resumeBtn').addEventListener('click',()=>{paused=false;pauseCover.classList.add('hidden');last=performance.now()});
  document.getElementById('restartBtn').addEventListener('click',startGame);
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key);if(e.key==='Escape'&&running){paused=!paused;pauseCover.classList.toggle('hidden',!paused);last=performance.now()}});
  window.addEventListener('keyup',e=>keys.delete(e.key));
  window.addEventListener('blur',()=>{keys.clear();touchDirs.clear()});
  document.querySelectorAll('.dpad button').forEach(button=>{
    const dir=button.dataset.dir;
    const release=e=>{e.preventDefault();touchDirs.delete(dir);button.classList.remove('pressed')};
    button.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs.add(dir);button.classList.add('pressed');button.setPointerCapture(e.pointerId)});
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  document.getElementById('bestScore').innerHTML=`BEST PICNIC <b>${Number(localStorage.getItem('picnicBest')||0)} / 12</b>`;
  initGarden();
  camera.x=world.w/2-W/2; camera.y=world.h/2-H/2;
  resize();
})();
