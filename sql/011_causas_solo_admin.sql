-- =====================================================================
-- 011 · CAUSAS DE INCUMPLIMIENTO: solo admin edita el catálogo
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/001_manpower_corte_semanal.sql (manpower_es_admin) y
--           sql/010_control_versiones.sql (registro).
--
-- Hallazgo de sql/pruebas/pruebas_roles.sql (prueba 3, 2026-11-26):
-- supervisores y modeladores podían crear causas. La regla acordada es
-- que los catálogos (grupos, especialidades, causas, parámetros) solo
-- los edita el rol admin (admin y coordinador_bim).
--
-- Qué hace:
--   - Todos los usuarios con sesión pueden LEER las causas (se usan al
--     justificar incumplimientos y al elegir el motivo de "En espera").
--   - Solo admin puede crear, renombrar, desactivar o borrar causas.
--   - No toca las causas ya asignadas a actividades (tabla tarea_causas).
-- =====================================================================

alter table public.causas_incumplimiento enable row level security;

-- Se quitan las políticas anteriores (no estaban versionadas)
do $$
declare v_r record;
begin
    for v_r in select policyname from pg_policies
               where schemaname = 'public' and tablename = 'causas_incumplimiento' loop
        execute format('drop policy %I on public.causas_incumplimiento', v_r.policyname);
    end loop;
end
$$;

create policy "causas_select" on public.causas_incumplimiento
    for select to authenticated using (true);

create policy "causas_admin_write" on public.causas_incumplimiento
    for all to authenticated
    using (public.manpower_es_admin())
    with check (public.manpower_es_admin());

select public.registrar_migracion(11, '011_causas_solo_admin');
