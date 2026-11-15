// La scène 3D du renard : chargement du modèle, animations, humeurs, lumière, météo et réactions au toucher.
// Tout ce qui dépend de three.js est ici, pour que le reste de l'appli reste léger (chargé à la demande).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOODS, randomBetween, type Gesture, type Mood, type MoodId } from './moods';

export interface FoxSceneOptions {
  modelUrl: string;
  mood: MoodId;
  onProgress?: (fraction: number) => void;
  /** Appelé quand le renard réagit au toucher (pour un retour visuel ou sonore côté interface). */
  onReact?: () => void;
}

// Axes de rotation locaux des os, trouvés en testant le modèle « Fox » de pxltiger.
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
/** Rotation maximale des paupières hautes avant qu'elles ne passent derrière l'œil. */
const LID_MAX = 0.55;

const TRANSITION = { toSit: 'Fox_Sit1', toStand: 'Fox_Sit3_StandUp' } as const;

/** Valeurs qui glissent doucement d'une humeur à l'autre. */
interface Blend {
  exposure: number;
  fog: number;
  sunIntensity: number;
  sunHeight: number;
  ambientIntensity: number;
  glowOpacity: number;
  rain: number;
  pollen: number;
  wind: number;
  headDown: number;
  earsDown: number;
  lids: number;
  breathDepth: number;
  breathRate: number;
  restless: number;
}

interface ColorBlend {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
  glow: THREE.Color;
}

function targetBlend(m: Mood): Blend {
  return {
    exposure: m.exposure,
    fog: m.fog,
    sunIntensity: m.sun.intensity,
    sunHeight: m.sun.height,
    ambientIntensity: m.ambient.intensity,
    glowOpacity: m.glow.opacity,
    rain: m.weather === 'rain' ? m.weatherAmount : 0,
    pollen: m.weather === 'pollen' ? m.weatherAmount : 0,
    wind: m.weather === 'wind' ? m.weatherAmount : 0,
    headDown: m.headDown,
    earsDown: m.earsDown,
    lids: m.lids,
    breathDepth: m.breath.depth,
    breathRate: m.breath.rate,
    restless: m.restless
  };
}

function targetColors(m: Mood): ColorBlend {
  return {
    skyTop: new THREE.Color(m.sky.top),
    skyBottom: new THREE.Color(m.sky.bottom),
    ground: new THREE.Color(m.ground),
    sun: new THREE.Color(m.sun.color),
    ambientSky: new THREE.Color(m.ambient.sky),
    ambientGround: new THREE.Color(m.ambient.ground),
    glow: new THREE.Color(m.glow.color)
  };
}

/** Petite texture ronde et floue, pour les halos et les particules. */
function softDot(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Masque radial pour que le sol se fonde dans le ciel au loin (canal vert = opacité). */
function groundFade(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export class FoxScene {
  private readonly container: HTMLElement;
  private readonly opts: FoxSceneOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Décor
  private skyUniforms!: { top: { value: THREE.Color }; bottom: { value: THREE.Color } };
  private groundMat!: THREE.MeshStandardMaterial;
  private hillMat!: THREE.MeshStandardMaterial;
  private glow!: THREE.Sprite;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private rim!: THREE.DirectionalLight;
  private fog!: THREE.FogExp2;
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private motes!: THREE.Points;
  private motePos!: Float32Array;
  private moteSeed!: Float32Array;

  // Renard
  private foxRoot = new THREE.Group();
  private foxYaw = 0;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private bones: Record<string, THREE.Bone> = {};
  private active: THREE.AnimationAction | null = null;
  private posture: 'sit' | 'stand' = 'sit';
  private busy: 'transition' | 'gesture' | null = null;
  /**
   * Pose d'animation des os retouchés à la main. three.js ne réécrit un os que si l'animation le fait bouger :
   * sans cette copie, nos retouches s'additionneraient d'une image à l'autre sur les os immobiles.
   */
  private animatedPose = new Map<THREE.Bone, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  private idlePelvis = new THREE.Vector3();
  private pelvisUp = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  // Humeur
  private mood: Mood;
  private blend: Blend;
  private colors: ColorBlend;
  private target: Blend;
  private targetCol: ColorBlend;

  // Minuteries
  private time = 0;
  private breathPhase = 0;
  private nextGestureAt = 0;
  private nextBlinkAt = 0;
  private blinkStart = -1;
  private reactUntil = 0;

  // Interaction
  private dragYaw = 0;
  private pointer: { id: number; x: number; y: number; t: number; moved: number } | null = null;

  private raf = 0;
  private running = false;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  private constructor(container: HTMLElement, opts: FoxSceneOptions) {
    this.container = container;
    this.opts = opts;
    this.mood = MOODS[opts.mood];
    this.blend = targetBlend(this.mood);
    this.target = targetBlend(this.mood);
    this.colors = targetColors(this.mood);
    this.targetCol = targetColors(this.mood);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'pan-y';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.buildDecor();
    this.scene.add(this.foxRoot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Crée la scène et attend que le renard soit chargé. */
  static async create(container: HTMLElement, opts: FoxSceneOptions): Promise<FoxScene> {
    const scene = new FoxScene(container, opts);
    try {
      await scene.loadFox();
    } catch (e) {
      scene.dispose();
      throw e;
    }
    if (!scene.disposed) scene.start();
    return scene;
  }

  // ------------------------------------------------------------------ décor

  private buildDecor(): void {
    // Ciel : un dégradé plein écran dessiné derrière tout le reste
    this.skyUniforms = { top: { value: this.colors.skyTop.clone() }, bottom: { value: this.colors.skyBottom.clone() } };
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
        fragmentShader: `
          uniform vec3 top; uniform vec3 bottom; varying vec2 vUv;
          void main(){
            float t = smoothstep(0.15, 1.0, vUv.y);
            gl_FragColor = vec4(mix(bottom, top, t), 1.0);
            #include <colorspace_fragment>
          }`,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.scene.add(sky);

    this.fog = new THREE.FogExp2(this.colors.skyBottom.clone(), this.blend.fog);
    this.scene.fog = this.fog;

    // Sol qui se fond au loin
    this.groundMat = new THREE.MeshStandardMaterial({
      color: this.colors.ground.clone(),
      roughness: 1,
      transparent: true,
      alphaMap: groundFade(),
      depthWrite: false
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Collines lointaines, adoucies par la brume
    this.hillMat = new THREE.MeshStandardMaterial({ color: this.colors.ground.clone(), roughness: 1 });
    const hillGeo = new THREE.SphereGeometry(1, 32, 16);
    [
      [-6, -11, 7, 1.8, 3],
      [3, -13, 9, 2.6, 4],
      [9, -10, 6, 1.5, 3]
    ].forEach(([x, z, sx, sy, sz]) => {
      const h = new THREE.Mesh(hillGeo, this.hillMat);
      h.position.set(x, -0.2, z);
      h.scale.set(sx, sy, sz);
      this.scene.add(h);
    });

    // Halo du soleil ou de la lune
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softDot(128), color: this.colors.glow.clone(), transparent: true, depthWrite: false, fog: false })
    );
    this.glow.position.set(-3.5, 3.6, -12);
    this.glow.scale.setScalar(5);
    this.scene.add(this.glow);

    // Lumières
    this.hemi = new THREE.HemisphereLight(this.colors.ambientSky.clone(), this.colors.ambientGround.clone(), this.blend.ambientIntensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.colors.sun.clone(), this.blend.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -1.4;
    sc.right = sc.top = 1.4;
    sc.near = 0.5;
    sc.far = 12;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(this.colors.glow.clone(), 0.7);
    this.rim.position.set(2.5, 2, -3);
    this.scene.add(this.rim);

    // Pluie : de courts traits qui tombent
    const RAIN = this.reducedMotion ? 150 : 450;
    this.rainPos = new Float32Array(RAIN * 6);
    for (let i = 0; i < RAIN; i++) this.resetDrop(i, Math.random() * 5);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0xcfdcff, transparent: true, opacity: 0, depthWrite: false })
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // Poussières de lumière (élan) ou feuilles emportées par le vent (emballement)
    const MOTES = this.reducedMotion ? 50 : 140;
    this.motePos = new Float32Array(MOTES * 3);
    this.moteSeed = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      this.motePos[i * 3] = (Math.random() - 0.5) * 6;
      this.motePos[i * 3 + 1] = Math.random() * 2.6;
      this.motePos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 0.5;
      this.moteSeed[i] = Math.random() * 100;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({ map: softDot(), size: 0.07, transparent: true, opacity: 0, depthWrite: false, color: 0xfff2b0 })
    );
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  private resetDrop(i: number, y = 4.5 + Math.random()): void {
    const x = (Math.random() - 0.5) * 7;
    const z = (Math.random() - 0.5) * 6 - 0.5;
    const len = 0.1 + Math.random() * 0.08;
    const p = this.rainPos;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.02;
    p[i * 6 + 4] = y + len;
    p[i * 6 + 5] = z;
  }

  // ------------------------------------------------------------------ renard

  private async loadFox(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(this.opts.modelUrl, (e) => {
      if (e.total) this.opts.onProgress?.(e.loaded / e.total);
    });
    if (this.disposed) return;

    const model = gltf.scene;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false; // la boîte englobante d'un maillage animé ne suit pas la pose
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && 'roughness' in mat) {
          mat.roughness = Math.max(mat.roughness ?? 1, 0.75); // fourrure moins brillante
          mat.metalness = 0;
        }
      }
      if ((o as THREE.Bone).isBone) this.bones[o.name.replace(/_\d+$/, '')] = o as THREE.Bone;
    });

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', this.onActionFinished);

    // Mesure du renard assis, puis mise à l'échelle : hauteur 1, posé au sol, tourné vers la caméra.
    const sit = this.actions.get('Fox_Sit2_Idle')!;
    sit.play();
    this.mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    Object.values(this.bones).forEach((b) => box.expandByPoint(b.getWorldPosition(v)));
    const height = box.max.y - box.min.y;
    const s = 1 / height;
    const center = box.getCenter(new THREE.Vector3());
    const eyes = this.bonePos('Fox_LEye').add(this.bonePos('Fox_REye')).multiplyScalar(0.5);
    const facing = eyes.sub(this.bonePos('Fox_Head')).setY(0).normalize();

    const holder = new THREE.Group();
    holder.add(model);
    model.position.set(-center.x, -box.min.y + height * 0.02, -center.z);
    holder.scale.setScalar(s);
    holder.rotation.y = -Math.atan2(facing.x, facing.z);
    this.foxRoot.add(holder);
    sit.stop();

    // Hauteur du bassin debout, pour limiter la hauteur des sauts (sinon il sort du cadre).
    const idle = this.actions.get('Fox_Idle');
    if (idle && this.bones.Fox_Pelvis) {
      const pelvis = this.bones.Fox_Pelvis;
      idle.play();
      this.mixer.update(0);
      this.foxRoot.updateMatrixWorld(true);
      this.idlePelvis.copy(pelvis.position);
      // Direction « vers le haut » exprimée dans le repère du parent du bassin
      const parentQ = pelvis.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.pelvisUp.set(0, 1, 0).applyQuaternion(parentQ).normalize();
      idle.stop();
    }

    const touched = ['Fox_Pelvis', 'Fox_Head', 'Fox_LEar1', 'Fox_REar1', 'Fox_UpperLEyelid', 'Fox_UpperREyelid', 'Fox_Ribcage'];
    const ribs = this.bones.Fox_Ribcage;
    for (const bone of [...touched.map((n) => this.bones[n]), ...(ribs?.children ?? [])]) {
      if ((bone as THREE.Bone)?.isBone) {
        this.animatedPose.set(bone as THREE.Bone, {
          p: bone.position.clone(),
          q: bone.quaternion.clone(),
          s: bone.scale.clone()
        });
      }
    }

    // État de départ selon l'humeur
    this.posture = this.mood.posture;
    this.playBase(0);
    this.nextGestureAt = randomBetween(this.mood.gestureEvery);
    this.nextBlinkAt = randomBetween(this.mood.blinkEvery);
    this.opts.onProgress?.(1);
  }

  private bonePos(name: string): THREE.Vector3 {
    return this.bones[name].getWorldPosition(new THREE.Vector3());
  }

  private fadeTo(next: THREE.AnimationAction, duration: number): void {
    if (this.active === next) return;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.reset().play();
    if (this.active && duration > 0) this.active.crossFadeTo(next, duration, false);
    else if (this.active) this.active.stop();
    this.active = next;
  }

  private playBase(fade = 0.4): void {
    const base = this.actions.get(this.mood.base);
    if (!base) return;
    base.setLoop(THREE.LoopRepeat, Infinity);
    base.timeScale = this.mood.speed;
    this.busy = null;
    if (this.active === base) return;
    this.fadeTo(base, fade);
  }

  private playGesture(g: Gesture, kind: 'gesture' | 'transition' = 'gesture', fade = 0.3): boolean {
    const action = this.actions.get(g.clip);
    if (!action) return false;
    const repeat = g.repeat ?? 1;
    action.setLoop(repeat > 1 ? THREE.LoopRepeat : THREE.LoopOnce, repeat);
    action.clampWhenFinished = true;
    action.timeScale = g.speed ?? (kind === 'transition' ? 1 : this.mood.speed);
    if (this.active === action) this.active = null; // permet de rejouer le même geste
    this.fadeTo(action, fade);
    this.busy = kind;
    return true;
  }

  private onActionFinished = (e: { action: THREE.AnimationAction }): void => {
    if (e.action !== this.active) return;
    if (this.busy === 'transition') {
      this.posture = this.mood.posture;
    }
    this.playBase(0.35);
    this.nextGestureAt = this.time + randomBetween(this.mood.gestureEvery);
  };

  // ------------------------------------------------------------------ API publique

  setMood(id: MoodId): void {
    const next = MOODS[id];
    if (!next || next === this.mood) return;
    this.mood = next;
    this.target = targetBlend(next);
    this.targetCol = targetColors(next);
    if (!this.mixer) return;

    if (next.posture !== this.posture) {
      this.playGesture({ clip: next.posture === 'sit' ? TRANSITION.toSit : TRANSITION.toStand }, 'transition', 0.25);
    } else if (this.busy !== 'transition') {
      this.playBase(0.5);
    }
    this.nextGestureAt = this.time + randomBetween(next.gestureEvery);
  }

  /** Le renard réagit (toucher, ou appel depuis l'interface). */
  react(): void {
    if (!this.mixer || this.busy === 'transition') return;
    this.playGesture(this.mood.reaction, 'gesture', 0.2);
    this.reactUntil = this.time + 1.6;
    this.blinkStart = -1;
    this.opts.onReact?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.mixer?.stopAllAction();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    canvas.remove();
  }

  // ------------------------------------------------------------------ boucle

  private start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Plus l'écran est étroit, plus la caméra recule pour garder tout le renard.
    // Sur une scène large et basse (pendant le check-in), elle s'approche un peu.
    const distance = 3.6 * Math.max(0.78, 0.8 / this.camera.aspect);
    const target = new THREE.Vector3(0, 0.6, 0);
    const dir = new THREE.Vector3(0.36, 0.06, 1).normalize();
    this.camera.position.copy(dir.multiplyScalar(distance)).add(target);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  private frame(dt: number): void {
    this.time += dt;
    const t = this.time;

    // 1. Glissement doux vers l'humeur visée (environ 2 secondes)
    const k = 1 - Math.exp(-dt * 1.6);
    for (const key of Object.keys(this.blend) as (keyof Blend)[]) {
      this.blend[key] += (this.target[key] - this.blend[key]) * k;
    }
    for (const key of Object.keys(this.colors) as (keyof ColorBlend)[]) {
      this.colors[key].lerp(this.targetCol[key], k);
    }
    const b = this.blend;
    const c = this.colors;

    // 2. Décor
    this.skyUniforms.top.value.copy(c.skyTop);
    this.skyUniforms.bottom.value.copy(c.skyBottom);
    this.fog.color.copy(c.skyBottom);
    this.fog.density = b.fog;
    this.groundMat.color.copy(c.ground);
    this.hillMat.color.copy(c.ground).multiplyScalar(0.8);
    this.hemi.color.copy(c.ambientSky);
    this.hemi.groundColor.copy(c.ambientGround);
    this.hemi.intensity = b.ambientIntensity;
    this.sun.color.copy(c.sun);
    this.sun.intensity = b.sunIntensity;
    this.sun.position.set(-1.6, 0.6 + b.sunHeight * 2, 2.2);
    this.rim.color.copy(c.glow);
    (this.glow.material as THREE.SpriteMaterial).color.copy(c.glow);
    (this.glow.material as THREE.SpriteMaterial).opacity = b.glowOpacity;
    this.glow.position.y = 1.6 + b.sunHeight * 1.3;
    this.renderer.toneMappingExposure = b.exposure;
    this.updateWeather(dt, b);

    // 3. Animation du squelette
    if (this.mixer) {
      if (this.busy === null && t >= this.nextGestureAt && this.mood.gestures.length) {
        const g = this.mood.gestures[Math.floor(Math.random() * this.mood.gestures.length)];
        this.playGesture(g);
      }
      for (const [bone, pose] of this.animatedPose) {
        bone.position.copy(pose.p);
        bone.quaternion.copy(pose.q);
        bone.scale.copy(pose.s);
      }
      this.mixer.update(dt);
      for (const [bone, pose] of this.animatedPose) {
        pose.p.copy(bone.position);
        pose.q.copy(bone.quaternion);
        pose.s.copy(bone.scale);
      }
      this.applyProcedural(dt, b);
    }

    // 4. Orientation : le doigt fait tourner le renard, qui revient doucement face à toi
    if (!this.pointer) this.dragYaw *= Math.exp(-dt * 2.2);
    const shiver = this.reducedMotion ? 0 : b.restless * 0.012 * Math.sin(t * 47);
    this.foxYaw += (this.dragYaw - this.foxYaw) * Math.min(1, dt * 12);
    this.foxRoot.rotation.y = this.foxYaw;
    this.foxRoot.position.x = shiver;

    this.renderer.render(this.scene, this.camera);
  }

  private applyProcedural(dt: number, b: Blend): void {
    const t = this.time;
    const happy = t < this.reactUntil ? Math.sin(Math.min(1, (this.reactUntil - t) / 1.6) * Math.PI) : 0;
    const q = new THREE.Quaternion();

    // Sauts et saltos deux fois moins hauts, pour qu'il reste dans le cadre
    const pelvis = this.bones.Fox_Pelvis;
    if (pelvis && this.pelvisUp.lengthSq() > 0) {
      const lift = this.tmp.copy(pelvis.position).sub(this.idlePelvis).dot(this.pelvisUp);
      if (lift > 0) pelvis.position.addScaledVector(this.pelvisUp, -lift * 0.5);
    }

    // Tête : baissée selon l'humeur, petits mouvements vivants, relevée quand on le touche
    const head = this.bones.Fox_Head;
    if (head) {
      const restlessLook = this.reducedMotion ? 0 : b.restless * 0.12 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
      // Axe Z local : positif = museau vers le bas
      head.quaternion.multiply(q.setFromAxisAngle(Z, b.headDown * (1 - happy * 0.8)));
      head.quaternion.multiply(q.setFromAxisAngle(Y, restlessLook));
    }

    // Oreilles couchées
    const ears = b.earsDown * (1 - happy);
    const lEar = this.bones.Fox_LEar1;
    const rEar = this.bones.Fox_REar1;
    // Axe Z local, même sens pour les deux oreilles : positif = couchée vers l'arrière
    if (lEar) lEar.quaternion.multiply(q.setFromAxisAngle(Z, ears * 0.8));
    if (rEar) rEar.quaternion.multiply(q.setFromAxisAngle(Z, ears * 0.8));

    // Paupières : tombantes selon l'humeur, plus un clignement de temps en temps
    if (this.blinkStart < 0 && t >= this.nextBlinkAt) this.blinkStart = t;
    let blink = 0;
    if (this.blinkStart >= 0) {
      const p = (t - this.blinkStart) / 0.18;
      blink = p < 1 ? Math.sin(p * Math.PI) : 0;
      if (p >= 1) {
        this.blinkStart = -1;
        this.nextBlinkAt = t + randomBetween(this.mood.blinkEvery);
      }
    }
    const lid = Math.min(LID_MAX, (b.lids * (1 - happy) * 0.75 + blink) * LID_MAX);
    for (const name of ['Fox_UpperLEyelid', 'Fox_UpperREyelid']) {
      this.bones[name]?.quaternion.multiply(q.setFromAxisAngle(Z, lid));
    }

    // Respiration : la cage thoracique gonfle doucement (les enfants gardent leur taille)
    this.breathPhase += dt * b.breathRate * 1.4;
    const breath = 1 + Math.sin(this.breathPhase) * 0.022 * b.breathDepth;
    const ribs = this.bones.Fox_Ribcage;
    if (ribs) {
      ribs.scale.multiplyScalar(breath);
      for (const child of ribs.children) child.scale.divideScalar(breath);
    }
  }

  private updateWeather(dt: number, b: Blend): void {
    // Pluie
    const rainMat = this.rain.material as THREE.LineBasicMaterial;
    rainMat.opacity = b.rain * 0.55;
    this.rain.visible = b.rain > 0.01;
    if (this.rain.visible) {
      const speed = 3.5 + b.rain * 2.5;
      const p = this.rainPos;
      const n = p.length / 6;
      for (let i = 0; i < n; i++) {
        p[i * 6 + 1] -= speed * dt;
        p[i * 6 + 4] -= speed * dt;
        p[i * 6] -= dt * 0.25;
        p[i * 6 + 3] -= dt * 0.25;
        if (p[i * 6 + 4] < 0) this.resetDrop(i);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // Poussières et feuilles
    const amount = Math.max(b.pollen, b.wind);
    const mat = this.motes.material as THREE.PointsMaterial;
    mat.opacity = amount * 0.9;
    this.motes.visible = amount > 0.01;
    if (!this.motes.visible) return;
    const windShare = b.wind / (b.wind + b.pollen + 1e-6);
    mat.color.setRGB(1, 0.95 - windShare * 0.35, 0.69 - windShare * 0.35, THREE.SRGBColorSpace);
    mat.size = 0.06 + windShare * 0.03;
    const vx = 0.05 + windShare * 2.6;
    const vy = 0.12 - windShare * 0.2;
    const p = this.motePos;
    const n = p.length / 3;
    for (let i = 0; i < n; i++) {
      const s = this.moteSeed[i];
      p[i * 3] += (vx + Math.sin(this.time * 0.8 + s) * (0.08 + windShare * 0.6)) * dt;
      p[i * 3 + 1] += (vy + Math.cos(this.time * 1.1 + s) * (0.05 + windShare * 0.5)) * dt;
      if (p[i * 3] > 3.5) p[i * 3] = -3.5;
      if (p[i * 3 + 1] > 2.8) p[i * 3 + 1] = 0.05;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 2.7;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ toucher

  private onPointerDown = (e: PointerEvent): void => {
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.moved += Math.hypot(dx, dy);
    // Seuls les glissements horizontaux font tourner le renard ; le défilement vertical reste à la page.
    if (Math.abs(dx) > Math.abs(dy)) this.dragYaw = Math.max(-1.3, Math.min(1.3, this.dragYaw + dx * 0.01));
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    const isTap = this.pointer.moved < 10 && performance.now() - this.pointer.t < 500;
    this.pointer = null;
    if (isTap && e.type === 'pointerup') this.react();
  };
}
