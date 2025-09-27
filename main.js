import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const statusEl = document.getElementById('status');
const fallbackEl = document.getElementById('fallback');
const log = (m) => { console.log(m); statusEl.textContent = m; };

let camera, scene, renderer;
let reticle, hitTestSource=null, hitTestSourceRequested=false;
let model=null, mixer=null, clock=new THREE.Clock();

(async function start(){
  log('بررسی پشتیبانی WebXR…');
  if (!('xr' in navigator)) {
    log('WebXR در مرورگر موجود نیست. فالبک فعال شد.');
    fallbackEl.style.display = 'block';
    return;
  }
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false);
  if (!ok) {
    log('immersive-ar پشتیبانی نمی‌شود. فالبک فعال شد.');
    fallbackEl.style.display = 'block';
    return;
  }
  log('WebXR OK. راه‌اندازی صحنه…');
  init();
  animate();
})();

function init(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1,2,1);
  dir.castShadow = true;
  scene.add(dir);

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const loader = new GLTFLoader();
  loader.load('./character.glb', (gltf)=>{
    model = gltf.scene;
    model.traverse(o => { if (o.isMesh){ o.castShadow = true; }});
    model.visible = false;
    scene.add(model);
    if (gltf.animations?.length){
      mixer = new THREE.AnimationMixer(model);
      const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
      mixer.clipAction(clip).play();
    }
    log('مدل بارگذاری شد. دکمه AR باید ظاهر شود.');
  }, undefined, (e)=>{
    console.error('GLB load error:', e);
    log('خطا در بارگذاری مدل GLB');
  });

  const btn = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  document.body.appendChild(btn);

  renderer.xr.addEventListener('sessionstart', ()=>{
    log('جلسه AR شروع شد. رتیکل را روی زمین ببینید و ضربه بزنید.');
    const session = renderer.xr.getSession();
    session.addEventListener('select', ()=>{
      if (!reticle.visible || !model) return;
      const m = new THREE.Matrix4().fromArray(reticle.matrix.elements);
      model.position.setFromMatrixPosition(m);
      model.quaternion.setFromRotationMatrix(m);
      model.visible = true;
    });
  });

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate(){ renderer.setAnimationLoop(render); }

function render(t, frame){
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  const session = renderer.xr.getSession?.();
  if (frame && session){
    const refSpace = renderer.xr.getReferenceSpace();
    if (!hitTestSourceRequested){
      session.requestReferenceSpace('viewer').then((viewerSpace)=>{
        frame.session.requestHitTestSource({ space: viewerSpace }).then((source)=>{
          hitTestSource = source;
        });
      }).catch(e=>{
        console.error(e);
        log('Hit-test در دسترس نیست.');
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource){
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length){
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        statusEl.textContent = 'روی صفحه ضربه بزنید تا کاراکتر قرار بگیرد.';
      } else {
        reticle.visible = false;
        statusEl.textContent = 'در حال جستجوی سطح… دوربین را به سمت زمین تکان دهید.';
      }
    }
  }

  renderer.render(scene, camera);
}
