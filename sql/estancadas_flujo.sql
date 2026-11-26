-- =====================================================================
-- Actividades estancadas + Flujo (throughput y tiempo de ciclo)
-- Solo agrega el parámetro editable del umbral de estancadas.
-- El cálculo se hace en la app con datos que ya existen (no crea tablas).
--   dias_estancada = 2  días laborables TERMINADOS (Roster) sin horas
-- Requiere: sql/parametros_app.sql
-- Idempotente: se puede ejecutar varias veces (no pisa un valor ya editado).
-- =====================================================================

insert into public.parametros_app (clave, valor, descripcion) values
    ('dias_estancada', 2, 'Días laborables terminados sin horas para marcar una actividad como estancada (Dashboard y Mi trabajo)')
on conflict (clave) do nothing;
