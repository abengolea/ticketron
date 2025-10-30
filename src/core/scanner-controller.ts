
import type { Html5Qrcode } from "html5-qrcode";

export class ScannerController {
  private scanner: Html5Qrcode | null = null;
  private running = false;
  private containerId: string;

  constructor(containerId: string) { this.containerId = containerId; }

  async init() {
    const { Html5Qrcode } = await import("html5-qrcode");
    if (!this.scanner) this.scanner = new Html5Qrcode(this.containerId);
  }

  async start(onDecode: (text: string) => Promise<void>) {
    if (this.running) return;
    await this.init();
    const el = document.getElementById(this.containerId);
    if (!el) throw new Error("Contenedor del lector no existe");
    el.innerHTML = "";
    this.running = true;

    await (this.scanner as any).start(
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
    if (!this.running) return;
    try { await (this.scanner as any).stop(); }
    finally {
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
