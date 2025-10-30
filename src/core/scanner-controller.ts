
// NO import 'html5-qrcode' here to avoid server-side rendering issues.

// Forward declaration of the type for internal use.
declare class Html5Qrcode {
    constructor(containerId: string, verbose?: boolean);
    start(cameraConfig: any, config: any, success: (text: string) => void, error: (err: any) => void): Promise<null>;
    stop(): Promise<void>;
    // Add other methods you use if necessary
    [key: string]: any; // To allow for isScanning property etc.
}


export class ScannerController {
  private scanner: Html5Qrcode | null = null;
  private running = false;
  private containerId: string;

  constructor(containerId: string) { this.containerId = containerId; }

  async init() {
    // Dynamically import the library only on the client-side
    const { Html5Qrcode } = await import("html5-qrcode");
    if (!this.scanner) this.scanner = new Html5Qrcode(this.containerId, false);
  }

  async start(onDecode: (text: string) => Promise<void>) {
    if (this.running) return;
    await this.init();
    
    // Ensure scanner is initialized
    if (!this.scanner) {
      throw new Error("Scanner library failed to initialize.");
    }

    const el = document.getElementById(this.containerId);
    if (!el) throw new Error("Contenedor del lector no existe");
    el.innerHTML = "";
    this.running = true;

    await this.scanner.start(
      { facingMode: "environment" },
      { fps: 6, qrbox: { width: 260, height: 260 } },
      async (decodedText: string) => {
        await this.pause();              // corta frames antes de procesar
        await onDecode(decodedText);     // validación + canje
      },
      () => {}
    );
  }

  async pause() {
    if (!this.running || !this.scanner) return;
    try { 
        // Check if scanning is active before stopping
        if ((this.scanner as any).isScanning) {
            await this.scanner.stop(); 
        }
    } catch (e) {
        console.error("Error stopping scanner (might have already been stopped):", e);
    } finally {
      this.running = false;
      const el = document.getElementById(this.containerId);
      if (el) el.innerHTML = "";
    }
  }

  async destroy() {
    await this.pause();
    this.scanner = null;
  }
}
