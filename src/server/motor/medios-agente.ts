import { cargarMotor, type ObjetoMeta } from "@/server/motor/metadatos";
import { MotorError, obtenerRegistro } from "@/server/motor/registros";
import { leerArchivo } from "@/server/motor/archivos";
import { sendMediaMessage } from "@/server/inbox/send";

/**
 * Motor — las fotos y el video que el agente pide con [fotos:<registro>].
 *
 * El cerebro no tiene una herramienta para mandar archivos: escribe el código
 * que lee en el conocimiento y el CRM lo intercepta en /api/bot/messages,
 * manda el texto y después TODAS las fotos de la galería (en su orden) y el
 * video. Solo de columnas visibles para el agente en objetos visibles: el
 * agente no puede pedir lo que no ve. Los documentos (PDF) no salen por acá.
 */

export type MediosDeRegistro = {
  registroId: string;
  titulo: string;
  fotos: string[];
  videos: string[];
};

function camposDeMedios(o: ObjetoMeta) {
  return o.campos.filter((c) => c.visibleAgente && (c.tipo === "galeria" || c.tipo === "video"));
}

/** Busca el registro en los objetos visibles que tienen fotos o video. Nunca lanza. */
export async function mediosDeRegistro(organizationId: string, registroId: string): Promise<MediosDeRegistro | null> {
  try {
    const motor = await cargarMotor(organizationId);
    for (const o of motor.objetos.values()) {
      if (!o.visibleAgente) continue;
      const campos = camposDeMedios(o);
      if (!campos.length) continue;
      try {
        const r = await obtenerRegistro(organizationId, o.clave, registroId);
        const fotos: string[] = [];
        const videos: string[] = [];
        for (const c of campos) {
          const v = r.valores[c.clave];
          if (c.tipo === "galeria" && Array.isArray(v)) fotos.push(...v.map(String));
          if (c.tipo === "video" && typeof v === "string" && v) videos.push(v);
        }
        return { registroId, titulo: r.titulo, fotos, videos };
      } catch (err) {
        if (err instanceof MotorError && err.codigo === "no_encontrado") continue;
        throw err;
      }
    }
  } catch (err) {
    console.error("[motor] no se pudieron leer las fotos del registro:", err);
  }
  return null;
}

/**
 * Manda por WhatsApp las fotos y los videos de los registros, uno por uno.
 * Un archivo que falla se salta (y queda `failed` en el hilo); los demás
 * siguen. Si la ventana está cerrada o la conversación no admite adjuntos,
 * corta ahí: el resto fallaría igual.
 */
export async function enviarMediosDeRegistros(params: {
  organizationId: string;
  conversationId: string;
  registros: MediosDeRegistro[];
}): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;
  for (const r of params.registros) {
    for (const id of [...r.fotos, ...r.videos]) {
      const archivo = await leerArchivo(params.organizationId, id).catch(() => null);
      if (!archivo) {
        fallidos++;
        continue;
      }
      try {
        await sendMediaMessage({
          conversationId: params.conversationId,
          organizationId: params.organizationId,
          file: { data: archivo.datos, mimeType: archivo.meta.mime, fileName: archivo.meta.nombre ?? undefined },
          aiGenerated: true,
        });
        enviados++;
      } catch (err) {
        fallidos++;
        const code = (err as { code?: string }).code;
        console.error(`[motor] no se pudo mandar un archivo de ${r.registroId}:`, code ?? err);
        if (code === "window_closed" || code === "ai_paused" || code === "sandbox_violation" || code === "reconnect_required") {
          return { enviados, fallidos };
        }
      }
    }
  }
  return { enviados, fallidos };
}

/** Lo que se anota en una conversación de prueba en lugar de mandar los archivos. */
export function notaDeMedios(registros: MediosDeRegistro[]): string {
  return registros
    .map((r) => {
      const partes = [];
      if (r.fotos.length) partes.push(`${r.fotos.length} foto${r.fotos.length === 1 ? "" : "s"}`);
      if (r.videos.length) partes.push(r.videos.length === 1 ? "un video" : `${r.videos.length} videos`);
      return partes.length ? `[Se envían ${partes.join(" y ")} de ${r.titulo}]` : `[${r.titulo} no tiene fotos ni video cargados]`;
    })
    .join("\n");
}
