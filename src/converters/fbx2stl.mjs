if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, eventInitDict) {
      this.type = type;
      this.lengthComputable = eventInitDict?.lengthComputable || false;
      this.loaded = eventInitDict?.loaded || 0;
      this.total = eventInitDict?.total || 0;
    }
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

import * as THREE from 'three';
import { GLTFLoader as OriginalGLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const FileReader = require('filereader').FileReader;

class CustomFileLoader extends THREE.FileLoader {
  load(url, onLoad, onProgress, onError) {
    super.load(url, onLoad, undefined, onError);
  }
}

class CustomGLTFLoader extends OriginalGLTFLoader {
  constructor(manager) {
    super(manager);
    this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
    this.fileLoader = new CustomFileLoader(this.manager);
  }
}

async function fbxToStl(inputFilePath, outputFilePath) {
  const fbxLoader = new FBXLoader();
  const exporter = new STLExporter();

  const fileData = fs.readFileSync(inputFilePath);
  const dataUrl = `data:model/fbx;base64,${fileData.toString('base64')}`;

  const data = await new Promise((resolve, reject) => {
    fbxLoader.load(dataUrl, (object) => resolve(object), undefined, (error) => reject(error));
  });

  const scene = new THREE.Scene();
  scene.add(data);

  const stlData = exporter.parse(scene); // Export the scene as STL
  fs.writeFileSync(outputFilePath, stlData); // Write the STL data directly to a file
}


export { fbxToStl };
