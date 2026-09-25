import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { DEFAULT_MANNEQUIN_URL, getMannequinModelSource, loadMannequinModel, prepareMannequinModel, type PreparedMannequin } from "@/lib/mannequin-model";
import { garmentTypeOf, type Product } from "@/data/catalog";

import type { Body } from "@/lib/sizing";

type Garment = "basico" | "camisa" | "blazer" | "vestido" | "calca" | "saia" | "camiseta";
type Accessory = "nenhum" | "oculos" | "bolsa";
type CameraAction = "front" | "back" | "left" | "right" | "zoomIn" | "zoomOut" | "reset";

const GARMENTS: { value: Garment; label: string; color: string }[] = [
  { value: "basico", label: "Manequim", color: "#D2D3D6" },
  { value: "camisa", label: "Camisa", color: "#9BAA8E" },
  { value: "blazer", label: "Blazer", color: "#414246" },
  { value: "vestido", label: "Vestido", color: "#B4614A" },
  { value: "calca", label: "Calça", color: "#5B6572" },
  { value: "saia", label: "Saia", color: "#B68588" },
  { value: "camiseta", label: "Camiseta", color: "#E7DED0" },
];

function productGarment(product: Product): Garment {
  switch (garmentTypeOf(product)) {
    case "top": return /blazer|jaqueta/i.test(product.name) ? "blazer" : /camisa/i.test(product.name) ? "camisa" : "camiseta";
    case "pants": return "calca";
    case "skirt": return "saia";
    case "dress": return "vestido";
  }
}

const ACCESSORIES: { value: Accessory; label: string }[] = [
  { value: "nenhum", label: "Sem acessório" },
  { value: "oculos", label: "Óculos" },
  { value: "bolsa", label: "Bolsa" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function disposeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => materials.add(material));
    } else if (mesh.material) {
      materials.add(mesh.material);
    }
  });
  materials.forEach((material) => material.dispose());
}

function createBodyGeometry(body: Body) {
  const height = clamp(body.heightCm / 100, 1.3, 2.15);
  const chest = clamp(body.chestCm / 100, 0.65, 1.5);
  const waist = clamp(body.waistCm / 100, 0.55, 1.5);
  const hips = clamp(body.hipsCm / 100, 0.65, 1.6);
  const legHeight = clamp(body.inseamCm / 100, 0.55, height * 0.58);
  const torsoHeight = Math.max(0.58, height - legHeight - 0.24);
  const hipY = legHeight;
  const waistY = hipY + torsoHeight * 0.45;
  const chestY = hipY + torsoHeight * 0.8;
  const shoulderY = hipY + torsoHeight;

  const points = [
    new THREE.Vector2(hips * 0.19, hipY),
    new THREE.Vector2(hips * 0.22, hipY + torsoHeight * 0.08),
    new THREE.Vector2(waist * 0.17, waistY),
    new THREE.Vector2(chest * 0.205, chestY),
    new THREE.Vector2(chest * 0.22, shoulderY),
    new THREE.Vector2(chest * 0.15, shoulderY + 0.04),
  ];

  return {
    geometry: new THREE.LatheGeometry(points, 64),
    height,
    chest,
    waist,
    hips,
    legHeight,
    torsoHeight,
    shoulderY,
  };
}

function addCapsule(
  group: THREE.Group,
  material: THREE.Material,
  radius: number,
  length: number,
  position: THREE.Vector3,
  radialSegments = 16,
) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.05, length), 8, radialSegments),
    material,
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addJoint(
  group: THREE.Group,
  material: THREE.Material,
  radius: number,
  position: THREE.Vector3,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function fittedLathe(
  group: THREE.Group,
  material: THREE.Material,
  points: THREE.Vector2[],
  depthScale = 0.72,
) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 96), material);
  mesh.scale.z = depthScale;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function fittedSleeve(
  group: THREE.Group,
  material: THREE.Material,
  side: -1 | 1,
  shoulderX: number,
  shoulderY: number,
  length: number,
  radius: number,
) {
  const elbow = length * 0.5;
  const outward = side * Math.max(0.018, length * 0.045);
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * shoulderX, shoulderY, 0),
    new THREE.Vector3(side * shoulderX + outward * 0.75, shoulderY - elbow, 0.006),
    new THREE.Vector3(side * shoulderX + outward, shoulderY - length, 0.012),
  ]);
  const sleeve = new THREE.Mesh(new THREE.TubeGeometry(path, 40, radius, 20, false), material);
  sleeve.scale.z = 0.88;
  sleeve.castShadow = true;
  sleeve.receiveShadow = true;
  group.add(sleeve);
  return sleeve;
}

function curvedLapel(
  group: THREE.Group,
  material: THREE.Material,
  side: -1 | 1,
  chest: number,
  shoulderY: number,
  torsoHeight: number,
) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * chest * 0.055, shoulderY - torsoHeight * 0.03, chest * 0.205),
    new THREE.Vector3(side * chest * 0.105, shoulderY - torsoHeight * 0.17, chest * 0.218),
    new THREE.Vector3(side * chest * 0.035, shoulderY - torsoHeight * 0.38, chest * 0.205),
  ]);
  const lapel = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, Math.max(0.009, chest * 0.012), 12, false), material);
  lapel.castShadow = true;
  group.add(lapel);
}

export function Mannequin3D({ body, audience = "feminino", product }: { body: Body; audience?: "feminino" | "masculino"; product?: Product }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraActionRef = useRef<((action: CameraAction) => void) | null>(null);
  const productColorRef = useRef(product?.colorHex);
  const bodyRef = useRef(body);
  const audienceRef = useRef(audience);
  const rebuildRef = useRef<(() => void) | null>(null);
  const styleRef = useRef({ garment: "basico" as Garment, accessory: "nenhum" as Accessory });
  const [garment, setGarment] = useState<Garment>(() => {
    if (typeof window === "undefined") return "basico";
    const value = new URLSearchParams(window.location.search).get("garment");
    return GARMENTS.some((item) => item.value === value) ? (value as Garment) : "basico";
  });
  const [accessory, setAccessory] = useState<Accessory>(() => {
    if (typeof window === "undefined") return "nenhum";
    const value = new URLSearchParams(window.location.search).get("accessory");
    return ACCESSORIES.some((item) => item.value === value) ? (value as Accessory) : "nenhum";
  });
  const [shared, setShared] = useState(false);
  const [externalModelLoaded, setExternalModelLoaded] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const activeGarment = product ? productGarment(product) : garment;

  bodyRef.current = body;
  audienceRef.current = audience;
  productColorRef.current = product?.colorHex;
  styleRef.current = { garment: activeGarment, accessory: product ? "nenhum" : accessory };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f5f7);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
    camera.position.set(0, 0.92, 4.35);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.panSpeed = 0.55;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 1.75;
    controls.maxDistance = 4.8;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.target.set(0, 0.95, 0);
    controls.autoRotate = false;
    controls.update();
    let frame = 0;
    let stopped = false;
    const requestRender = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(render);
    };
    const render = () => {
      frame = 0;
      if (stopped) return;
      const moving = controls.update();
      renderer.render(scene, camera);
      if (moving) requestRender();
    };
    controls.addEventListener("change", requestRender);
    cameraActionRef.current = (action) => {
      const target = controls.target;
      const offset = camera.position.clone().sub(target);
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
      if (action === "zoomIn" || action === "zoomOut") {
        offset.setLength(THREE.MathUtils.clamp(distance * (action === "zoomIn" ? 0.72 : 1.38), controls.minDistance, controls.maxDistance));
        camera.position.copy(target).add(offset);
      } else {
        const nextDistance = action === "reset" ? 4.35 : distance;
        const direction = action === "back" ? new THREE.Vector3(0, 0, -1)
          : action === "left" ? new THREE.Vector3(-1, 0, 0)
          : action === "right" ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 0, 1);
        camera.position.copy(target).addScaledVector(direction, nextDistance);
      }
      controls.update();
      requestRender();
    };

    scene.add(new THREE.HemisphereLight(0xfff8ef, 0x51483f, 2.1));

    const key = new THREE.DirectionalLight(0xfff7eb, 3.2);
    key.position.set(2.8, 4.2, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 8;
    key.shadow.camera.left = -2.5;
    key.shadow.camera.right = 2.5;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -1;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd9e6ff, 1.1);
    fill.position.set(-3, 2.5, 2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd8bc, 1.8);
    rim.position.set(-2.2, 2.8, -3);
    scene.add(rim);

    const mannequin = new THREE.Group();
    mannequin.rotation.y = -0.14;
    scene.add(mannequin);

    const externalModelGroup = new THREE.Group();
    externalModelGroup.visible = false;
    mannequin.add(externalModelGroup);
    let externalModel: THREE.Object3D | null = null;
    let externalModelLoaded = false;
    let preparedExternal: PreparedMannequin | null = null;
    const modelSource = getMannequinModelSource();

    const skin = new THREE.MeshPhysicalMaterial({
      color: 0xd2d3d6,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
      sheen: 0.12,
    });

    const hairMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3a2b25,
      roughness: 0.72,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
    });

    const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), skin);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;

    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skin);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), skin);
    [pelvis, head, neck].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    mannequin.add(bodyMesh, pelvis, head, neck);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMaterial);
    hair.scale.set(1, 0.78, 1);
    hair.castShadow = true;
    hair.visible = false;
    mannequin.add(hair);

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftForearm = new THREE.Group();
    const rightForearm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const clothing = new THREE.Group();
    const accessories = new THREE.Group();
    mannequin.add(leftArm, rightArm, leftForearm, rightForearm, leftLeg, rightLeg, clothing, accessories);

    const leftKnee = addJoint(mannequin, skin, 0.09, new THREE.Vector3());
    const rightKnee = addJoint(mannequin, skin, 0.09, new THREE.Vector3());

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e6e9, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.35, 64), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 64),
      new THREE.MeshBasicMaterial({ color: 0x5c5149, transparent: true, opacity: 0.1 }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.015;
    scene.add(shadowDisc);

    const clearGroup = (group: THREE.Group) => {
      const materials = new Set<THREE.Material>();
      group.children.forEach((child) => {
        child.traverse((descendant) => {
          const mesh = descendant as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => materials.add(material));
          else if (mesh.material) materials.add(mesh.material);
        });
      });
      group.clear();
      materials.forEach((material) => { if (material !== skin && material !== hairMaterial) material.dispose(); });
    };

    const buildFittedAccessories = (height: number) => {
      clearGroup(accessories);
      accessories.scale.setScalar(height / 1.667);
      if (styleRef.current.accessory === "oculos") {
        const frame = new THREE.MeshStandardMaterial({ color: 0x262729, metalness: 0.25, roughness: 0.42 });
        for (const side of [-1, 1]) {
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0032, 10, 48), frame);
          rim.scale.y = 0.72;
          rim.position.set(side * 0.043, 1.532, 0.209);
          accessories.add(rim);
          const temple = new THREE.Mesh(new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(side * 0.077, 1.534, 0.206),
              new THREE.Vector3(side * 0.103, 1.529, 0.166),
              new THREE.Vector3(side * 0.107, 1.52, 0.115),
            ]), 12, 0.0025, 6, false,
          ), frame);
          accessories.add(temple);
        }
        const bridge = new THREE.Mesh(new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.007, 1.54, 0.213),
            new THREE.Vector3(0, 1.548, 0.218),
            new THREE.Vector3(0.007, 1.54, 0.213),
          ]), 8, 0.0028, 6, false,
        ), frame);
        accessories.add(bridge);
      }
      if (styleRef.current.accessory === "bolsa") {
        const leather = new THREE.MeshPhysicalMaterial({ color: 0x684534, roughness: 0.74 });
        const outline = new THREE.Shape();
        outline.moveTo(-0.085, -0.095);
        outline.lineTo(0.085, -0.095);
        outline.quadraticCurveTo(0.105, -0.09, 0.105, -0.06);
        outline.lineTo(0.085, 0.086);
        outline.quadraticCurveTo(0.08, 0.10, 0.055, 0.10);
        outline.lineTo(-0.055, 0.10);
        outline.quadraticCurveTo(-0.08, 0.10, -0.085, 0.086);
        outline.lineTo(-0.105, -0.06);
        outline.quadraticCurveTo(-0.105, -0.09, -0.085, -0.095);
        const bag = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
          depth: 0.055, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 3,
        }), leather);
        bag.position.set(0.44, 0.64, 0.01);
        bag.castShadow = true;
        accessories.add(bag);
        const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.385, 0.74, 0.048),
          new THREE.Vector3(0.38, 0.81, 0.048),
          new THREE.Vector3(0.44, 0.83, 0.048),
          new THREE.Vector3(0.50, 0.81, 0.048),
          new THREE.Vector3(0.495, 0.74, 0.048),
        ]), 32, 0.007, 8, false), leather);
        accessories.add(handle);
      }
    };

    const buildClothing = (model: ReturnType<typeof createBodyGeometry>, prepared?: PreparedMannequin | null) => {
      clearGroup(clothing);
      clearGroup(accessories);

      // The garment frame always mirrors the loaded GLB root exactly. Geometry
      // is authored in metres, then converted into that shared source frame.
      clothing.position.set(0, 0, 0);
      clothing.scale.setScalar(1);
      clothing.rotation.set(0, 0, 0);

      const garmentConfig = GARMENTS.find((item) => item.value === styleRef.current.garment) ?? GARMENTS[0]!;
      const fabric = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(productColorRef.current ?? garmentConfig.color),
        roughness: styleRef.current.garment === "blazer" ? 0.86 : 0.7,
        clearcoat: styleRef.current.garment === "blazer" ? 0.03 : 0.12,
      });

      const selected = styleRef.current.garment;
      const dress = selected === "vestido";
      const waistY = model.legHeight + model.torsoHeight * 0.43;
      const hipRadius = Math.max(model.hips * 0.245, 0.215);
      const waistRadius = Math.max(model.waist * 0.218, 0.185);
      const chestRadius = Math.max(model.chest * 0.252, 0.215);
      const shoulderRadius = Math.max(bodyRef.current.shoulderCm / 200 + 0.018, chestRadius * 0.94);
      const ease = selected === "blazer" ? 1.08 : selected === "camisa" ? 1.055 : 1.025;
      const torsoBottom = selected === "blazer" || selected === "camisa"
        ? model.legHeight - model.torsoHeight * 0.045
        : model.legHeight + model.torsoHeight * 0.06;

      if (prepared && externalModel && selected !== "basico") {
        const parent = clothing.parent ?? clothing;
        clothing.add(buildFittedGarment(externalModel, parent, selected, fabric));
        prepared = null;
      } else if (selected === "camisa" || selected === "blazer" || selected === "camiseta" || dress) {
        fittedLathe(clothing, fabric, [
          new THREE.Vector2(hipRadius * ease, torsoBottom),
          new THREE.Vector2(hipRadius * ease * 1.015, model.legHeight + model.torsoHeight * 0.10),
          new THREE.Vector2(waistRadius * ease, waistY),
          new THREE.Vector2(chestRadius * ease, model.legHeight + model.torsoHeight * 0.72),
          new THREE.Vector2(shoulderRadius * ease, model.shoulderY - model.torsoHeight * 0.055),
          new THREE.Vector2(chestRadius * 0.63, model.shoulderY + 0.012),
        ], selected === "blazer" ? 0.76 : 0.71);
      }

      if (dress) {
        const hemY = Math.max(model.legHeight * 0.48, 0.41);
        // The skirt starts under the bodice and flows to mid-calf; a continuous
        // outer surface hides the underlying legs and waist from every angle.
        fittedLathe(clothing, fabric, [
          new THREE.Vector2(model.hips * 0.40, hemY),
          new THREE.Vector2(model.hips * 0.38, hemY + 0.045),
          new THREE.Vector2(model.hips * 0.32, model.legHeight * 0.76),
          new THREE.Vector2(hipRadius * 1.04, model.legHeight + 0.02),
          new THREE.Vector2(waistRadius * 1.03, waistY + 0.025),
        ], 0.76);
        for (const side of [-1, 1] as const) fittedSleeve(
          clothing, fabric, side, shoulderRadius * 0.95, model.shoulderY - 0.015,
          model.height * 0.16, Math.max(model.chest * 0.075, 0.065),
        );
      }

      if (selected === "saia") {
        fittedLathe(clothing, fabric, [
          new THREE.Vector2(model.hips * 0.38, model.legHeight * 0.56),
          new THREE.Vector2(model.hips * 0.365, model.legHeight * 0.60),
          new THREE.Vector2(model.hips * 0.31, model.legHeight * 0.78),
          new THREE.Vector2(hipRadius * 1.04, model.legHeight + 0.015),
          new THREE.Vector2(waistRadius * 1.035, waistY + 0.018),
        ], 0.76);
      }

      if (selected === "calca") {
        fittedLathe(clothing, fabric, [
          new THREE.Vector2(model.hips * 0.19, model.legHeight * 0.78),
          new THREE.Vector2(hipRadius * 1.03, model.legHeight + 0.01),
          new THREE.Vector2(waistRadius * 1.035, waistY + 0.018),
        ], 0.76);
        const legOffset = Math.max(model.hips * 0.105, 0.074);
        for (const side of [-1, 1] as const) {
          const leg = fittedLathe(clothing, fabric, [
            new THREE.Vector2(model.hips * 0.088, 0.035),
            new THREE.Vector2(model.hips * 0.095, model.legHeight * 0.35),
            new THREE.Vector2(model.hips * 0.108, model.legHeight * 0.72),
            new THREE.Vector2(model.hips * 0.12, model.legHeight * 0.82),
          ], 0.78);
          leg.position.x = side * legOffset;
        }
      }

      if (selected === "camisa" || selected === "blazer" || selected === "camiseta") {
        if (selected !== "camiseta") {
          const lapelMaterial = new THREE.MeshPhysicalMaterial({
            color: selected === "blazer" ? 0x2e3033 : 0xd8d5c8,
            roughness: 0.78,
          });
          for (const side of [-1, 1] as const) curvedLapel(clothing, lapelMaterial, side, model.chest, model.shoulderY, model.torsoHeight);
        }
        const sleeveLength = selected === "camiseta" ? model.height * 0.12 : model.height * 0.32;
        for (const side of [-1, 1] as const) fittedSleeve(
          clothing, fabric, side, shoulderRadius * 0.96, model.shoulderY - 0.012,
          sleeveLength, Math.max(model.chest * (selected === "blazer" ? 0.078 : 0.073), 0.062),
        );
      }

      if (selected === "basico") fabric.dispose();

      if (prepared) {
        const inverseScale = 1 / prepared.scale;
        clothing.position.copy(prepared.position);
        clothing.scale.setScalar(prepared.scale);
        clothing.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.scale(inverseScale, inverseScale, inverseScale);
          mesh.position.set(
            prepared.sourceCenter.x + mesh.position.x * inverseScale,
            prepared.sourceBounds.min.y + mesh.position.y * inverseScale,
            prepared.sourceCenter.z + mesh.position.z * inverseScale,
          );
        });
      }

      if (styleRef.current.accessory === "oculos") {
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: 0.3, metalness: 0.45 });
        for (const side of [-1, 1]) {
          const lens = new THREE.Mesh(new THREE.TorusGeometry(model.height * 0.035, model.height * 0.008, 12, 32), frameMaterial);
          lens.position.set(side * model.height * 0.036, model.height * 0.966, model.height * 0.065);
          lens.scale.set(1, 0.72, 0.35);
          accessories.add(lens);
        }
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(model.height * 0.025, model.height * 0.008, model.height * 0.01), frameMaterial);
        bridge.position.set(0, model.height * 0.966, model.height * 0.067);
        accessories.add(bridge);
      }

      if (styleRef.current.accessory === "bolsa") {
        const bagMaterial = new THREE.MeshPhysicalMaterial({ color: 0x6b4634, roughness: 0.5, clearcoat: 0.12 });
        const bag = new THREE.Mesh(new THREE.BoxGeometry(model.height * 0.12, model.height * 0.16, model.height * 0.05), bagMaterial);
        bag.position.set(model.chest * 0.24, model.legHeight + model.torsoHeight * 0.34, model.chest * 0.14);
        bag.rotation.z = -0.12;
        bag.castShadow = true;
        accessories.add(bag);

        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(model.height * 0.11, model.height * 0.008, 10, 48, Math.PI),
          bagMaterial,
        );
        strap.rotation.x = Math.PI / 2;
        strap.rotation.z = Math.PI * 0.5;
        strap.position.set(model.chest * 0.08, model.legHeight + model.torsoHeight * 0.56, model.chest * 0.09);
        accessories.add(strap);
      }
    };

    const frameCamera = (height: number) => {
      const previous = controls.target.clone();
      const offset = camera.position.clone().sub(previous);
      const nextY = height * 0.53;
      const ratio = THREE.MathUtils.clamp(height / Math.max(previous.y * 1.9, 0.1), 0.7, 1.3);
      controls.target.set(0, nextY, 0);
      camera.position.copy(controls.target).add(offset.multiplyScalar(ratio));
      controls.update();
      ground.scale.setScalar(Math.max(0.9, height * 0.62));
      shadowDisc.scale.setScalar(Math.max(0.65, height * 0.38));
    };

    const rebuild = () => {
      const current = bodyRef.current;

      if (externalModel && externalModelLoaded) {
        preparedExternal = prepareMannequinModel(externalModel, current, audienceRef.current);
        const garmentModel = createBodyGeometry(current);
        buildClothing(garmentModel, preparedExternal);
        garmentModel.geometry.dispose();
        clothing.visible = true;
        accessories.visible = true;
        frameCamera(current.heightCm / 100);
        return;
      }

      const model = createBodyGeometry(current);
      preparedExternal = null;

      bodyMesh.geometry.dispose();
      bodyMesh.geometry = model.geometry;

      const height = model.height;
      const shoulder = clamp(current.shoulderCm / 100, 0.3, 0.6);
      const armLength = clamp(height * 0.28, 0.38, 0.62);
      const legLength = model.legHeight;
      const thighLength = Math.max(0.28, legLength * 0.52);
      const shinLength = Math.max(0.24, legLength * 0.44);
      const legRadius = clamp((current.hipsCm / 100) * 0.095, 0.055, 0.095);
      const armRadius = clamp((current.chestCm / 100) * 0.052, 0.035, 0.075);

      pelvis.scale.set(
        clamp(model.hips * 0.31, 0.22, 0.5),
        clamp(model.torsoHeight * 0.18, 0.12, 0.22),
        clamp(model.hips * 0.2, 0.14, 0.32),
      );
      pelvis.position.set(0, model.legHeight + model.torsoHeight * 0.02, 0);

      head.scale.set(height * 0.075, height * 0.09, height * 0.075);
      head.position.set(0, height * 0.955, 0.01);
      hair.scale.set(height * 0.079, height * 0.064, height * 0.079);
      hair.position.set(0, height * 0.99, -0.005);

      neck.scale.set(height * 0.045, height * 0.07, height * 0.045);
      neck.position.set(0, height * 0.89, 0);

      clearGroup(leftArm);
      clearGroup(rightArm);
      clearGroup(leftForearm);
      clearGroup(rightForearm);
      clearGroup(leftLeg);
      clearGroup(rightLeg);

      const shoulderX = shoulder * 0.5;
      const armY = model.shoulderY - 0.015;
      const armTilt = 0.16;

      for (const [side, group, forearm] of [
        [-1, leftArm, leftForearm],
        [1, rightArm, rightForearm],
      ] as const) {
        const upper = addCapsule(group, skin, armRadius, armLength * 0.48, new THREE.Vector3(0, -armLength * 0.24, 0), 20);
        upper.rotation.z = side * -armTilt;
        group.position.set(side * shoulderX, armY, 0);

        const elbowX = side * (shoulderX + Math.sin(armTilt) * armLength * 0.42);
        const elbowY = armY - Math.cos(armTilt) * armLength * 0.42;

        const lower = addCapsule(forearm, skin, armRadius * 0.88, armLength * 0.42, new THREE.Vector3(0, -armLength * 0.22, 0), 20);
        lower.rotation.z = side * -0.11;
        forearm.position.set(elbowX, elbowY, 0.01);
      }

      const hipOffset = clamp(model.hips * 0.105, 0.07, 0.15);
      for (const [side, group, knee] of [
        [-1, leftLeg, leftKnee],
        [1, rightLeg, rightKnee],
      ] as const) {
        const thigh = addCapsule(group, skin, legRadius, thighLength, new THREE.Vector3(0, -thighLength * 0.48, 0), 20);
        thigh.scale.x = 1.05;
        group.position.set(side * hipOffset, model.legHeight, 0);

        const kneeY = model.legHeight - thighLength;
        knee.position.set(side * hipOffset, kneeY, 0);

        const shin = addCapsule(group, skin, legRadius * 0.86, shinLength, new THREE.Vector3(0, -thighLength - shinLength * 0.45, 0), 20);
        shin.scale.x = 0.92;
      }

      buildClothing(model, null);

      frameCamera(height);
    };

    rebuildRef.current = rebuild;
    rebuild();

    if (modelSource) {
      void loadMannequinModel(modelSource)
        .then((loadedModel) => {
          if (stopped) {
            disposeObject(loadedModel);
            return;
          }

          externalModel = loadedModel;
          if (modelSource === DEFAULT_MANNEQUIN_URL) {
            const fittedBody = loadedModel.getObjectByName("Body") as THREE.Mesh | undefined;
            if (fittedBody?.isMesh) fittedBody.material = skin.clone();
          }
          externalModelGroup.add(loadedModel);
          externalModelLoaded = true;
          externalModelGroup.visible = true;

          bodyMesh.visible = false;
          pelvis.visible = false;
          head.visible = false;
          neck.visible = false;
          hair.visible = false;
          leftArm.visible = false;
          rightArm.visible = false;
          leftForearm.visible = false;
          rightForearm.visible = false;
          leftLeg.visible = false;
          rightLeg.visible = false;
          leftKnee.visible = false;
          rightKnee.visible = false;
          rebuild();
          setExternalModelLoaded(true);
        })
        .catch((error) => {
          console.warn("Não foi possível carregar o modelo 3D externo; usando o manequim de fallback.", error);
        });
    }

    const resize = () => {
      const width = canvas.clientWidth || 360;
      const height = canvas.clientHeight || 520;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      rebuildRef.current = null;
      cameraActionRef.current = null;
      clearGroup(clothing);
      clearGroup(accessories);
      disposeObject(mannequin);
      ground.geometry.dispose();
      ground.material.dispose();
      shadowDisc.geometry.dispose();
      shadowDisc.material.dispose();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    bodyRef.current = body;
    rebuildRef.current?.();
  }, [body]);

  useEffect(() => {
    rebuildRef.current?.();
  }, [activeGarment, accessory, product?.colorHex]);

  useEffect(() => {
    audienceRef.current = audience;
    rebuildRef.current?.();
  }, [audience]);

  const share = async () => {
    const shareData = {
      title: "Meu visual no Provador Virtual",
      text: "Confira meu visual personalizado no Provador Virtual.",
      url: (() => {
        const url = new URL(window.location.href);
        url.searchParams.set("garment", garment);
        url.searchParams.set("accessory", accessory);
        return url.toString();
      })(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      // User closed the native share sheet; no error state is needed.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#f4f5f7]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Visualização 3D
          </p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            {product ? `Visualização ilustrativa · ${product.name}` : externalModelLoaded ? "Corpo anatômico 3D ajustado às suas medidas" : "Visual 3D proporcional às suas medidas"}
          </p>
        </div>
        <span className="rounded-full border border-line bg-background/70 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          {product ? "giro 360°" : externalModelLoaded ? "modelo 3D" : "fallback"}
        </span>
      </div>

      <div className="relative">
        {webglError ? <div className="flex h-[430px] items-center justify-center p-6 text-center text-sm text-muted-foreground sm:h-[520px]">O 3D não está disponível neste navegador. Use a prova na foto e as imagens da peça.</div> : <canvas
          ref={canvasRef}
          className="block h-[430px] w-full touch-none sm:h-[520px]"
          aria-label="Manequim 3D rotativo baseado nas medidas informadas"
        />}
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-background/75 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground shadow-sm backdrop-blur-sm">
          Arraste para girar · pinça/roda para zoom · dois dedos para mover
        </div>
      </div>

      {!webglError ? <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-background/80 p-3" role="group" aria-label="Controles do manequim 3D">
        {([ ["front", "Frente"], ["back", "Costas"], ["left", "Lado esquerdo"], ["right", "Lado direito"], ["zoomIn", "Aproximar +"], ["zoomOut", "Afastar −"], ["reset", "Recentrar"] ] as const).map(([action, label]) => (
          <button key={action} type="button" onClick={() => cameraActionRef.current?.(action)} className="rounded-full border border-line bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary">{label}</button>
        ))}
      </div> : null}

      {!product ? <div className="grid gap-3 border-t border-line bg-background/80 p-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Roupa</p>
          <div className="flex flex-wrap gap-1.5">
            {GARMENTS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={garment === item.value}
                onClick={() => setGarment(item.value)}
                className={`rounded-full border px-2.5 py-1.5 text-xs transition ${garment === item.value ? "border-primary bg-primary text-primary-foreground" : "border-line bg-background text-secondary-foreground hover:bg-secondary"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Acessório</p>
          <div className="flex flex-wrap gap-1.5">
            {ACCESSORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={accessory === item.value}
                onClick={() => setAccessory(item.value)}
                className={`rounded-full border px-2.5 py-1.5 text-xs transition ${accessory === item.value ? "border-primary bg-primary text-primary-foreground" : "border-line bg-background text-secondary-foreground hover:bg-secondary"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void share()}
          className="sm:col-span-2 inline-flex items-center justify-center rounded-lg border border-line bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
        >
          {shared ? "Link copiado para compartilhar" : "Compartilhar resultado"}
        </button>
        <p className="sm:col-span-2 text-[11px] leading-relaxed text-muted-foreground">
          Prévia de cor sobre o corpo. O tecido, o caimento e o tamanho da peça real dependem do modelo 3D do produto.
        </p>
      </div> : <p className="border-t border-line bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">Manequim proporcional às medidas, com a cor aproximada da peça. O tecido e a modelagem reais aparecem nas fotos do produto; esta representação 3D não é uma digitalização da roupa.</p>}

      <div className="grid grid-cols-3 border-t border-line bg-background/60 text-center text-[11px] text-muted-foreground">
        <span className="border-r border-line px-2 py-2">altura {body.heightCm} cm</span>
        <span className="border-r border-line px-2 py-2">busto {body.chestCm} cm</span>
        <span className="px-2 py-2">quadril {body.hipsCm} cm</span>
      </div>
    </div>
  );
}
