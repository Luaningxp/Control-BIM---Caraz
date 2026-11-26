-- =====================================================================
-- 013 · PERMISOS DE LAS TABLAS QUE ESTABAN ABIERTAS A TODOS
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/001 (manpower_es_admin), sql/004 (app_rol_actual) y
--           sql/010 (registro).
--
-- Hallazgo de la foto de la estructura (sql/esquema/esquema_supabase_2026-11-26.sql):
-- estas tablas tenían "Permitir todo a autenticados". Regla acordada (2026-11-26):
--
--  A) SOLO ADMIN (admin y coordinador_bim) crea, edita o borra. Todos leen.
--     feriados, descansos, descansos_medicos, trabajos_extra   (Roster)
--     subcontratas, propiedades_def                            (Configuración)
--     planos                                                   (Log de planos)
--
--  B) MISMA REGLA QUE EDITAR LA ACTIVIDAD. Todos leen. Escriben:
--     - admin, coordinador y supervisor: en cualquier actividad;
--     - modelador: solo en actividades donde es responsable, recurso o
--       quien la creó.
--     actividad_planos   (planos vinculados a la actividad)
--     tarea_causas       (causas de incumplimiento de la actividad)
--     propiedades_valores (parámetros personalizados de la actividad)
--
-- No cambia ningún dato: solo quién puede escribir.
-- =====================================================================

-- ¿El usuario actual puede editar la actividad p_pendiente_id? (regla B)
create or replace function public.puede_editar_actividad(p_pendiente_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
    select case
        when auth.uid() is null then false
        when coalesce(public.app_rol_actual(), '') in ('admin', 'coordinador_bim', 'supervisor_bim') then true
        else exists (
            select 1 from public.pendientes_bim p
            where p.id = p_pendiente_id
              and (p.responsable_id = auth.uid()
                   or p.user_id = auth.uid()
                   or exists (select 1 from public.actividad_recursos r
                              where r.pendiente_id = p.id and r.usuario_id = auth.uid())))
    end;
$$;

revoke execute on function public.puede_editar_actividad(bigint) from public, anon;
grant  execute on function public.puede_editar_actividad(bigint) to authenticated;

-- Quita las políticas actuales (no versionadas) y aplica la regla
do $$
declare
    v_t text;
    v_r record;
begin
    -- A) Solo admin
    foreach v_t in array array['feriados', 'descansos', 'descansos_medicos', 'trabajos_extra',
                               'subcontratas', 'propiedades_def', 'planos'] loop
        execute format('alter table public.%I enable row level security', v_t);
        for v_r in select policyname from pg_policies where schemaname = 'public' and tablename = v_t loop
            execute format('drop policy %I on public.%I', v_r.policyname, v_t);
        end loop;
        execute format('create policy %I on public.%I for select to authenticated using (true)',
                       v_t || '_select', v_t);
        execute format('create policy %I on public.%I for all to authenticated
                            using (public.manpower_es_admin()) with check (public.manpower_es_admin())',
                       v_t || '_admin_write', v_t);
    end loop;

    -- B) Misma regla que editar la actividad
    foreach v_t in array array['actividad_planos', 'tarea_causas', 'propiedades_valores'] loop
        execute format('alter table public.%I enable row level security', v_t);
        for v_r in select policyname from pg_policies where schemaname = 'public' and tablename = v_t loop
            execute format('drop policy %I on public.%I', v_r.policyname, v_t);
        end loop;
        execute format('create policy %I on public.%I for select to authenticated using (true)',
                       v_t || '_select', v_t);
        execute format('create policy %I on public.%I for insert to authenticated
                            with check (public.puede_editar_actividad(pendiente_id))',
                       v_t || '_insert', v_t);
        execute format('create policy %I on public.%I for update to authenticated
                            using (public.puede_editar_actividad(pendiente_id))
                            with check (public.puede_editar_actividad(pendiente_id))',
                       v_t || '_update', v_t);
        execute format('create policy %I on public.%I for delete to authenticated
                            using (public.puede_editar_actividad(pendiente_id))',
                       v_t || '_delete', v_t);
    end loop;
end
$$;

select public.registrar_migracion(13, '013_permisos_tablas_abiertas');
