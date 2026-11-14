(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const state = {
    title: 'Untitled story', tab: 'characters', selected: 0, playing: false,
    elapsed: 0, lastFrame: 0, audioUrl: null, audioName: '',
    character: { name: 'Bloop', color: '#ff9cba', expression: 'happy', x: 640, size: 1, speech: 'What if...?' },
    scenes: [{ name: 'Opening scene', duration: 6, background: 'sunset', title: 'WHAT IF...?', subtitle: 'A tiny idea. A BIG adventure.', motion: 'bounce' }]
  };
  const backgrounds = {
    sunset: ['#261b46','#ef8a9c','#ffc58d'], sky: ['#1c3558','#6bb6e9','#c5eaff'],
    night: ['#101329','#30366d','#8377c6'], mint: ['#173d3a','#5eae98','#c1e7b4'],
    candy: ['#4b244d','#c06bba','#ffb6d6'], studio: ['#25243a','#56506d','#9b91bb']
  };
  const selectedScene = () => state.scenes[state.selected];
  const totalDuration = () => state.scenes.reduce((n,s)=>n+s.duration,0);
  const currentTime = () => {
    let t=state.elapsed;
    for(let i=0;i<state.scenes.length;i++){if(t<=state.scenes[i].duration || i===state.scenes.length-1)return {index:i,local:Math.min(t,state.scenes[i].duration)};t-=state.scenes[i].duration;}
    return {index:0,local:0};
  };
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200);}
  function drawCharacter(c, time, scene){
    const bob = scene.motion==='bounce' ? Math.sin(time*5)*15 : scene.motion==='float' ? Math.sin(time*2.2)*24 : 0;
    const x=c.x, y=475+bob, r=112*c.size;
    ctx.save();ctx.translate(x,y);
    // soft ground shadow
    ctx.fillStyle='#100e1c55';ctx.beginPath();ctx.ellipse(0,105*c.size,105*c.size,19*c.size,0,0,Math.PI*2);ctx.fill();
    // feet
    ctx.fillStyle='#30233a';ctx.beginPath();ctx.ellipse(-43*c.size,87*c.size,32*c.size,17*c.size,.15,0,Math.PI*2);ctx.ellipse(43*c.size,87*c.size,32*c.size,17*c.size,-.15,0,Math.PI*2);ctx.fill();
    // body
    ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(0,0,r*.95,r*1.02,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffffff24';ctx.beginPath();ctx.ellipse(-r*.28,-r*.43,r*.23,r*.35,-.5,0,Math.PI*2);ctx.fill();
    // cheeks
    ctx.fillStyle='#ff789c88';ctx.beginPath();ctx.ellipse(-r*.58,10,r*.18,r*.11,0,0,Math.PI*2);ctx.ellipse(r*.58,10,r*.18,r*.11,0,0,Math.PI*2);ctx.fill();
    // eyes
    const eyeY=-r*.2, blink=Math.abs(Math.sin(time*2.1))>.985;
    ctx.fillStyle='#29213b';
    if(blink){ctx.fillRect(-r*.42,eyeY,r*.24,5);ctx.fillRect(r*.18,eyeY,r*.24,5);}
    else {ctx.beginPath();ctx.ellipse(-r*.3,eyeY,r*.085,r*.13,0,0,Math.PI*2);ctx.ellipse(r*.3,eyeY,r*.085,r*.13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.beginPath();ctx.arc(-r*.32,eyeY-r*.04,r*.028,0,Math.PI*2);ctx.arc(r*.28,eyeY-r*.04,r*.028,0,Math.PI*2);ctx.fill();}
    // mouth expressions
    ctx.strokeStyle='#38243d';ctx.fillStyle='#38243d';ctx.lineWidth=7*c.size;ctx.lineCap='round';
    ctx.beginPath();
    if(c.expression==='happy'){ctx.arc(0,r*.08,r*.22,.15,Math.PI-.15);ctx.stroke();}
    else if(c.expression==='surprised'){ctx.beginPath();ctx.ellipse(0,r*.16,r*.09,r*.15,0,0,Math.PI*2);ctx.fill();}
    else if(c.expression==='sad'){ctx.arc(0,r*.34,r*.2,Math.PI+0.2,Math.PI*2-.2);ctx.stroke();}
    else if(c.expression==='angry'){ctx.moveTo(-r*.16,r*.19);ctx.lineTo(r*.16,r*.19);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.45,-r*.42);ctx.lineTo(-r*.2,-r*.34);ctx.moveTo(r*.45,-r*.42);ctx.lineTo(r*.2,-r*.34);ctx.stroke();}
    else {ctx.moveTo(-r*.15,r*.17);ctx.lineTo(r*.15,r*.17);ctx.stroke();}
    // arms
    ctx.strokeStyle=c.color;ctx.lineWidth=25*c.size;ctx.beginPath();ctx.moveTo(-r*.7,5);ctx.quadraticCurveTo(-r*1.15,25+bob*.3,-r*1.12,55);ctx.moveTo(r*.7,5);ctx.quadraticCurveTo(r*1.1,-25-bob*.3,r*1.08,-60);ctx.stroke();
    ctx.restore();
    if(c.speech){ctx.save();ctx.font='700 25px DM Sans';const w=Math.min(460,ctx.measureText(c.speech).width+50);const bx=Math.min(1280-w-25,Math.max(25,x-w/2));const by=170;ctx.fillStyle='#fff';roundRect(ctx,bx,by,w,65,18);ctx.fill();ctx.beginPath();ctx.moveTo(x-12,by+62);ctx.lineTo(x+8,by+62);ctx.lineTo(x,by+82);ctx.fill();ctx.fillStyle='#332642';ctx.textAlign='center';ctx.fillText(c.speech,bx+w/2,by+41);ctx.restore();}
  }
  function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
  function draw(){
    const scene=selectedScene(), bg=backgrounds[scene.background]||backgrounds.sunset;
    const grad=ctx.createLinearGradient(0,0,0,720);grad.addColorStop(0,bg[0]);grad.addColorStop(.65,bg[1]);grad.addColorStop(1,bg[2]);ctx.fillStyle=grad;ctx.fillRect(0,0,1280,720);
    // decorative stars / confetti
    for(let i=0;i<34;i++){const x=(i*197+73)%1280,y=(i*113+39)%490;ctx.fillStyle='#ffffff'+(i%3?'35':'65');ctx.beginPath();ctx.arc(x,y,(i%3)+1.5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#ffffff13';ctx.beginPath();ctx.ellipse(640,660,560,65,0,0,Math.PI*2);ctx.fill();
    if(scene.title){ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#241a3a88';ctx.shadowBlur=20;ctx.font='800 62px Space Grotesk';ctx.fillText(scene.title,640,100);ctx.shadowBlur=0;}
    if(scene.subtitle){ctx.textAlign='center';ctx.fillStyle='#fff';ctx.globalAlpha=.85;ctx.font='500 22px DM Sans';ctx.fillText(scene.subtitle,640,137);ctx.globalAlpha=1;}
    drawCharacter(state.character,state.elapsed,scene);
    ctx.textAlign='left';ctx.fillStyle='#ffffff88';ctx.font='600 13px DM Sans';ctx.fillText('CARTOONLAB',35,680);
  }
  function updateClock(){
    const t=state.elapsed, m=Math.floor(t/60),s=(t%60).toFixed(1).padStart(4,'0');
    $('timecode').textContent=String(m).padStart(2,'0')+':'+s;
    $('durationLabel').textContent='00:'+totalDuration().toFixed(1).padStart(4,'0');
    $('timelineDuration').textContent=totalDuration().toFixed(1)+' seconds';
    const p=Math.min(1,t/totalDuration())*100;$('scrubFill').style.width=p+'%';$('scrubKnob').style.left=p+'%';
    const cur=currentTime();$('sceneCounter').textContent=String(cur.index+1).padStart(2,'0')+' / '+String(state.scenes.length).padStart(2,'0');
  }
  function frame(now){
    if(!state.lastFrame)state.lastFrame=now;
    const dt=Math.min((now-state.lastFrame)/1000,.05);state.lastFrame=now;
    if(state.playing){state.elapsed+=dt;if(state.elapsed>=totalDuration()){state.elapsed=0;state.playing=false;$('playButton').textContent='▶';}}
    const cur=currentTime();if(cur.index!==state.selected){state.selected=cur.index;renderTimeline();renderInspector();}
    draw();updateClock();requestAnimationFrame(frame);
  }
  function renderTimeline(){
    $('sceneTrack').innerHTML='';
    state.scenes.forEach((s,i)=>{const b=document.createElement('button');b.className='scene-card'+(i===state.selected?' active':'');b.innerHTML='<b>'+escapeHtml(s.name)+'</b><small>'+s.duration.toFixed(1)+' sec</small><span class="scene-num">'+String(i+1).padStart(2,'0')+'</span>';b.onclick=()=>{state.selected=i;state.elapsed=state.scenes.slice(0,i).reduce((a,x)=>a+x.duration,0);renderTimeline();renderInspector();};$('sceneTrack').append(b);});
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function field(label,id,value,type='text',extra=''){return '<label class="field"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+escapeHtml(value)+'" '+extra+'></label>';}
  function renderInspector(){
    const tab=state.tab, c=state.character, s=selectedScene();document.querySelectorAll('.inspector-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    let html='';
    if(tab==='characters'){
      html='<div class="inspector-section"><div class="section-title">MAIN CHARACTER</div>'+field('Character name','charName',c.name)+field('Speech bubble text','speechText',c.speech)+'</div>'+
      '<div class="inspector-section"><div class="section-title">LOOK & FEEL</div>'+field('Character colour','charColor',c.color,'color')+
      '<label class="field"><span>Expression</span><div class="choice-row">'+['happy','surprised','sad','angry','neutral'].map(x=>'<button class="choice '+(c.expression===x?'active':'')+'" data-expression="'+x+'">'+x[0].toUpperCase()+x.slice(1)+'</button>').join('')+'</div></label>'+
      '<label class="field"><span>Character size</span><input id="charSize" type="range" min=".65" max="1.35" step=".05" value="'+c.size+'"></label>'+
      '<label class="field"><span>Stage position</span><input id="charX" type="range" min="180" max="1100" step="10" value="'+c.x+'"></label></div>'+
      '<button class="full-button" id="addCharacter">＋ Add another character (coming soon)</button><p class="muted-copy">Tip: change the expression between scenes to make reactions feel alive.</p>';
    } else if(tab==='scenes'){
      html='<div class="inspector-section"><div class="section-title">SCENE SETTINGS</div>'+field('Scene name','sceneName',s.name)+
      '<label class="field"><span>Background</span><select id="sceneBg">'+Object.keys(backgrounds).map(k=>'<option value="'+k+'" '+(s.background===k?'selected':'')+'>'+k[0].toUpperCase()+k.slice(1)+'</option>').join('')+'</select></label>'+
      field('Main title','sceneTitle',s.title)+field('Subtitle','sceneSubtitle',s.subtitle)+
      '<label class="field"><span>Animation style</span><select id="sceneMotion"><option value="bounce" '+(s.motion==='bounce'?'selected':'')+'>Bouncy</option><option value="float" '+(s.motion==='float'?'selected':'')+'>Floaty</option><option value="still" '+(s.motion==='still'?'selected':'')+'>Still</option></select></label>'+
      '<label class="field"><span>Scene duration · '+s.duration.toFixed(1)+'s</span><input id="sceneDuration" type="range" min="2" max="20" step=".5" value="'+s.duration+'"></label></div>'+
      '<button class="full-button" id="duplicateScene">▣ Duplicate scene</button><button class="full-button" id="deleteScene" style="margin-top:8px">− Delete scene</button>';
    } else {
      html='<div class="inspector-section"><div class="section-title">AUDIO & VOICE</div><p class="muted-copy">Add your own narration or music track. Audio stays in this browser session.</p>'+
      '<button class="full-button" id="uploadAudio">＋ Import audio file</button>'+
      (state.audioName?'<p class="muted-copy">♫ '+escapeHtml(state.audioName)+'</p>':'')+
      '<label class="field"><span>Sound effects</span><div class="choice-row"><button class="choice" data-sound="pop">Pop</button><button class="choice" data-sound="boing">Boing</button><button class="choice" data-sound="sparkle">Sparkle</button></div></label>'+
      '<p class="muted-copy">Imported audio can be previewed while editing. Video export currently records the animation preview; audio mixing is not included yet.</p></div>';
    }
    $('inspectorContent').innerHTML=html;bindInspector();
  }
  function bindInspector(){
    const bind=(id,fn,event='input')=>{const el=$(id);if(el)el.addEventListener(event,()=>fn(el.value));};
    bind('charName',v=>state.character.name=v);bind('speechText',v=>state.character.speech=v);bind('charColor',v=>state.character.color=v);bind('charSize',v=>state.character.size=+v);bind('charX',v=>state.character.x=+v);
    bind('sceneName',v=>selectedScene().name=v);bind('sceneBg',v=>selectedScene().background=v,'change');bind('sceneTitle',v=>selectedScene().title=v);bind('sceneSubtitle',v=>selectedScene().subtitle=v);bind('sceneMotion',v=>selectedScene().motion=v,'change');
    bind('sceneDuration',v=>{selectedScene().duration=+v;renderTimeline();updateClock();});
    document.querySelectorAll('[data-expression]').forEach(b=>b.onclick=()=>{state.character.expression=b.dataset.expression;renderInspector();});
    if($('duplicateScene'))$('duplicateScene').onclick=()=>{const copy={...selectedScene(),name:selectedScene().name+' copy'};state.scenes.splice(state.selected+1,0,copy);state.selected++;renderTimeline();renderInspector();toast('Scene duplicated');};
    if($('deleteScene'))$('deleteScene').onclick=()=>{if(state.scenes.length===1){toast('Keep at least one scene');return;}state.scenes.splice(state.selected,1);state.selected=Math.max(0,state.selected-1);state.elapsed=0;renderTimeline();renderInspector();};
    if($('uploadAudio'))$('uploadAudio').onclick=()=>$('audioUpload').click();
    document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>playSound(b.dataset.sound));
  }
  function switchTab(tab){state.tab=tab;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderInspector();}
  document.querySelectorAll('.nav-item,.inspector-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  function addScene(scene){state.scenes.push(scene||{name:'New scene',duration:5,background:'sky',title:'',subtitle:'',motion:'bounce'});state.selected=state.scenes.length-1;state.elapsed=state.scenes.slice(0,-1).reduce((a,x)=>a+x.duration,0);renderTimeline();renderInspector();toast('Scene added');}
  $('addScene').onclick=()=>addScene();$('addIntro').onclick=()=>addScene({name:'Animated intro',duration:5,background:'sunset',title:'WELCOME!',subtitle:'The story is about to begin',motion:'bounce'});$('addDialogue').onclick=()=>{state.character.speech='Wait... WHAT?!';state.character.expression='surprised';addScene({name:'Big reaction',duration:5,background:'candy',title:'PLOT TWIST!',subtitle:'Nobody saw that coming',motion:'bounce'});switchTab('characters');};
  $('playButton').onclick=()=>{state.playing=!state.playing;$('playButton').textContent=state.playing?'Ⅱ':'▶';if(state.elapsed>=totalDuration())state.elapsed=0;};
  $('restartButton').onclick=()=>{state.elapsed=0;state.playing=false;$('playButton').textContent='▶';};
  $('scrubTrack').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();state.elapsed=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*totalDuration();};
  $('renameProject').onclick=()=>{const n=prompt('Name your story',state.title);if(n&&n.trim()){state.title=n.trim();$('projectTitle').textContent=state.title;}};
  $('newProject').onclick=()=>{if(!confirm('Start a new story? This replaces the current scenes.'))return;state.scenes=[{name:'Opening scene',duration:6,background:'sunset',title:'WHAT IF...?',subtitle:'A tiny idea. A BIG adventure.',motion:'bounce'}];state.selected=0;state.elapsed=0;state.title='Untitled story';$('projectTitle').textContent=state.title;renderTimeline();renderInspector();toast('New story created');};
  $('fullscreen').onclick=()=>{const el=$('stageWrap');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.();};
  $('fitStage').onclick=()=>toast('Preview is fitted to the editor');
  $('audioUpload').onchange=e=>{const f=e.target.files[0];if(!f)return;if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=URL.createObjectURL(f);state.audioName=f.name;const a=new Audio(state.audioUrl);a.play().catch(()=>{});renderInspector();toast('Audio loaded for preview');};
  function playSound(kind){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('Sound effects are unavailable');return;}const ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);const now=ac.currentTime;o.type=kind==='boing'?'triangle':'sine';o.frequency.setValueAtTime(kind==='boing'?180:kind==='sparkle'?900:520,now);o.frequency.exponentialRampToValueAtTime(kind==='boing'?520:kind==='sparkle'?1500:180,now+.22);g.gain.setValueAtTime(.12,now);g.gain.exponentialRampToValueAtTime(.001,now+.25);o.start();o.stop(now+.26);}
  $('exportVideo').onclick=()=>{
    if(!canvas.captureStream||!window.MediaRecorder){toast('Video recording is not supported in this browser');return;}
    state.playing=false;state.elapsed=0;$('playButton').textContent='▶';
    const stream=canvas.captureStream(30);let mime='video/webm;codecs=vp9';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(state.title||'cartoonlab-story').replace(/[^a-z0-9-_]+/gi,'-')+'.webm';a.click();URL.revokeObjectURL(url);state.playing=false;state.elapsed=0;$('playButton').textContent='▶';toast('Your video is ready!');};recorder.start();state.playing=true;$('playButton').textContent='Ⅱ';toast('Recording your animation…');setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},totalDuration()*1000);
  };
  renderTimeline();renderInspector();requestAnimationFrame(frame);
})();