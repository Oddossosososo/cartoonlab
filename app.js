(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const state = {
    title: 'Untitled story', tab: 'characters', selected: 0, playing: false, vip: localStorage.getItem('cartoonlab-vip') === 'true',
    elapsed: 0, lastFrame: 0, audioUrl: null, audioName: '', audioBuffer:null, audioTracks:[], kokoro: null, kokoroLoading: false, kokoroPromise: null, voiceBuffer: null, voiceText: '', voiceName: 'af_heart', voiceSpeed: 1, voiceBufferSpeed: 1, audioContext: null, voiceSource: null, analyser: null, analyserData: null, lipSync: { active:false, startedAt:0, utterance:null },
    character: { name: 'Bloop', color: '#ff9cba', expression: 'happy', x: 640, size: 1, speech: 'What if...?', ttsText: 'What if...?' }, extraCharacters: [], meshObjects: [], selectedMesh: 0, selectedVertex: 0,
    scenes: [{ name: 'Opening scene', duration: 6, background: 'sunset', title: 'WHAT IF...?', subtitle: 'A tiny idea. A BIG adventure.', motion: 'bounce' }]
  };
  const PROJECT_KEY = 'cartoonlab-project-v1';
  // One-time reset requested: discard the previous cartoon and start clean.
  const RESET_KEY = 'cartoonlab-reset-all-v1';
  try {
    if (localStorage.getItem(RESET_KEY) !== 'true') {
      localStorage.removeItem(PROJECT_KEY);
      localStorage.setItem(RESET_KEY, 'true');
    }
  } catch (error) { console.warn('CartoonLab reset could not access local storage:', error); }
  let saveTimer = null;
  let smoothPreviewUrl=null,smoothPreviewRecorder=null,smoothPreviewTimer=null,smoothPreviewValid=false,smoothPreviewActive=false,smoothPreviewCancelled=false;
  const smoothVideo=$('smoothVideo');
  function hideSmoothVideo(){
    if(!smoothVideo)return;
    smoothVideo.pause();smoothVideo.style.display='none';canvas.style.display='block';smoothPreviewActive=false;
  }
  function clearSmoothPreview(){
    smoothPreviewCancelled=true;
    if(smoothPreviewTimer){clearTimeout(smoothPreviewTimer);smoothPreviewTimer=null;}
    if(smoothPreviewRecorder&&smoothPreviewRecorder.state!=='inactive'){try{smoothPreviewRecorder.stop();}catch(error){}}
    smoothPreviewRecorder=null;
    hideSmoothVideo();
    if(smoothPreviewUrl){URL.revokeObjectURL(smoothPreviewUrl);smoothPreviewUrl=null;}
    smoothPreviewValid=false;
    const button=$('smoothPreview');if(button){button.disabled=false;button.textContent='Smooth preview';}
  }
  async function renderSmoothPreview(){
    const button=$('smoothPreview');
    if(!canvas.captureStream||!window.MediaRecorder||!smoothVideo){toast('Compressed preview is not supported in this browser');return;}
    if(smoothPreviewValid&&smoothPreviewUrl){
      canvas.style.display='none';smoothVideo.style.display='block';smoothPreviewActive=true;
      smoothVideo.currentTime=0;
      try{await smoothVideo.play();}catch(error){toast('Press play on the video preview to start playback');}
      return;
    }
    clearSmoothPreview();smoothPreviewCancelled=false;
    button.disabled=true;button.textContent='Rendering…';
    state.playing=false;state.elapsed=0;state.lastFrame=0;$('playButton').textContent='▶';
    draw();
    let stream=null;
    try{
      const memory=Number(navigator.deviceMemory)||4;
      const cores=Number(navigator.hardwareConcurrency)||4;
      const previewFps=(memory<=2||cores<=2)?24:(memory<=4||cores<=4)?30:60;
      stream=canvas.captureStream(previewFps);
      const videoBitsPerSecond=(memory<=2||cores<=2)?1800000:(memory<=4||cores<=4)?3500000:6500000;
      const candidates=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
      const mimeType=candidates.find(type=>MediaRecorder.isTypeSupported(type))||'';
      const options={videoBitsPerSecond};if(mimeType)options.mimeType=mimeType;
      const recorder=new MediaRecorder(stream,options);
      smoothPreviewRecorder=recorder;
      const chunks=[];
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=e=>{console.error('Smooth preview encoding failed:',e.error||e);smoothPreviewCancelled=true;toast('Smooth preview failed to encode');};
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop());
        smoothPreviewRecorder=null;
        if(smoothPreviewCancelled){button.disabled=false;button.textContent='Smooth preview';return;}
        const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});
        if(!blob.size){button.disabled=false;button.textContent='Smooth preview';toast('Preview recording was empty');return;}
        smoothPreviewUrl=URL.createObjectURL(blob);smoothPreviewValid=true;
        smoothVideo.src=smoothPreviewUrl;smoothVideo.load();
        canvas.style.display='none';smoothVideo.style.display='block';smoothPreviewActive=true;
        button.disabled=false;button.textContent='↻ Re-render preview';
        smoothVideo.play().catch(()=>toast('Preview ready — press play to watch'));
        toast('Compressed preview ready · native video playback');
      };
      recorder.start(250);
      state.playing=true;$('playButton').textContent='Ⅱ';
      toast('Rendering compressed preview at '+previewFps+' FPS…');
      smoothPreviewTimer=setTimeout(()=>{
        smoothPreviewTimer=null;
        if(recorder.state!=='inactive')recorder.stop();
        state.playing=false;$('playButton').textContent='▶';
      },Math.max(1,totalDuration())*1000+80);
    }catch(error){
      if(stream)stream.getTracks().forEach(track=>track.stop());
      smoothPreviewRecorder=null;state.playing=false;button.disabled=false;button.textContent='Smooth preview';
      console.error('Smooth preview:',error);toast('Preview failed: '+(error.message||'unsupported video encoder'));
    }
  }
  function projectSnapshot(){
    return {version:3,title:state.title,character:state.character,extraCharacters:state.extraCharacters,meshObjects:state.meshObjects,selectedMesh:state.selectedMesh,scenes:state.scenes,selected:state.selected,elapsed:state.elapsed,vip:state.vip,voiceSpeed:state.voiceSpeed,voiceName:state.voiceName};
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
      if(!saved || ![1,3].includes(saved.version) || !Array.isArray(saved.scenes) || !saved.scenes.length)return;
      if(saved.character && typeof saved.character==='object'){state.character={...state.character,...saved.character};if(typeof saved.character.ttsText!=='string')state.character.ttsText=String(saved.character.speech||'');}if(Array.isArray(saved.extraCharacters))state.extraCharacters=saved.extraCharacters.filter(c=>c&&typeof c==='object').slice(0,20);if(Array.isArray(saved.meshObjects))state.meshObjects=saved.meshObjects.filter(m=>m&&typeof m==='object').slice(0,100);
      state.scenes=saved.scenes.filter(s=>s && typeof s==='object' && Number.isFinite(Number(s.duration)) && Number(s.duration)>0);
      if(!state.scenes.length)state.scenes=[{name:'Opening scene',duration:3,background:'sunset',title:'WHAT IF...?',subtitle:'A tiny idea. A BIG adventure.',motion:'bounce'}];
      state.title=typeof saved.title==='string' && saved.title ? saved.title : state.title;
      state.selected=Math.max(0,Math.min(state.scenes.length-1,Number(saved.selected)||0));
      state.selectedMesh=Math.max(0,Math.min(state.meshObjects.length-1,Number(saved.selectedMesh)||0));
      state.elapsed=Math.max(0,Math.min(Number(saved.elapsed)||0,state.scenes.reduce((n,s)=>n+Number(s.duration||0),0)));
      if(typeof saved.vip==='boolean')state.vip=saved.vip;
      if(Number.isFinite(Number(saved.voiceSpeed)))state.voiceSpeed=Number(saved.voiceSpeed);
      $('projectTitle').textContent=state.title;
    }catch(error){console.warn('CartoonLab could not restore the saved project:',error);}
  }
  restoreProject();
  document.addEventListener('input',()=>{clearSmoothPreview();scheduleSave();});
  document.addEventListener('change',()=>{clearSmoothPreview();scheduleSave();});
  document.addEventListener('click',e=>{
    if(!e.target.closest('#smoothPreview,#playButton,#restartButton,#scrubTrack,.nav-item,.inspector-tab')&&(!e.target.closest('.scene-card')||e.target.closest('.scene-delete,.scene-resize')))clearSmoothPreview();
    scheduleSave();
  });
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
    for(let i=0;i<state.scenes.length;i++){if(t<state.scenes[i].duration || i===state.scenes.length-1)return {index:i,local:Math.min(t,state.scenes[i].duration)};t-=state.scenes[i].duration;}
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
  const KOKORO_DOWNLOAD_KEY='cartoonlab-kokoro-download-complete-v1';
  function kokoroWasDownloaded(){
    try{return localStorage.getItem(KOKORO_DOWNLOAD_KEY)==='true';}catch(error){return false;}
  }
  function updateVoiceLoadUI(info){
    if(kokoroWasDownloaded())return;
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
    try{localStorage.setItem(KOKORO_DOWNLOAD_KEY,'true');}catch(error){console.warn('Could not save Kokoro download status:',error);}
    const panel=$('kokoroLoadStatus');if(!panel)return;
    $('kokoroLoadTitle').textContent='✓ Download complete';
    $('kokoroLoadTitle').style.color='#8fe3ad';
    $('kokoroLoadPercent').textContent='100%';
    $('kokoroLoadBar').style.width='100%';
    $('kokoroLoadBar').style.background='linear-gradient(90deg,#55c987,#8fe3ad)';
    $('kokoroLoadDetail').textContent='Kokoro AI voice is loaded and ready to use. This status stays visible.';
  }
  async function loadKokoro(){
    if(state.kokoro)return state.kokoro;
    if(state.kokoroPromise)return state.kokoroPromise;
    state.kokoroLoading=true;
    if(!kokoroWasDownloaded())updateVoiceLoadUI({title:'Preparing AI voice…',detail:'Checking the browser cache and loading model files.'});
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
    if(!String(state.character.ttsText||'').trim()){toast('Add TTS text first');return null;}
    // Wait for the model first, then read the latest editor values. If the user
    // changes text, voice, or speed while synthesis is running, regenerate once
    // with the newest settings instead of playing stale narration.
    const model=await loadKokoro();
    for(let attempt=0;attempt<4;attempt++){
      const text=String(state.character.ttsText||'').trim();
      const voice=state.voiceName;
      const speed=state.voiceSpeed;
      if(!text){toast('Add TTS text first');return null;}
      if(state.voiceBuffer && state.voiceText===text && state.voiceName===voice && state.voiceBufferSpeed===speed)return state.voiceBuffer;
      const result=await model.generate(text,{voice,speed});
      if(text!==String(state.character.ttsText||'').trim()||voice!==state.voiceName||speed!==state.voiceSpeed)continue;
      const ac=audioContext();
      const samples=result.audio instanceof Float32Array?result.audio:new Float32Array(result.audio);
      const buffer=ac.createBuffer(1,samples.length,result.sampling_rate||24000);
      buffer.copyToChannel(samples,0);
      state.voiceBuffer=buffer;state.voiceText=text;state.voiceBufferSpeed=speed;
      return buffer;
    }
    throw new Error('Voice settings kept changing. Press Generate + speak again.');
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
  function sceneLayersForSpeech(){return (state.scenes[currentTime().index]?.layers?.speech)!==false;}
  function drawCharacter(c, time, scene){
    const movement=scene.characterMotion||({bounce:'bounce',float:'float',still:'idle'}[scene.motion]||'bounce');
    const cycle=time*(movement==='run'?10:movement==='walk'?5:3.5);
    const bob=movement==='bounce'?Math.abs(Math.sin(time*5))*22:movement==='float'?Math.sin(time*2.2)*24:movement==='jump'?Math.abs(Math.sin(time*2.8))*105:movement==='walk'?Math.abs(Math.sin(cycle))*7:movement==='run'?Math.abs(Math.sin(cycle))*13:movement==='wave'?Math.sin(time*3)*5:0;
    const stride=movement==='walk'?Math.sin(cycle)*22:movement==='run'?Math.sin(cycle)*39:0;
    const x=c.x+(movement==='walk'?Math.sin(time*2.5)*42:movement==='run'?Math.sin(time*4)*72:0), y=475-bob, r=112*c.size;
    ctx.save();ctx.translate(x,y);
    // soft ground shadow
    ctx.fillStyle='#100e1c55';ctx.beginPath();ctx.ellipse(0,105*c.size,105*c.size,19*c.size,0,0,Math.PI*2);ctx.fill();
    // feet
    ctx.fillStyle='#30233a';ctx.beginPath();ctx.ellipse((-43+stride)*c.size,87*c.size,32*c.size,17*c.size,.15+Number(c.rig?.legLeft||0)*Math.PI/180,0,Math.PI*2);ctx.ellipse((43-stride)*c.size,87*c.size,32*c.size,17*c.size,-.15+Number(c.rig?.legRight||0)*Math.PI/180,0,Math.PI*2);ctx.fill();
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
      ctx.moveTo(-r*.7,8);ctx.quadraticCurveTo(-r*1.12,28,-r*1.12,58);
      // Bent arm raised clearly toward the chin
      ctx.moveTo(r*.7,r*.18);ctx.bezierCurveTo(r*1.02,r*.38,r*.78,r*.66,r*.48,r*.43);
      ctx.stroke();
      // Open mitten-like hand with visible fingers beside the chin
      ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(r*.39,r*.34,r*.145,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(r*.32,r*.25);ctx.quadraticCurveTo(r*.24,r*.15,r*.31,r*.12);
      ctx.moveTo(r*.39,r*.22);ctx.quadraticCurveTo(r*.36,r*.08,r*.44,r*.09);
      ctx.moveTo(r*.46,r*.24);ctx.quadraticCurveTo(r*.51,r*.13,r*.57,r*.17);
      ctx.strokeStyle=c.color;ctx.lineWidth=15*c.size;ctx.lineCap='round';ctx.stroke();
    } else if(movement==='wave'){
      const wave=Math.sin(time*8)*.48;
      ctx.moveTo(-r*.7,5);ctx.quadraticCurveTo(-r*1.15,25,-r*1.12,55);
      ctx.moveTo(r*.7,5);ctx.lineTo(r*.98,-r*.42);ctx.stroke();
      ctx.save();ctx.translate(r*.98,-r*.42);ctx.rotate(wave);ctx.strokeStyle=c.color;ctx.lineWidth=22*c.size;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r*.12,-r*.48);ctx.stroke();ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(r*.12,-r*.49,r*.13,0,Math.PI*2);ctx.fill();ctx.restore();
    } else {
      const swing=(movement==='walk'||movement==='run')?Math.sin(cycle)*.5:0;
      ctx.save();ctx.rotate(-swing*.28+Number(c.rig?.armLeft||0)*Math.PI/180);ctx.moveTo(-r*.7,5);ctx.quadraticCurveTo(-r*1.15,25,-r*1.12,55);ctx.stroke();ctx.restore();
      ctx.save();ctx.rotate(swing*.28+Number(c.rig?.armRight||0)*Math.PI/180);ctx.moveTo(r*.7,5);ctx.quadraticCurveTo(r*1.1,-25,r*1.08,-60);ctx.stroke();ctx.restore();
    }
    if(c.expression==='curious'){
      ctx.save();ctx.textAlign='center';ctx.font='800 76px Space Grotesk';ctx.lineWidth=8;ctx.strokeStyle='#38243d';ctx.strokeText('?',r*.82,-r*1.08);ctx.fillStyle='#fff';ctx.fillText('?',r*.82,-r*1.08);ctx.restore();
    }
    ctx.restore();
    if(c.speech&&sceneLayersForSpeech()){ctx.save();ctx.font='700 25px DM Sans';const w=Math.min(460,ctx.measureText(c.speech).width+50);const bx=Math.min(1280-w-25,Math.max(25,x-w/2));const by=170;ctx.fillStyle='#fff';roundRect(ctx,bx,by,w,65,18);ctx.fill();ctx.beginPath();ctx.moveTo(x-12,by+62);ctx.lineTo(x+8,by+62);ctx.lineTo(x,by+82);ctx.fill();ctx.fillStyle='#332642';ctx.textAlign='center';ctx.fillText(c.speech,bx+w/2,by+41);ctx.restore();}
  }
  function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

  function housePolygon(points,fill,stroke){
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=4;ctx.stroke();}
  }
  function drawWitheringForest(scene,time){
    const progress=Math.max(0,Math.min(1,(Number(time)||0)/Math.max(.1,Number(scene.duration)||6)));
    const sky=ctx.createLinearGradient(0,0,0,720);
    sky.addColorStop(0,'#8aa9b5');sky.addColorStop(.62,'#c7bda5');sky.addColorStop(1,'#8b8065');
    ctx.fillStyle=sky;ctx.fillRect(0,0,1280,720);
    ctx.fillStyle='#75694f';ctx.fillRect(0,555,1280,165);
    ctx.fillStyle='#a69a75';ctx.globalAlpha=.35;ctx.fillRect(0,555,1280,12);ctx.globalAlpha=1;
    const trees=[{x:110,y:570,h:300,r:1},{x:330,y:575,h:260,r:.82},{x:600,y:580,h:340,r:1.12},{x:900,y:570,h:285,r:.94},{x:1160,y:575,h:320,r:1.05}];
    trees.forEach((tree,index)=>{
      const x=tree.x,y=tree.y,h=tree.h*tree.r;
      ctx.save();ctx.translate(x,y);ctx.scale(tree.r,tree.r);
      ctx.strokeStyle='#594431';ctx.lineCap='round';ctx.lineWidth=25;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-h);ctx.stroke();
      ctx.lineWidth=13;
      const branches=[[-85,-h*.78,-155,-h*.98],[82,-h*.72,150,-h*.96],[-65,-h*.55,-125,-h*.73],[60,-h*.48,125,-h*.7],[-35,-h*.9,-75,-h*1.08],[30,-h*.86,88,-h*1.05]];
      branches.forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(0,y1);ctx.lineTo(x1,y1-20);ctx.lineTo(x2,y2);ctx.stroke();});
      const leafCount=16;
      for(let n=0;n<leafCount;n++){
        const a=(n*2.399+index)*1.3,rad=35+(n%5)*19;
        const lx=Math.cos(a)*rad,ly=-h*.76+Math.sin(a)*rad*.72;
        const withered=progress*leafCount;
        if(n<withered)continue;
        ctx.fillStyle=['#477b4d','#63934f','#829c55','#a1a45d'][n%4];
        ctx.beginPath();ctx.ellipse(lx,ly,27,18,a,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    });
    // Leaves drift down as the scene advances, leaving increasingly bare branches.
    for(let n=0;n<24;n++){
      const phase=(progress*1.8+n*.137)%1;
      if(phase<.12)continue;
      const x=(n*173+80+Math.sin(time*1.5+n)*35)%1280;
      const y=300+phase*340;
      ctx.save();ctx.translate(x,y);ctx.rotate(time*1.7+n);
      ctx.fillStyle='#b78a45';ctx.globalAlpha=.8;
      ctx.beginPath();ctx.ellipse(0,0,7,3,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(progress>.72){ctx.fillStyle='#5c5140';ctx.globalAlpha=(progress-.72)*.35;ctx.fillRect(0,0,1280,720);ctx.globalAlpha=1;}
  }

  function drawHouseRoom(scene,time){
    const room=scene.houseRoom||'hallway',walk=scene.cameraMotion==='walkthrough';
    const step=walk?Math.sin(time*7)*5:0,depth=walk?Math.min(1,time/Math.max(1,scene.duration))*.28:0;
    const cx=640+step,cy=330+Math.sin(time*3)*2;
    const palettes={hallway:['#d9c8ad','#b58f70','#80634f'],living:['#eadcc7','#b98e6c','#80604c'],kitchen:['#dce7e6','#9baeb0','#718589'],bedroom:['#e8dce8','#b9a3b9','#856f87'],front:['#b6d9f3','#7aaf79','#527d55'],backyard:['#a9d9f3','#70b978','#4e8c52']};
    const p=palettes[room]||palettes.hallway;
    const sky=ctx.createLinearGradient(0,0,0,720);sky.addColorStop(0,room==='front'||room==='backyard'?'#8ec9f0':'#f7ead8');sky.addColorStop(1,p[0]);ctx.fillStyle=sky;ctx.fillRect(0,0,1280,720);
    if(room==='front'||room==='backyard'){
      ctx.fillStyle='#8ec8f1';ctx.fillRect(0,0,1280,430);
      ctx.fillStyle='#6cb66d';ctx.fillRect(0,430,1280,290);
      for(let i=0;i<7;i++){const x=70+i*190;ctx.fillStyle='#39784d';ctx.beginPath();ctx.arc(x,365+(i%2)*25,58,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6b9d55';ctx.fillRect(x-9,390,18,65);}
      if(room==='front'){
        housePolygon([[320,400],[640,170],[960,400]],'#704f48','#4b3434');
        ctx.fillStyle='#f0dfc7';ctx.fillRect(380,390,520,270);ctx.fillStyle='#d5bda0';ctx.fillRect(585,445,110,215);
        ctx.fillStyle='#a7d9e8';ctx.fillRect(430,455,100,100);ctx.fillRect(750,455,100,100);
        ctx.fillStyle='#d9b46f';ctx.beginPath();ctx.arc(675,555,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c4a27d';ctx.fillRect(0,655,1280,65);
      }else{
        ctx.fillStyle='#f0dfc7';ctx.fillRect(0,500,1280,220);
        ctx.fillStyle='#8d654b';ctx.fillRect(120,470,1040,28);
        for(let i=0;i<5;i++){ctx.fillStyle='#4d9959';ctx.beginPath();ctx.arc(180+i*235,420+(i%2)*35,55,0,Math.PI*2);ctx.fill();}
      }
      return;
    }
    const push=depth*480;
    // Room shell in one-point perspective.
    housePolygon([[0,0],[1280,0],[cx+350+push,cy-35],[cx-350-push,cy-35]],'#f4e9da');
    housePolygon([[0,0],[cx-350-push,cy-35],[cx-350-push,590],[0,720]],'#d8c4aa');
    housePolygon([[1280,0],[cx+350+push,cy-35],[cx+350+push,590],[1280,720]],'#cbb49a');
    housePolygon([[0,720],[1280,720],[cx+350+push,cy-35],[cx-350-push,cy-35]],'#9a755b');
    // Floor boards converge toward the back wall.
    ctx.strokeStyle='#6e513e55';ctx.lineWidth=3;
    for(let i=-5;i<=5;i++){ctx.beginPath();ctx.moveTo(cx+i*55,cy-35);ctx.lineTo(640+i*170,720);ctx.stroke();}
    for(let y=470;y<720;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1280,y);ctx.stroke();}
    // Back wall, doorway and window.
    ctx.fillStyle=p[0];ctx.fillRect(cx-350-push,cy-35,700+push*2,250);
    ctx.fillStyle='#78513e';ctx.fillRect(cx-75,cy+10,150,205);
    ctx.fillStyle='#d5b18a';ctx.fillRect(cx-62,cy+22,124,193);
    ctx.fillStyle='#6b4b3c';ctx.fillRect(cx+43,cy+115,8,8);
    ctx.fillStyle='#9ed2e5';ctx.fillRect(cx-285,cy+15,145,110);
    ctx.strokeStyle='#fff';ctx.lineWidth=8;ctx.strokeRect(cx-285,cy+15,145,110);ctx.beginPath();ctx.moveTo(cx-212,cy+15);ctx.lineTo(cx-212,cy+125);ctx.moveTo(cx-285,cy+70);ctx.lineTo(cx-140,cy+70);ctx.stroke();
    // Ceiling light.
    ctx.strokeStyle='#8d745e';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,cy-25);ctx.stroke();
    ctx.fillStyle='#ffe8a3';ctx.beginPath();ctx.ellipse(cx,cy-15,48,17,0,0,Math.PI*2);ctx.fill();
    if(room==='living'){
      // Sofa and coffee table.
      ctx.fillStyle='#688c91';roundRect(ctx,150,470,360,135,35);ctx.fill();ctx.fillStyle='#8eb2b3';roundRect(ctx,175,440,310,100,28);ctx.fill();
      ctx.fillStyle='#76543e';ctx.fillRect(500,600,270,18);ctx.fillRect(530,618,18,50);ctx.fillRect(720,618,18,50);
      ctx.fillStyle='#d9b36f';ctx.beginPath();ctx.arc(635,580,25,0,Math.PI*2);ctx.fill();
    }else if(room==='kitchen'){
      ctx.fillStyle='#f5f0e7';ctx.fillRect(120,470,1040,125);ctx.fillStyle='#8ba3a1';ctx.fillRect(120,470,1040,24);
      for(let i=0;i<5;i++){ctx.fillStyle='#d8e2df';ctx.fillRect(145+i*205,270,180,170);ctx.strokeStyle='#9aaca9';ctx.strokeRect(145+i*205,270,180,170);}
      ctx.fillStyle='#454b50';ctx.fillRect(560,475,160,18);ctx.fillStyle='#c4d5d1';ctx.fillRect(800,480,210,105);
    }else if(room==='bedroom'){
      ctx.fillStyle='#6c7898';ctx.fillRect(260,470,760,180);ctx.fillStyle='#d8d7e6';ctx.fillRect(290,440,700,95);
      ctx.fillStyle='#f4b8c9';ctx.fillRect(330,450,210,80);ctx.fillRect(760,450,210,80);
      ctx.fillStyle='#8c6c87';ctx.fillRect(230,640,820,18);
    }else{
      // Hallway runner and framed pictures.
      ctx.fillStyle='#b45e62';ctx.beginPath();ctx.moveTo(490,720);ctx.lineTo(790,720);ctx.lineTo(690,cy+215);ctx.lineTo(590,cy+215);ctx.closePath();ctx.fill();
      ctx.fillStyle='#c99d69';ctx.fillRect(80,190,145,180);ctx.fillStyle='#8eb4a5';ctx.fillRect(95,205,115,150);
      ctx.fillStyle='#c99d69';ctx.fillRect(1050,190,145,180);ctx.fillStyle='#d7b2a2';ctx.fillRect(1065,205,115,150);
    }
    // Subtle forward camera movement and footsteps in the floor lighting.
    if(walk){ctx.fillStyle='#ffffff12';ctx.beginPath();ctx.ellipse(640,690,240+Math.sin(time*7)*12,22,0,0,Math.PI*2);ctx.fill();}
  }

  function drawCounter(scene,local){
    if(!scene.counterEnabled)return;
    const intervalRaw=Number(scene.counterInterval);
    const interval=Number.isFinite(intervalRaw)&&intervalRaw>0?intervalRaw:1;
    const delayRaw=Number(scene.counterDelay);
    const delay=Number.isFinite(delayRaw)&&delayRaw>0?delayRaw:0;
    const elapsed=Math.max(0,Number(local)||0);
    let value,label,unit,counterText;
    if(scene.counterMode==='years'){
      const progress=Math.max(0,Math.min(1,state.elapsed/Math.max(.001,totalDuration())));
      value=Math.round((Number(scene.counterStart)||0)+progress*((Number(scene.counterEnd)||250)-(Number(scene.counterStart)||0)));
      counterText=value+' '+(value===1?'YEAR':'YEARS');
    }else{
      const startRaw=Number(scene.counterStart);
      const start=Number.isFinite(startRaw)?startRaw:1;
      const stepRaw=Number(scene.counterStep);
      const step=Number.isFinite(stepRaw)?stepRaw:1;
      const increments=elapsed<delay?0:Math.floor((elapsed-delay)/interval)+1;
      value=start+increments*step;
      label=String(scene.counterLabel||'DAY').trim();
      unit=String(scene.counterUnit||'').trim();
      counterText=(label?label+' ':'')+value+(unit?' '+unit:'');
    }
    ctx.save();
    ctx.font='800 27px Space Grotesk';ctx.textAlign='center';ctx.textBaseline='middle';
    const width=Math.max(116,ctx.measureText(counterText).width+42),height=58,pad=22;
    const corner=scene.counterCorner||'top-right';
    const left=corner.includes('left')?pad:1280-width-pad;
    const top=corner.includes('bottom')?720-height-pad:pad;
    ctx.fillStyle='#171326dd';roundRect(ctx,left,top,width,height,15);ctx.fill();
    ctx.strokeStyle='#ffffff38';ctx.lineWidth=1.5;roundRect(ctx,left,top,width,height,15);ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillText(counterText,left+width/2,top+height/2);
    ctx.restore();
  }

  // Mini Mesh Lab: editable primitive meshes, stored as real vertices/faces in HSL.
  function createPrimitiveMesh(type){
    const vertices=[],faces=[],segments=16;
    if(type==='cube'){
      vertices.push([-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]);
      faces.push([0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]);
    }else if(type==='pyramid'){
      vertices.push([-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],[0,-1,0]);
      faces.push([0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]);
    }else if(type==='sphere'){
      const rings=8,cols=segments;
      for(let y=0;y<=rings;y++){const v=Math.PI*y/rings;for(let x=0;x<cols;x++){const u=2*Math.PI*x/cols;vertices.push([Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)]);}}
      for(let y=0;y<rings;y++)for(let x=0;x<cols;x++){const a=y*cols+x,b=y*cols+(x+1)%cols,c=(y+1)*cols+(x+1)%cols,d=(y+1)*cols+x;faces.push([a,b,c,d]);}
    }else if(type==='cylinder'||type==='cone'){
      for(let y=0;y<2;y++)for(let x=0;x<segments;x++){const a=2*Math.PI*x/segments;vertices.push([Math.cos(a),y?1:-1,Math.sin(a)]);}
      vertices.push([0,-1,0]);if(type==='cone')vertices.push([0,1,0]);
      for(let x=0;x<segments;x++){const n=(x+1)%segments;faces.push([x,n,segments+n,segments+x]);if(type==='cone')faces.push([x,n,segments+1]);}
      if(type==='cylinder'){faces.push(Array.from({length:segments},(_,i)=>i).reverse(),Array.from({length:segments},(_,i)=>segments+i));}
    }else if(type==='torus'){
      const tube=7;
      for(let i=0;i<segments;i++)for(let j=0;j<tube;j++){const u=2*Math.PI*i/segments,v=2*Math.PI*j/tube,r=0.68+0.3*Math.cos(v);vertices.push([r*Math.cos(u),.3*Math.sin(v),r*Math.sin(u)]);}
      for(let i=0;i<segments;i++)for(let j=0;j<tube;j++){const a=i*tube+j,b=((i+1)%segments)*tube+j,c=((i+1)%segments)*tube+(j+1)%tube,d=i*tube+(j+1)%tube;faces.push([a,b,c,d]);}
    }
    return {id:'mesh-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),name:type[0].toUpperCase()+type.slice(1),type,color:'#a78bfa',x:640,y:390,z:0,scale:90,rotationX:18,rotationY:-24,rotationZ:0,vertices,faces};
  }
  function drawMeshObjects(){
    state.meshObjects.forEach(mesh=>{
      if(mesh.visible===false)return;
      const rx=(Number(mesh.rotationX)||0)*Math.PI/180,ry=(Number(mesh.rotationY)||0)*Math.PI/180,rz=(Number(mesh.rotationZ)||0)*Math.PI/180;
      const scale=Math.max(2,Math.min(400,Number(mesh.scale)||90));
      const projected=mesh.vertices.map(v=>{
        let [x,y,z]=v.map(n=>n*scale);
        let y1=y*Math.cos(rx)-z*Math.sin(rx),z1=y*Math.sin(rx)+z*Math.cos(rx);y=y1;z=z1;
        let x1=x*Math.cos(ry)+z*Math.sin(ry);z1=-x*Math.sin(ry)+z*Math.cos(ry);x=x1;z=z1;
        x1=x*Math.cos(rz)-y*Math.sin(rz);y1=x*Math.sin(rz)+y*Math.cos(rz);x=x1;y=y1;
        const perspective=700/(700+z);
        return {x:Number(mesh.x||640)+x*perspective,y:Number(mesh.y||360)+y*perspective,z};
      });
      const faces=mesh.faces.map(face=>({face,depth:face.reduce((sum,i)=>sum+projected[i].z,0)/face.length})).sort((a,b)=>b.depth-a.depth);
      faces.forEach(({face},index)=>{
        ctx.beginPath();face.forEach((id,i)=>{const p=projected[id];if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();
        ctx.fillStyle=mesh.color||'#a78bfa';ctx.globalAlpha=.68+((index%4)*.08);ctx.fill();
        ctx.globalAlpha=1;ctx.strokeStyle='#ffffff99';ctx.lineWidth=1.4;ctx.stroke();
      });
    });
  }

  function draw(){
    const activeTime=currentTime();
    const scene=state.scenes[activeTime.index]||selectedScene(), bg=backgrounds[scene.background]||backgrounds.sunset;
    // House walkthrough scenes keep their dedicated room artwork as the primary background.
    // The 3D landscape renderer is only used for ordinary scenes / fallback environments.
    const has3D=scene.background!=='withering-forest'&&!!(window.CartoonLab3D&&window.CartoonLab3D.ready&&window.CartoonLab3D.render(state.elapsed,scene));
    if(has3D&&window.CartoonLab3D.canvas&&(scene.layers?.background!==false))ctx.drawImage(window.CartoonLab3D.canvas,0,0,1280,720);
    const layers=scene.layers||{};
    if(scene.houseRoom){if(layers.background!==false&&!has3D)drawHouseRoom(scene,state.elapsed);drawMeshObjects();if(layers.character!==false){drawCharacter(studioCharacter(scene,activeTime.local),state.elapsed,scene);state.extraCharacters.forEach(c=>drawCharacter(c,state.elapsed,scene));}if(scene.title){ctx.save();ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#0008';ctx.shadowBlur=12;ctx.font='800 42px Space Grotesk';ctx.fillText(scene.title,640,72);ctx.restore();}if(scene.subtitle){ctx.save();ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='500 20px DM Sans';ctx.fillText(scene.subtitle,640,108);ctx.restore();}}
    else if(layers.background!==false&&!has3D){if(scene.background==='withering-forest')drawWitheringForest(scene,activeTime.local);else{const grad=ctx.createLinearGradient(0,0,0,720);grad.addColorStop(0,bg[0]);grad.addColorStop(.65,bg[1]);grad.addColorStop(1,bg[2]);ctx.fillStyle=grad;ctx.fillRect(0,0,1280,720);}}
    if(scene.houseRoom){if(layers.counter!==false)drawCounter(scene,activeTime.local);return;}
    const t=state.elapsed, camera=scene.cameraMotion||'none';
    let zoom=1,panX=0,panY=0,shakeX=0,shakeY=0;
    if(camera==='zoom-in')zoom=1+((Math.sin(t*1.1)+1)/2)*.12;
    if(camera==='zoom-out')zoom=1.12-((Math.sin(t*1.1)+1)/2)*.12;
    if(camera==='pan-left')panX=-Math.sin(t*.8)*90;
    if(camera==='pan-right')panX=Math.sin(t*.8)*90;
    if(camera==='pan-up')panY=-Math.sin(t*.8)*65;
    if(camera==='shake'){shakeX=(Math.random()-.5)*9;shakeY=(Math.random()-.5)*9;}
    zoom*=Number(scene.cameraZoom)||1;panX+=Number(scene.cameraX)||0;panY+=Number(scene.cameraY)||0;
    ctx.save();ctx.translate(640+panX+shakeX,360+panY+shakeY);ctx.scale(zoom,zoom);ctx.translate(-640,-360);
    // Decorative stars and animated scene props.
    if(layers.props!==false)for(let i=0;i<34;i++){const x=(i*197+73)%1280,y=(i*113+39)%490;ctx.fillStyle='#ffffff'+(i%3?'35':'65');ctx.beginPath();ctx.arc(x,y,(i%3)+1.5,0,Math.PI*2);ctx.fill();}
    const props=scene.objectMotion||'sparkles';
    if(layers.props!==false)for(let i=0;i<6;i++){
      const phase=t*(props==='fast'?2.1:props==='orbit'?1.15:.65)+i*1.047;
      const px=props==='orbit'?640+Math.cos(phase)*430:(i*211+110)%1280;
      const py=props==='rise'?700-((t*65+i*137)%780):props==='orbit'?350+Math.sin(phase)*205:((i*127+60)%520)+Math.sin(phase)*24;
      if(props!=='none'){
        ctx.save();ctx.translate(px,py);ctx.rotate(phase*.3);ctx.fillStyle=props==='bubbles'?'#ffffff55':'#fff8';
        if(props==='bubbles'){ctx.beginPath();ctx.arc(0,0,8+(i%3)*4,0,Math.PI*2);ctx.strokeStyle='#ffffff99';ctx.lineWidth=2;ctx.stroke();}
        else{ctx.font='22px sans-serif';ctx.fillText(props==='hearts'?'♥':'✦',0,0);}
        ctx.restore();
      }
    }
    ctx.fillStyle='#ffffff13';ctx.beginPath();ctx.ellipse(640,660,560,65,0,0,Math.PI*2);ctx.fill();
    if(scene.title){ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#241a3a88';ctx.shadowBlur=20;ctx.font='800 62px Space Grotesk';ctx.fillText(scene.title,640,100);ctx.shadowBlur=0;}
    if(scene.subtitle){ctx.textAlign='center';ctx.fillStyle='#fff';ctx.globalAlpha=.85;ctx.font='500 22px DM Sans';ctx.fillText(scene.subtitle,640,137);ctx.globalAlpha=1;}
    if(state.onionSkin&&!state.playing){const prev=(scene.keyframes||[]).filter(k=>k.time<activeTime.local).slice(-1)[0];if(prev){ctx.save();ctx.globalAlpha=.18;drawCharacter({...state.character,...prev},state.elapsed-.08,scene);ctx.restore();}}
    if(layers.character!==false){drawCharacter(studioCharacter(scene,activeTime.local),state.elapsed,scene);state.extraCharacters.forEach(c=>drawCharacter(c,state.elapsed,scene));}
    drawMeshObjects();
    ctx.restore();
    if(layers.counter!==false)drawCounter(scene,activeTime.local);
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
  const PLAYER_FRAME_INTERVAL=1000/60;
  const UI_FRAME_INTERVAL=1000/24;
  let lastUiFrame=0;
  function frame(now){
    if(!state.lastFrame)state.lastFrame=now;
    if(now-state.lastFrame<PLAYER_FRAME_INTERVAL){requestAnimationFrame(frame);return;}
    const dt=Math.min((now-state.lastFrame)/1000,.05);state.lastFrame=now;
    if(state.playing){state.elapsed+=dt;if(state.elapsed>=totalDuration()){state.elapsed=totalDuration();state.playing=false;$('playButton').textContent='▶';}}
    // Keep the preview smooth at 60 FPS while updating heavier editor controls at 24 FPS.
    if(!smoothPreviewActive)draw();
    if(!lastUiFrame||now-lastUiFrame>=UI_FRAME_INTERVAL){
      lastUiFrame=now;
      const cur=currentTime();if(cur.index!==state.selected){state.selected=cur.index;renderTimeline();renderInspector();}
      updateClock();
    }
    requestAnimationFrame(frame);
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
      card.innerHTML='<span class="scene-resize scene-resize-left" title="Drag to change segment length" aria-label="Resize segment from start"></span><span class="scene-drag" draggable="true" title="Drag to reorder" aria-label="Drag to reorder">⠿</span><button class="scene-delete" type="button" title="Delete segment (Backspace)" aria-label="Delete '+escapeHtml(scene.name)+'">×</button><b>'+escapeHtml(scene.name)+'</b><small>'+Number(scene.duration).toFixed(1)+' sec</small><span class="keyframe-markers">'+(scene.keyframes||[]).map(k=>'<i title="Keyframe at '+k.time.toFixed(2)+'s"></i>').join('')+'</span><span class="scene-num">'+String(i+1).padStart(2,'0')+'</span><span class="scene-resize scene-resize-right" title="Drag to change segment length" aria-label="Resize segment from end"></span>';
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
            scene.duration=Math.max(0.1,Math.round((startDuration+delta)*2)/2);
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
      html='<div class="inspector-section"><div class="section-title">MAIN CHARACTER</div>'+field('Character name','charName',c.name)+'<div class="section-title">SPEECH BUBBLE · ON-SCREEN ONLY</div>'+field('Bubble text','speechText',c.speech)+'<p class="muted-copy">This text appears in the scene. It does not control the voice.</p><div class="section-title">AI TEXT-TO-SPEECH · AUDIO ONLY</div>'+field('Text to speak','ttsText',c.ttsText||'')+'<label class="field"><span>Storytelling voice</span><select id="voiceChoice"><option value="af_heart">Heart · warm narrator</option><option value="af_bella">Bella · bright</option><option value="af_nicole">Nicole · gentle</option><option value="am_adam">Adam · deeper</option><option value="am_michael">Michael · friendly</option><option value="bf_emma">Emma · British</option><option value="bm_george">George · British deep</option></select></label><label class="field"><span>Speaking speed (×)</span><input id="voiceSpeed" type="number" step="any" inputmode="decimal" value="'+state.voiceSpeed+'"></label><button class="full-button" id="speakDialogue">▶ Generate + speak</button><p class="muted-copy">Kokoro AI voice runs locally in your browser. Mouth movement follows the audio volume.</p></div>'+
      '<div class="inspector-section"><div class="section-title">LOOK & FEEL</div>'+field('Character colour','charColor',c.color,'color')+
      '<label class="field"><span>Expression</span><div class="choice-row">'+['happy','surprised','curious','sad','angry','neutral'].map(x=>'<button class="choice '+(c.expression===x?'active':'')+'" data-expression="'+x+'">'+x[0].toUpperCase()+x.slice(1)+'</button>').join('')+'</div></label>'+
      '<label class="field"><span>Character size</span><input id="charSize" type="number" step="any" inputmode="decimal" value="'+c.size+'"></label>'+
      '<label class="field"><span>Stage position (px)</span><input id="charX" type="number" step="any" inputmode="decimal" value="'+c.x+'"></label></div>'+
      '<button class="full-button" id="addCharacter">＋ Add another character</button><p class="muted-copy">Add up to 20 extra characters. Each one appears in the scene and can have its own name, colour and position.</p>'+state.extraCharacters.map((extra,i)=>'<div class="inspector-section"><div class="section-title">EXTRA CHARACTER '+(i+1)+'</div>'+field('Name','extraName'+i,extra.name||'Character '+(i+1))+field('Colour','extraColor'+i,extra.color||'#8bd5ff','color')+field('Stage position (px)','extraX'+i,extra.x??(800+i*20),'number')+'<button class="full-button" data-remove-character="'+i+'">Remove character</button></div>').join('')+'<p class="muted-copy">Tip: change the expression between scenes to make reactions feel alive.</p>'+ 
      '<div class="mesh-lab"><div class="mesh-lab-heading"><span>⬡</span><div><b>MINI MESH LAB</b><small>Build 3D props for your characters</small></div></div><label class="field"><span>Primitive mesh</span><select id="meshPrimitive"><option value="cube">Cube</option><option value="sphere">Sphere</option><option value="cylinder">Cylinder</option><option value="cone">Cone</option><option value="pyramid">Pyramid</option><option value="torus">Torus</option></select></label><button class="full-button mesh-add" id="addMesh">＋ Create mesh object</button><p class="muted-copy">Meshes are editable, saved in your project and included in HSL exports.</p>'+state.meshObjects.map((m,i)=>'<div class="mesh-object"><div class="mesh-object-title"><b>'+escapeHtml(m.name||m.type||'Mesh')+'</b><button class="mesh-remove" data-remove-mesh="'+i+'" title="Delete mesh">×</button></div>'+field('Object name','meshName'+i,m.name||'Mesh')+'<label class="field"><span>Mesh colour</span><input id="meshColor'+i+'" type="color" value="'+escapeHtml(m.color||'#a78bfa')+'"></label><div class="field-row">'+field('X position','meshX'+i,m.x??640,'number')+field('Y position','meshY'+i,m.y??360,'number')+'</div><label class="field"><span>Size</span><input id="meshScale'+i+'" type="number" min="2" max="400" value="'+(m.scale??90)+'"></label><div class="field-row">'+field('Rotate X','meshRX'+i,m.rotationX??0,'number')+field('Rotate Y','meshRY'+i,m.rotationY??0,'number')+'</div>'+field('Rotate Z','meshRZ'+i,m.rotationZ??0,'number')+'</div>').join('')+'</div>';
    } else if(tab==='blender'){
      const mesh=state.meshObjects[state.selectedMesh];
      html='<div class="blender-studio"><div class="blender-top"><div><span class="blender-kicker">CARTOONLAB / 3D WORKSPACE</span><h2>Blender</h2><p>Build, shape and colour your own objects.</p></div><span class="blender-mark">⬡</span></div>'+
      '<div class="blender-section"><div class="blender-section-head"><b>01 · ADD SHAPE</b><span>'+state.meshObjects.length+' / 100</span></div><label class="field"><span>Primitive</span><select id="meshPrimitive"><option value="cube">Cube</option><option value="sphere">Sphere</option><option value="cylinder">Cylinder</option><option value="cone">Cone</option><option value="pyramid">Pyramid</option><option value="torus">Torus</option></select></label><button class="full-button blender-primary" id="addMesh">＋ Add shape to scene</button></div>'+
      '<div class="blender-section"><div class="blender-section-head"><b>02 · OBJECTS</b><span>'+state.meshObjects.length+' objects</span></div>'+
      (state.meshObjects.length?'<label class="field"><span>Selected object</span><select id="blenderObject">'+state.meshObjects.map((m,i)=>'<option value="'+i+'" '+(i===state.selectedMesh?'selected':'')+'>'+escapeHtml(m.name||m.type||('Object '+(i+1)))+'</option>').join('')+'</select></label>':'<p class="muted-copy">Add a shape above to start modelling.</p>')+
      (mesh?'<div class="blender-object-actions"><button class="choice" id="duplicateMesh">Duplicate</button><button class="choice blender-delete" id="deleteMesh">Delete object</button></div>'+
      '<label class="field"><span>Object name</span><input id="meshName0" type="text" value="'+escapeHtml(mesh.name||'Mesh')+'"></label>'+
      '<div class="blender-colour"><label class="field"><span>Material / colour</span><input id="meshColor0" type="color" value="'+escapeHtml(mesh.color||'#a78bfa')+'"></label><span class="blender-swatch" style="background:'+escapeHtml(mesh.color||'#a78bfa')+'"></span></div>'+
      '<div class="blender-section-head"><b>TRANSFORM</b><span>Scene space</span></div><div class="field-row">'+field('Position X','meshX0',mesh.x??640,'number')+field('Position Y','meshY0',mesh.y??390,'number')+'</div>'+
      field('Overall size','meshScale0',mesh.scale??90,'number')+'<div class="field-row">'+field('Rotate X','meshRX0',mesh.rotationX??0,'number')+field('Rotate Y','meshRY0',mesh.rotationY??0,'number')+'</div>'+field('Rotate Z','meshRZ0',mesh.rotationZ??0,'number')+
      '<div class="blender-section-head"><b>03 · EDIT & MOLD</b><span>'+mesh.vertices.length+' vertices</span></div>'+
      '<label class="field"><span>Vertex</span><select id="blenderVertex">'+mesh.vertices.map((v,i)=>'<option value="'+i+'" '+(i===state.selectedVertex?'selected':'')+'>Vertex '+(i+1)+'</option>').join('')+'</select></label>'+
      (mesh.vertices[state.selectedVertex]?'<div class="field-row">'+field('Vertex X','vertexX',Number(mesh.vertices[state.selectedVertex][0]).toFixed(3),'number','step="0.05"')+field('Vertex Y','vertexY',Number(mesh.vertices[state.selectedVertex][1]).toFixed(3),'number','step="0.05"')+'</div>'+field('Vertex Z','vertexZ',Number(mesh.vertices[state.selectedVertex][2]).toFixed(3),'number','step="0.05"'):'')+
      '<div class="blender-mold"><button class="choice" id="moldInflate">＋ Inflate</button><button class="choice" id="moldDeflate">− Deflate</button><button class="choice" id="moldReset">Reset vertex</button></div>'+
      '<p class="muted-copy">Edit vertex coordinates for precise shaping, or inflate / deflate a point to mold the surface. Changes update the scene preview and HSL save.</p>':'')+
      '</div><div class="blender-footer">LOCAL MESH EDITOR · PROJECT-SAVED · HSL READY</div></div>';
    } else if(tab==='scenes'){
      html='<div class="inspector-section"><div class="section-title">SCENE SETTINGS</div>'+field('Scene name','sceneName',s.name)+
      '<label class="field"><span>Background</span><select id="sceneBg">'+Object.keys(backgrounds).map(k=>'<option value="'+k+'" '+(s.background===k?'selected':'')+'>'+k[0].toUpperCase()+k.slice(1)+'</option>').join('')+'<option value="withering-forest" '+(s.background==='withering-forest'?'selected':'')+'>Withering forest · changes over time</option></select></label>'+
      field('Main title','sceneTitle',s.title)+field('Subtitle','sceneSubtitle',s.subtitle)+
      (s.houseRoom?'<div class="section-title">HOUSE WALKTHROUGH</div><label class="field"><span>Room</span><select id="houseRoom">'+[['front','Outside / front'],['hallway','Hallway'],['living','Living room'],['kitchen','Kitchen'],['bedroom','Bedroom'],['backyard','Backyard']].map(([v,l])=>'<option value="'+v+'" '+(s.houseRoom===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>':'')+
      '<div class="section-title">CHARACTER MOVEMENT</div><label class="field"><span>Movement</span><select id="characterMotion">'+[['bounce','Bounce'],['float','Float'],['walk','Walk'],['run','Run'],['jump','Jump'],['wave','Wave'],['idle','Idle']].map(([v,l])=>'<option value="'+v+'" '+((s.characterMotion||({bounce:'bounce',float:'float',still:'idle'}[s.motion]||'bounce'))===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
      '<div class="section-title">CAMERA MOVEMENT</div><label class="field"><span>Camera</span><select id="cameraMotion">'+[['none','Static'],['walkthrough','Walk through'],['pan-left','Pan left'],['pan-right','Pan right'],['pan-up','Pan up'],['zoom-in','Zoom in'],['zoom-out','Zoom out'],['shake','Shake']].map(([v,l])=>'<option value="'+v+'" '+((s.cameraMotion||'none')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
      '<div class="section-title">CORNER COUNTER</div><label class="field"><span><input id="counterEnabled" type="checkbox" '+(s.counterEnabled?'checked':'')+'> Show counter</span></label>'+
      field('Counter label (e.g. DAY)','counterLabel',s.counterLabel||'DAY')+field('Starting number','counterStart',s.counterStart??1,'number')+
      field('Increase by','counterStep',s.counterStep??1,'number')+field('Unit (e.g. DB)','counterUnit',s.counterUnit||'')+
      field('Wait before first count (seconds)','counterDelay',s.counterDelay??0,'number')+
      field('Count up every (seconds)','counterInterval',s.counterInterval??1,'number')+
      '<p class="muted-copy">Example: wait 3 seconds, then count up every 2 seconds. The counter starts at your starting number before the first count.</p>'+
      '<label class="field"><span>Corner</span><select id="counterCorner">'+[['top-right','Top right'],['top-left','Top left'],['bottom-right','Bottom right'],['bottom-left','Bottom left']].map(([v,l])=>'<option value="'+v+'" '+((s.counterCorner||'top-right')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
      '<div class="section-title">SCENE OBJECTS</div><label class="field"><span>Background motion</span><select id="objectMotion">'+[['sparkles','Floating sparkles'],['bubbles','Bubbles'],['hearts','Hearts'],['rise','Rising particles'],['orbit','Orbiting sparkles'],['fast','Fast sparkles'],['none','None']].map(([v,l])=>'<option value="'+v+'" '+((s.objectMotion||'sparkles')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
      '<label class="field"><span>Legacy motion style</span><select id="sceneMotion"><option value="bounce" '+(s.motion==='bounce'?'selected':'')+'>Bouncy</option><option value="float" '+(s.motion==='float'?'selected':'')+'>Floaty</option><option value="still" '+(s.motion==='still'?'selected':'')+'>Still</option></select></label>'+
      '<label class="field"><span>Scene duration (seconds)</span><input id="sceneDuration" type="number" step="any" inputmode="decimal" value="'+s.duration+'"></label></div>'+
      '<button class="full-button" id="duplicateScene">▣ Duplicate scene</button><button class="full-button" id="deleteScene" title="Delete selected scene (Backspace)" style="margin-top:8px">− Delete scene</button>';
    } else if(tab==='studio'){
      const s=selectedScene(), layers=s.layers||(s.layers={background:true,props:true,character:true,speech:true,counter:true});
      const rig=state.character.rig||(state.character.rig={armLeft:0,armRight:0,legLeft:0,legRight:0});
      html='<div class="inspector-section"><div class="section-title">KEYFRAMES</div><p class="muted-copy">Set the playhead, adjust the character, then capture a keyframe. Position and size interpolate between keys.</p><button class="full-button" id="addKeyframe">＋ Add keyframe</button><button class="full-button" id="clearKeyframes" style="margin-top:7px">Clear scene keyframes</button><div id="keyframeList" class="keyframe-list"></div></div>'+
      '<div class="inspector-section"><div class="section-title">ONION SKIN</div><label class="field"><span><input id="onionSkin" type="checkbox" '+(state.onionSkin?'checked':'')+'> Show previous pose</span></label></div>'+
      '<div class="inspector-section"><div class="section-title">CHARACTER RIG</div>'+[['armLeft','Left arm'],['armRight','Right arm'],['legLeft','Left leg'],['legRight','Right leg']].map(([k,label])=>'<label class="field"><span>'+label+' angle</span><input id="rig'+k[0].toUpperCase()+k.slice(1)+'" type="number" value="'+Number(rig[k]||0)+'"></label>').join('')+'<button class="full-button" id="resetRig">Reset pose</button></div>'+
      '<div class="inspector-section"><div class="section-title">LAYER GROUPS</div><div class="field-row"><button class="full-button" data-layer-group="environment">Environment group</button><button class="full-button" data-layer-group="foreground">Foreground group</button></div></div><div class="inspector-section"><div class="section-title">LAYERS</div>'+[['background','Background'],['props','Particles'],['character','Character'],['speech','Speech bubble'],['counter','Counter']].map(([k,v])=>'<label class="field"><span><input type="checkbox" data-layer="'+k+'" '+(layers[k]!==false?'checked':'')+'> '+v+'</span></label>').join('')+'</div>'+
      '<div class="inspector-section"><div class="section-title">CAMERA</div>'+field('Zoom','cameraZoom',s.cameraZoom||1,'number')+field('Pan X','cameraX',s.cameraX||0,'number')+field('Pan Y','cameraY',s.cameraY||0,'number')+'</div>'+
      '<div class="inspector-section"><div class="section-title">PROJECT HISTORY</div><div class="field-row"><button class="full-button" id="undoEdit">↶ Undo</button><button class="full-button" id="redoEdit">↷ Redo</button></div></div>'+
      '<div class="inspector-section"><div class="section-title">AUDIO WAVEFORM</div><canvas id="audioWaveform" width="900" height="90" class="audio-waveform"></canvas></div>'+
      '<div class="inspector-section"><div class="section-title">HYPERSHORT · HSL</div><p class="muted-copy">Complete local project format. HSL files preserve characters, scenes, settings, and keyframes.</p><button class="full-button" id="exportHsl">Export .hsl</button><label class="full-button" style="display:block;margin-top:7px">Import .hsl file<input id="importHsl" type="file" accept=".hsl,text/plain" hidden></label><label class="field" style="margin-top:10px"><span>Type or paste HSL code</span><textarea id="typedHsl" rows="7" spellcheck="false" placeholder="!cartoonlab 2&#10;@10 sunset&#10;>A new scene&#10;_A subtitle"></textarea></label><button class="full-button" id="importTypedHsl">Import typed HSL</button><p class="muted-copy">Import by selecting a .hsl file or typing/pasting its contents above. Legacy scene scripts are supported.</p></div>'+
      '<div class="inspector-section"><div class="section-title">VIDEO EXPORT</div><label class="field"><span>Format</span><select id="exportFormat"><option value="webm">WebM</option><option value="mp4">MP4 (if supported)</option></select></label><button class="full-button" id="exportSelectedFormat">Export video</button></div>';
    } else if(tab==='audio'){
      html='<div class="inspector-section"><div class="section-title">AUDIO & VOICE</div><p class="muted-copy">Add your own narration or music track. Audio stays in this browser session.</p>'+
      '<button class="full-button" id="uploadAudio">＋ Import audio file</button>'+
      (state.audioName?'<p class="muted-copy">♫ Tracks: '+escapeHtml(state.audioName)+'</p>':'')+
      '<label class="field"><span>Sound effects</span><div class="choice-row"><button class="choice" data-sound="pop">Pop</button><button class="choice" data-sound="boing">Boing</button><button class="choice" data-sound="sparkle">Sparkle</button></div></label>'+
      '<p class="muted-copy">Import multiple audio files. Studio exports mix imported tracks into WebM or supported MP4 exports.</p></div>';
    }
    $('inspectorContent').innerHTML=html;bindInspector();if(tab==='studio')bindStudio();
  }
  function bindInspector(){
    const bind=(id,fn,event='input')=>{const el=$(id);if(el)el.addEventListener(event,()=>fn(el.value));};
    bind('charName',v=>state.character.name=v);
    state.extraCharacters.forEach((c,i)=>{bind('extraName'+i,v=>c.name=v);bind('extraColor'+i,v=>c.color=v);bind('extraX'+i,v=>{const n=Number(v);if(Number.isFinite(n))c.x=n;});});
    if($('addCharacter'))$('addCharacter').onclick=()=>{if(state.extraCharacters.length>=20){toast('Character limit reached (20 extra characters)');return;}state.extraCharacters.push({name:'Character '+(state.extraCharacters.length+2),color:['#8bd5ff','#c6a6ff','#ffd27d','#9ce6b0'][state.extraCharacters.length%4],expression:'happy',x:820,size:0.9,speech:'',ttsText:''});renderInspector();draw();scheduleSave();toast('Character added to your scene');};
    document.querySelectorAll('[data-remove-character]').forEach(b=>b.onclick=()=>{state.extraCharacters.splice(Number(b.dataset.removeCharacter),1);renderInspector();draw();scheduleSave();});
if($('addMesh'))$('addMesh').onclick=()=>{if(state.meshObjects.length>=100){toast('Object limit reached (100)');return;}const type=$('meshPrimitive')?.value||'cube';state.meshObjects.push(createPrimitiveMesh(type));state.selectedMesh=state.meshObjects.length-1;state.selectedVertex=0;renderInspector();draw();scheduleSave();toast(type+' added to Blender');};
    if($('blenderObject'))$('blenderObject').onchange=e=>{state.selectedMesh=Number(e.target.value)||0;state.selectedVertex=0;renderInspector();};
    if($('blenderVertex'))$('blenderVertex').onchange=e=>{state.selectedVertex=Number(e.target.value)||0;renderInspector();};
    if($('duplicateMesh'))$('duplicateMesh').onclick=()=>{if(state.meshObjects.length>=100){toast('Object limit reached (100)');return;}const copy=JSON.parse(JSON.stringify(state.meshObjects[state.selectedMesh]));copy.id='mesh-'+Date.now().toString(36);copy.name=(copy.name||'Mesh')+' Copy';copy.x=(Number(copy.x)||640)+35;copy.y=(Number(copy.y)||390)+25;state.meshObjects.push(copy);state.selectedMesh=state.meshObjects.length-1;state.selectedVertex=0;renderInspector();draw();scheduleSave();};
    if($('deleteMesh'))$('deleteMesh').onclick=()=>{state.meshObjects.splice(state.selectedMesh,1);state.selectedMesh=Math.max(0,Math.min(state.selectedMesh,state.meshObjects.length-1));state.selectedVertex=0;renderInspector();draw();scheduleSave();};
    const activeMesh=state.meshObjects[state.selectedMesh];
    if(activeMesh){
      bind('meshName0',v=>activeMesh.name=v);bind('meshColor0',v=>{activeMesh.color=v;const swatch=document.querySelector('.blender-swatch');if(swatch)swatch.style.background=v;draw();},'input');
      const meshNum=(id,prop)=>bind(id+'0',v=>{const n=Number(v);if(Number.isFinite(n))activeMesh[prop]=n;draw();});
      meshNum('meshX','x');meshNum('meshY','y');meshNum('meshScale','scale');meshNum('meshRX','rotationX');meshNum('meshRY','rotationY');meshNum('meshRZ','rotationZ');
      const vertex=activeMesh.vertices[state.selectedVertex];
      if(vertex){
        ['X','Y','Z'].forEach((axis,i)=>bind('vertex'+axis,v=>{const n=Number(v);if(Number.isFinite(n))vertex[i]=n;draw();}));
        const mold=(direction)=>{const length=Math.hypot(...vertex)||1;for(let axis=0;axis<3;axis++)vertex[axis]+=direction*(vertex[axis]/length)*.12;renderInspector();draw();scheduleSave();};
        if($('moldInflate'))$('moldInflate').onclick=()=>mold(1);
        if($('moldDeflate'))$('moldDeflate').onclick=()=>mold(-1);
        if($('moldReset'))$('moldReset').onclick=()=>{const original=createPrimitiveMesh(activeMesh.type);const nearest=original.vertices[state.selectedVertex];if(nearest)activeMesh.vertices[state.selectedVertex]=nearest.slice();renderInspector();draw();scheduleSave();};
      }
    }
    state.meshObjects.forEach((m,i)=>{
      const num=(id,prop)=>bind(id+i,v=>{const n=Number(v);if(Number.isFinite(n))m[prop]=n;});
      bind('meshName'+i,v=>m.name=v);bind('meshColor'+i,v=>m.color=v,'input');
      num('meshX','x');num('meshY','y');num('meshScale','scale');num('meshRX','rotationX');num('meshRY','rotationY');num('meshRZ','rotationZ');
    });
    document.querySelectorAll('[data-remove-mesh]').forEach(b=>b.onclick=()=>{state.meshObjects.splice(Number(b.dataset.removeMesh),1);renderInspector();draw();scheduleSave();});
    bind('speechText',v=>state.character.speech=v);bind('ttsText',v=>{state.character.ttsText=v;state.voiceBuffer=null;state.voiceText='';});bind('charColor',v=>state.character.color=v);bind('charSize',v=>{const n=Number(v);if(Number.isFinite(n)&&n>0)state.character.size=n;});bind('charX',v=>{const n=Number(v);if(Number.isFinite(n))state.character.x=n;});
    bind('sceneName',v=>selectedScene().name=v);
    if($('sceneBg'))$('sceneBg').onchange=e=>{const scene=selectedScene();scene.background=e.target.value;if(e.target.value==='withering-forest'){scene.title='YES, ALL LIFE.';scene.subtitle='Trees are life.';}draw();scheduleSave();};
bind('sceneTitle',v=>selectedScene().title=v);bind('sceneSubtitle',v=>selectedScene().subtitle=v);bind('sceneMotion',v=>selectedScene().motion=v,'change');
    bind('characterMotion',v=>selectedScene().characterMotion=v,'change');bind('houseRoom',v=>selectedScene().houseRoom=v,'change');bind('cameraMotion',v=>selectedScene().cameraMotion=v,'change');bind('objectMotion',v=>selectedScene().objectMotion=v,'change');
    bind('counterLabel',v=>selectedScene().counterLabel=v);bind('counterStart',v=>{const n=Number(v);if(Number.isFinite(n))selectedScene().counterStart=n;});bind('counterStep',v=>{const n=Number(v);if(Number.isFinite(n))selectedScene().counterStep=n;});bind('counterUnit',v=>selectedScene().counterUnit=v);
    bind('counterDelay',v=>{const n=Number(v);if(Number.isFinite(n)&&n>=0)selectedScene().counterDelay=n;});
    bind('counterInterval',v=>{const n=Number(v);if(Number.isFinite(n)&&n>0)selectedScene().counterInterval=n;});
    bind('counterCorner',v=>selectedScene().counterCorner=v,'change');
    if($('counterEnabled'))$('counterEnabled').onchange=e=>selectedScene().counterEnabled=e.target.checked;
    bind('sceneDuration',v=>{const n=Number(v);if(Number.isFinite(n)&&n>0){selectedScene().duration=n;state.elapsed=Math.min(state.elapsed,totalDuration());renderTimeline();updateClock();}});
    if($('speakDialogue'))$('speakDialogue').onclick=()=>state.lipSync.active?stopLipSync():startLipSync();
    if($('voiceChoice')){$('voiceChoice').value=state.voiceName;$('voiceChoice').onchange=e=>{state.voiceName=e.target.value;state.voiceBuffer=null;state.voiceText='';};}
    bind('voiceSpeed',v=>{const n=Number(v);if(Number.isFinite(n)&&n>0){state.voiceSpeed=n;state.voiceBuffer=null;state.voiceText='';}});
    document.querySelectorAll('[data-expression]').forEach(b=>b.onclick=()=>{state.character.expression=b.dataset.expression;renderInspector();});
    if($('duplicateScene'))$('duplicateScene').onclick=()=>{const copy={...selectedScene(),name:selectedScene().name+' copy'};state.scenes.splice(state.selected+1,0,copy);state.selected++;renderTimeline();renderInspector();toast('Scene duplicated');};
    if($('deleteScene'))$('deleteScene').onclick=()=>{if(state.scenes.length===1){toast('Keep at least one scene');return;}state.scenes.splice(state.selected,1);state.selected=Math.max(0,state.selected-1);state.elapsed=0;renderTimeline();renderInspector();};
    if($('uploadAudio'))$('uploadAudio').onclick=()=>$('audioUpload').click();
    document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>playSound(b.dataset.sound));
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Backspace'||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
    const target=e.target;
    if(target&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))return;
    e.preventDefault();
    const inspectorDelete=$('deleteScene');
    if(inspectorDelete){inspectorDelete.click();return;}
    const timelineDeletes=document.querySelectorAll('.scene-delete');
    if(timelineDeletes[state.selected])timelineDeletes[state.selected].click();
  });

  // Five-minute campaign clock: persistent across reloads in this browser.
  const CAMPAIGN_KEY='cartoonlab-beginning-of-time-start-v1';
  let campaignStart=0;
  try{campaignStart=Number(localStorage.getItem(CAMPAIGN_KEY))||0;if(!campaignStart){campaignStart=Date.now();localStorage.setItem(CAMPAIGN_KEY,String(campaignStart));}}catch(error){campaignStart=Date.now();}
  const campaignEnd=campaignStart+5*60*1000;
  let compactHslReleased=false;
  let compactHslReleaseNotified=false;
  function updateCampaignClock(){
    const remaining=Math.max(0,campaignEnd-Date.now()),seconds=Math.ceil(remaining/1000);
    const clock=$('campaignCountdown'),status=$('campaignStatus'),reveal=$('revealUpdate'),link=$('updateDocLink');
    if(clock)clock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    if(remaining===0){
      compactHslReleased=true;
      if(status)status.textContent='UPDATE READY';
      if(reveal)reveal.textContent='Open update';
      if(link)link.hidden=false;
      if(!compactHslReleaseNotified){compactHslReleaseNotified=true;toast('HSL v4 unlocked · compact export is ready');}
    }
  }
  updateCampaignClock();const campaignInterval=setInterval(()=>{updateCampaignClock();if(Date.now()>=campaignEnd)clearInterval(campaignInterval);},250);
  const updatePanel=$('updateDocument');
  function openUpdateDocument(){updatePanel?.classList.add('open');updatePanel?.setAttribute('aria-hidden','false');}
  function closeUpdateDocument(){updatePanel?.classList.remove('open');updatePanel?.setAttribute('aria-hidden','true');}
  $('revealUpdate')?.addEventListener('click',()=>{const link=$('updateDocLink');if(link)link.hidden=false;openUpdateDocument();});
  $('updateDocLink')?.addEventListener('click',e=>{e.preventDefault();openUpdateDocument();});
  $('closeUpdateDocument')?.addEventListener('click',closeUpdateDocument);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeUpdateDocument();});

  const inspector=$('inspectorContent');
  inspector.addEventListener('focusin',()=>{if(state.playing){state.playing=false;$('playButton').textContent='▶';}});
  function switchTab(tab){state.tab=tab;document.querySelectorAll('.nav-item,.inspector-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderInspector();}
  document.querySelectorAll('.nav-item,.inspector-tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  function addScene(scene){state.scenes.push(scene||{name:'New scene',duration:5,background:'sky',title:'',subtitle:'',motion:'bounce'});state.selected=state.scenes.length-1;state.elapsed=state.scenes.slice(0,-1).reduce((a,x)=>a+x.duration,0);renderTimeline();renderInspector();toast('Scene added');}
  $('addScene').onclick=()=>addScene();$('addIntro').onclick=()=>addScene({name:'Animated intro',duration:2,background:'sunset',title:'WELCOME!',subtitle:'The story is about to begin',motion:'bounce'});$('addHouseTour').onclick=()=>{const rooms=[['front','Outside the house','Welcome home'],['hallway','Walk inside','Let’s take a look around'],['living','Living room','A cosy place to relax'],['kitchen','Kitchen','The heart of the home'],['bedroom','Bedroom','Time to unwind'],['backyard','Backyard','And a little outdoor space']];state.scenes=rooms.map(([houseRoom,name,subtitle],i)=>({name,duration:4,background:'sky',title:'',subtitle,houseRoom,cameraMotion:i===0?'none':'walkthrough',characterMotion:'walk',counterEnabled:false,objectMotion:'none'}));state.selected=0;state.elapsed=0;state.title='House walkthrough';$('projectTitle').textContent=state.title;renderTimeline();renderInspector();switchTab('scenes');toast('House walkthrough created · 6 scenes');};$('addDialogue').onclick=()=>{state.character.speech='Wait... WHAT?!';state.character.expression='surprised';addScene({name:'Big reaction',duration:5,background:'candy',title:'PLOT TWIST!',subtitle:'Nobody saw that coming',motion:'bounce'});switchTab('characters');};
  const vipButton=$('vipToggle');
  function updateVipButton(){if(vipButton){vipButton.textContent=state.vip?'✦ VIP ON':'✦ VIP';vipButton.classList.toggle('vip-active',state.vip);}}
  if(vipButton)vipButton.onclick=()=>{state.vip=!state.vip;localStorage.setItem('cartoonlab-vip',String(state.vip));updateVipButton();toast(state.vip?'VIP mode enabled · watermark hidden':'VIP mode disabled · watermark restored');};
  updateVipButton();
  $('smoothPreview').onclick=renderSmoothPreview;
  $('sceneTrack').addEventListener('pointerup',()=>clearSmoothPreview());
  smoothVideo.addEventListener('ended',()=>{smoothPreviewActive=true;});
  $('playButton').onclick=()=>{if(smoothPreviewActive)hideSmoothVideo();stopLipSync();state.playing=!state.playing;$('playButton').textContent=state.playing?'Ⅱ':'▶';if(state.elapsed>=totalDuration())state.elapsed=0;};
  $('restartButton').onclick=()=>{if(smoothPreviewActive)hideSmoothVideo();stopLipSync();state.elapsed=0;state.playing=false;$('playButton').textContent='▶';};
  $('scrubTrack').onclick=e=>{if(smoothPreviewActive)hideSmoothVideo();const r=e.currentTarget.getBoundingClientRect();state.elapsed=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*totalDuration();};
  $('renameProject').onclick=()=>{const n=prompt('Name your story',state.title);if(n&&n.trim()){state.title=n.trim();$('projectTitle').textContent=state.title;}};
  $('newProject').onclick=()=>{if(!confirm('Start a new story? This replaces the current scenes.'))return;state.scenes=[{name:'Opening scene',duration:6,background:'sunset',title:'WHAT IF...?',subtitle:'A tiny idea. A BIG adventure.',motion:'bounce'}];state.selected=0;state.elapsed=0;state.title='Untitled story';$('projectTitle').textContent=state.title;renderTimeline();renderInspector();toast('New story created');};
  $('fullscreen').onclick=()=>{const el=$('stageWrap');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.();};
  $('fitStage').onclick=()=>toast('Preview is fitted to the editor');
  $('rendererToggle').onclick=()=>{const params=new URLSearchParams(location.search);if(params.get('renderer')==='webgpu')params.delete('renderer');else params.set('renderer','webgpu');const query=params.toString();location.search=query?'?'+query:'';};
  $('audioUpload').onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;for(const f of files){const url=URL.createObjectURL(f);try{const buffer=await audioContext().decodeAudioData(await f.arrayBuffer());state.audioTracks.push({name:f.name,url,buffer});if(!state.audioBuffer)state.audioBuffer=buffer;state.audioName=state.audioTracks.map(t=>t.name).join(', ');const a=new Audio(url);a.play().catch(()=>{});}catch(error){URL.revokeObjectURL(url);toast('Could not decode '+f.name);}}if(state.tab==='studio')drawStudioWave();renderInspector();toast(files.length+' audio track(s) imported');e.target.value='';};
  function playSound(kind){const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('Sound effects are unavailable');return;}const ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);const now=ac.currentTime;o.type=kind==='boing'?'triangle':'sine';o.frequency.setValueAtTime(kind==='boing'?180:kind==='sparkle'?900:520,now);o.frequency.exponentialRampToValueAtTime(kind==='boing'?520:kind==='sparkle'?1500:180,now+.22);g.gain.setValueAtTime(.12,now);g.gain.exponentialRampToValueAtTime(.001,now+.25);o.start();o.stop(now+.26);}
  $('exportVideo').onclick=async()=>{
    if(!canvas.captureStream||!window.MediaRecorder){toast('Video recording is not supported in this browser');return;}
    const button=$('exportVideo');
    if(button)button.disabled=true;
    state.playing=false;state.elapsed=0;$('playButton').textContent='▶';
    stopLipSync();
    let voiceBuffer=null;
    const dialogue=String(state.character.ttsText||'').trim();
    try{
      if(dialogue){
        toast('Preparing AI voice for video…');
        voiceBuffer=await generateVoice();
        if(!voiceBuffer)throw new Error('No voice audio was generated.');
      }
      const ac=voiceBuffer?audioContext():null;
      if(ac&&ac.state==='suspended')await ac.resume();
      const stream=canvas.captureStream(24);
      let audioDestination=null,voiceSource=null;
      if(voiceBuffer){
        audioDestination=ac.createMediaStreamDestination();
        const analyser=ac.createAnalyser();analyser.fftSize=256;
        voiceSource=ac.createBufferSource();voiceSource.buffer=voiceBuffer;
        voiceSource.connect(analyser);
        analyser.connect(audioDestination);
        audioDestination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
        state.analyser=analyser;state.analyserData=new Uint8Array(analyser.fftSize);state.lipSync.active=true;
      }
      let mime='video/webm;codecs=vp9,opus';
      if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
      const recorder=new MediaRecorder(stream,{mimeType:mime});
      const chunks=[];
      const exportDuration=Math.max(totalDuration(),voiceBuffer?voiceBuffer.duration:0.5);
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
      recorder.onerror=e=>{console.error('Video export recorder error:',e.error||e);toast('Video export failed. Try again.');};
      recorder.onstop=()=>{
        const blob=new Blob(chunks,{type:recorder.mimeType||mime});
        downloadBlob((state.title||'cartoonlab-story').replace(/[^a-z0-9-_]+/gi,'-')+'.webm',blob);
        stream.getTracks().forEach(track=>track.stop());
        state.playing=false;state.elapsed=0;$('playButton').textContent='▶';
        state.lipSync.active=false;state.analyser=null;state.analyserData=null;
        if(button)button.disabled=false;
        toast(voiceBuffer?'Video exported with AI voice included!':'Video exported without AI voice.');
      };
      recorder.start(100);
      state.playing=true;$('playButton').textContent='Ⅱ';
      if(voiceSource){
        voiceSource.onended=()=>{state.lipSync.active=false;state.analyser=null;state.analyserData=null;};
        voiceSource.start(ac.currentTime+0.08);
      }
      toast(voiceBuffer?'Recording video + AI voice…':'Recording video…');
      setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},exportDuration*1000+150);
    }catch(error){
      console.error('CartoonLab video export:',error);
      state.playing=false;state.elapsed=0;$('playButton').textContent='▶';
      state.lipSync.active=false;state.analyser=null;state.analyserData=null;
      if(button)button.disabled=false;
      toast('Video export failed: '+(error.message||'check browser permissions'));
    }
  };

  // Studio feature layer: keyframes, onion skin, layers, rig controls, history and export.
  state.onionSkin=false;
  const undoStack=[],redoStack=[];
  function snapshot(){return JSON.stringify({title:state.title,character:state.character,scenes:state.scenes,selected:state.selected,elapsed:state.elapsed});}
  let lastSnapshot=snapshot();
  function checkpoint(){const now=snapshot();if(now!==lastSnapshot){undoStack.push(lastSnapshot);if(undoStack.length>60)undoStack.shift();lastSnapshot=now;redoStack.length=0;}}
  function restoreSnapshot(raw){const d=JSON.parse(raw);state.title=d.title;state.character=d.character;state.scenes=d.scenes;state.selected=Math.min(d.selected||0,state.scenes.length-1);state.elapsed=d.elapsed||0;$('projectTitle').textContent=state.title;renderTimeline();renderInspector();draw();updateClock();saveProject();lastSnapshot=snapshot();}
  function undoStudio(){if(!undoStack.length){toast('Nothing to undo');return;}redoStack.push(snapshot());restoreSnapshot(undoStack.pop());toast('Undo');}
  function redoStudio(){if(!redoStack.length){toast('Nothing to redo');return;}undoStack.push(snapshot());restoreSnapshot(redoStack.pop());toast('Redo');}
  function studioCharacter(scene,local){const c={...state.character};const keys=(scene.keyframes||[]).slice().sort((a,b)=>a.time-b.time);if(!keys.length)return c;let a=keys[0],b=keys[keys.length-1];for(const k of keys){if(k.time<=local)a=k;if(k.time>=local){b=k;break;}}const p=Math.max(0,Math.min(1,(local-a.time)/Math.max(.001,b.time-a.time)));for(const key of ['x','size'])if(Number.isFinite(a[key])&&Number.isFinite(b[key]))c[key]=a[key]+(b[key]-a[key])*p;if(p>=.5)c.expression=b.expression||c.expression;return c;}
  function addStudioKey(){const s=selectedScene(),t=currentTime().local;s.keyframes=s.keyframes||[];const k={time:Number(t.toFixed(3)),x:state.character.x,size:state.character.size,expression:state.character.expression};const i=s.keyframes.findIndex(x=>Math.abs(x.time-t)<.025);if(i>=0)s.keyframes[i]=k;else s.keyframes.push(k);s.keyframes.sort((a,b)=>a.time-b.time);checkpoint();renderInspector();scheduleSave();toast('Keyframe added at '+k.time.toFixed(2)+'s');}
  function drawStudioWave(){const cv=$('audioWaveform');if(!cv)return;const c=cv.getContext('2d');c.fillStyle='#171522';c.fillRect(0,0,cv.width,cv.height);const data=state.audioBuffer?.getChannelData(0);if(!data){c.fillStyle='#aaa';c.textAlign='center';c.fillText('Import audio to view waveform',cv.width/2,48);return;}c.strokeStyle='#b59fff';for(let x=0;x<cv.width;x++){const start=Math.floor(x*data.length/cv.width),end=Math.max(start+1,Math.floor((x+1)*data.length/cv.width));let peak=0;for(let j=start;j<end;j++)peak=Math.max(peak,Math.abs(data[j]));c.beginPath();c.moveTo(x,45-peak*40);c.lineTo(x,45+peak*40);c.stroke();}}
  function encodeHslPayload(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    let binary='';
    for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodeHslPayload(value){
    const base64=value.replace(/-/g,'+').replace(/_/g,'/');
    const binary=atob(base64+'='.repeat((4-base64.length%4)%4));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const HSL4_KEYS={version:'z',title:'t',character:'c',extraCharacters:'x',meshObjects:'m',scenes:'s',selected:'i',elapsed:'e',vip:'v',voiceSpeed:'w',voiceName:'n',name:'a',duration:'d',background:'b',subtitle:'u',motion:'o',characterMotion:'q',x:'X',y:'Y',size:'S',color:'C',expression:'E',speech:'p',ttsText:'T',counterEnabled:'ce',counterMode:'cm',counterStart:'cs',counterEnd:'cn',counterCorner:'cc',layers:'l',keyframes:'k',vertices:'V',faces:'F',type:'g',id:'I',scale:'Z',rotationX:'rx',rotationY:'ry',rotationZ:'rz',visible:'vi',houseRoom:'hr',cameraMotion:'ca',cameraZoom:'cz',cameraX:'cx',cameraY:'cy',objectMotion:'om',rig:'r',armLeft:'al',armRight:'ar',legLeft:'ll',legRight:'lr'};
  const HSL4_REVERSE=Object.fromEntries(Object.entries(HSL4_KEYS).map(([key,short])=>[short,key]));
  function compactHslValue(value){
    if(Array.isArray(value))return value.map(compactHslValue);
    if(value&&typeof value==='object'){const out={};Object.entries(value).forEach(([key,item])=>{out[HSL4_KEYS[key]||key]=compactHslValue(item);});return out;}
    return value;
  }
  function expandHslValue(value){
    if(Array.isArray(value))return value.map(expandHslValue);
    if(value&&typeof value==='object'){const out={};Object.entries(value).forEach(([key,item])=>{out[HSL4_REVERSE[key]||key]=expandHslValue(item);});return out;}
    return value;
  }
  function hypershortSource(){
    if(compactHslReleased)return '!cartoonlab 4\\n!hsl-format 4\\n!hsl4 '+encodeHslPayload(compactHslValue(projectSnapshot()))+'\\n';
    const lines=['!cartoonlab 3','!hsl-format 3','!project '+encodeHslPayload(projectSnapshot())];
    state.scenes.forEach(scene=>{
      lines.push('@'+Math.max(.1,Number(scene.duration)||5)+' '+(scene.background||'sunset'));
      if(scene.title)lines.push('>'+JSON.stringify(scene.title));
      if(scene.subtitle)lines.push('_'+JSON.stringify(scene.subtitle));
    });
    return lines.join('\\n')+'\\n';
  }
  function downloadBlob(name,blob){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=name;a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function downloadText(name,content,type){
    downloadBlob(name,new Blob([content],{type:type||'text/plain;charset=utf-8'}));
  }
  function importHypershort(source){
    const lines=String(source).split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('//'));
    const compactLine=lines.find(line=>line.startsWith('!hsl4 '));
    const payloadLine=lines.find(line=>line.startsWith('!project '));
    if(compactLine||payloadLine){
      const decoded=decodeHslPayload((compactLine||payloadLine).slice(compactLine?6:9).trim());
      const project=compactLine?expandHslValue(decoded):decoded;
      if(!project||!Array.isArray(project.scenes)||!project.scenes.length)throw new Error('The HSL project data is invalid');
      const scenes=project.scenes.filter(scene=>scene&&typeof scene==='object'&&Number.isFinite(Number(scene.duration))&&Number(scene.duration)>0);
      if(!scenes.length)throw new Error('The HSL file contains no valid scenes');
      checkpoint();
      state.title=typeof project.title==='string'&&project.title?project.title:'Imported HSL project';
      if(project.character&&typeof project.character==='object')state.character={...state.character,...project.character};if(Array.isArray(project.extraCharacters))state.extraCharacters=project.extraCharacters.filter(c=>c&&typeof c==='object').slice(0,20);if(Array.isArray(project.meshObjects))state.meshObjects=project.meshObjects.filter(m=>m&&typeof m==='object').slice(0,100);
      state.scenes=scenes;
      state.selected=Math.max(0,Math.min(scenes.length-1,Number(project.selected)||0));
      state.elapsed=Math.max(0,Math.min(Number(project.elapsed)||0,totalDuration()));
      if(typeof project.vip==='boolean')state.vip=project.vip;
      if(Number.isFinite(Number(project.voiceSpeed)))state.voiceSpeed=Number(project.voiceSpeed);
       if(typeof project.voiceName==='string'&&project.voiceName)state.voiceName=project.voiceName;
      $('projectTitle').textContent=state.title;
      renderTimeline();renderInspector();draw();updateClock();saveProject();
      toast('Imported complete HSL project · '+scenes.length+' scene(s)');
      return;
    }
    const scenes=[];let current=null,years=null;
    for(const line of lines){
      if(line.startsWith('!cartoonlab '))continue;
      if(line.startsWith('!voice ')){const voice=line.slice(7).trim();if(!/^[a-z0-9_]+$/i.test(voice))throw new Error('Bad voice name: '+voice);state.voiceName=voice;continue;}
      if(line.startsWith('!tts ')){const raw=line.slice(5).trim();try{state.character.ttsText=JSON.parse(raw);}catch(error){state.character.ttsText=raw;}continue;}
      if(line[0]==='@'){
        const m=line.match(/^@([\d.]+)\s+([a-z-]+)$/i);
        if(!m)throw new Error('Bad scene command: '+line);
        current={name:'HSL scene '+(scenes.length+1),duration:Math.max(.1,Number(m[1])),background:m[2],title:'',subtitle:'',motion:'bounce'};
        scenes.push(current);
      }else if(line[0]==='>'||line[0]==='_'){
        if(!current)throw new Error('Add a scene with @ first');
        let value=line.slice(1).trim();
        try{value=JSON.parse(value);}catch(error){if(value.startsWith('"'))throw new Error('Bad quoted text: '+line);}
        if(line[0]==='>')current.title=String(value);else current.subtitle=String(value);
      }else if(line[0]==='#'){
        const m=line.match(/^#(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)y$/i);
        if(!m)throw new Error('Bad years command: '+line);
        years={start:Number(m[1]),end:Number(m[2])};
      }else throw new Error('Unknown HSL command: '+line);
    }
    if(!scenes.length)throw new Error('No scenes found. Start with @duration background');
    if(years)scenes.forEach(scene=>{scene.counterEnabled=true;scene.counterMode='years';scene.counterStart=years.start;scene.counterEnd=years.end;scene.counterCorner='top-right';});
    checkpoint();state.scenes=scenes;state.selected=0;state.elapsed=0;state.title='Hypershort video';
    $('projectTitle').textContent=state.title;renderTimeline();renderInspector();draw();updateClock();saveProject();
    toast('Imported '+scenes.length+' scene(s) from HSL');
  }
  function bindStudio(){
    const s=selectedScene(),layers=s.layers||(s.layers={background:true,props:true,character:true,speech:true,counter:true}),rig=state.character.rig||(state.character.rig={armLeft:0,armRight:0});
    const list=$('keyframeList');if(list){list.innerHTML=(s.keyframes||[]).map((k,i)=>'<button class="choice" data-key="'+i+'">'+k.time.toFixed(2)+'s · '+(k.expression||'pose')+'</button>').join('')||'<p class="muted-copy">No keyframes yet.</p>';list.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=s.keyframes[Number(b.dataset.key)];state.elapsed=state.scenes.slice(0,state.selected).reduce((n,x)=>n+x.duration,0)+k.time;state.character.x=k.x;state.character.size=k.size;state.character.expression=k.expression;draw();updateClock();});}
    if($('addKeyframe'))$('addKeyframe').onclick=addStudioKey;
    if($('clearKeyframes'))$('clearKeyframes').onclick=()=>{s.keyframes=[];renderInspector();scheduleSave();};
    if($('onionSkin'))$('onionSkin').onchange=e=>{state.onionSkin=e.target.checked;draw();};
    ['armLeft','armRight','legLeft','legRight'].forEach(k=>{const el=$('rig'+k[0].toUpperCase()+k.slice(1));if(el)el.oninput=()=>{rig[k]=Number(el.value)||0;draw();scheduleSave();};});
    if($('resetRig'))$('resetRig').onclick=()=>{state.character.rig={armLeft:0,armRight:0,legLeft:0,legRight:0};renderInspector();draw();scheduleSave();};
    document.querySelectorAll('[data-layer]').forEach(el=>el.onchange=()=>{layers[el.dataset.layer]=el.checked;draw();scheduleSave();});
    document.querySelectorAll('[data-layer-group]').forEach(el=>el.onclick=()=>{const keys=el.dataset.layerGroup==='environment'?['background','props']:['character','speech','counter'];const show=keys.some(k=>layers[k]===false);keys.forEach(k=>layers[k]=show);document.querySelectorAll('[data-layer]').forEach(input=>input.checked=layers[input.dataset.layer]!==false);draw();scheduleSave();});
    ['cameraZoom','cameraX','cameraY'].forEach(k=>{const el=$(k);if(el)el.oninput=()=>{s[k]=Number(el.value)||0;draw();scheduleSave();};});
    if($('undoEdit'))$('undoEdit').onclick=undoStudio;if($('redoEdit'))$('redoEdit').onclick=redoStudio;
    if($('exportSelectedFormat'))$('exportSelectedFormat').onclick=()=>exportStudio($('exportFormat').value);
    if($('exportHsl'))$('exportHsl').onclick=()=>downloadText((state.title||'video').replace(/[^a-z0-9-_]+/gi,'-')+'.hsl',hypershortSource(),'text/plain');
    if($('importHsl'))$('importHsl').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{importHypershort(await file.text());}catch(error){toast('HSL import: '+error.message);}e.target.value='';};
     if($('importTypedHsl'))$('importTypedHsl').onclick=()=>{const source=$('typedHsl')?.value||'';if(!source.trim()){toast('Type or paste HSL code first');return;}try{importHypershort(source);}catch(error){toast('HSL import: '+error.message);}};
    drawStudioWave();
  }
  async function exportStudio(format){
    if(format==='gif'){
      if(!window.GIF){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.js';script.onload=resolve;script.onerror=()=>reject(new Error('GIF encoder could not load'));document.head.appendChild(script);}).catch(e=>{toast(e.message);throw e;});}
      const gif=new window.GIF({workers:2,quality:12,workerScript:'https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js',width:640,height:360});
      const oldElapsed=state.elapsed,wasPlaying=state.playing;state.playing=false;
      for(let t=0;t<totalDuration();t+=.12){state.elapsed=t;draw();const frame=document.createElement('canvas');frame.width=640;frame.height=360;frame.getContext('2d').drawImage(canvas,0,0,640,360);gif.addFrame(frame,{copy:true,delay:120});}
      gif.on('finished',blob=>{downloadBlob((state.title||'cartoonlab').replace(/[^a-z0-9-_]+/gi,'-')+'.gif',blob);state.elapsed=oldElapsed;state.playing=wasPlaying;draw();toast('GIF export complete');});
      gif.render();toast('Rendering animated GIF…');return;
    }
    const types=format==='mp4'?['video/mp4;codecs=avc1.42E01E','video/mp4']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const type=types.find(x=>MediaRecorder.isTypeSupported(x));if(!canvas.captureStream||!type){toast(format.toUpperCase()+' is not supported by this browser');return;}
    const stream=canvas.captureStream(30),ac=state.audioTracks.length?audioContext():null;let audioSources=[],audioDest=null;
    if(ac&&state.audioTracks.length){audioDest=ac.createMediaStreamDestination();state.audioTracks.forEach(track=>{const source=ac.createBufferSource();source.buffer=track.buffer;source.connect(audioDest);audioSources.push(source);});audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}
    const rec=new MediaRecorder(stream,{mimeType:type}),chunks=[];rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    rec.onstop=()=>{const blob=new Blob(chunks,{type:rec.mimeType||type});downloadBlob((state.title||'cartoonlab').replace(/[^a-z0-9-_]+/gi,'-')+'.'+(format==='mp4'?'mp4':'webm'),blob);stream.getTracks().forEach(t=>t.stop());state.playing=false;$('playButton').textContent='▶';toast(blob.size?'Export complete':'Export failed: the recorder produced an empty file');};
    state.elapsed=0;state.playing=true;$('playButton').textContent='Ⅱ';rec.start(100);if(audioSources.length){if(ac.state==='suspended')await ac.resume();audioSources.forEach(source=>source.start());}
    setTimeout(()=>{if(rec.state!=='inactive')rec.stop();},totalDuration()*1000+150);
  }
  document.addEventListener('input',checkpoint);document.addEventListener('click',checkpoint);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoStudio():undoStudio();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redoStudio();}});

    renderTimeline();renderInspector();requestAnimationFrame(frame);
  // Download and cache the voice model automatically after the editor is ready.
  // This is a one-time first-visit download; the browser/runtime cache handles later visits.
  const preloadKokoro=()=>loadKokoro().catch(error=>console.warn('Kokoro background preload failed; it will retry when narration is used:',error));
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(preloadKokoro,{timeout:4000});
  else setTimeout(preloadKokoro,1800);
})();