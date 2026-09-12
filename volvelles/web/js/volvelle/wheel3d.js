// Procedural 3D volvelles: flat extruded discs with canvas-rendered glyph
// faces, stacked on a shared pivot.  The top disc rotates and is what the user
// drags; the bottom disc stays fixed.

import * as THREE from "../../vendor/three/three.module.min.js";
import {
  additionRotorItems, additionStatorItems, bRotorItems, bStatorItems,
  circlePoints, holeLoops, outlinePoints, renderFace,
} from "./face.js";

const D2R = Math.PI / 180;

function shapeFrom(loops, holes) {
  const shape = new THREE.Shape();
  loops.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  for (const hole of holes) {
    const path = new THREE.Path();
    hole.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

function faceGeometry(shape, extent) {
  const geometry = new THREE.ShapeGeometry(shape, 24);
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = (pos.getX(i) + extent) / (2 * extent);
    uv[2 * i + 1] = (pos.getY(i) + extent) / (2 * extent);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function texturedFace(shape, extent, canvas, z) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.32,
    roughness: 0.5,
    metalness: 0.25,
  });
  const mesh = new THREE.Mesh(faceGeometry(shape, extent), material);
  mesh.position.z = z;
  return mesh;
}

function bodyMesh(shape, thickness) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -thickness / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x0a0b0d,
    roughness: 0.72,
    metalness: 0.2,
  });
  return new THREE.Mesh(geometry, material);
}

function edgeLoop(points, z) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, y]) => new THREE.Vector3(x, y, z)),
  );
  const material = new THREE.LineBasicMaterial({ color: 0x8a6f34, transparent: true, opacity: 0.8 });
  return new THREE.LineLoop(geometry, material);
}

const BOARD = "#08090b";
const INK = "#e6b24c";

export class Volvelle3D {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.built = new Map();
    this.snap = true;
    this.onSettingChange = () => {};

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 20000);
    this.camera.up.set(0, 0, 1);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    this.ortho.up.set(0, 1, 0);
    this.activeCamera = this.camera;
    this.top = false;
    this.onTopChange = () => {};
    this.orthoZoom = 1;
    this.fitHalf = 1000;
    this._w = 1;
    this._h = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xfff4d6, 0x101018, 1.1));
    const key = new THREE.DirectionalLight(0xfff0cc, 1.5);
    key.position.set(-400, -300, 800);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
    rim.position.set(500, 400, 300);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.target = new THREE.Vector3(0, 0, 0);
    this.baseRadius = 1000;
    this.rig = { azimuth: -90, elevation: 34, radius: 1000 };
    this.drag = null;

    this._bindPointer();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();
    this._loop();
  }

  _resize() {
    const w = (this._w = this.container.clientWidth || 1);
    const h = (this._h = this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop = () => {
    this._updateCamera();
    this.renderer.render(this.scene, this.activeCamera);
    this._raf = requestAnimationFrame(this._loop);
  };

  _updateCamera() {
    if (this.top) {
      const aspect = this._w / this._h;
      const halfH = this.fitHalf / this.orthoZoom;
      const halfW = halfH * aspect;
      Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      this.ortho.updateProjectionMatrix();
      this.ortho.position.set(this.target.x, this.target.y, this.target.z + this.baseRadius * 4);
      this.ortho.up.set(0, 1, 0);
      this.ortho.lookAt(this.target);
      this.activeCamera = this.ortho;
      return;
    }
    const { azimuth, elevation, radius } = this.rig;
    const phi = elevation * D2R;
    const theta = azimuth * D2R;
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.cos(theta),
      this.target.y + radius * Math.sin(phi) * Math.sin(theta),
      this.target.z + radius * Math.cos(phi),
    );
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.activeCamera = this.camera;
  }

  // Fusion-360-style "Top" view: straight down the Z axis, north (+Y) up,
  // orthographic so there is no perspective or isometric distortion.
  setTop(on) {
    const next = !!on;
    if (next === this.top) return this.top;
    this.top = next;
    if (this.top) this.orthoZoom = 1;
    this.onTopChange(this.top);
    return this.top;
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      if (e.button === 0 && this.active) {
        this.drag = { mode: "spin", x: e.clientX, spin: this.spin };
      } else {
        if (this.top) {
          this.top = false;
          this.onTopChange(false);
        }
        this.drag = { mode: "orbit", x: e.clientX, y: e.clientY, ...this.rig };
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      if (this.drag.mode === "spin") {
        const dx = e.clientX - this.drag.x;
        this._applySpin(this.drag.spin + (dx / el.clientWidth) * Math.PI * 1.5);
        this._emitSetting(false);
      } else {
        this.rig.azimuth = this.drag.azimuth - (e.clientX - this.drag.x) * 0.4;
        this.rig.elevation = Math.max(2, Math.min(88, this.drag.elevation + (e.clientY - this.drag.y) * 0.3));
      }
    });
    const end = () => {
      if (!this.drag) return;
      if (this.drag.mode === "spin" && this.snap) this._snap();
      this.drag = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.top) {
          this.orthoZoom = Math.max(0.4, Math.min(5, this.orthoZoom * (1 - Math.sign(e.deltaY) * 0.1)));
          return;
        }
        this.rig.radius = Math.max(this.baseRadius * 0.45, Math.min(this.baseRadius * 2.2, this.rig.radius * (1 + Math.sign(e.deltaY) * 0.08)));
      },
      { passive: false },
    );
  }

  // The bottom disc carries the data; the top disc (windows, grip, tab) stays
  // put.  Spin is the logical setting angle; the bottom turns by -spin so the
  // glyphs move the way a fixed window would scroll them.
  get spin() {
    return this.active ? -this.active.userData.stator.rotation.z : 0;
  }

  _applySpin(angle) {
    if (this.active) this.active.userData.stator.rotation.z = -angle;
  }

  _snap() {
    const step = this.instrument.stepAngle * D2R;
    this.setSetting(Math.round(this.spin / step));
  }

  _emitSetting(snapped) {
    const inst = this.instrument;
    const raw = this.spin / (inst.stepAngle * D2R);
    const index = ((Math.round(raw) % inst.steps) + inst.steps) % inst.steps;
    this.onSettingChange({ index, exact: snapped === true });
  }

  show(name) {
    if (!this.built.has(name)) this.built.set(name, this._build(name));
    for (const [, group] of this.built) group.visible = false;
    const group = this.built.get(name);
    group.visible = true;
    this.active = group;
    this.instrument = group.userData.instrument;
    this.target = group.userData.target;
    this.baseRadius = group.userData.radius;
    this.rig.radius = this.baseRadius;
    this.rig.elevation = group.userData.elevation;
    const gAdd = this.data.geometry.addition;
    const B = this.data.geometry.familyB;
    this.fitHalf = name === "addition" ? gAdd.handleR * 1.12 : B.tabTop * 1.18;
    this.setSetting(0);
  }

  _faceConfig(name) {
    const data = this.data;
    const gAdd = data.geometry.addition;
    const B = data.geometry.familyB;
    if (name === "addition") {
      return {
        stator: {
          shape: ["circle", gAdd.statorEdgeR],
          items: additionStatorItems(data),
          extent: gAdd.statorEdgeR * 1.12,
          size: 3072,
        },
        rotor: {
          shape: ["addition_rotor"],
          items: additionRotorItems(data),
          extent: gAdd.handleR * 1.1,
          size: 2560,
        },
        thickness: gAdd.statorEdgeR * 0.045,
        gap: 1.8,
        steps: 32,
        stepAngle: gAdd.rimStep,
        radius: gAdd.handleR * 2.4,
        elevation: 30,
      };
    }
    const ir = data.familyB[name].innerRadius;
    return {
      stator: {
        shape: ["circle", B.radius],
        items: bStatorItems(data, data.familyB[name]),
        extent: B.radius * 1.15,
        size: 2048,
      },
      rotor: {
        shape: ["b_rotor", ir],
        items: bRotorItems(data, name),
        extent: B.tabTop * 1.12,
        size: 2048,
      },
      thickness: B.radius * 0.06,
      gap: 1.8,
      steps: 31,
      stepAngle: B.step,
      radius: B.radius * 3.1,
      elevation: 32,
    };
  }

  _build(name) {
    const cfg = this._faceConfig(name);
    const group = new THREE.Group();
    group.visible = false;

    const statorPts = cfg.stator.shape[0] === "circle"
      ? circlePoints(cfg.stator.shape[1], 128)
      : outlinePoints(cfg.stator.shape, this.data);
    const statorShape = shapeFrom(statorPts,
      holeLoops(cfg.stator.items, { pivotR: this._pivotR(), includeWindows: false }));
    const stator = new THREE.Group();
    stator.add(bodyMesh(statorShape, cfg.thickness));
    stator.add(texturedFace(statorShape, cfg.stator.extent, renderFace(cfg.stator.items, {
      extent: cfg.stator.extent, size: cfg.stator.size, ink: INK, board: BOARD,
    }), cfg.thickness / 2 + cfg.thickness * 0.02));
    stator.add(edgeLoop(statorPts, cfg.thickness / 2 + cfg.thickness * 0.03));
    group.add(stator);

    const rotorPts = outlinePoints(cfg.rotor.shape, this.data);
    const rotorShape = shapeFrom(rotorPts,
      holeLoops(cfg.rotor.items, { pivotR: this._pivotR(), includeWindows: true }));
    const rotor = new THREE.Group();
    rotor.position.z = cfg.thickness + cfg.gap;
    rotor.add(bodyMesh(rotorShape, cfg.thickness));
    rotor.add(texturedFace(rotorShape, cfg.rotor.extent, renderFace(cfg.rotor.items, {
      extent: cfg.rotor.extent, size: cfg.rotor.size, ink: INK, board: BOARD,
    }), cfg.thickness / 2 + cfg.thickness * 0.02));
    rotor.add(edgeLoop(rotorPts, cfg.thickness / 2 + cfg.thickness * 0.03));
    group.add(rotor);

    this.root.add(group);
    group.userData = {
      instrument: { name, ...cfg },
      stator,
      rotor,
      target: new THREE.Vector3(0, 0, 0),
      radius: cfg.radius,
      elevation: cfg.elevation,
    };
    return group;
  }

  _pivotR() {
    return (this.data.geometry.addition.statorEdgeR * 0.012);
  }

  setSetting(index) {
    const inst = this.instrument;
    const i = ((index % inst.steps) + inst.steps) % inst.steps;
    this._applySpin(i * inst.stepAngle * D2R);
    this.onSettingChange({ index: i, exact: true });
  }

  setSnap(on) {
    this.snap = on;
    if (on) this._snap();
  }

  addHighlight(local, color = 0xffd479, r = 10) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.72, r, 40),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.position.set(local[0], local[1], 0.4);
    return ring;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
