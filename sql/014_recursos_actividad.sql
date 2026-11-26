-- =====================================================================
-- 014 · RECURSOS DE LAS ACTIVIDADES: solo admin, coordinador y supervisor
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/004 (app_rol_actual) y sql/010 (registro).
--
-- Regla acordada (2026-11-26): los recursos de CUALQUIER actividad solo los
-- asignan o quitan admin, BIM Manager (rol admin), coordinador y supervisor.
-- Los modeladores no, ni siquiera en sus propias actividades. Todos leen.
--
-- Antes (política recursos_mod, no versionada): solo admin/coordinador o
-- quien creó la actividad. Un supervisor que no la creó guardaba cambios
-- que no se aplicaban, sin aviso.
-- No cambia ningún dato: solo quién puede escribir.
-- =====================================================================

create or replace function public.puede_editar_recursos()
returns boolean language sql stable security definer set search_path = public as $$
    select auth.uid() is not null
       and coalesce(public.app_rol_actual(), '') in ('admin', 'coordinador_bim', 'supervisor_bim');
$$;

revoke execute on function public.puede_editar_recursos() from public, anon;
grant  execute on function public.puede_editar_recursos() to authenticated;

alter table public.actividad_recursos enable row level security;

do $$
declare v_r record;
begin
    for v_r in select policyname from pg_policies
               where schemaname = 'public' and tablename = 'actividad_recursos' loop
        execute format('drop policy %I on public.actividad_recursos', v_r.policyname);
    end loop;
end
$$;

create policy "recursos_select" on public.actividad_recursos
    for select to authenticated using (true);

create policy "recursos_write" on public.actividad_recursos
    for all to authenticated
    using (public.puede_editar_recursos())
    with check (public.puede_editar_recursos());

select public.registrar_migracion(14, '014_recursos_actividad');
