(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const state = {
    title: 'Untitled story', tab: 'characters', selected: 0, playing: false, vip: localStorage.getItem('cartoonlab-vip') === 'true',
    elapsed: 0, lastFrame: 0, audioUrl: null, audioName: '', kokoro: null, kokoroLoading: false, kokoroPromise: null, voiceBuffer: null, voiceText: '', voiceName: 'af_heart', audioContext: null, voiceSource: null, analyser: null, analyserData: null, lipSync: { active:false, startedAt:0, utterance:null },
    character: { name: 'Bloop', color: '#ff9cba', expression: 'happy', x: 640, size: 1, speech: 'What if...?' },
    scenes: [{ name: 'Opening scene', duration: 3, background: 'sunset', title: 'WHAT IF...?', subtitle: 'A tiny idea. A BIG adventure.', motion: 'bounce' }]
  };
  const PROJECT_KEY = 'cartoonlab-project-v1';
  let saveTimer = null;
  function projectSnapshot(){
    return {version:1,title:state.title,character:state.character,scenes:state.scenes,selected:state.selected,elapsed:state.elapsed,vip:state.vip};
  }
  function makeShareCode(){
    const payload={...projectSnapshot(),audioTrackName:state.audioName||'',sharedAt:new Date().toISOString()};
    const bytes=new TextEncoder().encode(JSON.stringify(payload));
    let binary='';
    for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    return 'CL1-'+btoa(binary).split('+').join('-').split('/').join('_').replace(/=+$/,'');
  }
  async function shareProjectCode(){
    const code=makeShareCode();
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(code);
      }else{
        const field=document.createElement('textarea');
        field.value=code;
        field.setAttribute('readonly','');
        field.style.position='fixed';
        field.style.opacity='0';
        document.body.appendChild(field);
        field.select();
        const copied=document.execCommand('copy');
        field.remove();
        if(!copied)throw new Error('Clipboard copy was blocked');
      }
      toast('Share code copied! Paste it into ChatGPT for a rating.');
    }catch(error){
      const field=document.createElement('textarea');
      field.value=code;
      field.setAttribute('readonly','');
      field.style.position='fixed';
      field.style.opacity='0';
      document.body.appendChild(field);
      field.select();
      let copied=false;
      try{copied=document.execCommand('copy');}catch(copyError){}
      field.remove();
      toast(copied?'Share code copied!':'Could not access clipboard — please check browser permissions.');
    }
  }
  function saveProject(){
    try{
      localStorage.setItem(PROJECT_KEY,JSON.stringify(projectSnapshot()));
      const label=document.querySelector('.saved-label');
      if(label)label.textContent='Saved locally';
    }catch(error){
      const label=document.querySelector('.saved-label');
      if(label)label.textContent='Save unavailable';
      console.warn('CartoonLab could not save this project:',error);
    }
  }
  function scheduleSave(){
    const label=document.querySelector('.saved-label');
    if(label)label.textContent='Saving…';
    clearTimeout(saveTimer);
    saveTimer=setTimeout(saveProject,350);
  }
  function restoreProject(){
    try{
      const raw=localStorage.getItem(PROJECT_KEY);
      if(!raw)return;
      const saved=JSON.parse(raw);
      if(!saved || saved.version!==1 || !Array.isArray(saved.scenes) || !saved.scenes.length)return;
      if(saved.character && typeof saved.character==='object')state.character={...state.character,...saved.character};
      state.scenes=saved.scenes.filter(s=>s && typeof s==='object' && Number.isFinite(Number(s.duration)) && Number(s.duration)>0);
      if(!state.scenes.length)state.scenes=[{name:'Opening scene',duration:3,background:'sunset',title:'WHAT IF...?',subtitle:'A tiny idea. A BIG adventure.',motion:'bounce'}];
      state.title=typeof saved.title==='string' && saved.title ? saved.title : state.title;
      state.selected=Math.max(0,Math.min(state.scenes.length-1,Number(saved.selected)||0));
      state.elapsed=Math.max(0,Math.min(Number(saved.elapsed)||0,state.scenes.reduce((n,s)=>n+Number(s.duration||0),0)));
      if(typeof saved.vip==='boolean')state.vip=saved.vip;
      $('projectTitle').textContent=state.title;
    }catch(error){console.warn('CartoonLab could not restore the saved project:',error);}
  }
  restoreProject();
  document.addEventListener('input',scheduleSave);
  document.addEventListener('change',scheduleSave);
  document.addEventListener('click',scheduleSave);
  window.addEventListener('beforeunload',saveProject);
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
  function mouthAmount(){
    if(!state.lipSync.active)return 0;
    if(state.analyser && state.analyserData){
      state.analyser.getByteTimeDomainData(state.analyserData);
      let sum=0;for(let i=0;i<state.analyserData.length;i++){const v=(state.analyserData[i]-128)/128;sum+=v*v;}
      const rms=Math.sqrt(sum/state.analyserData.length);
      return Math.min(1,Math.max(0,(rms-.012)*13));
    }
    return 0;
  }
  function updateVoiceLoadUI(info){
    let panel=$('kokoroLoadStatus');
    if(!panel){
      panel=document.createElement('div');panel.id='kokoroLoadStatus';
      panel.style.cssText='position:fixed;top:82px;left:14px;z-index:9999;width:min(340px,calc(100vw - 28px));padding:13px 15px;border:1px solid #ffffff24;border-radius:14px;background:#191626;color:#fff;box-shadow:0 12px 40px #0008;font:500 13px DM Sans,sans-serif;display:block';
      panel.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:9px"><strong id="kokoroLoadTitle">Preparing AI voice…</strong><span id="kokoroLoadPercent">Starting</span></div><div style="height:6px;border-radius:8px;background:#ffffff20;overflow:hidden"><div id="kokoroLoadBar" style="height:100%;width:0%;border-radius:8px;background:linear-gradient(90deg,#bd8cff,#ff9cba);transition:width .2s"></div></div><div id="kokoroLoadDetail" style="margin-top:7px;color:#c9c2d8;font-size:11px">The editor remains usable while this loads.</div>';
      document.body.appendChild(panel);
    }
    panel.style.display='block';
    const title=$('kokoroLoadTitle'),percent=$('kokoroLoadPercent'),bar=$('kokoroLoadBar'),detail=$('kokoroLoadDetail');
    const p=Number.isFinite(info.progress)?Math.max(0,Math.min(100,info.progress)):-1;
    title.textContent=info.title||'Preparing AI voice…';
    percent.textContent=p>=0?Math.round(p)+'%':'Working…';
    if(p>=0)bar.style.width=p+'%';
    detail.textContent=info.detail||'The editor remains usable while this loads.';
  }
  function finishVoiceLoadUI(){
    const panel=$('kokoroLoadStatus');if(!panel)return;
    $('kokoroLoadTitle').textContent='AI voice ready';
    $('kokoroLoadPercent').textContent='100%';
    $('kokoroLoadBar').style.width='100%';
    $('kokoroLoadDetail').textContent='Voice model loaded and ready to reuse.';
  }
  async function loadKokoro(){
    if(state.kokoro)return state.kokoro;
    if(state.kokoroPromise)return state.kokoroPromise;
    state.kokoroLoading=true;
    updateVoiceLoadUI({title:'Preparing AI voice…',detail:'Checking the browser cache and loading model files.'});
    state.kokoroPromise=(async()=>{
      try{
        const {KokoroTTS}=await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
        const model=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{
          dtype:'q8',device:'wasm',
          progress_callback:(progress)=>{
            const status=progress?.status||'';
            const pct=Number(progress?.progress);
            const loaded=Number(progress?.loaded),total=Number(progress?.total);
            const detail=status==='progress'&&loaded>0&&total>0
              ?(progress.file||'Model file')+' · '+(loaded/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MB'
              :status==='done'?'A model file is ready. Loading remaining components…'
              :status==='ready'?'Finalising the voice engine…'
              :'Downloading and preparing model files. The editor stays usable.';
            updateVoiceLoadUI({title:status==='progress_total'?'Downloading AI voice model…':'Preparing AI voice…',progress:Number.isFinite(pct)?pct:-1,detail});
          }
        });
        state.kokoro=model;
        finishVoiceLoadUI();
        toast('Kokoro voice engine ready');
        return model;
      }catch(error){
        const panel=$('kokoroLoadStatus');if(panel){$('kokoroLoadTitle').textContent='Voice download failed';$('kokoroLoadPercent').textContent='Retry';$('kokoroLoadDetail').textContent=error.message||'Check your connection and try narration again.';}
        throw error;
      }finally{
        state.kokoroLoading=false;state.kokoroPromise=null;
      }
    })();
    return state.kokoroPromise;
  }
  function audioContext(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('Web Audio is not supported in this browser.');
    if(!state.audioContext)state.audioContext=new AC();
    return state.audioContext;
  }
  async function generateVoice(){
    const text=String(state.character.speech||'').trim();
    if(!text){toast('Add dialogue first');return null;}
    if(state.voiceBuffer && state.voiceText===text)return state.voiceBuffer;
    const model=await loadKokoro();
    const result=await model.generate(text,{voice:state.voiceName});
    const ac=audioContext();
    const samples=result.audio instanceof Float32Array?result.audio:new Float32Array(result.audio);
    const buffer=ac.createBuffer(1,samples.length,result.sampling_rate||24000);
    buffer.copyToChannel(samples,0);
    state.voiceBuffer=buffer;state.voiceText=text;
    return buffer;
  }
  function playVoiceBuffer(buffer){
    const ac=audioContext();if(ac.state==='suspended')ac.resume();
    if(state.voiceSource){try{state.voiceSource.stop();}catch(e){}}
    const source=ac.createBufferSource();source.buffer=buffer;
    const analyser=ac.createAnalyser();analyser.fftSize=256;
    const output=ac.createGain();output.gain.value=.95;
    source.connect(analyser);analyser.connect(output);output.connect(ac.destination);
    state.analyser=analyser;state.analyserData=new Uint8Array(analyser.fftSize);
    state.voiceSource=source;state.lipSync.active=true;
    const button=$('speakDialogue');if(button)button.textContent='Ⅱ Stop speech';
    source.onended=()=>{if(state.voiceSource===source){state.lipSync.active=false;state.voiceSource=null;state.analyser=null;state.analyserData=null;const b=$('speakDialogue');if(b)b.textContent='▶ Generate + speak';}};
    source.start();return source;
  }
  function stopLipSync(){
    if(state.voiceSource){try{state.voiceSource.stop();}catch(e){}state.voiceSource=null;}
    if(state.lipSync.utterance){try{speechSynthesis.cancel();}catch(e){}}
    state.lipSync.active=false;state.analyser=null;state.analyserData=null;
    const button=$('speakDialogue');if(button)button.textContent='▶ Generate + speak';
  }
  async function startLipSync(){
    const button=$('speakDialogue');if(button){button.disabled=true;button.textContent='Loading voice…';}
    try{stopLipSync();const buffer=await generateVoice();if(buffer)playVoiceBuffer(buffer);}
    catch(error){console.error('Kokoro TTS:',error);toast('Voice failed: '+(error.message||'check your connection'));if(button)button.textContent='▶ Generate + speak';}
    finally{if(button)button.disabled=false;}
  }
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
    const talking=mouthAmount();
    if(talking>.08){ctx.beginPath();ctx.ellipse(0,r*.16,r*(.075+talking*.075),r*(.035+talking*.17),0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9aa9';ctx.beginPath();ctx.ellipse(0,r*(.19+talking*.08),r*.045,r*talking*.035,0,0,Math.PI*2);ctx.fill();}
    else if(c.expression==='happy'){ctx.arc(0,r*.08,r*.22,.15,Math.PI-.15);ctx.stroke();}
    else if(c.expression==='surprised'){ctx.beginPath();ctx.ellipse(0,r*.16,r*.09,r*.15,0,0,Math.PI*2);ctx.fill();}
    else if(c.expression==='sad'){ctx.arc(0,r*.34,r*.2,Math.PI+0.2,Math.PI*2-.2);ctx.stroke();}
    else if(c.expression==='angry'){ctx.moveTo(-r*.16,r*.19);ctx.lineTo(r*.16,r*.19);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.45,-r*.42);ctx.lineTo(-r*.2,-r*.34);ctx.moveTo(r*.45,-r*.42);ctx.lineTo(r*.2,-r*.34);ctx.stroke();}
    else if(c.expression==='curious'){ctx.beginPath();ctx.moveTo(-r*.16,r*.17);ctx.quadraticCurveTo(-r*.02,r*.28,r*.17,r*.12);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.43,-r*.43);ctx.quadraticCurveTo(-r*.3,-r*.58,-r*.17,-r*.43);ctx.moveTo(r*.18,-r*.48);ctx.quadraticCurveTo(r*.32,-r*.39,r*.45,-r*.46);ctx.stroke();}
    else {ctx.moveTo(-r*.15,r*.17);ctx.lineTo(r*.15,r*.17);ctx.stroke();}
    // arms
    ctx.strokeStyle=c.color;ctx.lineWidth=25*c.size;ctx.lineCap='round';ctx.beginPath();
    if(c.expression==='curious'){
      ctx.moveTo(-r*.7,8);ctx.quadraticCurveTo(-r*1.12,28+bob*.3,-r*1.12,58);
      // Bent arm raised clearly toward the chin
      ctx.moveTo(r*.7,r*.18);ctx.bezierCurveTo(r*1.02,r*.38,r*.78,r*.66,r*.48,r*.43);
      ctx.stroke();
      // Open mitten-like hand with visible fingers beside the chin
      ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(r*.39,r*.34,r*.145,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(r*.32,r*.25);ctx.quadraticCurveTo(r*.24,r*.15,r*.31,r*.12);
      ctx.moveTo(r*.39,r*.22);ctx.quadraticCurveTo(r*.36,r*.08,r*.44,r*.09);
      ctx.moveTo(r*.46,r*.24);ctx.quadraticCurveTo(r*.51,r*.13,r*.57,r*.17);
      ctx.strokeStyle=c.color;ctx.lineWidth=15*c.size;ctx.lineCap='round';ctx.stroke();
    } else {
      ctx.moveTo(-r*.7,5);ctx.quadraticCurveTo(-r*1.15,25+bob*.3,-r*1.12,55);ctx.moveTo(r*.7,5);ctx.quadraticCurveTo(r*1.1,-25-bob*.3,r*1.08,-60);ctx.stroke();
    }
    if(c.expression==='curious'){
      ctx.save();ctx.textAlign='center';ctx.font='800 76px Space Grotesk';ctx.lineWidth=8;ctx.strokeStyle='#38243d';ctx.strokeText('?',r*.82,-r*1.08);ctx.fillStyle='#fff';ctx.fillText('?',r*.82,-r*1.08);ctx.restore();
    }
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
    if(!state.vip){ctx.textAlign='left';ctx.fillStyle='#ffffff88';ctx.font='600 13px DM Sans';ctx.fillText('CARTOONLAB',35,680);}
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
    const track=$('sceneTrack');
    track.innerHTML='';
    state.scenes.forEach((scene,i)=>{
      const card=document.createElement('div');
      card.className='scene-card'+(i===state.selected?' active':'');
      card.tabIndex=0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label','Select '+scene.name);
      card.style.flexBasis=Math.max(112,Number(scene.duration)*34)+'px';
      card.innerHTML='<span class="scene-resize scene-resize-left" title="Drag to change segment length" aria-label="Resize segment from start"></span><span class="scene-drag" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">⠿</span><button class="scene-delete" type="button" title="Delete segment" aria-label="Delete '+escapeHtml(scene.name)+'">×</button><b>'+escapeHtml(scene.name)+'</b><small>'+Number(scene.duration).toFixed(1)+' sec</small><span class="scene-num">'+String(i+1).padStart(2,'0')+'</span><span class="scene-resize scene-resize-right" title="Drag to change segment length" aria-label="Resize segment from end"></span>';
      const select=()=>{state.selected=i;state.elapsed=state.scenes.slice(0,i).reduce((n,x)=>n+Number(x.duration||0),0);renderTimeline();renderInspector();scheduleSave();};
      card.addEventListener('click',e=>{if(e.target.closest('.scene-delete,.scene-drag'))return;select();});
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
      card.querySelector('.scene-delete').addEventListener('click',e=>{
        e.stopPropagation();
        if(state.scenes.length===1){toast('Keep at least one segment');return;}
        const removedIndex=i;
        state.scenes.splice(removedIndex,1);
        if(state.selected===removedIndex)state.selected=Math.max(0,removedIndex-1);
        else if(state.selected>removedIndex)state.selected--;
        state.elapsed=state.scenes.slice(0,state.selected).reduce((n,x)=>n+Number(x.duration||0),0);
        renderTimeline();renderInspector();scheduleSave();toast('Segment deleted');
      });
      card.querySelectorAll('.scene-resize').forEach(handle=>{
        handle.addEventListener('pointerdown',e=>{
          e.preventDefault();e.stopPropagation();handle.setPointerCapture(e.pointerId);
          const startX=e.clientX,startDuration=Number(scene.duration),direction=handle.classList.contains('scene-resize-left')?-1:1;
          const onMove=ev=>{
            const delta=(ev.clientX-startX)/34*direction;
            scene.duration=Math.max(1,Math.min(60,Math.round((startDuration+delta)*2)/2));
            card.style.flexBasis=Math.max(112,scene.duration*34)+'px';
            card.querySelector('small').textContent=scene.duration.toFixed(1)+' sec';
            updateClock();scheduleSave();
          };
          const onUp=()=>{handle.removeEventListener('pointermove',onMove);handle.removeEventListener('pointerup',onUp);handle.removeEventListener('pointercancel',onUp);renderTimeline();if(state.tab==='scenes')renderInspector();};
          handle.addEventListener('pointermove',onMove);handle.addEventListener('pointerup',onUp);handle.addEventListener('pointercancel',onUp);
        });
      });
      const handle=card.querySelector('.scene-drag');
      handle.addEventListener('dragstart',e=>{
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',String(i));
      });
      handle.addEventListener('dragend',()=>card.classList.remove('dragging'));
      card.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';card.classList.add('drag-over');});
      card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
      card.addEventListener('drop',e=>{
        e.preventDefault();card.classList.remove('drag-over');
        const from=Number(e.dataTransfer.getData('text/plain')),to=i;
        if(!Number.isInteger(from)||from<0||from>=state.scenes.length||from===to)return;
        const [moved]=state.scenes.splice(from,1);
        state.scenes.splice(to,0,moved);
        if(state.selected===from)state.selected=to;
        else if(from<state.selected&&to>=state.selected)state.selected--;
        else if(from>state.selected&&to<=state.selected)state.selected++;
        state.elapsed=state.scenes.slice(0,state.selected).reduce((n,x)=>n+Number(x.duration||0),0);
        renderTimeline();renderInspector();scheduleSave();toast('Segments reordered');
      });
      track.append(card);
    });
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function field(label,id,value,type='text',extra=''){return '<label class="field"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+escapeHtml(value)+'" '+extra+'></label>';}
  function renderInspector(){
    const tab=state.tab, c=state.character, s=selectedScene();document.querySelectorAll('.inspector-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    let html='';
    if(tab==='characters'){
      html='<div class="inspector-section"><div class="section-title">MAIN CHARACTER</div>'+field('Character name','charName',c.name)+field('Speech bubble text','speechText',c.speech)+'<label class="field"><span>Storytelling voice</span><select id="voiceChoice"><option value="af_heart">Heart · warm narrator</option><option value="af_bella">Bella · bright</option><option value="af_nicole">Nicole · gentle</option><option value="am_adam">Adam · deeper</option><option value="am_michael">Michael · friendly</option><option value="bf_emma">Emma · British</option><option value="bm_george">George · British deep</option></select></label><button class="full-button" id="speakDialogue">▶ Generate + speak</button><p class="muted-copy">Kokoro AI voice runs on this device. First use downloads the model (about 80 MB); later uses are cached. Mouth movement follows the audio volume.</p></div>'+
      '<div class="inspector-section"><div class="section-title">LOOK & FEEL</div>'+field('Character colour','charColor',c.color,'color')+
      '<label class="field"><span>Expression</span><div class="choice-row">'+['happy','surprised','curious','sad','angry','neutral'].map(x=>'<button class="choice '+(c.expression===x?'active':'')+'" data-expression="'+x+'">'+x[0].toUpperCase()+x.slice(1)+'</button>').join('')+'</div></label>'+
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
    bind('charName',v=>state.character.name=v);bind('speechText',v=>{state.character.speech=v;state.voiceBuffer=null;state.voiceText='';});bind('charColor',v=>state.character.color=v);bind('charSize',v=>state.character.size=+v);bind('charX',v=>state.character.x=+v);
    bind('sceneName',v=>selectedScene().name=v);bind('sceneBg',v=>selectedScene().background=v,'change');bind('sceneTitle',v=>selectedScene().title=v);bind('sceneSubtitle',v=>selectedScene().subtitle=v);bind('sceneMotion',v=>selectedScene().motion=v,'change');
    bind('sceneDuration',v=>{selectedScene().duration=+v;renderTimeline();updateClock();});
    if($('speakDialogue'))$('speakDialogue').onclick=()=>state.lipSync.active?stopLipSync():startLipSync();
    if($('voiceChoice')){$('voiceChoice').value=state.voiceName;$('voiceChoice').onchange=e=>{state.voiceName=e.target.value;state.voiceBuffer=null;state.voiceText='';};}
    document.querySelectorAll('[data-expression]').forEach(b=>b.onclick=()=>{state.character.expression=b.dataset.expression;renderInspector();});
    if($('duplicateScene'))$('duplicateScene').onclick=()=>{const copy={...selectedScene(),name:selectedScene().name+' copy'};state.scenes.splice(state.selected+1,0,copy);state.selected++;renderTimeline();renderInspector();toast('Scene duplicated');};
    if($('deleteScene'))$('deleteScene').onclick=()=>{if(state.scenes.length===1){toast('Keep at least one scene');return;}state.scenes.splice(state.selected,1);state.selected=Math.max(0,state.selected-1);state.elapsed=0;renderTimeline();renderInspector();};
    if($('uploadAudio'))$('uploadAudio').onclick=()=>$('audioUpload').click();
    document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>playSound(b.dataset.sound));
  }
  function switchTab(tab){state.tab=tab;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderInspector();}
  document.querySelectorAll('.nav-item,.inspector-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  function addScene(scene){state.scenes.push(scene||{name:'New scene',duration:5,background:'sky',title:'',subtitle:'',motion:'bounce'});state.selected=state.scenes.length-1;state.elapsed=state.scenes.slice(0,-1).reduce((a,x)=>a+x.duration,0);renderTimeline();renderInspector();toast('Scene added');}
  $('addScene').onclick=()=>addScene();$('addIntro').onclick=()=>addScene({name:'Animated intro',duration:2,background:'sunset',title:'WELCOME!',subtitle:'The story is about to begin',motion:'bounce'});$('addDialogue').onclick=()=>{state.character.speech='Wait... WHAT?!';state.character.expression='surprised';addScene({name:'Big reaction',duration:5,background:'candy',title:'PLOT TWIST!',subtitle:'Nobody saw that coming',motion:'bounce'});switchTab('characters');};
  const vipButton=$('vipToggle');
  function updateVipButton(){if(vipButton){vipButton.textContent=state.vip?'✦ VIP ON':'✦ VIP';vipButton.classList.toggle('vip-active',state.vip);}}
  if(vipButton)vipButton.onclick=()=>{state.vip=!state.vip;localStorage.setItem('cartoonlab-vip',String(state.vip));updateVipButton();toast(state.vip?'VIP mode enabled · watermark hidden':'VIP mode disabled · watermark restored');};
  updateVipButton();
  $('shareCode').onclick=shareProjectCode;
  $('playButton').onclick=()=>{stopLipSync();state.playing=!state.playing;$('playButton').textContent=state.playing?'Ⅱ':'▶';if(state.elapsed>=totalDuration())state.elapsed=0;};
  $('restartButton').onclick=()=>{stopLipSync();state.elapsed=0;state.playing=false;$('playButton').textContent='▶';};
  $('scrubTrack').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();state.elapsed=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*totalDuration();};
  $('renameProject').onclick=()=>{const n=prompt('Name your story',state.title);if(n&&n.trim()){state.title=n.trim();$('projectTitle').textContent=state.title;}};
  $('newProject').onclick=()=>{if(!confirm('Start a new story? This replaces the current scenes.'))return;state.scenes=[{name:'Opening scene',duration:6,background:'sunset',title:'WHAT IF...?',subtitle:'A tiny idea. A BIG adventure.',motion:'bounce'}];state.selected=0;state.elapsed=0;state.title='Untitled story';$('projectTitle').textContent=state.title;renderTimeline();renderInspector();toast('New story created');};
  $('fullscreen').onclick=()=>{const el=$('stageWrap');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.();};
  $('fitStage').onclick=()=>toast('Preview is fitted to the editor');
  $('audioUpload').onchange=e=>{const f=e.target.files[0];if(!f)return;if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);state.audioUrl=URL.createObjectURL(f);state.audioName=f.name;const a=new Audio(state.audioUrl);a.play().catch(()=>{});renderInspector();toast('Audio loaded for preview');};
  function playSound(kind){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('Sound effects are unavailable');return;}const ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);const now=ac.currentTime;o.type=kind==='boing'?'triangle':'sine';o.frequency.setValueAtTime(kind==='boing'?180:kind==='sparkle'?900:520,now);o.frequency.exponentialRampToValueAtTime(kind==='boing'?520:kind==='sparkle'?1500:180,now+.22);g.gain.setValueAtTime(.12,now);g.gain.exponentialRampToValueAtTime(.001,now+.25);o.start();o.stop(now+.26);}
  $('exportVideo').onclick=async()=>{
    if(!canvas.captureStream||!window.MediaRecorder){toast('Video recording is not supported in this browser');return;}
    state.playing=false;state.elapsed=0;$('playButton').textContent='▶';
    const dialogue=String(state.character.speech||'').trim();
    if(dialogue){
      try{await generateVoice();}
      catch(error){console.error('Kokoro export voice:',error);toast('Could not generate narration: '+(error.message||'check your connection'));return;}
    }
    let stream=canvas.captureStream(30), audioDestination=null;
    try{
      if(state.voiceBuffer){
        const ac=audioContext();if(ac.state==='suspended')await ac.resume();
        audioDestination=ac.createMediaStreamDestination();
        const analyser=ac.createAnalyser();analyser.fftSize=256;
        const source=ac.createBufferSource();source.buffer=state.voiceBuffer;
        source.connect(analyser);analyser.connect(audioDestination);
        state.analyser=analyser;state.analyserData=new Uint8Array(analyser.fftSize);state.lipSync.active=true;
        source.onended=()=>{state.lipSync.active=false;state.analyser=null;state.analyserData=null;};
        source.start();
        audioDestination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      }
    }catch(error){console.warn('Audio export setup failed:',error);}
    let mime='video/webm;codecs=vp9,opus';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(state.title||'cartoonlab-story').replace(/[^a-z0-9-_]+/gi,'-')+'.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);stream.getTracks().forEach(track=>track.stop());state.playing=false;state.elapsed=0;$('playButton').textContent='▶';toast(state.voiceBuffer?'Video exported with voice audio!':'Video ready (generate dialogue first to include voice audio).');};recorder.start();state.playing=true;$('playButton').textContent='Ⅱ';toast(state.voiceBuffer?'Recording animation + voice…':'Recording animation…');setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},totalDuration()*1000);
  };
  renderTimeline();renderInspector();requestAnimationFrame(frame);
  // Download and cache the voice model automatically after the editor is ready.
  // This is a one-time first-visit download; the browser/runtime cache handles later visits.
  const preloadKokoro=()=>loadKokoro().catch(error=>console.warn('Kokoro background preload failed; it will retry when narration is used:',error));
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(preloadKokoro,{timeout:4000});
  else setTimeout(preloadKokoro,1800);
})();