// ── Techos CPC manuales ───────────────────────────────────────
// Fallback cuando las estrategias de cartera pertenecen al MCC
// y la API no puede leerlas desde la cuenta hija.
//
// Estos valores también se pueden editar desde /dashboard/config.
// Los cambios hechos en la UI se guardan en la base de datos y
// tienen prioridad sobre los valores de este archivo.

export const MANUAL_CPC_CEILINGS: Record<string, number> = {
  'AEU_BO_ES_MARCA_1':        0.40,
  'AEU_BO_ES_MARCA_GENERICA': 0.40,
}
