
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
      // Set a timeout to prevent waiting forever
      const timeoutId = setTimeout(() => {
        console.warn(`Timeout waiting for image to load: ${img.src}`);
        resolve(); // Resolve anyway to not block the process
      }, 10000); // 10 seconds timeout

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      
      img.onerror = () => {
        clearTimeout(timeoutId);
        console.warn(`Failed to load image: ${img.src}`);
        resolve(); // Resolve anyway
      };

      // Re-check in case the image loaded between the `complete` check and attaching listeners
      if (img.complete) {
        clearTimeout(timeoutId);
        resolve();
      }
    });
  });

  await Promise.all(promises);
}
