// @ts-nocheck

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export let scene: THREE.Scene;
export let camera: THREE.PerspectiveCamera;
export let renderer: THREE.WebGLRenderer;
export let controls: OrbitControls;

let container: HTMLDivElement | null = null;

export function Init3DView() {
  container = document.getElementById("3dcontainer") as HTMLDivElement | null;
  if (!container) {
    throw new Error("3dcontainer element not found");
  }

  scene = new THREE.Scene();

  const { width, height } = getViewportSize();

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
  camera.position.set(25, 20, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);

  // Canvas fills entire container
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.top = "0";
  renderer.domElement.style.left = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  container.style.position = "relative";
  container.style.width = "100%";
  container.style.height = "100%";
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.update();

  window.addEventListener("resize", onWindowResize);

  animate();
}

export function InitBasicScene() {
  if (!scene) return;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(20, 40, 20);
  scene.add(directional);
}

export function ClearScene() {
  if (!scene) return;

  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    scene.remove(obj);

    const anyObj = obj as any;
    if (anyObj.geometry) {
      anyObj.geometry.dispose();
    }
    if (anyObj.material) {
      if (Array.isArray(anyObj.material)) {
        anyObj.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        anyObj.material.dispose();
      }
    }
  }
}

function getViewportSize() {
  const toolbar = document.querySelector(".toolbar") as HTMLElement | null;
  const toolbarHeight = toolbar ? toolbar.clientHeight : 0;

  const width = window.innerWidth;
  const height = window.innerHeight - toolbarHeight;

  return { width, height };
}

function onWindowResize() {
  if (!camera || !renderer) return;

  const { width, height } = getViewportSize();

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);

  if (controls) {
    controls.update();
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}
