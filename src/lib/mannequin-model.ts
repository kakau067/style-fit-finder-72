import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { Body } from "@/lib/sizing";

export type MannequinModelMetrics = {
  heightCm?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  shoulderCm?: number;
  inseamCm?: number;
};

export type PreparedMannequin = {
  sourceBounds: THREE.Box3;
  sourceCenter: THREE.Vector3;
  scale: number;
  position: THREE.Vector3;
};

// CC0 female display mannequin. An optimized, self-hosted model can override this URL.
export const DEFAULT_MANNEQUIN_URL = "/models/parametric-body.glb";
const BASE = { heightCm: 167, chestCm: 90, waistCm: 72, hipsCm: 98, shoulderCm: 40, inseamCm: 78 };
const ALIASES = {
  chestCm: ["chest", "bust", "breast"],
  waistCm: ["waist", "abdomen"],
  hipsCm: ["hips", "hip"],
  shoulderCm: ["shoulder"],
  inseamCm: ["inseam", "leglength"],
} as const;
type MorphMetric = keyof typeof ALIASES;
type FitMesh = THREE.Mesh & { userData: { mannequinOriginalPositions?: Float32Array } };
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

function peak(value: number, center: number, radius: number) {
  const t = Math.max(0, 1 - Math.abs(value - center) / radius);
  return t * t * (3 - 2 * t);
}

function fitStaticMesh(
  mesh: FitMesh,
  model: THREE.Object3D,
  bounds: THREE.Box3,
  body: Body,
  base: typeof BASE,
) {
  // Edit a private copy of the base surface. Artist morph targets remain intact
  // and still control bust, waist, hips and shoulders independently.
  if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || !mesh.geometry.getAttribute("position")) return;
  if (!mesh.userData.mannequinOriginalPositions) {
    const source = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const vertices = new Float32Array(source.count * 3);
    for (let i = 0; i < source.count; i++) {
      vertices[i * 3] = source.getX(i);
      vertices[i * 3 + 1] = source.getY(i);
      vertices[i * 3 + 2] = source.getZ(i);
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    mesh.userData.mannequinOriginalPositions = vertices;
  }
  const target = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const original = mesh.userData.mannequinOriginalPositions;
  const height = Math.max(bounds.getSize(new THREE.Vector3()).y, 0.01);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  const toMesh = toModel.clone().invert();
  const point = new THREE.Vector3();
  const center = bounds.getCenter(new THREE.Vector3());
  const chest = THREE.MathUtils.clamp(body.chestCm / base.chestCm, 0.76, 1.25);
  const waist = THREE.MathUtils.clamp(body.waistCm / base.waistCm, 0.76, 1.25);
  const hips = THREE.MathUtils.clamp(body.hipsCm / base.hipsCm, 0.76, 1.25);
  const inseam = THREE.MathUtils.clamp(body.inseamCm / base.inseamCm, 0.78, 1.22);
  const weight = THREE.MathUtils.clamp(body.weightKg / (65 * (body.heightCm / 167) ** 2), 0.75, 1.3);
  const hipHeight = height * 0.47;
  const newHipHeight = hipHeight * inseam;
  const width = bounds.getSize(new THREE.Vector3()).x;

  for (let i = 0; i < target.count; i++) {
    point.fromArray(original, i * 3).applyMatrix4(toModel);
    const y = (point.y - bounds.min.y) / height;
    const a = peak(y, 0.74, 0.18);
    const b = peak(y, 0.56, 0.13);
    const c = peak(y, 0.46, 0.15);
    const limb = y < 0.4 || Math.abs(point.x - center.x) > width * 0.27 ? 0.28 : 0;
    const ratio = 1 + ((chest - 1) * a + (waist - 1) * b + (hips - 1) * c) / Math.max(1, a + b + c) + (weight - 1) * limb;
    point.x = center.x + (point.x - center.x) * ratio;
    point.z = center.z + (point.z - center.z) * ratio;
    const fromGround = point.y - bounds.min.y;
    point.y = bounds.min.y + (fromGround < hipHeight
      ? fromGround * inseam
      : newHipHeight + (fromGround - hipHeight) * ((height - newHipHeight) / (height - hipHeight)));
    point.applyMatrix4(toMesh);
    target.setXYZ(i, point.x, point.y, point.z);
  }
  target.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  // Degenerate triangles (eyes, fingers, toes) produce zero/NaN normals that render black.
  const normals = mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    n.fromBufferAttribute(normals, i);
    const l = n.length();
    if (!Number.isFinite(l) || l < 0.5) {
      point.fromArray(original, i * 3).sub(center).setY(0.001);
      n.copy(point).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
  }
  normals.needsUpdate = true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

export async function loadMannequinModel(url: string) {
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
}

function baseGeometryBounds(model: THREE.Object3D) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const positions = mesh.isMesh && mesh.geometry.getAttribute("position");
    if (!positions) return;
    // Box3.setFromObject includes the extrema of every morph, even inactive ones.
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
}

export function prepareMannequinModel(model: THREE.Object3D, body: Body, audience: "feminino" | "masculino" = "feminino") {
  // Always measure from the original geometry: edits must not compound height.
  model.scale.setScalar(1);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const bounds = (model.userData["mannequinSourceBounds"] as THREE.Box3 | undefined)
    ?? baseGeometryBounds(model);
  model.userData["mannequinSourceBounds"] = bounds;
  const base = { ...BASE, ...(model.userData["mannequinBaseMeasurements"] as MannequinModelMetrics | undefined) };
  const height = bounds.getSize(new THREE.Vector3()).y;
  if (height <= 0) throw new Error("O modelo 3D não possui altura válida.");

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      for (const name of ["bodyFeminine", "bodyMasculine"]) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = name === (audience === "masculino" ? "bodyMasculine" : "bodyFeminine") ? 1 : 0;
      }
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        const metric = (Object.keys(ALIASES) as MorphMetric[])
          .find((key) => ALIASES[key].some((alias) => normalize(name).includes(alias)));
        if (!metric) continue;
        const ratio = body[metric] / base[metric];
        const negative = /decrease|smaller|narrow|minus|reduce|negative/.test(normalize(name));
        mesh.morphTargetInfluences[index] = (negative === (ratio < 1))
          ? THREE.MathUtils.clamp(Math.abs(ratio - 1) / 0.25, 0, 1) : 0;
      }
    }
    fitStaticMesh(mesh as FitMesh, model, bounds, body, base);
  });

  const scale = THREE.MathUtils.clamp(body.heightCm / 100, 1.3, 2.15) / height;
  const center = bounds.getCenter(new THREE.Vector3());
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);

  return {
    sourceBounds: bounds.clone(),
    sourceCenter: center.clone(),
    scale,
    position: model.position.clone(),
  } satisfies PreparedMannequin;
}

export function getMannequinModelSource() {
  return import.meta.env["VITE_MANNEQUIN_MODEL_URL"]?.trim() || DEFAULT_MANNEQUIN_URL;
}
