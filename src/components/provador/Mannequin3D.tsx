import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { Body } from "@/lib/sizing";

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
    geometry: new THREE.LatheGeometry(points, 32),
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
) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.05, length), 8, 16),
    material,
  );
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

function addJoint(
  group: THREE.Group,
  material: THREE.Material,
  radius: number,
  position: THREE.Vector3,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material);
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

export function Mannequin3D({ body }: { body: Body }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodyRef = useRef(body);
  const rebuildRef = useRef<(() => void) | null>(null);

  bodyRef.current = body;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4efe7);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
    camera.position.set(0, 0.92, 3.15);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene.add(new THREE.HemisphereLight(0xfff8ef, 0x6b5a4b, 2.1));

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.4, 3.4, 3.2);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xe7d2bd, 1.25);
    rim.position.set(-2.5, 1.6, -2.2);
    scene.add(rim);

    const mannequin = new THREE.Group();
    mannequin.rotation.y = -0.14;
    scene.add(mannequin);

    const material = new THREE.MeshStandardMaterial({
      color: 0xc8a58b,
      roughness: 0.82,
      metalness: 0,
    });

    const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), material);
    mannequin.add(bodyMesh, pelvis, head, neck);

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftForearm = new THREE.Group();
    const rightForearm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    mannequin.add(leftArm, rightArm, leftForearm, rightForearm, leftLeg, rightLeg);

    const leftKnee = addJoint(mannequin, material, 0.09, new THREE.Vector3());
    const rightKnee = addJoint(mannequin, material, 0.09, new THREE.Vector3());

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xe3d8cc,
      roughness: 1,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    scene.add(ground);

    const clearGroup = (group: THREE.Group) => {
      group.children.forEach((child) => {
        child.traverse((descendant) => {
          const mesh = descendant as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      });
      group.clear();
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
        const upper = addCapsule(
          group,
          material,
          armRadius,
          armLength * 0.48,
          new THREE.Vector3(0, -armLength * 0.24, 0),
        );
        upper.rotation.z = side * -armTilt;
        group.position.set(side * shoulderX, armY, 0);

        const elbowX = side * (shoulderX + Math.sin(armTilt) * armLength * 0.42);
        const elbowY = armY - Math.cos(armTilt) * armLength * 0.42;

        const lower = addCapsule(
          forearm,
          material,
          armRadius * 0.88,
          armLength * 0.42,
          new THREE.Vector3(0, -armLength * 0.22, 0),
        );
        lower.rotation.z = side * -0.11;
        forearm.position.set(elbowX, elbowY, 0.01);
      }

      const hipOffset = clamp(model.hips * 0.105, 0.07, 0.15);
      for (const [side, group, knee] of [
        [-1, leftLeg, leftKnee],
        [1, rightLeg, rightKnee],
      ] as const) {
        const thigh = addCapsule(
          group,
          material,
          legRadius,
          thighLength,
          new THREE.Vector3(0, -thighLength * 0.48, 0),
        );
        thigh.scale.x = 1.05;
        group.position.set(side * hipOffset, model.legHeight, 0);

        const kneeY = model.legHeight - thighLength;
        knee.position.set(side * hipOffset, kneeY, 0);

        const shin = addCapsule(
          group,
          material,
          legRadius * 0.86,
          shinLength,
          new THREE.Vector3(0, -thighLength - shinLength * 0.45, 0),
        );
        shin.scale.x = 0.92;
      }

      camera.position.y = height * 0.54;
      camera.position.z = Math.max(2.65, height * 1.72);
      camera.lookAt(0, height * 0.53, 0);
      ground.scale.setScalar(Math.max(0.9, height * 0.62));
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
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    bodyRef.current = body;
    rebuildRef.current?.();
  }, [body]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#f4efe7]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Visualização 3D
          </p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            Manequim ajustado às suas medidas
          </p>
        </div>
        <span className="rounded-full border border-line bg-background/70 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          ao vivo
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block h-[430px] w-full touch-none sm:h-[520px]"
        aria-label="Manequim 3D baseado nas medidas informadas"
      />
      <div className="grid grid-cols-3 border-t border-line bg-background/60 text-center text-[11px] text-muted-foreground">
        <span className="border-r border-line px-2 py-2">altura {body.heightCm} cm</span>
        <span className="border-r border-line px-2 py-2">busto {body.chestCm} cm</span>
        <span className="px-2 py-2">quadril {body.hipsCm} cm</span>
      </div>
    </div>
  );
}
