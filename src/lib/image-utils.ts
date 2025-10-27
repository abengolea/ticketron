
export function isValidDataURL(s: string): boolean {
  return s.startsWith('data:image/png;base64,') && s.length > 100;
}

export async function waitForImagesInContainer(container: HTMLElement): Promise<void> {
  const images = Array.from(container.getElementsByTagName('img'));
  
  const promises = images.map(img => {
    if (img.complete && img.naturalHeight > 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      // Si la imagen ya está en caché, 'load' puede no dispararse,
      // así que volvemos a verificar 'complete'.
      if (img.complete) {
          resolve();
          return;
      }
      img.onerror = () => reject(new Error(`Failed to load image: ${img.src}`));
    });
  });

  await Promise.all(promises);
}
