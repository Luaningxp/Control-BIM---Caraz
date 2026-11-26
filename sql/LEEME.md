# Scripts SQL de la base de datos (Supabase)

Cada archivo de esta carpeta es un cambio a la base de datos (una "migración").
Se ejecutan **a mano**, **en orden de número**, en Supabase > SQL Editor > pegar todo el archivo > Run.

## Cómo saber qué falta ejecutar

En la app: **Configuración > Base de datos (scripts SQL)** (solo administradores).
Muestra ✅ lo ejecutado y ⚠️ lo que falta, y qué hacer en cada caso.

Requisito: haber ejecutado una vez `010_control_versiones.sql`. Ese script revisa la base,
detecta cuáles de los scripts 001-009 ya estaban aplicados y los deja registrados.

## Lista

| Nº | Archivo | Nota |
|----|---------|------|
| 001 | `001_manpower_corte_semanal.sql` | |
| 002 | `002_dashboard_ppc_especialidades.sql` | |
| 003 | `003_parametros_app.sql` | |
| 004 | `004_archivar_actividades_cierre.sql` | |
| 005 | `005_manpower_justificar_retraso.sql` | el 006 lo reemplaza |
| 006 | `006_manpower_registro_por_fecha.sql` | versión vigente de las reglas de Manpower |
| 007 | `007_reagrupar_grupos_bim.sql` | **solo una vez**: si ya se ejecutó, se detiene sin cambiar nada |
| 008 | `008_cambio_masivo_grupo.sql` | |
| 009 | `009_espera_bloqueos_ppc_responsable.sql` | versión vigente del PPC |
| 010 | `010_control_versiones.sql` | registro de scripts, revisión y exportar estructura |
| 011 | `011_causas_solo_admin.sql` | catálogo de causas: solo admin lo edita |
| 012 | `012_fotos_ppc_solo_lectura.sql` | fotos semanales del PPC: nadie las edita desde la app |

**Ojo:** algunos scripts redefinen funciones de otros anteriores (Manpower: 001, 004, 005, 006;
PPC: 002, 004, 009). Si vuelves a ejecutar uno viejo, después vuelve a ejecutar los posteriores.
Configuración > Base de datos te avisa si alguna función quedó en una versión vieja.

## Script nuevo (para quien programa)

1. Nombre: siguiente número, por ejemplo `013_lo_que_hace.sql`. Idempotente (`if not exists`, `create or replace`).
2. Última línea: `select public.registrar_migracion(13, '013_lo_que_hace');`
3. Agregarlo a `MIGRACIONES` en `js/basedatos.js`.
4. Si redefine una función de la tabla de huellas (`bd_huellas` en el 010), actualizar la huella
   y la versión esperada en un script nuevo.

## Pruebas de permisos por rol

`pruebas/pruebas_roles.sql`: pégalo en el SQL Editor y ejecútalo. Crea 4 usuarios ficticios
(admin, coordinador, supervisor, modelador), intenta 19 acciones con cada uno y **deshace todo al final**:
no cambia ningún dato. Muestra una tabla con ✅ / ❌. Para repetirlas: `select * from public.pruebas_roles();`

## Foto de la estructura

Configuración > Base de datos > **Descargar estructura (.sql)** baja la estructura completa
(tablas, columnas, permisos RLS, funciones, triggers; **sin datos**). Se guarda en
`sql/esquema/` del repositorio como referencia. No se ejecuta.
