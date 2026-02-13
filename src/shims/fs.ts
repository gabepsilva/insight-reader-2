type ReadFileCallback = (error: Error | null, data?: Uint8Array) => void;

export function readFile(_path: string, callback: ReadFileCallback): void {
  callback(new Error("Node fs.readFile is not available in browser builds."));
}

export default { readFile };
