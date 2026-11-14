import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W=1280,H=720,RENDER_W=960,RENDER_H=540,RENDER_INTERVAL=1000/60;
const palettes={
  sunset:{sky:0x302044,floor:0x8c6370,accent:0xffa17e,far:0x59466f,mid:0x8a5876,near:0x65445f,cloud:0xffc0a6,sun:0xffd29a},
  sky:{sky:0x31577a,floor:0x6c9bb4,accent:0x9ce5ff,far:0x547fa0,mid:0x6ca4bd,near:0x4f879c,cloud:0xe4f6ff,sun:0xfff0c2},
  night:{sky:0x11152f,floor:0x34385f,accent:0x9c8cff,far:0x252b55,mid:0x353b70,near:0x252c58,cloud:0x7475a5,sun:0xd2caff},
  mint:{sky:0x1c4c45,floor:0x4c8878,accent:0x9be7c7,far:0x386b62,mid:0x4f927e,near:0x326e60,cloud:0xbcebd5,sun:0xffe8b2},
  candy:{sky:0x572b59,floor:0x9d568e,accent:0xffb5d6,far:0x784b7d,mid:0xb56b9e,near:0x8c4c82,cloud:0xffd0e7,sun:0xffd5ee},
  studio:{sky:0x29283d,floor:0x55516d,accent:0xb5a5ff,far:0x45415e,mid:0x625b7e,near:0x403b5c,cloud:0xc8c0e8,sun:0xe5ddff}
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
function addSceneryShape(points,z,color,role){
  const shape=new THREE.Shape();
  shape.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);
  shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color,roughness:.95,metalness:0,side:THREE.DoubleSide}));
  mesh.position.z=z;mesh.userData.paletteRole=role;roomGroup.add(mesh);return mesh;
}
function addCloud(x,y,z,scale,color){
  const shape=new THREE.Shape();
  shape.moveTo(-2.2,0);shape.bezierCurveTo(-2.8,.7,-1.8,1.35,-.9,1.05);
  shape.bezierCurveTo(-.65,2.0,.8,2.05,1.15,1.15);
  shape.bezierCurveTo(2.45,1.45,2.8,.3,1.9,0);shape.lineTo(-2.2,0);
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);mesh.scale.setScalar(scale);mesh.userData={paletteRole:'cloud',baseX:x,phase:x*.11};roomGroup.add(mesh);
}
function addTree(x,z,scale,color){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12*scale,.18*scale,1.5*scale,7),new THREE.MeshStandardMaterial({color:0x493747,roughness:1}));
  trunk.position.set(x,-1.1*scale,z);roomGroup.add(trunk);
  for(let i=0;i<3;i++){
    const crown=new THREE.Mesh(new THREE.ConeGeometry((.9-i*.16)*scale,1.55*scale,7),new THREE.MeshStandardMaterial({color,roughness:.95}));
    crown.position.set(x,(-.1+i*.55)*scale,z);crown.userData.paletteRole='tree';roomGroup.add(crown);
  }
}
function addRoomObjects(palette,maps){
  roomGroup=new THREE.Group();scene.add(roomGroup);
  const floorMat=new THREE.MeshStandardMaterial({map:maps.albedo,roughnessMap:maps.roughness,metalnessMap:maps.metalness,normalMap:maps.normal,normalScale:new THREE.Vector2(.16,.16),color:palette.floor,roughness:.78,metalness:.04});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),floorMat);
  floor.rotation.x=-Math.PI/2;floor.position.y=-2.25;floor.receiveShadow=true;floor.userData.paletteRole='floor';roomGroup.add(floor);
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(200,100),new THREE.MeshBasicMaterial({color:palette.sky}));
  sky.position.set(0,17,-38);sky.userData.paletteRole='sky';roomGroup.add(sky);
  // Layered mountain silhouettes create a real horizon instead of floating decorative objects.
  addSceneryShape([[-55,-1.7],[-48,5],[-40,1],[-31,10],[-23,2],[-13,8],[-3,1],[8,9],[19,2],[30,11],[40,2],[49,7],[57,-1.7]],-27,palette.far,'far');
  addSceneryShape([[-55,-2],[-48,0],[-39,5],[-30,-.3],[-19,4],[-8,-.6],[3,5],[14,-.4],[25,4],[36,-.5],[47,3],[57,-2]],-20,palette.mid,'mid');
  addSceneryShape([[-55,-2],[-48,-.4],[-39,1.2],[-29,-.6],[-17,1.8],[-5,-.7],[8,1.5],[19,-.5],[31,1.8],[43,-.5],[55,1.2],[58,-2]],-13,palette.near,'near');
  // A flat, softly lit sun and broad clouds add depth without the old orb cluster.
  const sun=new THREE.Mesh(new THREE.CircleGeometry(2.35,48),new THREE.MeshBasicMaterial({color:palette.sun}));
  sun.position.set(7,7.2,-30);sun.userData.paletteRole='sun';roomGroup.add(sun);
  addCloud(-10,7.1,-24,1.15,palette.cloud);addCloud(18,9,-25,.82,palette.cloud);addCloud(-25,10,-29,.68,palette.cloud);
  // Small trees sit along the horizon as environmental detail.
  for(const [x,z,s] of [[-17,-10,1.25],[-13,-9,.82],[15,-10,1.1],[20,-11,.8],[-31,-14,.75],[31,-14,.9]])addTree(x,z,s,palette.near);
  // Keep the textured foreground floor and lighting for a grounded 3D look.
  const path=new THREE.Mesh(new THREE.PlaneGeometry(8,35),new THREE.MeshStandardMaterial({color:palette.accent,roughness:.92,transparent:true,opacity:.16}));
  path.rotation.x=-Math.PI/2;path.position.set(0,-2.22,1);path.userData.paletteRole='accent';roomGroup.add(path);
  orbGroup=null;
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
  if(!roomGroup)return;
  roomGroup.children.forEach(obj=>{
    const role=obj.userData?.paletteRole;
    if(!role||!obj.material?.color)return;
    const colors={sky:p.sky,floor:p.floor,far:p.far,mid:p.mid,near:p.near,tree:p.near,cloud:p.cloud,sun:p.sun,accent:p.accent};
    if(colors[role]!==undefined)obj.material.color.setHex(colors[role]);
  });
}
function render(time,sceneData={}){
  if(!ready||!renderer)return false;
  const now=performance.now();
  if(now-lastRenderAt<RENDER_INTERVAL)return true;
  lastRenderAt=now;
  const sceneName=sceneData.background||'sunset';
  if(sceneName!==lastScene){setPalette(sceneName);lastScene=sceneName;}
  const t=Number(time)||0;
  roomGroup?.children.forEach(obj=>{
    if(obj.userData?.baseX!==undefined)obj.position.x=obj.userData.baseX+Math.sin(t*.12+obj.userData.phase)*.18;
  });
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
