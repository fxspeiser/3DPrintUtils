// Node.js polyfills for Three.js browser APIs
// Must be imported before any Three.js imports

import { parseHTML } from 'linkedom';

// DOMParser — needed by 3MFLoader, AMFLoader, ColladaLoader
// linkedom supports querySelector/querySelectorAll which these loaders require
const { document: linkedomDocument, DOMParser: LinkedomDOMParser } = parseHTML('<!DOCTYPE html><html><body></body></html>');

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = LinkedomDOMParser;
}

// window and self — Three.js checks for these in various places
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

// document stub — Three.js TextureLoader and some loaders reference document
if (typeof globalThis.document === 'undefined') {
  globalThis.document = linkedomDocument;
}

// ProgressEvent — Three.js FileLoader dispatches these
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

// Image stub — GLTFLoader texture loading path references Image
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class Image {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.src = '';
    }
    addEventListener() {}
    removeEventListener() {}
  };
}

// URL.createObjectURL stub — 3MFLoader texture path (unused for geometry-only conversion)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => '';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {};
}

// FileReader — for loaders that use FileReader internally
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
if (typeof globalThis.FileReader === 'undefined') {
  const { FileReader } = require('filereader');
  globalThis.FileReader = FileReader;
}
