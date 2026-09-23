import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { Body } from "@/lib/sizing";

export type MannequinModelMetrics = {
  heightCm?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  shoulderCm?: number;
  inseamCm?: number;
};

const MORPH_ALIASES: Record<keyof MannequinModelMetrics, string[]> = {
  heightCm: ["height", "bodyheight", "stature"],
  chestCm: ["chest", "bust", "breast"],
  waistCm: ["waist", "abdomen"],
  hipsCm: ["hips", "hip"],
  shoulderCm: ["shoulders", "shoulder"],
  inseamCm: ["inseam", "leglength", "leg"],
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getMetricValue(body: Body, key: keyof MannequinModelMetrics) {
  return {
    heightCm: body.heightCm,
    chestCm: body.chestCm,
    waistCm: body.waistCm,
    hipsCm: body.hipsCm,
    shoulderCm: body.shoulderCm,
    inseamCm: body.inseamCm,
  }[key];
}

function getBaseMetric(model: THREE.Object3D, key: keyof MannequinModelMetrics) {
  const metrics = model.userData.mannequinBaseMeasurements as MannequinModelMetrics | undefined;
  return metrics?.[key] ?? null;
}

function applyMorphMetric(model: THREE.Object3D, key: keyof MannequinModelMetrics) {
  const base = getBaseMetric(model, key);
  if (!base) return;

  const target = getMetricValue(model.userData.body as Body, key);
  if (!target) return;

  const delta = THREE.MathUtils.clamp((target - base) / Math.max(base * 0.25, 1), -1, 1);
  const aliases = MORPH_ALIASES[key].map(normalizeName);

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const normalized = normalizeName(name);
      if (aliases.some((alias) => normalized.includes(alias))) {
        mesh.morphTargetInfluences[index] = Math.max(0, Math.min(1, (delta + 1) / 2));
      }
    }
  });
}

export async function loadMannequinModel(url: string) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

export function prepareMannequinModel(model: THREE.Object3D, body: Body) {
  model.userData.body = body;

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if ("castShadow" in mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.y > 0) {
    const targetHeight = THREE.MathUtils.clamp(body.heightCm / 100, 1.35, 2.15);
    const scale = targetHeight / size.y;
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
  }

  applyMorphMetric(model, "heightCm");
  applyMorphMetric(model, "chestCm");
  applyMorphMetric(model, "waistCm");
  applyMorphMetric(model, "hipsCm");
  applyMorphMetric(model, "shoulderCm");
  applyMorphMetric(model, "inseamCm");

  model.updateMatrixWorld(true);
}

export function getMannequinModelSource() {
  return import.meta.env.VITE_MANNEQUIN_MODEL_URL?.trim() ?? "";
}
