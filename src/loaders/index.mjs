// Loader wrapper — reads a file and returns a Three.js Scene

import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { getLoaderConfig } from '../registry.mjs';

// Import all loaders
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';

const LOADER_CLASSES = {
  ThreeMFLoader,
  AMFLoader,
  FBXLoader,
  GLTFLoader,
  OBJLoader,
  STLLoader,
  PLYLoader,
  ColladaLoader,
};

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Load a 3D file and return a normalized Three.js Scene.
 * @param {string} filePath - Path to the input file
 * @returns {Promise<THREE.Scene>}
 */
export async function loadScene(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const config = getLoaderConfig(ext);

  if (!config) {
    const supported = Object.keys((await import('../registry.mjs')).loaders).join(', ');
    throw new Error(`Unsupported input format "${ext}". Supported: ${supported}`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read file
  const fileBuffer = fs.readFileSync(filePath);
  const data = config.inputType === 'string'
    ? fileBuffer.toString('utf-8')
    : bufferToArrayBuffer(fileBuffer);

  // Instantiate loader
  const LoaderClass = LOADER_CLASSES[config.className];
  if (!LoaderClass) {
    throw new Error(`Loader class "${config.className}" not found`);
  }
  const loader = new LoaderClass();

  // Parse based on result type
  let result;

  if (config.parseResult === 'callback') {
    // GLTFLoader uses callback-based parse
    result = await new Promise((resolve, reject) => {
      loader.parse(data, '', (parsed) => resolve(parsed), (error) => reject(error));
    });
  } else {
    // All other loaders have synchronous .parse()
    const args = config.parseArgs ? config.parseArgs(data) : [data];
    result = loader.parse(...args);
  }

  // Normalize to Scene
  const scene = new THREE.Scene();

  if (config.parseResult === 'geometry') {
    // STLLoader, PLYLoader return BufferGeometry
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const mesh = new THREE.Mesh(result, material);
    scene.add(mesh);
  } else if (config.parseResult === 'scene') {
    // ColladaLoader returns { scene }
    const children = [...result.scene.children];
    for (const child of children) {
      scene.add(child);
    }
  } else if (config.parseResult === 'callback') {
    // GLTFLoader returns { scene }
    const children = [...result.scene.children];
    for (const child of children) {
      scene.add(child);
    }
  } else {
    // Group result (3MF, AMF, FBX, OBJ)
    scene.add(result);
  }

  scene.updateMatrixWorld(true);
  return scene;
}

/**
 * Get info about a loaded scene (mesh count, vertex count, etc.)
 */
export function getSceneInfo(scene) {
  let meshCount = 0;
  let totalVertices = 0;
  let totalFaces = 0;
  let hasColors = false;
  let hasMaterials = false;
  const materials = new Set();

  scene.traverse((obj) => {
    if (obj.isMesh) {
      meshCount++;
      const geo = obj.geometry;
      if (geo.attributes.position) {
        totalVertices += geo.attributes.position.count;
      }
      if (geo.index) {
        totalFaces += geo.index.count / 3;
      } else if (geo.attributes.position) {
        totalFaces += geo.attributes.position.count / 3;
      }
      if (geo.attributes.color) {
        hasColors = true;
      }
      if (obj.material) {
        hasMaterials = true;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => materials.add(m.type));
      }
    }
  });

  return {
    meshCount,
    totalVertices,
    totalFaces: Math.floor(totalFaces),
    hasColors,
    hasMaterials,
    materialTypes: [...materials],
  };
}
