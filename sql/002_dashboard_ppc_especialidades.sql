-- =====================================================================
-- [Control de versiones] Script 002 de sql/. Si lo vuelves a ejecutar, revisa
-- después Configuración > Base de datos: te dirá si hay que re-ejecutar alguno
-- posterior que redefine las mismas funciones.
-- DASHBOARD: PPC semanal (Last Planner), fotos semanales congeladas
-- y catálogo de especialidades.
-- Zona horaria del proyecto: America/Lima
--
-- Requisitos: haber ejecutado antes sql/manpower_corte_semanal.sql
--             (usa public.manpower_es_admin) y tener activada la extensión pg_cron.
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Reglas del PPC de una semana W (lunes L a domingo D):
--   * Fecha fin vigente en un instante: la fecha que tenía la actividad en ese
--     momento, según el historial de reprogramaciones_bim.
--   * Comprometidas = actividades que el lunes 00:00 tenían su fecha fin
--     vigente dentro de W (y no estaban cerradas antes de L)
--     + actividades creadas durante W con fecha fin dentro de W (no planificadas).
--   * Cumplida = comprometida cerrada en su fecha fin vigente o antes, siempre que
--     esa fecha siga dentro de W. Reprogramar dentro de la semana no la penaliza;
--     reprogramar fuera de la semana = no cumplida (y entra como compromiso en la
--     semana de su nueva fecha). Cerrar después de la fecha vigente = no cumplida.
--   * Adelantada = actividad comprometida para una semana futura que se cerró en W.
--     Suma al numerador, no al denominador (el PPC puede superar 100%).
--   * PPC = (cumplidas + adelantadas) / comprometidas. NULL si no hay comprometidas.
--   * Se excluyen actividades Canceladas/Anuladas. Las que vencen en día de
--     descanso del responsable SÍ cuentan.
--   * Reprogramaciones migradas (sin fechas): se usa fecha_fin_original hasta el
--     cierre de su semana y luego la fecha fin actual.
-- Planos trabajados en W: planos distintos vinculados a actividades con horas
-- registradas en Manpower durante W, separados en contractuales y detalles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CATÁLOGO DE ESPECIALIDADES
-- ---------------------------------------------------------------------
create table if not exists public.especialidades (
    id      bigint generated always as identity primary key,
    nombre  text    not null unique,
    activo  boolean not null default true,
    orden   int     not null default 0
);

insert into public.especialidades (nombre, orden) values
    ('IIEE', 1), ('IISS', 2), ('IIMM', 3), ('ARQ', 4), ('EST', 5),
    ('EQP', 6), ('BIM', 7), ('TIC', 8), ('LS', 9), ('GENERAL', 10)
on conflict (nombre) do nothing;

alter table public.especialidades enable row level security;

drop policy if exists "especialidades_select" on public.especialidades;
create policy "especialidades_select" on public.especialidades
    for select to authenticated using (true);

drop policy if exists "especialidades_admin_write" on public.especialidades;
create policy "especialidades_admin_write" on public.especialidades
    for all to authenticated
    using (public.manpower_es_admin())
    with check (public.manpower_es_admin());

-- Campo fijo en las actividades
alter table public.pendientes_bim
    add column if not exists especialidad_id bigint references public.especialidades(id);

-- Migrar los valores del parámetro personalizado "Especialidad"
do $$
declare
    v_prop_id bigint;
begin
    select id into v_prop_id
    from public.propiedades_def
    where lower(trim(nombre)) = 'especialidad'
    order by id limit 1;

    if v_prop_id is not null then
        -- Valores usados que no estén en el catálogo: se agregan para no perder nada
        insert into public.especialidades (nombre, orden)
        select distinct upper(trim(pv.valor_texto)), 100
        from public.propiedades_valores pv
        where pv.propiedad_id = v_prop_id
          and nullif(trim(pv.valor_texto), '') is not null
        on conflict (nombre) do nothing;

        update public.pendientes_bim p
        set especialidad_id = e.id
        from public.propiedades_valores pv
        join public.especialidades e on e.nombre = upper(trim(pv.valor_texto))
        where pv.propiedad_id = v_prop_id
          and pv.pendiente_id = p.id
          and p.especialidad_id is null;

        -- Ocultar el parámetro personalizado (no se borra)
        update public.propiedades_def set activo = false where id = v_prop_id;
    end if;
end $$;

-- Las actividades sin especialidad quedan en GENERAL
update public.pendientes_bim
set especialidad_id = (select id from public.especialidades where nombre = 'GENERAL')
where especialidad_id is null;

-- Obligatoria: si llega vacía se asigna GENERAL, y la columna no admite NULL
create or replace function public.pendientes_especialidad_default()
returns trigger language plpgsql as $$
begin
    if new.especialidad_id is null then
        select id into new.especialidad_id from public.especialidades where nombre = 'GENERAL';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_pendientes_especialidad_default on public.pendientes_bim;
create trigger trg_pendientes_especialidad_default
    before insert or update on public.pendientes_bim
    for each row execute function public.pendientes_especialidad_default();

alter table public.pendientes_bim alter column especialidad_id set not null;

-- ---------------------------------------------------------------------
-- 2) FUNCIONES DE FECHA
-- ---------------------------------------------------------------------
-- Instante en que empieza un día en Lima
create or replace function public.ppc_inicio_dia(p_fecha date)
returns timestamptz language sql immutable as $$
    select (p_fecha::timestamp at time zone 'America/Lima');
$$;

-- Lunes de la semana que contiene la fecha
create or replace function public.ppc_lunes(p_fecha date)
returns date language sql immutable as $$
    select p_fecha - (extract(isodow from p_fecha)::int - 1);
$$;

-- Fecha fin vigente de una actividad en un instante dado (NULL si aún no existía)
create or replace function public.ppc_fecha_vigente(p_id bigint, p_instante timestamptz)
returns date language plpgsql stable security definer set search_path = public as $$
declare
    t   record;
    v   date;
begin
    select id, created_at, fecha_fin, fecha_fin_original into t
    from public.pendientes_bim where id = p_id;
    if not found or (t.created_at is not null and t.created_at > p_instante) then
        return null;
    end if;

    -- Última reprogramación con fechas hecha hasta ese instante
    select r.fin_nuevo into v
    from public.reprogramaciones_bim r
    where r.pendiente_id = p_id and coalesce(r.es_migrada, false) = false
      and r.fin_nuevo is not null and r.created_at <= p_instante
    order by r.created_at desc limit 1;
    if v is not null then return v; end if;

    -- Si se reprogramó después, la fecha previa a la primera reprogramación
    select r.fin_anterior into v
    from public.reprogramaciones_bim r
    where r.pendiente_id = p_id and coalesce(r.es_migrada, false) = false
      and r.fin_anterior is not null and r.created_at > p_instante
    order by r.created_at asc limit 1;
    if v is not null then return v; end if;

    -- Reprogramación migrada (sin fechas): original hasta el cierre de su semana
    if t.fecha_fin_original is not null and t.fecha_fin_original <> t.fecha_fin
       and exists (select 1 from public.reprogramaciones_bim r
                   where r.pendiente_id = p_id and coalesce(r.es_migrada, false) = true) then
        if p_instante < public.ppc_inicio_dia(public.ppc_lunes(t.fecha_fin_original) + 7) then
            return t.fecha_fin_original;
        end if;
    end if;

    return t.fecha_fin;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) CÁLCULO DE UNA SEMANA
-- ---------------------------------------------------------------------
create or replace function public.ppc_calcular_semana(p_lunes date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    L        date := public.ppc_lunes(p_lunes);
    D        date := public.ppc_lunes(p_lunes) + 6;
    i0       timestamptz := public.ppc_inicio_dia(public.ppc_lunes(p_lunes));
    i_fin    timestamptz := public.ppc_inicio_dia(public.ppc_lunes(p_lunes) + 7);
    corte    timestamptz := least(now(), public.ppc_inicio_dia(public.ppc_lunes(p_lunes) + 7) - interval '1 microsecond');
    ref      date := (least(now(), public.ppc_inicio_dia(public.ppc_lunes(p_lunes) + 7) - interval '1 microsecond') at time zone 'America/Lima')::date;
    res      jsonb;
begin
    with base as (
        select p.id, coalesce(p.created_at, '-infinity'::timestamptz) as created_at, p.estado, p.fecha_cierre, p.especialidad_id,
               public.ppc_fecha_vigente(p.id, i0)    as v_lunes,
               public.ppc_fecha_vigente(p.id, corte) as v_corte,
               public.ppc_fecha_vigente(p.id, greatest(coalesce(p.created_at, i0), i0)) as v_creacion
        from public.pendientes_bim p
        where coalesce(p.estado, '') not in ('Cancelado', 'Anulado')
    ),
    compromisos as (
        -- Planificadas: comprometidas el lunes 00:00
        select b.*, false as no_planificada from base b
        where b.created_at <= i0
          and b.v_lunes between L and D
          and (b.fecha_cierre is null or b.fecha_cierre >= L)
        union all
        -- No planificadas: creadas durante la semana con fin dentro de ella
        select b.*, true from base b
        where b.created_at > i0 and b.created_at <= corte
          and b.v_creacion between L and D
          and (b.fecha_cierre is null or b.fecha_cierre >= L)
    ),
    evaluadas as (
        select c.*,
               (c.fecha_cierre is not null and c.fecha_cierre <= D
                and c.v_corte is not null and c.v_corte between L and D
                and c.fecha_cierre <= c.v_corte) as cumplida
        from compromisos c
    ),
    adelantadas as (
        select b.id from base b
        where b.fecha_cierre between L and least(D, ref)
          and b.id not in (select id from compromisos)
          and (
                (b.created_at <= i0 and b.v_lunes > D)
             or (b.created_at > i0 and b.v_creacion > D)
          )
    ),
    mp as (
        select m.pendiente_id, sum(coalesce(m.porcentaje_dia, 0)) * 9.3333 / 100 as horas
        from public.manpower_registros m
        where m.fecha between L and D
        group by m.pendiente_id
    ),
    planos_trab as (
        select distinct pl.id, pl.categoria
        from mp
        join public.actividad_planos ap on ap.pendiente_id = mp.pendiente_id
        join public.planos pl on pl.id = ap.plano_id
        where mp.pendiente_id is not null
    ),
    estado_corte as (
        select b.id,
               (b.fecha_cierre is not null and b.fecha_cierre <= ref) as cerrada,
               b.v_corte
        from base b
        where b.created_at <= corte
    ),
    np_esp as (
        select coalesce(e.nombre, 'GENERAL') as esp,
               count(*) as n,
               coalesce(sum(mp.horas), 0) as horas
        from evaluadas ev
        left join public.especialidades e on e.id = ev.especialidad_id
        left join mp on mp.pendiente_id = ev.id
        where ev.no_planificada
        group by 1
    )
    select jsonb_build_object(
        'semana',            L,
        'cerrada',           now() >= i_fin,
        'comprometidas',     (select count(*) from evaluadas),
        'cumplidas',         (select count(*) from evaluadas where cumplida),
        'adelantadas',       (select count(*) from adelantadas),
        'ppc',               case when (select count(*) from evaluadas) = 0 then null
                                  else round(((select count(*) from evaluadas where cumplida)
                                            + (select count(*) from adelantadas)) * 100.0
                                            / (select count(*) from evaluadas)) end,
        'no_planificadas',   (select count(*) from evaluadas where no_planificada),
        'horas_no_planificadas', round(coalesce((select sum(mp.horas) from mp
                                  where mp.pendiente_id in (select id from evaluadas where no_planificada)), 0)::numeric, 2),
        'no_planificadas_por_especialidad',
                             coalesce((select jsonb_object_agg(esp, jsonb_build_object('n', n, 'horas', round(horas::numeric, 2))) from np_esp), '{}'::jsonb),
        'horas_semana',      round(coalesce((select sum(horas) from mp), 0)::numeric, 2),
        'planos_contractuales', (select count(*) from planos_trab where categoria = 'contractual'),
        'planos_detalle',       (select count(*) from planos_trab where categoria = 'detalle'),
        'total_tareas',      (select count(*) from estado_corte),
        'abiertas',          (select count(*) from estado_corte where not cerrada),
        'vencidas',          (select count(*) from estado_corte where not cerrada and v_corte < ref),
        'por_vencer',        (select count(*) from estado_corte where not cerrada and v_corte between ref and ref + 7),
        'sin_fecha',         (select count(*) from estado_corte where not cerrada and v_corte is null)
    ) into res;
    return res;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) FOTOS SEMANALES (snapshots_semanales)
-- ---------------------------------------------------------------------
alter table public.snapshots_semanales add column if not exists comprometidas int;
alter table public.snapshots_semanales add column if not exists cumplidas int;
alter table public.snapshots_semanales add column if not exists adelantadas int;
alter table public.snapshots_semanales add column if not exists no_planificadas int;
alter table public.snapshots_semanales add column if not exists horas_no_planificadas numeric;
alter table public.snapshots_semanales add column if not exists no_planificadas_por_especialidad jsonb;
alter table public.snapshots_semanales add column if not exists planos_contractuales int;
alter table public.snapshots_semanales add column if not exists planos_detalle int;
alter table public.snapshots_semanales add column if not exists version smallint;
alter table public.snapshots_semanales add column if not exists congelado_en timestamptz;

-- Congela una semana ya cerrada (reemplaza su foto si existía)
create or replace function public.ppc_congelar_semana(p_lunes date)
returns void language plpgsql security definer set search_path = public as $$
declare
    L date := public.ppc_lunes(p_lunes);
    s jsonb;
begin
    if now() < public.ppc_inicio_dia(L + 7) then
        raise exception 'La semana del % aún no termina.', L;
    end if;
    s := public.ppc_calcular_semana(L);
    delete from public.snapshots_semanales where semana::date = L;
    -- Las columnas antiguas (planos WIP/Shared/Published/Archived, causas_top) ya no se usan:
    -- se guardan en 0 / {} porque la tabla las exige.
    insert into public.snapshots_semanales (
        semana, total_tareas, abiertas, cerradas, vencidas, por_vencer, sin_fecha, ppc, horas_semana,
        planos_wip, planos_shared, planos_published, planos_archived, causas_top,
        comprometidas, cumplidas, adelantadas, no_planificadas, horas_no_planificadas,
        no_planificadas_por_especialidad, planos_contractuales, planos_detalle,
        version, congelado_en
    ) values (
        L, (s->>'total_tareas')::int, (s->>'abiertas')::int,
        (s->>'total_tareas')::int - (s->>'abiertas')::int,
        (s->>'vencidas')::int, (s->>'por_vencer')::int, (s->>'sin_fecha')::int,
        (s->>'ppc')::numeric,
        (s->>'horas_semana')::numeric,
        0, 0, 0, 0, '{}'::jsonb,
        (s->>'comprometidas')::int, (s->>'cumplidas')::int, (s->>'adelantadas')::int,
        (s->>'no_planificadas')::int, (s->>'horas_no_planificadas')::numeric,
        s->'no_planificadas_por_especialidad',
        (s->>'planos_contractuales')::int, (s->>'planos_detalle')::int,
        2, now()
    );
end;
$$;

-- Congela la semana que acaba de terminar (la llama pg_cron cada lunes)
create or replace function public.ppc_congelar_semana_anterior()
returns void language sql security definer set search_path = public as $$
    select public.ppc_congelar_semana(public.ppc_lunes((now() at time zone 'America/Lima')::date) - 7);
$$;

-- Recalcula todas las semanas pasadas con la regla nueva
create or replace function public.ppc_recalcular_historial()
returns int language plpgsql security definer set search_path = public as $$
declare
    v_desde date;
    v_hasta date := public.ppc_lunes((now() at time zone 'America/Lima')::date) - 7;
    w date;
    n int := 0;
begin
    select public.ppc_lunes(least(
               min((created_at at time zone 'America/Lima')::date),
               min(coalesce(fecha_fin_original, fecha_fin))))
    into v_desde from public.pendientes_bim;
    if v_desde is null then return 0; end if;
    w := v_desde;
    while w <= v_hasta loop
        perform public.ppc_congelar_semana(w);
        n := n + 1;
        w := w + 7;
    end loop;
    return n;
end;
$$;

-- Lo que lee el Dashboard: últimas N semanas seguidas (la actual en vivo)
create or replace function public.dashboard_semanas(p_semanas int default 8)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
    actual date := public.ppc_lunes((now() at time zone 'America/Lima')::date);
    w date;
    snap record;
begin
    for i in 0 .. greatest(p_semanas, 1) - 1 loop
        w := actual - (i * 7);
        select * into snap from public.snapshots_semanales
        where semana::date = w and version = 2 limit 1;
        if i > 0 and found then
            return next jsonb_build_object(
                'semana', snap.semana, 'cerrada', true,
                'comprometidas', snap.comprometidas, 'cumplidas', snap.cumplidas,
                'adelantadas', snap.adelantadas, 'ppc', snap.ppc,
                'no_planificadas', snap.no_planificadas,
                'horas_no_planificadas', snap.horas_no_planificadas,
                'no_planificadas_por_especialidad', snap.no_planificadas_por_especialidad,
                'horas_semana', snap.horas_semana,
                'planos_contractuales', snap.planos_contractuales,
                'planos_detalle', snap.planos_detalle,
                'total_tareas', snap.total_tareas, 'abiertas', snap.abiertas,
                'vencidas', snap.vencidas, 'por_vencer', snap.por_vencer,
                'congelado_en', snap.congelado_en);
        else
            return next public.ppc_calcular_semana(w);
        end if;
    end loop;
end;
$$;

grant execute on function public.dashboard_semanas(int) to authenticated;
revoke execute on function public.ppc_congelar_semana(date) from public, anon, authenticated;
revoke execute on function public.ppc_recalcular_historial() from public, anon, authenticated;
revoke execute on function public.ppc_congelar_semana_anterior() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) RECALCULAR HISTORIAL (respaldo de las fotos viejas primero)
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = 'snapshots_semanales_respaldo') then
        create table public.snapshots_semanales_respaldo as
            select * from public.snapshots_semanales;
        alter table public.snapshots_semanales_respaldo enable row level security;
    end if;
end $$;

select public.ppc_recalcular_historial() as semanas_recalculadas;

-- ---------------------------------------------------------------------
-- 6) PG_CRON: cada lunes 00:05 hora de Lima (05:05 UTC) congela la semana anterior
-- ---------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'ppc_congelar_semana';
        perform cron.schedule('ppc_congelar_semana', '5 5 * * 1',
                              'select public.ppc_congelar_semana_anterior();');
    else
        raise notice 'pg_cron no está activado: la congelación semanal no quedó programada.';
    end if;
end $$;

-- ---------------------------------------------------------------------
-- Control de versiones: deja la marca de que este script se ejecutó
-- (ver sql/010_control_versiones.sql y Configuración > Base de datos)
-- ---------------------------------------------------------------------
do $registro$
begin
    if to_regprocedure('public.registrar_migracion(integer,text,text)') is not null then
        perform public.registrar_migracion(2, '002_dashboard_ppc_especialidades');
    end if;
end
$registro$;
