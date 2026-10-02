import { isArray } from '../utils.js';

// Lightweight stub for browser environments where the source-map package
// (which depends on Node.js built-ins) is not available.
export function SourceNode(line, column, srcFile, chunks) {
  this.src = '';
  if (chunks) {
    this.add(chunks);
  }
}

SourceNode.prototype = {
  add(chunks) {
    if (isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src += chunks;
  },
  prepend(chunks) {
    if (isArray(chunks)) {
      chunks = chunks.join('');
    }
    this.src = chunks + this.src;
  },
  toStringWithSourceMap() {
    return { code: this.toString() };
  },
  toString() {
    return this.src;
  },
};
