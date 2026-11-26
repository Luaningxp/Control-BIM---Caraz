-- =====================================================================
-- BLOQUEOS "EN ESPERA" + PPC POR RESPONSABLE + META PPC
-- Ejecutar completo en el SQL Editor de Supabase (es idempotente).
-- Requiere haber ejecutado antes, en este orden:
--   sql/manpower_corte_semanal.sql, sql/dashboard_ppc_especialidades.sql,
--   sql/archivar_actividades_cierre.sql, sql/parametros_app.sql
--
-- Reglas:
--  A) Pasar una actividad a "En espera" exige un motivo, tomado del catálogo
--     de causas de incumplimiento (causas_incumplimiento). Al salir de
--     "En espera" el motivo se limpia y el bloqueo se cierra solo.
--  B) Cada cambio de estado (y cada cambio de motivo) queda en
--     pendientes_estado_historial con quién y cuándo.
--  C) Un bloqueo = un periodo en espera (bloqueos_espera). Si se cambia el
--     motivo durante la espera sigue siendo el mismo bloqueo: vale el último.
--  D) Los modeladores (rol operador) solo cambian estado o motivo en
--     actividades donde son responsables o recursos.
--  E) Las actividades que ya están en espera al ejecutar este archivo
--     empiezan a contar desde hoy, con motivo vacío ("Sin motivo").
--  F) PPC por responsable: misma regla Last Planner del PPC semanal,
--     agrupada por el responsable actual. Se guarda en las fotos semanales
--     (las fotos existentes solo se completan, sus cifras no cambian).
--  G) Meta de PPC configurable (parametros_app.meta_ppc, 80 por defecto).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) COLUMNAS Y TABLAS
-- ---------------------------------------------------------------------
alter table public.pendientes_bim
    add column if not exists motivo_espera_id bigint references public.causas_incumplimiento(id);

create table if not exists public.pendientes_estado_historial (
    id               bigint generated always as identity primary key,
    pendiente_id     bigint not null,
    estado_anterior  text,
    estado_nuevo     text,
    motivo_espera_id bigint,
    cambiado_por     uuid,
    cambiado_en      timestamptz not null default now()
);
create index if not exists idx_estado_hist_pendiente on public.pendientes_estado_historial (pendiente_id, cambiado_en);

create table if not exists public.bloqueos_espera (
    id              bigint generated always as identity primary key,
    pendiente_id    bigint not null,
    causa_id        bigint references public.causas_incumplimiento(id),
    inicio          timestamptz not null default now(),
    fin             timestamptz,
    creado_por      uuid,
    cerrado_por     uuid,
    actualizado_en  timestamptz not null default now()
);
create index if not exists idx_bloqueos_pendiente on public.bloqueos_espera (pendiente_id, inicio);
create unique index if not exists idx_bloqueos_un_abierto on public.bloqueos_espera (pendiente_id) where fin is null;

alter table public.pendientes_estado_historial enable row level security;
alter table public.bloqueos_espera enable row level security;

drop policy if exists "estado_hist_select" on public.pendientes_estado_historial;
create policy "estado_hist_select" on public.pendientes_estado_historial
    for select to authenticated using (true);

drop policy if exists "bloqueos_select" on public.bloqueos_espera;
create policy "bloqueos_select" on public.bloqueos_espera
    for select to authenticated using (true);
-- Sin políticas de escritura: solo escriben los triggers (security definer).

-- ---------------------------------------------------------------------
-- 2) ANTES DE GUARDAR: permisos de modelador, motivo obligatorio, limpieza
--    (el nombre "zz" hace que corra después de las reglas de cierre)
-- ---------------------------------------------------------------------
create or replace function public.pendientes_espera_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.app_rol_actual();
    v_asignado boolean;
begin
    if new.estado is distinct from 'En espera' then
        new.motivo_espera_id := null;
    end if;

    if tg_op = 'UPDATE' and auth.uid() is not null then
        -- D) Modeladores: solo en actividades asignadas
        if coalesce(nullif(v_rol, ''), 'operador') not in ('admin', 'coordinador_bim', 'supervisor_bim')
           and (new.estado is distinct from old.estado
                or new.motivo_espera_id is distinct from old.motivo_espera_id) then
            select (new.responsable_id = auth.uid())
                or exists (select 1 from public.actividad_recursos r
                           where r.pendiente_id = new.id and r.usuario_id = auth.uid())
            into v_asignado;
            if not coalesce(v_asignado, false) then
                raise exception 'Solo puedes cambiar el estado de las actividades en las que estás asignado.';
            end if;
        end if;

        -- A) Motivo obligatorio al entrar a "En espera" (o si se borra estando en espera)
        if new.estado = 'En espera' and new.motivo_espera_id is null
           and (old.estado is distinct from 'En espera' or old.motivo_espera_id is not null) then
            raise exception 'Elige el motivo de espera.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_pendientes_zz_espera_antes on public.pendientes_bim;
create trigger trg_pendientes_zz_espera_antes
    before insert or update on public.pendientes_bim
    for each row execute function public.pendientes_espera_antes();

-- ---------------------------------------------------------------------
-- 3) DESPUÉS DE GUARDAR: historial y bloqueos
-- ---------------------------------------------------------------------
create or replace function public.pendientes_espera_despues()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_old_estado text := case when tg_op = 'UPDATE' then old.estado end;
    v_old_motivo bigint := case when tg_op = 'UPDATE' then old.motivo_espera_id end;
begin
    if tg_op = 'INSERT' or new.estado is distinct from v_old_estado
       or new.motivo_espera_id is distinct from v_old_motivo then
        insert into public.pendientes_estado_historial
            (pendiente_id, estado_anterior, estado_nuevo, motivo_espera_id, cambiado_por)
        values (new.id, v_old_estado, new.estado, new.motivo_espera_id, auth.uid());
    end if;

    if new.estado = 'En espera' and (tg_op = 'INSERT' or v_old_estado is distinct from 'En espera') then
        -- Entra en espera: abre un bloqueo
        insert into public.bloqueos_espera (pendiente_id, causa_id, creado_por)
        values (new.id, new.motivo_espera_id, auth.uid())
        on conflict do nothing;
    elsif new.estado = 'En espera' and new.motivo_espera_id is distinct from v_old_motivo then
        -- Sigue en espera con otro motivo: mismo bloqueo, vale el último
        update public.bloqueos_espera
        set causa_id = new.motivo_espera_id, actualizado_en = now()
        where pendiente_id = new.id and fin is null;
    elsif tg_op = 'UPDATE' and v_old_estado = 'En espera' and new.estado is distinct from 'En espera' then
        -- Sale de espera: se cierra el bloqueo
        update public.bloqueos_espera
        set fin = now(), cerrado_por = auth.uid(), actualizado_en = now()
        where pendiente_id = new.id and fin is null;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_pendientes_zz_espera_despues on public.pendientes_bim;
create trigger trg_pendientes_zz_espera_despues
    after insert or update on public.pendientes_bim
    for each row execute function public.pendientes_espera_despues();

-- E) Las que ya están en espera: bloqueo abierto desde hoy, sin motivo
insert into public.bloqueos_espera (pendiente_id, causa_id, inicio)
select p.id, p.motivo_espera_id, now()
from public.pendientes_bim p
where p.estado = 'En espera'
  and p.archivada_en is null
  and not exists (select 1 from public.bloqueos_espera b where b.pendiente_id = p.id and b.fin is null);

-- ---------------------------------------------------------------------
-- 4) PPC POR RESPONSABLE (misma regla del PPC semanal) + horas generales
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
        select p.id, coalesce(p.created_at, '-infinity'::timestamptz) as created_at, p.estado, p.fecha_cierre, p.especialidad_id, p.responsable_id,
               public.ppc_fecha_vigente(p.id, i0)    as v_lunes,
               public.ppc_fecha_vigente(p.id, corte) as v_corte,
               public.ppc_fecha_vigente(p.id, greatest(coalesce(p.created_at, i0), i0)) as v_creacion
        from public.pendientes_bim p
        where coalesce(p.estado, '') not in ('Cancelado', 'Anulado')
          and (p.archivada_en is null or p.archivada_en >= i_fin)
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
        group by 1    ),
    resp_comp as (
        select coalesce(ev.responsable_id::text, 'sin_asignar') as k,
               count(*) as comp,
               count(*) filter (where ev.cumplida) as cump
        from evaluadas ev
        group by 1
    ),
    resp_adel as (
        select coalesce(b.responsable_id::text, 'sin_asignar') as k, count(*) as n
        from base b
        where b.id in (select id from adelantadas)
        group by 1
    ),
    por_resp as (
        select coalesce(c.k, a.k) as k,
               coalesce(c.comp, 0) as comp,
               coalesce(c.cump, 0) as cump,
               coalesce(a.n, 0) as adel
        from resp_comp c
        full outer join resp_adel a on a.k = c.k
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
        'horas_generales',   round(coalesce((select sum(horas) from mp where mp.pendiente_id is null), 0)::numeric, 2),
        'por_responsable',   coalesce((select jsonb_object_agg(k, jsonb_build_object(
                                  'comprometidas', comp, 'cumplidas', cump, 'adelantadas', adel,
                                  'ppc', case when comp = 0 then null else round((cump + adel) * 100.0 / comp) end))
                              from por_resp), '{}'::jsonb),
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
alter table public.snapshots_semanales add column if not exists ppc_por_responsable jsonb;
alter table public.snapshots_semanales add column if not exists horas_generales numeric;

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
    insert into public.snapshots_semanales (
        semana, total_tareas, abiertas, cerradas, vencidas, por_vencer, sin_fecha, ppc, horas_semana,
        planos_wip, planos_shared, planos_published, planos_archived, causas_top,
        comprometidas, cumplidas, adelantadas, no_planificadas, horas_no_planificadas,
        no_planificadas_por_especialidad, planos_contractuales, planos_detalle,
        ppc_por_responsable, horas_generales,
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
        s->'por_responsable', (s->>'horas_generales')::numeric,
        2, now()
    );
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
                'horas_generales', snap.horas_generales,
                'por_responsable', coalesce(snap.ppc_por_responsable, '{}'::jsonb),
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

-- F) Completar las fotos existentes (solo los campos nuevos; el PPC congelado no cambia)
update public.snapshots_semanales s
set ppc_por_responsable = c.calc->'por_responsable',
    horas_generales     = (c.calc->>'horas_generales')::numeric
from (
    select semana, public.ppc_calcular_semana(semana::date) as calc
    from public.snapshots_semanales
    where version = 2 and ppc_por_responsable is null
) c
where s.semana = c.semana;

-- ---------------------------------------------------------------------
-- 5) META DE PPC (editable por admin en Config)
-- ---------------------------------------------------------------------
insert into public.parametros_app (clave, valor, descripcion) values
    ('meta_ppc', 80, 'Meta de PPC semanal en % (Dashboard). Referencia Last Planner: 80%')
on conflict (clave) do nothing;

-- Verificación rápida (opcional):
-- select * from public.bloqueos_espera order by inicio desc limit 20;
-- select semana, ppc, ppc_por_responsable from public.snapshots_semanales order by semana desc limit 4;
