import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let camera, scene, renderer;
let reticle, hitTestSource=null, hitTestSourceRequested=false;
let model=null, mixer=null, clock=new THREE.Clock();

init();
animate();

function init(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // نور
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1,2,1);
  dir.castShadow = true;
  scene.add(dir);

  // رتیکل (نقطه‌ی نشانه‌گیری روی زمین)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // بارگذاری مدل و انیمیشن (فایل character.glb باید کنار این فایل باشد)
  const loader = new GLTFLoader();
  loader.load('./character.glb', (gltf)=>{
    model = gltf.scene;
    model.traverse(o => { if (o.isMesh){ o.castShadow = true; }});
    model.visible = false; // بعد از Place نمایش داده می‌شود
    scene.add(model);

    if (gltf.animations && gltf.animations.length){
      mixer = new THREE.AnimationMixer(model);
      const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
      mixer.clipAction(clip).play();
    }
  }, undefined, (e)=>console.error('GLB load error:', e));

  // دکمه ورود به AR
  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
  }));

  // با یک Tap روی صفحه → مدل روی زمین قرار می‌گیرد
  renderer.xr.addEventListener('sessionstart', ()=>{
    const session = renderer.xr.getSession();
    session.addEventListener('select', ()=>{
      if (!reticle.visible || !model) return;
      const m = new THREE.Matrix4().fromArray(reticle.matrix.elements);
      model.position.setFromMatrixPosition(m);
      model.quaternion.setFromRotationMatrix(m);
      model.visible = true;
    });
  });

  // واکنش به تغییر اندازه
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

  const session = renderer.xr.getSession();
  if (frame && session){
    const refSpace = renderer.xr.getReferenceSpace();
    if (!hitTestSourceRequested){
      session.requestReferenceSpace('viewer').then((viewerSpace)=>{
        frame.session.requestHitTestSource({ space: viewerSpace }).then((source)=>{
          hitTestSource = source;
        });
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
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
}
