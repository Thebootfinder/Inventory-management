/**
 * Lecture de codes-barres via la caméra du téléphone.
 * Utilise l'API native BarcodeDetector quand elle existe (Android/Chrome),
 * sinon ZXing (iPhone/Safari, Firefox), chargé à la demande.
 */

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

export interface ScanSession {
  stop(): void;
  setTorch(on: boolean): Promise<boolean>;
  hasTorch: boolean;
}

export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScanSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();

  const track = stream.getVideoTracks()[0];
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
  let stopped = false;
  let stopDecoder: () => void = () => {};

  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector })
    .BarcodeDetector;
  let native: NativeDetector | null = null;
  if (Detector) {
    try {
      const supported: string[] = await (Detector as unknown as { getSupportedFormats(): Promise<string[]> }).getSupportedFormats();
      native = new Detector({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      native = null;
    }
  }

  if (native) {
    const detector = native;
    let raf = 0;
    let busy = false;
    const loop = async () => {
      if (stopped) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) onCode(found[0].rawValue);
        } catch {
          /* image illisible, on réessaie */
        }
        busy = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stopDecoder = () => cancelAnimationFrame(raf);
  } else {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
    const controls = await reader.decodeFromVideoElement(video, (result) => {
      if (result && !stopped) onCode(result.getText());
    });
    stopDecoder = () => controls.stop();
  }

  return {
    hasTorch: Boolean(caps.torch),
    async setTorch(on) {
      try {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        return on;
      } catch {
        return false;
      }
    },
    stop() {
      stopped = true;
      stopDecoder();
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

export interface ProductInfo {
  name?: string;
  imageUrl?: string;
  category?: string;
}

/** Cherche le nom du produit dans la base ouverte Open Food Facts (gratuit, sans clé). */
export async function lookupProduct(barcode: string): Promise<ProductInfo | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_fr,brands,quantity,image_front_small_url,categories_tags`,
      { signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const base = (p.product_name_fr || p.product_name || '').trim();
    const brand = (p.brands || '').split(',')[0].trim();
    const qty = (p.quantity || '').trim();
    const name = [brand && !base.toLowerCase().includes(brand.toLowerCase()) ? brand : '', base, qty]
      .filter(Boolean)
      .join(' · ');
    return { name: name || undefined, imageUrl: p.image_front_small_url || undefined, category: guessCategory(p.categories_tags) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function guessCategory(tags: unknown): string | undefined {
  if (!Array.isArray(tags)) return undefined;
  const t = tags.join(' ');
  if (/wines|vins/.test(t)) return 'Vin';
  if (/beers|bieres/.test(t)) return 'Bière';
  if (/spirits|spiritueux|liqueurs/.test(t)) return 'Spiritueux';
  if (/beverages|boissons|waters|juices/.test(t)) return 'Boissons';
  if (/canned|conserves/.test(t)) return 'Conserves';
  if (/frozen|surgeles/.test(t)) return 'Surgelés';
  return 'Épicerie';
}
