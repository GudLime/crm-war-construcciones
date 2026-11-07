import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Motor — paso 2 contra un Postgres de verdad: sincroniza la configuración de
 * ejemplo (clínica: Sede y Tratamiento) y lee, crea, edita y borra registros.
 *
 * Corre solo con `MOTOR_TEST_DATABASE_URL` (el CI levanta un Postgres y aplica
 * las migraciones). Sin la variable se saltea: en una máquina sin base, el
 * resto de los tests sigue andando.
 */

const URL = process.env.MOTOR_TEST_DATABASE_URL;

describe.skipIf(!URL)("motor: registros en Postgres", () => {
  const org = `org_motor_${Date.now()}`;
  const otraOrg = `${org}_b`;
  const actor = { tipo: "usuario" as const, id: "usr_prueba" };

  // Se importan después de fijar el entorno: getEnv() lo lee y lo cachea.
  let m: typeof import("@/server/motor/registros");
  let sincronizar: typeof import("@/server/motor/sincronizar");
  let db: typeof import("@/lib/db");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.APP_BASE_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "secreto-de-prueba-0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN ??= "verifica123";
    process.env.CLIENTE_CONFIG = "clientes/ejemplo.json";

    db = await import("@/lib/db");
    sincronizar = await import("@/server/motor/sincronizar");
    m = await import("@/server/motor/registros");

    const d = db.getDb();
    await d.insert(db.schema.organization).values([
      { id: org, name: "Clínica de prueba" },
      { id: otraOrg, name: "Otra" },
    ]);
    const r = await sincronizar.sincronizarMotor();
    expect(r.estado).toBe("ok");
  });

  afterAll(async () => {
    if (!db) return;
    const { sql } = await import("drizzle-orm");
    // organization ON DELETE CASCADE se lleva metadatos, registros e historial.
    await db.getDb().execute(sql`DELETE FROM organization WHERE id IN (${org}, ${otraOrg})`);
  });

  it("sincronizar dos veces no cambia nada", async () => {
    const r = await sincronizar.sincronizarMotor();
    expect(r).toMatchObject({ estado: "ok", objetos: 2, omitidos: [] });
  });

  it("crea, lee y calcula", async () => {
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "Palermo", direccion: "Gorriti 1" } }, actor);
    expect(sede.titulo).toBe("Palermo");

    await m.crearRegistro(
      org,
      "tratamiento",
      { valores: { nombre: "Limpieza", precio: "1500000", activo: "sí", modalidad: "Presencial" }, padres: { sede_tratamientos: sede.id } },
      actor
    );
    await m.crearRegistro(
      org,
      "tratamiento",
      { valores: { nombre: "Blanqueamiento", activo: false }, padres: { sede_tratamientos: sede.id } },
      actor
    );

    const leida = await m.obtenerRegistro(org, "sede", sede.id);
    // Resumen con filtro: solo los tratamientos activos.
    expect(leida.valores.tratamientos_activos).toBe(1);

    const hijos = await m.listarRegistros(org, "tratamiento", { padre: { relacion: "sede_tratamientos", id: sede.id } });
    expect(hijos.total).toBe(2);
    const limpieza = hijos.registros.find((r) => r.titulo === "Limpieza");
    expect(limpieza?.valores).toMatchObject({ precio: 1500000, activo: true, modalidad: "presencial" });

    const filtrados = await m.listarRegistros(org, "tratamiento", { filtros: { activo: ["true"] } });
    expect(filtrados.registros.map((r) => r.titulo)).toEqual(["Limpieza"]);
    const buscados = await m.listarRegistros(org, "tratamiento", { busqueda: "blanq" });
    expect(buscados.total).toBe(1);
  });

  it("el título es único dentro de su padre, sin importar acentos ni mayúsculas", async () => {
    const a = await m.crearRegistro(org, "sede", { valores: { nombre: "Belgrano" } }, actor);
    const b = await m.crearRegistro(org, "sede", { valores: { nombre: "Núñez" } }, actor);
    await m.crearRegistro(org, "tratamiento", { valores: { nombre: "Ortodoncia" }, padres: { sede_tratamientos: a.id } }, actor);
    // Mismo nombre en otra sede: vale.
    await m.crearRegistro(org, "tratamiento", { valores: { nombre: "Ortodoncia" }, padres: { sede_tratamientos: b.id } }, actor);
    // Mismo nombre en la misma sede, escrito distinto: no.
    await expect(
      m.crearRegistro(org, "tratamiento", { valores: { nombre: " ortodóncia " }, padres: { sede_tratamientos: a.id } }, actor)
    ).rejects.toMatchObject({ codigo: "duplicado" });
    await expect(m.crearRegistro(org, "sede", { valores: { nombre: "BELGRANO" } }, actor)).rejects.toMatchObject({
      codigo: "duplicado",
    });
  });

  it("valida: obligatorios, opciones, campos y padres", async () => {
    await expect(m.crearRegistro(org, "sede", { valores: { direccion: "x" } }, actor)).rejects.toMatchObject({
      codigo: "invalido",
    });
    await expect(
      m.crearRegistro(org, "tratamiento", { valores: { nombre: "X", modalidad: "a domicilio" }, padres: { sede_tratamientos: "no-existe" } }, actor)
    ).rejects.toMatchObject({ codigo: "invalido" });
    await expect(
      m.crearRegistro(org, "tratamiento", { valores: { nombre: "X" }, padres: { sede_tratamientos: "no-existe" } }, actor)
    ).rejects.toMatchObject({ codigo: "padre_desconocido" });
    await expect(m.crearRegistro(org, "sede", { valores: { nombre: "Y", color: "rojo" } }, actor)).rejects.toMatchObject({
      codigo: "invalido",
    });
    await expect(m.crearRegistro(org, "cochera", { valores: {} }, actor)).rejects.toMatchObject({
      codigo: "objeto_desconocido",
    });
  });

  it("cada organización ve solo lo suyo", async () => {
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "Caballito" } }, actor);
    await expect(m.obtenerRegistro(otraOrg, "sede", sede.id)).rejects.toMatchObject({ codigo: "no_encontrado" });
    const deLaOtra = await m.listarRegistros(otraOrg, "sede");
    expect(deLaOtra.total).toBe(0);
  });

  it("editar anota solo lo que cambió", async () => {
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "Recoleta", horarios: "9 a 18" } }, actor);
    await m.actualizarRegistro(org, "sede", sede.id, { valores: { horarios: "9 a 18" } }, actor);
    await m.actualizarRegistro(org, "sede", sede.id, { valores: { horarios: "10 a 19", direccion: "Ayacucho 1" } }, actor);
    const historial = await m.historialRegistro(org, "sede", sede.id);
    expect(historial.map((h) => [h.accion, h.campo]).sort()).toEqual(
      [
        ["actualizado", "direccion"],
        ["actualizado", "horarios"],
        ["creado", null],
      ].sort()
    );
    const cambioHorario = historial.find((h) => h.campo === "horarios");
    expect(cambioHorario).toMatchObject({ antes: "9 a 18", despues: "10 a 19", actorTipo: "usuario" });
  });

  it("borrar: soltar deja a los hijos sin padre; cascada se los lleva", async () => {
    const s1 = await m.crearRegistro(org, "sede", { valores: { nombre: "Olivos" } }, actor);
    const t1 = await m.crearRegistro(org, "tratamiento", { valores: { nombre: "Implante" }, padres: { sede_tratamientos: s1.id } }, actor);
    expect(await m.contarAsociados(org, "sede", s1.id)).toEqual([
      { relacion: "sede_tratamientos", objeto: "tratamiento", nombre: "Tratamientos", cantidad: 1 },
    ]);
    expect(await m.borrarRegistro(org, "sede", s1.id, "soltar", actor)).toBe(1);
    const suelto = await m.obtenerRegistro(org, "tratamiento", t1.id);
    expect(suelto.padres.sede_tratamientos).toBeNull();

    const s2 = await m.crearRegistro(org, "sede", { valores: { nombre: "Martínez" } }, actor);
    const t2 = await m.crearRegistro(org, "tratamiento", { valores: { nombre: "Carillas" }, padres: { sede_tratamientos: s2.id } }, actor);
    expect(await m.borrarRegistro(org, "sede", s2.id, "cascada", actor)).toBe(2);
    await expect(m.obtenerRegistro(org, "tratamiento", t2.id)).rejects.toMatchObject({ codigo: "no_encontrado" });

    // El historial queda, con el nombre que tenía.
    const historial = await m.historialRegistro(org, "sede", s2.id);
    expect(historial[0]).toMatchObject({ accion: "borrado", titulo: "Martínez" });
  });

  it("describe el objeto para las pantallas y arma el menú", async () => {
    const { cargarMotor } = await import("@/server/motor/metadatos");
    const { describirObjeto, objetosDelMenu } = await import("@/server/motor/api");
    const motor = await cargarMotor(org);
    const sede = describirObjeto(motor, motor.objetos.get("sede")!);
    expect(sede.hijos).toEqual([{ clave: "sede_tratamientos", objeto: "tratamiento", nombre: "Tratamientos", obligatoria: true }]);
    expect(sede.campos.find((c) => c.clave === "tratamientos_activos")?.editable).toBe(false);
    const tratamiento = describirObjeto(motor, motor.objetos.get("tratamiento")!);
    expect(tratamiento.padres.map((p) => p.clave)).toEqual(["sede_tratamientos"]);
    expect((await objetosDelMenu(org)).map((o) => o.clave)).toEqual(["sede", "tratamiento"]);
  });

  it("importa un CSV: vista previa, aplicar, actualizar y errores por fila", async () => {
    const imp = await import("@/server/motor/importar");
    await m.crearRegistro(org, "sede", { valores: { nombre: "Vicente López" } }, actor);
    const csv = [
      "Sede,Nombre,Precio,Modalidad,Activo,Color",
      "vicente lopez,Endodoncia,25.000,Presencial,sí,rojo",
      "Vicente López,Periodoncia,,Virtual,no,",
      "Sede inventada,Prótesis,10,,,",
      "Vicente López,Endodoncia,1,,,",
    ].join("\n");

    const previa = await imp.previsualizarImportacion(org, "tratamiento", csv);
    expect(previa.aplicado).toBe(false);
    expect(previa.noReconocidas).toEqual(["Color"]);
    expect(previa.resumen).toEqual({ crear: 2, actualizar: 0, sin_cambios: 0, error: 2 });
    expect(previa.filas.find((f) => f.fila === 4)?.mensaje).toMatch(/No existe «Sede inventada»/);
    expect(previa.filas.find((f) => f.fila === 5)?.mensaje).toMatch(/repetido/);
    // La vista previa no guarda nada.
    expect((await m.listarRegistros(org, "tratamiento", { busqueda: "Endodoncia" })).total).toBe(0);

    const hecha = await imp.aplicarImportacion(org, "tratamiento", csv, "usr_prueba");
    expect(hecha.resumen.crear).toBe(2);
    const endo = (await m.listarRegistros(org, "tratamiento", { busqueda: "Endodoncia" })).registros[0];
    expect(endo?.valores).toMatchObject({ precio: 2500000, modalidad: "presencial", activo: true });

    // Segunda vuelta: una fila cambia, otra queda igual, ninguna se duplica.
    const otra = ["Sede,Nombre,Precio", "Vicente López,Endodoncia,30000", "Vicente López,Periodoncia,"].join("\n");
    const segunda = await imp.aplicarImportacion(org, "tratamiento", otra, "usr_prueba");
    expect(segunda.resumen).toEqual({ crear: 0, actualizar: 1, sin_cambios: 1, error: 0 });
    const historial = await m.historialRegistro(org, "tratamiento", endo!.id);
    expect(historial[0]).toMatchObject({ campo: "precio", actorTipo: "importacion", loteId: segunda.lote });

    // Exportar devuelve las mismas columnas que lee el importador.
    const { csv: exportado } = await imp.exportarCsv(org, "tratamiento", { busqueda: "Endodoncia" });
    expect(exportado.replace("\uFEFF", "").split("\n")[0]).toBe("Sede,Nombre,Duración (min),Precio,Modalidad,Activo,Cupo");
    expect(exportado).toContain("Vicente López,Endodoncia,,30000,Presencial,Sí");
  });

  it("paso 5: vincula objetos a una oportunidad y aplica las reglas de etapa", async () => {
    const { sql } = await import("drizzle-orm");
    const op = await import("@/server/motor/oportunidad");
    const { cambiarEstadoOportunidad } = await import("@/server/oportunidad-historial");
    const d = db.getDb();
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "San Isidro" } }, actor);
    const nuevo = (nombre: string) =>
      m.crearRegistro(org, "tratamiento", { valores: { nombre, cupo: "libre" }, padres: { sede_tratamientos: sede.id } }, actor);
    const a = await nuevo("Turno 9 h");
    const b = await nuevo("Turno 10 h");

    const opA = `op_motor_a_${Date.now()}`;
    const opB = `op_motor_b_${Date.now()}`;
    await d.execute(sql`INSERT INTO oportunidad (id, organization_id, nombre) VALUES (${opA}, ${org}, 'Ana'), (${opB}, ${org}, 'Beto')`);

    // Vínculos: exactamente los pedidos; un id ajeno se rechaza.
    await op.vincularOportunidad(org, opA, "oportunidad_tratamientos", [a.id, b.id]);
    let vinculos = await op.vinculosDeOportunidad(org, opA);
    expect(vinculos[0]?.registros.map((r) => r.titulo).sort()).toEqual(["Turno 10 h", "Turno 9 h"]);
    await expect(op.vincularOportunidad(org, opA, "oportunidad_tratamientos", ["reg_no_existe"])).rejects.toMatchObject({
      codigo: "padre_desconocido",
    });

    // Dos candidatos: Reservó no aplica solo; queda pendiente para elegir.
    await cambiarEstadoOportunidad({ organizationId: org, oportunidadId: opA, destino: "reservo", actor: { fuente: "persona", userId: null } });
    expect((await m.obtenerRegistro(org, "tratamiento", a.id)).valores.cupo).toBe("libre");
    const pendientes = await op.reglasPendientes(org, opA, "reservo");
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]?.descripcion).toBe("Tratamiento → Cupo: Ocupado");
    expect(await op.aplicarRegla(org, opA, "reserva_ocupa_cupo", [a.id], actor)).toBe(1);
    expect((await m.obtenerRegistro(org, "tratamiento", a.id)).valores.cupo).toBe("ocupado");
    expect((await m.obtenerRegistro(org, "tratamiento", b.id)).valores.cupo).toBe("libre");
    // Con uno solo pendiente, ya no se pregunta.
    expect(await op.reglasPendientes(org, opA, "reservo")).toEqual([]);

    // Un solo candidato: se aplica solo, y queda en el historial como del usuario.
    await op.vincularOportunidad(org, opB, "oportunidad_tratamientos", [b.id]);
    await cambiarEstadoOportunidad({ organizationId: org, oportunidadId: opB, destino: "reservo", actor: { fuente: "persona", userId: null } });
    expect((await m.obtenerRegistro(org, "tratamiento", b.id)).valores.cupo).toBe("ocupado");
    const historial = await m.historialRegistro(org, "tratamiento", b.id);
    // (userId null: el historial de la oportunidad referencia la tabla de usuarios, y acá no hay ninguno.)
    expect(historial[0]).toMatchObject({ campo: "cupo", actorTipo: "usuario", actorId: null });

    // Borrar un tratamiento suelta el vínculo; la oportunidad queda.
    await m.borrarRegistro(org, "tratamiento", a.id, "soltar", actor);
    vinculos = await op.vinculosDeOportunidad(org, opA);
    expect(vinculos[0]?.registros.map((r) => r.titulo)).toEqual(["Turno 10 h"]);
    const [quedo] = (await d.execute(sql`SELECT id FROM oportunidad WHERE id = ${opA}`)) as unknown as { id: string }[];
    expect(quedo?.id).toBe(opA);
  });

  it("paso 5: la siembra copia vínculos una vez y no pisa", async () => {
    const { sql } = await import("drizzle-orm");
    const { sentenciaSiembra } = await import("@/lib/motor/ddl");
    const d = db.getDb();
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "Tigre" } }, actor);
    const t = await m.crearRegistro(org, "tratamiento", { valores: { nombre: "Control" }, padres: { sede_tratamientos: sede.id } }, actor);
    const opC = `op_motor_c_${Date.now()}`;
    await d.execute(sql`INSERT INTO oportunidad (id, organization_id, nombre) VALUES (${opC}, ${org}, 'Carla')`);
    // Tabla común (no TEMP): el pool puede usar otra conexión en la consulta siguiente.
    await d.execute(sql`CREATE TABLE IF NOT EXISTS prueba_siembra (organization_id text, oportunidad_id text, tratamiento_id text)`);
    await d.execute(sql`INSERT INTO prueba_siembra VALUES (${org}, ${opC}, ${t.id}), (${org}, ${opC}, NULL)`);
    const siembra = sentenciaSiembra({
      clave: "oportunidad_tratamientos",
      desde: "oportunidad",
      hacia: "tratamiento",
      tipo: "muchos_a_muchos",
      nombreDesde: "x",
      nombreHacia: "y",
      adoptaTabla: false,
      obligatoria: false,
      sembrarDesde: { tabla: "prueba_siembra", columnaDesde: "oportunidad_id", columnaHacia: "tratamiento_id" },
    })!;
    await d.execute(sql.raw(siembra));
    await d.execute(sql.raw(siembra));
    const [n] = (await d.execute(
      sql`SELECT count(*) AS n FROM rel_oportunidad_tratamientos WHERE desde_id = ${opC}`
    )) as unknown as { n: string }[];
    expect(Number(n?.n)).toBe(1);
    await d.execute(sql`DROP TABLE prueba_siembra`);
  });

  it("paso 6: el agente lee lo visible y el administrador lo cambia por columna", async () => {
    const agente = await import("@/server/motor/agente");
    const sede = await m.crearRegistro(org, "sede", { valores: { nombre: "Caballito", direccion: "Ayacucho 9" } }, actor);
    await m.crearRegistro(
      org,
      "tratamiento",
      { valores: { nombre: "Ortodoncia", precio: 9000000, modalidad: "presencial", activo: true }, padres: { sede_tratamientos: sede.id } },
      actor
    );
    await m.crearRegistro(
      org,
      "tratamiento",
      { valores: { nombre: "Implante", precio: 30000000, modalidad: "presencial", activo: false }, padres: { sede_tratamientos: sede.id } },
      actor
    );

    let t = await agente.textoDeObjetosParaAgente(org);
    expect(t).toContain("Tratamiento Ortodoncia · Sede: Caballito");
    expect(t).toContain("Ofrecé solo los tratamientos de esta lista");
    expect(t).not.toContain("Tratamiento Implante");
    expect(t).toContain("Precio:");

    // Columna oculta por el administrador: desaparece del texto.
    expect(await agente.cambiarVisibilidadAgente(org, "tratamiento", { campos: { precio: false, inexistente: true } })).toBe(true);
    t = await agente.textoDeObjetosParaAgente(org);
    expect(t).not.toContain("Precio:");
    // …y sincronizar no la vuelve a prender.
    await sincronizar.sincronizarMotor();
    t = await agente.textoDeObjetosParaAgente(org);
    expect(t).not.toContain("Precio:");

    // Objeto apagado: no entra; la otra organización no se entera.
    await agente.cambiarVisibilidadAgente(org, "tratamiento", { visible: false });
    t = await agente.textoDeObjetosParaAgente(org);
    expect(t).not.toContain("Tratamiento Ortodoncia");
    expect(t).toContain("Caballito");
    expect(await agente.textoDeObjetosParaAgente(otraOrg)).not.toContain("Caballito");
    expect(await agente.cambiarVisibilidadAgente(org, "no_existe", { visible: true })).toBe(false);

    await agente.cambiarVisibilidadAgente(org, "tratamiento", { visible: true, campos: { precio: true } });
  });
});

