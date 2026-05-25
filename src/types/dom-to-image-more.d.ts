declare module 'dom-to-image-more' {
  export interface DomToImageOptions {
    width?: number;
    height?: number;
    bgcolor?: string;
    quality?: number;
    cacheBust?: boolean;
    copyStyles?: boolean;
    filter?: (node: Node) => boolean;
    style?: Partial<CSSStyleDeclaration>;
  }

  const domtoimage: {
    toPng(node: HTMLElement, options?: DomToImageOptions): Promise<string>;
  };

  export default domtoimage;
}
