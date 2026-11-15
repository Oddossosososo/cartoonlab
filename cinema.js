(() => {
  'use strict';
  const stage = document.getElementById('stage');
  const wrap = document.getElementById('stageWrap');
  if (!stage || !wrap || window.cartoonLabCinemaLoaded) return;
  window.cartoonLabCinemaLoaded = true;
  const $ = id => document.getElementById(id);
  const KEY = 'cartoonlab-cinema-studio-v1';
  const defaults = {
    brightness:100, contrast:108, saturation:112, blur:0, vignette:24, warmth:0,
    cameraKeys:[], layers:[], selectedTab:'effects'
  };
  let data = defaults;
  try { data = {...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch (_) {}
  let overlay = document.createElement('canvas');
  overlay.id = 'cinemaOverlay'; overlay.width = 1280; overlay.height = 720;
  wrap.appendChild(overlay);
  const ox = overlay.getContext('2d');
  const panel = document.createElement('aside');
  panel.className = 'cinema-panel';
  panel.id = 'cinemaPanel';
  panel.innerHTML = '<div class="cinema-head"><div><div style="font-size:9px;letter-spacing:1px;color:#a99bc9">CARTOONLAB / POST-PRODUCTION</div><h2>Cinema Studio</h2></div><button id="cinemaClose" aria-label="Close">×</button></div>'+
    '<div class="cinema-tabs"><button data-cinema-tab="effects">Film FX</button><button data-cinema-tab="camera">Camera</button><button data-cinema-tab="layers">Layers</button><button data-cinema-tab="ai">AI video</button></div>'+
    '<section class="cinema-page" data-cinema-page="effects"><div class="cinema-section"><h3>FILM LOOK</h3>'+
    range('brightness','Brightness',50,160,1)+' '+range('contrast','Contrast',50,160,1)+' '+range('saturation','Saturation',0,200,1)+' '+range('blur','Motion softness',0,5,.1)+
    '<label class="cinema-field"><span>Colour temperature</span><input id="fxWarmth" type="range" min="-50" max="50" value="'+data.warmth+'"></label>'+
    '<label class="cinema-field"><span>Vignette <b id="vignetteValue"></b></span><input id="fxVignette" type="range" min="0" max="80" value="'+data.vignette+'"></label>'+
    '<div class="cinema-row"><button class="cinema-action" id="fxCinematic">Cinematic preset</button><button class="cinema-action" id="fxReset">Reset effects</button></div></div>'+
    '<p class="cinema-help">Effects are applied to the preview and the captured video export. Motion softness is a subtle blur, not directional motion blur.</p></section>'+
    '<section class="cinema-page" data-cinema-page="camera"><div class="cinema-section"><h3>CAMERA TRANSFORM</h3>'+
    '<label class="cinema-field"><span>Zoom <b id="camZoomValue"></b></span><input id="camZoom" type="range" min="70" max="180" value="100"></label>'+
    '<div class="cinema-row"><label class="cinema-field"><span>Pan X</span><input id="camX" type="range" min="-400" max="400" value="0"></label><label class="cinema-field"><span>Pan Y</span><input id="camY" type="range" min="-250" max="250" value="0"></label></div>'+
    '<button class="cinema-action primary" id="addCameraKey">◆ Set camera keyframe at playhead</button><p class="cinema-help">Move the playhead, set a camera position, then add another keyframe. CartoonLab smoothly interpolates between them.</p></div>'+
    '<div class="cinema-section"><h3>CAMERA KEYFRAMES</h3><div id="cameraKeyList"></div><button class="cinema-action" id="clearCameraKeys">Clear camera keyframes</button></div></section>'+
    '<section class="cinema-page" data-cinema-page="layers"><div class="cinema-section"><h3>VIDEO / GRAPHICS TRACKS</h3>'+
    '<button class="cinema-action primary" id="addTextLayer">＋ Add text overlay</button><label class="cinema-action" style="display:block;text-align:center">＋ Import image or video<input id="cinemaMediaUpload" type="file" accept="image/*,video/*" hidden></label>'+
    '<div id="cinemaLayerList" class="cinema-list"></div><p class="cinema-help">Text and images are saved with this browser project. Video uploads stay available for the current editing session. Audio tracks can still be imported from Audio & Voice.</p></div></section>'+
    '<section class="cinema-page" data-cinema-page="ai"><div class="cinema-section"><h3>AI VIDEO SCENE BUILDER</h3>'+
    '<label class="cinema-field"><span>Describe the shot</span><textarea id="aiVideoPrompt" rows="4" placeholder="A cinematic wide shot of a city frozen at 8:17 AM..."></textarea></label>'+
    '<label class="cinema-field"><span>Visual style</span><select id="aiVideoStyle"><option>Cinematic realism</option><option>Stylised 3D animation</option><option>2D animated film</option><option>Documentary</option><option>Dreamlike sci-fi</option></select></label>'+
    '<label class="cinema-field"><span>Camera direction</span><select id="aiVideoCamera"><option>Slow cinematic push-in</option><option>Wide establishing shot</option><option>Slow pan left</option><option>Slow pan right</option><option>Overhead aerial shot</option><option>Static locked-off shot</option></select></label>'+
    '<button class="cinema-action primary" id="buildAIPrompt">Build + copy video prompt</button><textarea id="aiPromptOutput" rows="5" readonly placeholder="Your finished prompt will appear here." style="margin-top:8px"></textarea>'+
    '<label class="cinema-action" style="display:block;text-align:center;margin-top:10px">＋ Import generated video clip<input id="aiClipUpload" type="file" accept="video/*" hidden></label>'+
    '<p class="cinema-help">This creates production-ready prompts and imports generated clips into your timeline. Direct AI generation needs a secure server-side provider connection; this static GitHub Pages app must not expose private API keys in browser code.</p></div></section>'+
    '<div class="cinema-status" id="cinemaStatus" role="status"></div>';
  document.body.appendChild(panel);
  function range(id,label,min,max,step){return '<label class="cinema-field"><span>'+label+' <b id="'+id+'Value"></b></span><input id="fx'+id[0].toUpperCase()+id.slice(1)+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+data[id]+'"></label>';}
  const toolbar = document.querySelector('.stage-tools');
  if (toolbar) toolbar.insertAdjacentHTML('beforeend','<button class="button small" id="cinemaOpen">✦ Cinema Studio</button>');
  const status = message => { const el=$('cinemaStatus'); if(el)el.textContent=message; };
  function save(){try{const clean={...data,layers:(data.layers||[]).map(layer=>{const copy={...layer};delete copy._video;delete copy._image;if(copy.sessionOnly){copy.url='';copy.needsReimport=true;}return copy;})};localStorage.setItem(KEY,JSON.stringify(clean));}catch(e){status('Storage is full. Remove a large image layer and try again.');}}
  function currentTime(){
    const el=$('timecode'); if(!el)return 0;
    const m=el.textContent.match(/(\d+):(\d+\.\d+)/);return m?Number(m[1])*60+Number(m[2]):0;
  }
  function duration(){
    const el=$('durationLabel');if(!el)return 1;
    const m=el.textContent.match(/(\d+):(\d+\.\d+)/);return m?Number(m[1])*60+Number(m[2]):1;
  }
  function cameraAt(t){
    const keys=(data.cameraKeys||[]).slice().sort((a,b)=>a.time-b.time);
    if(!keys.length)return {zoom:1,x:0,y:0};
    if(t<=keys[0].time)return keys[0];
    if(t>=keys[keys.length-1].time)return keys[keys.length-1];
    let a=keys[0],b=keys[keys.length-1];
    for(let i=1;i<keys.length;i++){if(keys[i].time>=t){a=keys[i-1];b=keys[i];break;}}
    const p=Math.max(0,Math.min(1,(t-a.time)/Math.max(.001,b.time-a.time)));
    const eased=p*p*(3-2*p);
    return {zoom:a.zoom+(b.zoom-a.zoom)*eased,x:a.x+(b.x-a.x)*eased,y:a.y+(b.y-a.y)*eased};
  }
  function filterString(){
    const b=Math.max(0,Number(data.brightness)||100),c=Math.max(0,Number(data.contrast)||100),s=Math.max(0,Number(data.saturation)||100),blur=Math.max(0,Number(data.blur)||0);
    return 'brightness('+b+'%) contrast('+c+'%) saturate('+s+'%) blur('+blur+'px)';
  }
  function applyPreview(){
    const cam=cameraAt(currentTime());
    const transform='translate('+cam.x+'px,'+cam.y+'px) scale('+cam.zoom+')';
    stage.style.transform=transform;overlay.style.transform=transform;
    stage.style.filter=filterString();
    const warm=Number(data.warmth)||0;
    overlay.style.background='transparent';
    renderOverlay();
    $('fxBrightness').value=data.brightness;$('fxContrast').value=data.contrast;$('fxSaturation').value=data.saturation;$('fxBlur').value=data.blur;
    ['brightness','contrast','saturation','blur'].forEach(k=>{const el=$(k+'Value');if(el)el.textContent=data[k]+(k==='blur'?'px':'%');});
    $('vignetteValue').textContent=data.vignette+'%';
    $('camZoomValue').textContent=Math.round(cam.zoom*100)+'%';
    const vignette=Math.max(0,Math.min(80,Number(data.vignette)||0))/100;
    if(vignette>0){
      const g=ox.createRadialGradient(640,360,180,640,360,760);
      g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+(vignette*.85)+')');
      ox.fillStyle=g;ox.fillRect(0,0,1280,720);
    }
    if(warm!==0){ox.save();ox.globalCompositeOperation='soft-light';ox.fillStyle=warm>0?'rgba(255,150,65,'+(Math.abs(warm)/180)+')':'rgba(70,145,255,'+(Math.abs(warm)/180)+')';ox.fillRect(0,0,1280,720);ox.restore();}
  }
  function renderOverlay(){
    ox.clearRect(0,0,1280,720);
    const t=currentTime();
    (data.layers||[]).forEach(layer=>{
      if(layer.visible===false||t<Number(layer.start||0)||t>Number(layer.end??duration()))return;
      ox.save();ox.globalAlpha=Math.max(0,Math.min(1,Number(layer.opacity??100)/100));
      if(layer.type==='text'){
        ox.textAlign='left';ox.textBaseline='top';ox.font=(layer.weight||700)+' '+(Number(layer.size)||48)+'px '+(layer.font||'Space Grotesk');
        ox.lineWidth=5;ox.strokeStyle='rgba(0,0,0,.55)';ox.fillStyle=layer.color||'#ffffff';
        ox.strokeText(layer.text||'Your title',Number(layer.x)||80,Number(layer.y)||80);
        ox.fillText(layer.text||'Your title',Number(layer.x)||80,Number(layer.y)||80);
      }else if(layer.type==='image'&&layer.image){
        const img=layer._image||(layer._image=new Image());
        if(!img.src)img.src=layer.image;
        if(img.complete&&img.naturalWidth)ox.drawImage(img,Number(layer.x)||0,Number(layer.y)||0,Number(layer.width)||1280,Number(layer.height)||720);
      }else if(layer.type==='video'&&layer.url){
        if(!layer._video){const v=document.createElement('video');v.src=layer.url;v.muted=true;v.loop=true;v.playsInline=true;v.play().catch(()=>{});layer._video=v;}
        const v=layer._video;if(v.readyState>=2)ox.drawImage(v,Number(layer.x)||0,Number(layer.y)||0,Number(layer.width)||1280,Number(layer.height)||720);
      }
      ox.restore();
    });
  }
  function renderLayerList(){
    const list=$('cinemaLayerList');if(!list)return;
    list.innerHTML='';
    if(!data.layers.length){list.innerHTML='<p class="cinema-help">No extra layers yet. Add text, an image or a video clip.</p>';return;}
    data.layers.forEach((layer,i)=>{
      const row=document.createElement('div');row.className='cinema-item';
      const label=document.createElement('strong');label.textContent=(layer.type==='text'?'T · ':'▧ · ')+(layer.name||layer.text||'Media layer');
      const toggle=document.createElement('button');toggle.textContent=layer.visible===false?'Show':'Hide';toggle.onclick=()=>{layer.visible=layer.visible===false?true:false;renderLayerList();save();};
      const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>editLayer(i);
      const remove=document.createElement('button');remove.textContent='×';remove.onclick=()=>{if(layer._video){layer._video.pause();URL.revokeObjectURL(layer.url);}data.layers.splice(i,1);renderLayerList();save();};
      row.append(label,toggle,edit,remove);list.append(row);
    });
  }
  function editLayer(i){
    const l=data.layers[i];if(!l)return;
    if(l.type==='text'){
      const text=prompt('Overlay text',l.text||'');if(text===null)return;l.text=text;
      const size=Number(prompt('Text size in pixels',String(l.size||48)));if(Number.isFinite(size)&&size>0)l.size=Math.min(180,size);
      const x=Number(prompt('Horizontal position (0–1280)',String(l.x||80)));if(Number.isFinite(x))l.x=Math.max(0,Math.min(1280,x));
      const y=Number(prompt('Vertical position (0–720)',String(l.y||80)));if(Number.isFinite(y))l.y=Math.max(0,Math.min(720,y));
      const start=Number(prompt('Start time in seconds',String(l.start||0)));if(Number.isFinite(start))l.start=Math.max(0,start);
      const end=Number(prompt('End time in seconds',String(l.end??duration())));if(Number.isFinite(end))l.end=Math.max(l.start,end);
    }else{
      const start=Number(prompt('Start time in seconds',String(l.start||0)));if(Number.isFinite(start))l.start=Math.max(0,start);
      const end=Number(prompt('End time in seconds',String(l.end??duration())));if(Number.isFinite(end))l.end=Math.max(l.start,end);
    }
    renderLayerList();save();status('Layer updated');
  }
  function addText(){
    data.layers.push({id:Date.now(),type:'text',name:'Title overlay',text:'NEW TITLE',x:80,y:80,size:52,color:'#ffffff',weight:800,start:currentTime(),end:duration(),visible:true,opacity:100});
    renderLayerList();save();status('Text layer added');
  }
  function importMedia(file){
    if(!file)return;
    if(file.type.startsWith('image/')){
      if(file.size>1800000){status('Image is too large. Choose an image under 1.8 MB.');return;}
      const reader=new FileReader();reader.onload=()=>{data.layers.push({id:Date.now(),type:'image',name:file.name,image:reader.result,x:0,y:0,width:1280,height:720,start:currentTime(),end:duration(),visible:true,opacity:100});renderLayerList();save();status('Image layer imported and saved');};reader.readAsDataURL(file);
    }else if(file.type.startsWith('video/')){
      const url=URL.createObjectURL(file);data.layers.push({id:Date.now(),type:'video',name:file.name,url,x:0,y:0,width:1280,height:720,start:currentTime(),end:duration(),visible:true,opacity:100,sessionOnly:true});
      renderLayerList();save();status('Video clip added for this editing session');
    }else status('Choose an image or video file');
  }
  function renderCameraKeys(){
    const list=$('cameraKeyList');if(!list)return;list.innerHTML='';
    if(!data.cameraKeys.length){list.innerHTML='<p class="cinema-help">No camera keyframes yet.</p>';return;}
    data.cameraKeys.forEach((k,i)=>{const row=document.createElement('div');row.className='cinema-key';const label=document.createElement('span');label.textContent=k.time.toFixed(2)+'s · '+Math.round(k.zoom*100)+'% · '+Math.round(k.x)+','+Math.round(k.y);const del=document.createElement('button');del.textContent='Remove';del.onclick=()=>{data.cameraKeys.splice(i,1);renderCameraKeys();save();};row.append(label,del);list.append(row);});
  }
  function setCameraInputs(){
    const c=cameraAt(currentTime());$('camZoom').value=Math.round(c.zoom*100);$('camX').value=Math.round(c.x);$('camY').value=Math.round(c.y);
  }
  function setTab(name){
    document.querySelectorAll('[data-cinema-tab]').forEach(b=>b.classList.toggle('active',b.dataset.cinemaTab===name));
    document.querySelectorAll('[data-cinema-page]').forEach(p=>p.classList.toggle('active',p.dataset.cinemaPage===name));
    data.selectedTab=name;save();
  }
  function syncEffects(){
    ['brightness','contrast','saturation','blur'].forEach(k=>{const el=$('fx'+k[0].toUpperCase()+k.slice(1));if(el)el.value=data[k];});
    $('fxWarmth').value=data.warmth;$('fxVignette').value=data.vignette;
    applyPreview();
  }
  function open(){panel.classList.add('open');setTab(data.selectedTab||'effects');syncEffects();renderCameraKeys();renderLayerList();setCameraInputs();}
  $('cinemaOpen')?.addEventListener('click',open);
  $('cinemaClose').onclick=()=>panel.classList.remove('open');
  panel.querySelectorAll('[data-cinema-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.cinemaTab));
  ['brightness','contrast','saturation','blur'].forEach(k=>$('fx'+k[0].toUpperCase()+k.slice(1)).addEventListener('input',e=>{data[k]=Number(e.target.value);applyPreview();save();}));
  $('fxWarmth').oninput=e=>{data.warmth=Number(e.target.value);applyPreview();save();};
  $('fxVignette').oninput=e=>{data.vignette=Number(e.target.value);applyPreview();save();};
  $('fxCinematic').onclick=()=>{Object.assign(data,{brightness:104,contrast:118,saturation:112,blur:.15,vignette:38,warmth:8});syncEffects();save();status('Cinematic look applied');};
  $('fxReset').onclick=()=>{Object.assign(data,{brightness:100,contrast:100,saturation:100,blur:0,vignette:0,warmth:0});syncEffects();save();status('Film effects reset');};
  ['camZoom','camX','camY'].forEach(id=>$(id).addEventListener('input',()=>{
    const c=cameraAt(currentTime());
    const value={time:Number(currentTime().toFixed(3)),zoom:Number($('camZoom').value)/100,x:Number($('camX').value),y:Number($('camY').value)};
    if(!data.cameraKeys.length&&value.time>0)data.cameraKeys.push({time:0,zoom:1,x:0,y:0});
    const nearest=data.cameraKeys.findIndex(k=>Math.abs(k.time-value.time)<.04);
    if(nearest>=0)data.cameraKeys[nearest]=value;else data.cameraKeys.push(value);
    data.cameraKeys.sort((a,b)=>a.time-b.time);
    applyPreview();renderCameraKeys();save();
  }));
  $('addCameraKey').onclick=()=>{
    const key={time:Number(currentTime().toFixed(3)),zoom:Number($('camZoom').value)/100,x:Number($('camX').value),y:Number($('camY').value)};
    if(!data.cameraKeys.length&&key.time>0)data.cameraKeys.push({time:0,zoom:1,x:0,y:0});
    const i=data.cameraKeys.findIndex(k=>Math.abs(k.time-key.time)<.04);
    if(i>=0)data.cameraKeys[i]=key;else data.cameraKeys.push(key);
    data.cameraKeys.sort((a,b)=>a.time-b.time);renderCameraKeys();save();status('Camera keyframe set at '+key.time.toFixed(2)+'s');
  };
  $('clearCameraKeys').onclick=()=>{data.cameraKeys=[];renderCameraKeys();setCameraInputs();applyPreview();save();};
  $('addTextLayer').onclick=addText;
  $('cinemaMediaUpload').onchange=e=>{importMedia(e.target.files[0]);e.target.value='';};
  $('aiClipUpload').onchange=e=>{importMedia(e.target.files[0]);e.target.value='';setTab('layers');};
  $('buildAIPrompt').onclick=async()=>{
    const brief=$('aiVideoPrompt').value.trim();if(!brief){status('Describe the shot first');return;}
    const prompt=brief+'. Visual style: '+$('aiVideoStyle').value+'. Camera: '+$('aiVideoCamera').value+'. 16:9 cinematic composition, consistent subject details, natural motion, detailed lighting, no unwanted text, no watermark.';
    $('aiPromptOutput').value=prompt;
    try{await navigator.clipboard.writeText(prompt);status('AI video prompt copied');}catch(e){status('Prompt ready — select and copy it');}
  };
  document.addEventListener('keydown',e=>{if(e.key==='Escape')panel.classList.remove('open');});
  const originalCapture=stage.captureStream.bind(stage);
  stage.captureStream=function(fps){
    const composite=document.createElement('canvas');composite.width=1280;composite.height=720;
    const cx=composite.getContext('2d');const stream=composite.captureStream(fps||30);
    let raf=0,alive=true;
    const stop=()=>{alive=false;if(raf)cancelAnimationFrame(raf);};
    stream.getTracks().forEach(track=>track.addEventListener('ended',stop,{once:true}));
    const paint=()=>{
      if(!alive)return;
      cx.clearRect(0,0,1280,720);
      const cam=cameraAt(currentTime());
      cx.save();cx.translate(640+cam.x,360+cam.y);cx.scale(cam.zoom,cam.zoom);cx.translate(-640,-360);
      cx.filter=filterString();
      cx.drawImage(stage,0,0,1280,720);
      cx.filter='none';
      cx.drawImage(overlay,0,0,1280,720);
      cx.restore();
      raf=requestAnimationFrame(paint);
    };
    paint();
    return stream;
  };
  function tick(){applyPreview();requestAnimationFrame(tick);}
  renderCameraKeys();renderLayerList();syncEffects();setTab(data.selectedTab||'effects');
  requestAnimationFrame(tick);
})();