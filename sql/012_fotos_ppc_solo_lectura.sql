-- =====================================================================
-- 012 · FOTOS SEMANALES DEL PPC: solo lectura para todos
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/010_control_versiones.sql (registro).
--
-- Hallazgo de la foto de la estructura (sql/esquema/esquema_supabase_2026-11-26.sql):
-- snapshots_semanales tenía la política "Permitir todo a autenticados", así
-- que cualquier usuario con sesión podía cambiar o borrar las fotos
-- congeladas del PPC.
--
-- Qué hace:
--   - Todos los usuarios con sesión pueden LEER las fotos (Dashboard).
--   - Nadie las escribe desde la app. Solo las escriben las funciones del
--     sistema (ppc_congelar_semana, que corre con pg_cron el lunes 00:05 Lima,
--     y ppc_recalcular_historial), que se ejecutan como dueño de la base.
--   - No cambia ninguna foto ya guardada.
-- =====================================================================

alter table public.snapshots_semanales enable row level security;

-- Se quitan las políticas anteriores (no estaban versionadas)
do $$
declare v_r record;
begin
    for v_r in select policyname from pg_policies
               where schemaname = 'public' and tablename = 'snapshots_semanales' loop
        execute format('drop policy %I on public.snapshots_semanales', v_r.policyname);
    end loop;
end
$$;

create policy "snapshots_select" on public.snapshots_semanales
    for select to authenticated using (true);

-- Doble candado: sin permiso de escritura para los usuarios de la app
revoke insert, update, delete, truncate on public.snapshots_semanales from anon, authenticated;

select public.registrar_migracion(12, '012_fotos_ppc_solo_lectura');
