/** Uploads are stored inline as data: URLs (no backend), so keep them reasonably small. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface LoadedImage {
  src: string;
  name: string;
  width: number;
  height: number;
}

/** Reads a user-picked image file into a data URL plus its natural size. */
export async function readImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 4 MB.`);
  }

  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    img.onerror = () => reject(new Error(`${file.name} could not be decoded as an image.`));
    img.src = src;
  });

  return { src, name: file.name.replace(/\.[^.]+$/, ''), width, height };
}
