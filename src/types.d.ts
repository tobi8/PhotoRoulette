declare module 'heic-decode' {
  interface DecodeOptions {
    buffer: Uint8Array | ArrayBuffer
  }
  interface DecodedImage {
    width: number
    height: number
    data: ArrayBuffer | Uint8ClampedArray | Uint8Array
  }
  function decode(options: DecodeOptions): Promise<DecodedImage>
  namespace decode {
    function all(options: DecodeOptions): Promise<DecodedImage[]>
  }
  export default decode
  export = decode
}

declare module 'libheif-js/wasm-bundle' {
  const libheif: any
  export default libheif
  export = libheif
}
