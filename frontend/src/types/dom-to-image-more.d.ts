declare module 'dom-to-image-more' {
  interface DomToImageOptions {
    width?: number
    height?: number
    bgcolor?: string
    cacheBust?: boolean
  }

  interface DomToImage {
    toBlob(node: HTMLElement, options?: DomToImageOptions): Promise<Blob>
  }

  const domToImage: DomToImage
  export default domToImage
}
