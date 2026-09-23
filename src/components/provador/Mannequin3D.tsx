import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Body } from "@/lib/sizing";

type Garment = "basico" | "camisa" | "blazer" | "vestido" | "calca";
type Accessory = "nenhum" | "oculos" | "bolsa";

const GARMENTS: { value: Garment; label: string; color: string }[] = [
  { value: "basico", label: "Básico", color: "#E9E0D2" },
  { value: "camisa", label: "Camisa", color: "#9BAA8E" },
  { value: "blazer", label: "Blazer", color: "#414246" },
  { value: "vestido", label: "Vestido", color: "#B4614A" },
  { value: "calca", label: "Calça", color: "#5B6572" },
];

const ACCESSORIES: { value: Accessory; label: string }[] = [
  { value: "nenhum", label: "Sem acessório" },
  { value: "oculos", label: "Óculos" },
  { value: "bolsa", label: "Bolsa" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else if (mesh.material) {
      mesh.material.dispose();
    }
  });
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

export function Mannequin3D({ body }: { body: Body }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodyRef = useRef(body);
  const rebuildRef = useRef<(() => void) | null>(null);
  const styleRef = useRef({ garment: "basico" as Garment, accessory: "nenhum" as Accessory });
  const [garment, setGarment] = useState<Garment>("basico");
  const [accessory, setAccessory] = useState<Accessory>("nenhum");
  const [shared, setShared] = useState(false);

  bodyRef.current = body;
  styleRef.current = { garment, accessory };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4efe7);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
    camera.position.set(0, 0.92, 3.15);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
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

    const skin = new THREE.MeshPhysicalMaterial({
      color: 0xc69d82,
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

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xe0d5c8, roughness: 0.95 });
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
      group.children.forEach((child) => {
        child.traverse((descendant) => {
          const mesh = descendant as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      });
      group.clear();
    };

    const buildClothing = (model: ReturnType<typeof createBodyGeometry>) => {
      clearGroup(clothing);
      clearGroup(accessories);

      const garmentConfig = GARMENTS.find((item) => item.value === styleRef.current.garment) ?? GARMENTS[0];
      const fabric = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(garmentConfig.color),
        roughness: styleRef.current.garment === "blazer" ? 0.86 : 0.7,
        clearcoat: styleRef.current.garment === "blazer" ? 0.03 : 0.12,
      });

      const torsoRadius = Math.max(model.chest * 0.208, 0.16);
      const torso = new THREE.Mesh(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(Math.max(model.waist * 0.174, 0.14), model.legHeight + model.torsoHeight * 0.04),
            new THREE.Vector2(Math.max(model.waist * 0.19, 0.15), model.legHeight + model.torsoHeight * 0.43),
            new THREE.Vector2(torsoRadius * 1.02, model.legHeight + model.torsoHeight * 0.82),
            new THREE.Vector2(torsoRadius * 1.03, model.shoulderY + 0.015),
          ],
          64,
        ),
        fabric,
      );
      torso.castShadow = true;
      torso.receiveShadow = true;
      clothing.add(torso);

      if (styleRef.current.garment === "vestido") {
        const skirt = new THREE.Mesh(
          new THREE.CylinderGeometry(model.hips * 0.27, model.hips * 0.42, model.torsoHeight * 0.78, 64, 6),
          fabric,
        );
        skirt.position.y = model.legHeight + model.torsoHeight * 0.08;
        skirt.castShadow = true;
        skirt.receiveShadow = true;
        clothing.add(skirt);
      }

      if (styleRef.current.garment === "calca") {
        clearGroup(clothing);
        const pantsMaterial = fabric;
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(model.hips * 0.105, model.hips * 0.082, model.legHeight * 0.98, 48, 6),
            pantsMaterial,
          );
          leg.position.set(side * Math.max(model.hips * 0.1, 0.075), model.legHeight * 0.5, 0);
          leg.castShadow = true;
          leg.receiveShadow = true;
          clothing.add(leg);
        }
      }

      if (styleRef.current.garment === "camisa" || styleRef.current.garment === "blazer") {
        const lapelMaterial = new THREE.MeshPhysicalMaterial({
          color: styleRef.current.garment === "blazer" ? 0x2e3033 : 0xd8d5c8,
          roughness: 0.78,
        });
        for (const side of [-1, 1]) {
          const lapel = new THREE.Mesh(
            new THREE.BoxGeometry(model.chest * 0.075, model.torsoHeight * 0.36, 0.018),
            lapelMaterial,
          );
          lapel.position.set(side * model.chest * 0.07, model.shoulderY - model.torsoHeight * 0.18, model.chest * 0.2);
          lapel.rotation.z = side * -0.2;
          lapel.rotation.y = side * 0.08;
          lapel.castShadow = true;
          clothing.add(lapel);
        }
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

    const rebuild = () => {
      const current = bodyRef.current;
      const model = createBodyGeometry(current);

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

      buildClothing(model);

      camera.position.y = height * 0.54;
      camera.position.z = Math.max(2.65, height * 1.72);
      controls.target.set(0, height * 0.53, 0);
      controls.update();
      ground.scale.setScalar(Math.max(0.9, height * 0.62));
      shadowDisc.scale.setScalar(Math.max(0.65, height * 0.38));
    };

    rebuildRef.current = rebuild;
    rebuild();

    const resize = () => {
      const width = canvas.clientWidth || 360;
      const height = canvas.clientHeight || 520;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let stopped = false;
    const animate = () => {
      if (stopped) return;
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      rebuildRef.current = null;
      disposeObject(mannequin);
      ground.geometry.dispose();
      ground.material.dispose();
      shadowDisc.geometry.dispose();
      shadowDisc.material.dispose();
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
  }, [garment, accessory]);

  const share = async () => {
    const shareData = {
      title: "Meu visual no Provador Virtual",
      text: "Confira meu visual personalizado no Provador Virtual.",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard?.writeText(window.location.href);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      // User closed the native share sheet; no error state is needed.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#f4efe7]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Visualização 3D
          </p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Manequim realista ajustado às suas medidas
          </p>
        </div>
        <span className="rounded-full border border-line bg-background/70 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          ao vivo
        </span>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block h-[430px] w-full touch-none sm:h-[520px]"
          aria-label="Manequim 3D baseado nas medidas informadas"
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-background/75 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground shadow-sm backdrop-blur-sm">
          Arraste para girar · pinça/roda para zoom · dois dedos para mover
        </div>
      </div>

      <div className="grid gap-3 border-t border-line bg-background/80 p-3 sm:grid-cols-2">
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
      </div>

      <div className="grid grid-cols-3 border-t border-line bg-background/60 text-center text-[11px] text-muted-foreground">
        <span className="border-r border-line px-2 py-2">altura {body.heightCm} cm</span>
        <span className="border-r border-line px-2 py-2">busto {body.chestCm} cm</span>
        <span className="px-2 py-2">quadril {body.hipsCm} cm</span>
      </div>
    </div>
  );
}
