import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W=1280,H=720,RENDER_W=960,RENDER_H=540,RENDER_INTERVAL=1000/24;
const palettes={
  sunset:{sky:0x302044,floor:0x8c6370,accent:0xffa17e},
  sky:{sky:0x31577a,floor:0x6c9bb4,accent:0x9ce5ff},
  night:{sky:0x11152f,floor:0x34385f,accent:0x9c8cff},
  mint:{sky:0x1c4c45,floor:0x4c8878,accent:0x9be7c7},
  candy:{sky:0x572b59,floor:0x9d568e,accent:0xffb5d6},
  studio:{sky:0x29283d,floor:0x55516d,accent:0xb5a5ff}
};

function canvasTexture(draw,size=512){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d');draw(c,size);
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;
  return texture;
}
function makePBRMaps(){
  const albedo=canvasTexture((c,s)=>{
    c.fillStyle='#887c82';c.fillRect(0,0,s,s);
    for(let i=0;i<4500;i++){
      const v=105+Math.random()*85;c.fillStyle='rgba('+v+','+(v-5)+','+(v+3)+',0.12)';
      c.fillRect(Math.random()*s,Math.random()*s,1+Math.random()*4,1+Math.random()*3);
    }
    c.strokeStyle='#ffffff12';c.lineWidth=2;
    for(let y=0;y<s;y+=128){c.beginPath();c.moveTo(0,y);c.lineTo(s,y);c.stroke();}
  });
  const roughness=canvasTexture((c,s)=>{
    c.fillStyle='#b8b8b8';c.fillRect(0,0,s,s);
    for(let i=0;i<3500;i++){const v=110+Math.random()*130;c.fillStyle='rgb('+v+','+v+','+v+')';c.fillRect(Math.random()*s,Math.random()*s,2,2);}
  });
  roughness.colorSpace=THREE.NoColorSpace;
  const metalness=canvasTexture((c,s)=>{
    c.fillStyle='#252525';c.fillRect(0,0,s,s);
    for(let i=0;i<90;i++){c.fillStyle='rgba(190,190,190,.18)';c.fillRect(Math.random()*s,Math.random()*s,Math.random()*90+10,Math.random()*3+1);}
  });
  metalness.colorSpace=THREE.NoColorSpace;
  const normal=canvasTexture((c,s)=>{
    c.fillStyle='rgb(128,128,255)';c.fillRect(0,0,s,s);
    for(let i=0;i<3000;i++){const x=Math.random()*s,y=Math.random()*s,v=115+Math.random()*26;c.fillStyle='rgb('+v+','+(v+Math.random()*10)+',255)';c.fillRect(x,y,2+Math.random()*5,2+Math.random()*5);}
  });
  normal.colorSpace=THREE.NoColorSpace;
  return {albedo,roughness,metalness,normal};
}
const grainShader={
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uStrength:{value:.018}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;uniform float uStrength;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uTime*17.0)*43758.5453);}void main(){vec4 color=texture2D(tDiffuse,vUv);float grain=(hash(gl_FragCoord.xy)-.5)*uStrength;color.rgb+=grain;color.rgb*=1.0-0.025*length(vUv-.5);gl_FragColor=color;}`
};

let renderer,composer,scene,camera,ready=false,webgpu=false,grainPass,roomGroup,orbGroup,pmrem;
let lastScene='',lastRenderAt=0;
let renderCanvas=null;
const clock=new THREE.Clock();

function makeRenderer(){
  const params={antialias:false,alpha:false,powerPreference:'low-power'};
  // WebGPU is opt-in until its post-processing stack is available in the browser.
  // Use ?renderer=webgpu to test it; WebGL remains the full cinematic-effects path.
  const wantsGPU=new URLSearchParams(location.search).get('renderer')==='webgpu';
  if(wantsGPU&&navigator.gpu){
    return import('three/webgpu').then(async({WebGPURenderer})=>{
      const r=new WebGPURenderer(params);await r.init();webgpu=true;return r;
    }).catch(error=>{console.warn('WebGPU unavailable; using WebGL:',error);return new THREE.WebGLRenderer(params);});
  }
  return Promise.resolve(new THREE.WebGLRenderer(params));
}
function addRoomObjects(palette,maps){
  roomGroup=new THREE.Group();scene.add(roomGroup);
  const floorMat=new THREE.MeshStandardMaterial({
    map:maps.albedo,roughnessMap:maps.roughness,metalnessMap:maps.metalness,
    normalMap:maps.normal,normalScale:new THREE.Vector2(.22,.22),
    color:palette.floor,roughness:.62,metalness:.12
  });
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200,1,1),floorMat);
  floor.rotation.x=-Math.PI/2;floor.position.y=-2.25;floor.receiveShadow=true;roomGroup.add(floor);
  const backMat=new THREE.MeshStandardMaterial({color:palette.sky,roughness:.9,metalness:.02});
  const back=new THREE.Mesh(new THREE.PlaneGeometry(200,80),backMat);
  back.position.set(0,18,-34);roomGroup.add(back);
  const sphereMat=new THREE.MeshPhysicalMaterial({
    color:palette.accent,roughness:.24,metalness:.32,clearcoat:.85,clearcoatRoughness:.16,
    roughnessMap:maps.roughness,normalMap:maps.normal,normalScale:new THREE.Vector2(.12,.12)
  });
  for(let i=0;i<5;i++){
    const radius=1.05+(i%3)*.38;
    const orb=new THREE.Mesh(new THREE.SphereGeometry(radius,32,20),sphereMat.clone());
    orb.position.set((i-2)*3.25,-.35+(i%2)*.55,-3-(i%3)*1.2);
    orb.castShadow=true;orb.receiveShadow=true;orb.userData={baseY:orb.position.y,phase:i*1.17};
    roomGroup.add(orb);
  }
  const ringMat=new THREE.MeshStandardMaterial({color:palette.accent,metalness:.72,roughness:.24});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.7,.035,8,64),ringMat);
  ring.position.set(0,1.1,-5);ring.rotation.x=.25;roomGroup.add(ring);
  orbGroup=roomGroup;
}
function setupPostProcessing(){
  // Lightweight default stack: bloom only. SSAO and bokeh were the main frame-time cost.
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(RENDER_W,RENDER_H),.14,.45,.9);
  composer.addPass(bloom);
  grainPass=new ShaderPass(grainShader);composer.addPass(grainPass);
}
async function init(){
  renderCanvas=document.createElement('canvas');renderCanvas.width=W;renderCanvas.height=H;
  renderer=await makeRenderer();
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER_W,RENDER_H,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(palettes.sunset.sky);
  camera=new THREE.PerspectiveCamera(38,W/H,.1,300);
  camera.position.set(0,3.2,13);camera.lookAt(0,0,-2);
  const hemi=new THREE.HemisphereLight(0xdceaff,0x473a4c,1.35);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffe0c2,3.2);key.position.set(-5,9,7);key.castShadow=true;scene.add(key);
  const rim=new THREE.PointLight(0xa88cff,95,32,2);rim.position.set(5,3,1);scene.add(rim);
  const maps=makePBRMaps();
  addRoomObjects(palettes.sunset,maps);
  try{
    const hdr=await new RGBELoader().setDataType(THREE.HalfFloatType).loadAsync('https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr');
    hdr.mapping=THREE.EquirectangularReflectionMapping;
    if(!webgpu){
      pmrem=new THREE.PMREMGenerator(renderer);
      scene.environment=pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    }else{
      scene.environment=hdr;
    }
    scene.environmentIntensity=1.15;
  }catch(error){console.warn('HDRI could not load; using studio lights:',error);}
  if(!webgpu)setupPostProcessing();
  ready=true;
  render(0,{background:'sunset'});
  return {canvas:renderCanvas,renderer:webgpu?'WebGPU':'WebGL'};
}
function setPalette(name){
  const p=palettes[name]||palettes.sunset;
  scene.background.setHex(p.sky);
  if(roomGroup){
    roomGroup.children.forEach((obj,i)=>{
      if(obj.material&&obj.material.color){
        if(obj.geometry?.type==='PlaneGeometry'&&obj.position.z===-34)obj.material.color.setHex(p.sky);
        else if(obj.material.color.getHex()!==p.floor&&obj.geometry?.type==='PlaneGeometry')obj.material.color.setHex(p.floor);
      }
      if(obj.material&&obj.geometry?.type==='SphereGeometry')obj.material.color.setHex(p.accent);
      if(obj.material&&obj.geometry?.type==='TorusGeometry')obj.material.color.setHex(p.accent);
    });
  }
}
function render(time,sceneData={}){
  if(!ready||!renderer)return false;
  const now=performance.now();
  if(now-lastRenderAt<RENDER_INTERVAL)return true;
  lastRenderAt=now;
  const sceneName=sceneData.background||'sunset';
  if(sceneName!==lastScene){setPalette(sceneName);lastScene=sceneName;}
  const t=Number(time)||0;
  if(orbGroup){
    orbGroup.children.forEach(obj=>{
      if(obj.userData&&obj.userData.baseY!==undefined){
        obj.position.y=obj.userData.baseY+Math.sin(t*1.15+obj.userData.phase)*.28;
        obj.rotation.y=t*.12+obj.userData.phase*.2;
        obj.rotation.z=Math.sin(t*.55+obj.userData.phase)*.08;
      }
    });
  }
  camera.position.x=Math.sin(t*.16)*.24;
  camera.position.y=3.2+Math.sin(t*.23)*.12;
  camera.lookAt(0,0,-2);
  if(grainPass)grainPass.uniforms.uTime.value=t;
  if(composer)composer.render();
  else renderer.render(scene,camera);
  const glCanvas=renderer.domElement;
  const out=renderCanvas.getContext('2d');
  out.clearRect(0,0,W,H);
  out.drawImage(glCanvas,0,0,W,H);
  return true;
}
window.CartoonLab3D={
  get ready(){return ready;},
  get renderer(){return webgpu?'WebGPU':'WebGL';},
  canvas:renderCanvas,
  render
};
init().then(info=>{
  window.CartoonLab3D.canvas=info.canvas;
  console.info('CartoonLab cinematic renderer ready:',info.renderer);
  const badge=document.querySelector('.stage-label');
  if(badge)badge.title='Cinematic 3D renderer: '+info.renderer+' · PBR · HDRI · ACES';
}).catch(error=>{
  console.error('CartoonLab 3D renderer failed; 2D renderer remains active:',error);
});
