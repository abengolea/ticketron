
import { canonicalId, registry } from "./ticket-registry";
import { createHmacSha256 } from "@/lib/utils"; // tu HMAC ya existente

export type ValidateOutcome = "valid" | "invalid" | "already_redeemed" | "void" | "malformed";

export class ValidatorService {
  constructor(private secretProvider: () => string) {}

  async validateAndRedeem(payloadText: string): Promise<{ outcome: ValidateOutcome; id?: string; msg: string }> {
    let data: any;
    try { data = JSON.parse(payloadText); } catch { return { outcome: "malformed", msg: "QR no es JSON válido" }; }
    const { v, eid, tid, sig } = data ?? {};
    if (!v || !eid || !tid || !sig) return { outcome: "malformed", msg: "Faltan campos en el QR" };

    const id = canonicalId(eid, tid);
    const secret = this.secretProvider();
    if (!secret) {
        return { outcome: "invalid", id, msg: "Falta la clave secreta para validar." };
    }

    const expected = await createHmacSha256(secret, `${eid}|${tid}|${v}`);
    if (expected !== sig) return { outcome: "invalid", id, msg: "Firma inválida" };

    const rec = registry.get(id);
    if (rec?.state === "void") return { outcome: "void", id, msg: "Ticket anulado" };
    if (rec?.state === "redeemed") return { outcome: "already_redeemed", id, msg: "Ticket ya canjeado" };

    const res = registry.redeem(id, "operator");
    if (res.ok) return { outcome: "valid", id, msg: "Válido y canjeado" };
    if ((res as any).value === "already") return { outcome: "already_redeemed", id, msg: "Ticket ya canjeado" };
    if ((res as any).value === "void") return { outcome: "void", id, msg: "Ticket anulado" };
    return { outcome: "invalid", id, msg: "No pudo canjearse" };
  }
}
