-- =====================================================================
-- [Control de versiones] Script 003 de sql/. Si lo vuelves a ejecutar, revisa
-- después Configuración > Base de datos: te dirá si hay que re-ejecutar alguno
-- posterior que redefine las mismas funciones.
-- Parámetros de la aplicación (clave/valor editables por admin)
-- Uso inicial: límites de WIP (actividades en paralelo) para Recursos.
--   wip_modelador  = 3  actividades en paralelo por modelador
--   wip_supervisor = 8  actividades lideradas en paralelo por supervisor
-- Requiere: sql/manpower_corte_semanal.sql (public.manpower_es_admin)
-- Idempotente: se puede ejecutar varias veces.
-- =====================================================================

create table if not exists public.parametros_app (
    clave        text primary key,
    valor        numeric not null,
    descripcion  text,
    updated_at   timestamptz not null default now(),
    updated_by   uuid default auth.uid()
);

insert into public.parametros_app (clave, valor, descripcion) values
    ('wip_modelador', 3, 'Límite de actividades en paralelo por modelador (Recursos · WIP)'),
    ('wip_supervisor', 8, 'Límite de actividades lideradas en paralelo por supervisor (Recursos · WIP)')
on conflict (clave) do nothing;

alter table public.parametros_app
    drop constraint if exists parametros_app_valor_positivo;
alter table public.parametros_app
    add constraint parametros_app_valor_positivo check (valor > 0);

create or replace function public.parametros_app_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
end $$;

drop trigger if exists trg_parametros_app_touch on public.parametros_app;
create trigger trg_parametros_app_touch
    before update on public.parametros_app
    for each row execute function public.parametros_app_touch();

alter table public.parametros_app enable row level security;

drop policy if exists "parametros_app_select" on public.parametros_app;
create policy "parametros_app_select" on public.parametros_app
    for select to authenticated using (true);

drop policy if exists "parametros_app_admin_write" on public.parametros_app;
create policy "parametros_app_admin_write" on public.parametros_app
    for all to authenticated
    using (public.manpower_es_admin())
    with check (public.manpower_es_admin());

-- ---------------------------------------------------------------------
-- Control de versiones: deja la marca de que este script se ejecutó
-- (ver sql/010_control_versiones.sql y Configuración > Base de datos)
-- ---------------------------------------------------------------------
do $registro$
begin
    if to_regprocedure('public.registrar_migracion(integer,text,text)') is not null then
        perform public.registrar_migracion(3, '003_parametros_app');
    end if;
end
$registro$;
