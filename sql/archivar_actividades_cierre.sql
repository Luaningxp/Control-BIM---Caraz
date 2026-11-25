-- =====================================================================
-- ARCHIVAR ACTIVIDADES (borrado lógico) + CIERRE AUTOMÁTICO POR FECHA
-- Ejecutar completo en el SQL Editor de Supabase (es idempotente).
-- Requiere haber ejecutado antes: sql/dashboard_ppc_especialidades.sql
--                                 sql/manpower_corte_semanal.sql
--
-- Reglas (deben coincidir con js/utils.js):
--  A) "Eliminar" una actividad = SIEMPRE archivarla. Nunca se borra la fila,
--     así las HH de Manpower, planos, causas y reprogramaciones se conservan.
--     Pueden archivar: admin, coordinador_bim y supervisor_bim (por ROL).
--     Solo restauran: admin y coordinador_bim.
--  B) Una archivada sigue contando en las semanas PPC ya cerradas (fotos),
--     y deja de contar en la semana en curso y en las siguientes.
--  C) Fecha de cierre real: nunca futura (hoy en hora de Lima como máximo)
--     y no anterior a la fecha de inicio programada.
--  D) Poner fecha de cierre -> estado Cerrado. Borrar la fecha de cierre ->
--     vuelve al estado que tenía antes de cerrarse. Marcar Cerrado sin fecha
--     -> fecha de cierre = hoy (Lima).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) COLUMNAS NUEVAS
-- ---------------------------------------------------------------------
alter table public.pendientes_bim add column if not exists archivada_en        timestamptz;
alter table public.pendientes_bim add column if not exists archivada_por       uuid;
alter table public.pendientes_bim add column if not exists estado_antes_cierre text;

create index if not exists idx_pendientes_archivada_en on public.pendientes_bim (archivada_en);

-- Estado previo para las actividades que ya están cerradas hoy
update public.pendientes_bim
set estado_antes_cierre = 'En proceso'
where estado = 'Cerrado' and estado_antes_cierre is null;

-- ---------------------------------------------------------------------
-- 2) HELPERS
-- ---------------------------------------------------------------------
create or replace function public.app_rol_actual()
returns text language sql stable security definer set search_path = public as $$
    select lower(trim(coalesce(rol, ''))) from public.perfiles where id = auth.uid();
$$;

create or replace function public.app_hoy_lima()
returns date language sql stable as $$
    select (now() at time zone 'America/Lima')::date;
$$;

-- ---------------------------------------------------------------------
-- 3) ARCHIVAR / RESTAURAR (únicas vías para cambiar archivada_en)
-- ---------------------------------------------------------------------
create or replace function public.archivar_actividad(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
    if coalesce(public.app_rol_actual(), '') not in ('admin', 'coordinador_bim', 'supervisor_bim') then
        raise exception 'Solo admin, coordinador o supervisor pueden eliminar actividades.';
    end if;
    perform set_config('app.archivo_rpc', '1', true);
    update public.pendientes_bim
    set archivada_en = now(), archivada_por = auth.uid()
    where id = p_id and archivada_en is null;
    if not found then
        raise exception 'La actividad no existe o ya estaba eliminada.';
    end if;
    perform set_config('app.archivo_rpc', '0', true);
end;
$$;

create or replace function public.restaurar_actividad(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
    if coalesce(public.app_rol_actual(), '') not in ('admin', 'coordinador_bim') then
        raise exception 'Solo los administradores pueden restaurar actividades.';
    end if;
    perform set_config('app.archivo_rpc', '1', true);
    update public.pendientes_bim
    set archivada_en = null, archivada_por = null
    where id = p_id and archivada_en is not null;
    if not found then
        raise exception 'La actividad no existe o no está eliminada.';
    end if;
    perform set_config('app.archivo_rpc', '0', true);
end;
$$;

-- Importar Excel con "reemplazar": las actividades vigentes se archivan (antes se borraban)
create or replace function public.archivar_todas_actividades()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
    if coalesce(public.app_rol_actual(), '') not in ('admin', 'coordinador_bim') then
        raise exception 'Solo los administradores pueden reemplazar la base de actividades.';
    end if;
    perform set_config('app.archivo_rpc', '1', true);
    update public.pendientes_bim
    set archivada_en = now(), archivada_por = auth.uid()
    where archivada_en is null;
    get diagnostics n = row_count;
    perform set_config('app.archivo_rpc', '0', true);
    return n;
end;
$$;

revoke execute on function public.archivar_todas_actividades() from public, anon;
grant  execute on function public.archivar_todas_actividades() to authenticated;

revoke execute on function public.archivar_actividad(bigint)  from public, anon;
revoke execute on function public.restaurar_actividad(bigint) from public, anon;
grant  execute on function public.archivar_actividad(bigint)  to authenticated;
grant  execute on function public.restaurar_actividad(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4) TRIGGER: proteger el archivado y aplicar las reglas de cierre
-- ---------------------------------------------------------------------
create or replace function public.pendientes_reglas_cierre_archivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_hoy     date := public.app_hoy_lima();
    v_rol     text := public.app_rol_actual();
    v_previo  text;
    v_cambio_fecha boolean;
begin
    -- A) archivada_en solo cambia por archivar_actividad / restaurar_actividad
    if tg_op = 'INSERT' then
        if auth.uid() is not null then
            new.archivada_en := null;
            new.archivada_por := null;
        end if;
    elsif (new.archivada_en is distinct from old.archivada_en
           or new.archivada_por is distinct from old.archivada_por)
          and auth.uid() is not null
          and coalesce(current_setting('app.archivo_rpc', true), '0') <> '1' then
        raise exception 'Para eliminar o restaurar una actividad usa los botones de la app.';
    end if;

    -- Una actividad eliminada no se edita (primero hay que restaurarla)
    if tg_op = 'UPDATE' and old.archivada_en is not null and new.archivada_en is not null
       and auth.uid() is not null then
        raise exception 'La actividad está eliminada (archivada). Un administrador debe restaurarla para editarla.';
    end if;

    -- D) Reglas de estado <-> fecha de cierre
    if tg_op = 'UPDATE' then
        if old.estado = 'Cerrado' and new.estado = 'Cerrado'
           and old.fecha_cierre is not null and new.fecha_cierre is null then
            -- Se borró la fecha de cierre: vuelve al estado anterior
            new.estado := coalesce(nullif(old.estado_antes_cierre, 'Cerrado'), 'En proceso');
        elsif old.estado = 'Cerrado' and new.estado is distinct from 'Cerrado'
              and new.fecha_cierre is not distinct from old.fecha_cierre then
            -- Se reabrió cambiando el estado: la fecha de cierre se limpia
            new.fecha_cierre := null;
        end if;
    end if;

    if new.fecha_cierre is not null and new.estado is distinct from 'Cerrado' then
        new.estado := 'Cerrado';
    elsif new.estado = 'Cerrado' and new.fecha_cierre is null then
        new.fecha_cierre := v_hoy;
    end if;

    -- Al entrar a Cerrado se guarda el estado del que venía
    if new.estado = 'Cerrado' and (tg_op = 'INSERT' or old.estado is distinct from 'Cerrado') then
        if tg_op = 'UPDATE' then v_previo := old.estado; end if;
        new.estado_antes_cierre := coalesce(nullif(v_previo, 'Cerrado'), 'En proceso');
        -- Los modeladores no cierran actividades
        if auth.uid() is not null and coalesce(v_rol, 'operador') not in ('admin', 'coordinador_bim', 'supervisor_bim') then
            raise exception 'Los modeladores no pueden cerrar actividades. Coordina con tu supervisor.';
        end if;
    end if;

    -- C) Validación de la fecha de cierre (solo cuando se fija o cambia)
    v_cambio_fecha := new.fecha_cierre is not null
        and (tg_op = 'INSERT' or new.fecha_cierre is distinct from old.fecha_cierre
             or new.fecha_inicio_programado is distinct from old.fecha_inicio_programado);
    if v_cambio_fecha and auth.uid() is not null then
        if new.fecha_cierre > v_hoy then
            raise exception 'La fecha de cierre real no puede ser futura (hoy es %).', to_char(v_hoy, 'DD/MM/YYYY');
        end if;
        if new.fecha_inicio_programado is not null and new.fecha_cierre < new.fecha_inicio_programado then
            raise exception 'La fecha de cierre real no puede ser anterior a la fecha de inicio (%).',
                to_char(new.fecha_inicio_programado, 'DD/MM/YYYY');
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_pendientes_reglas_cierre_archivo on public.pendientes_bim;
create trigger trg_pendientes_reglas_cierre_archivo
    before insert or update on public.pendientes_bim
    for each row execute function public.pendientes_reglas_cierre_archivo();

-- A) Nunca se borra una actividad desde la app: se archiva
create or replace function public.pendientes_no_borrar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is not null then
        raise exception 'Las actividades no se borran: se archivan con el botón Eliminar.';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_pendientes_no_borrar on public.pendientes_bim;
create trigger trg_pendientes_no_borrar
    before delete on public.pendientes_bim
    for each row execute function public.pendientes_no_borrar();

-- ---------------------------------------------------------------------
-- 5) MANPOWER: no se cargan ni modifican horas de actividades eliminadas
--    (las HH ya registradas se conservan). Igual que js/utils.js.
-- ---------------------------------------------------------------------
create or replace function public.manpower_violacion_nueva(p_fecha date, p_pendiente_id bigint)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_hoy date := public.manpower_hoy();
    t record;
begin
    if public.manpower_domingo(p_fecha) < v_hoy then
        return 'semana cerrada';
    end if;
    if p_pendiente_id is not null then
        select estado, estado_cde, fecha_cierre, archivada_en into t
        from public.pendientes_bim where id = p_pendiente_id;
        if found then
            if t.archivada_en is not null then
                return 'actividad eliminada';
            end if;
            if t.estado_cde = 'Archived' then
                return 'actividad archivada';
            end if;
            if t.estado = 'Cerrado' then
                if t.fecha_cierre is null then
                    return 'actividad cerrada sin fecha de cierre';
                end if;
                if p_fecha > t.fecha_cierre then
                    return 'fecha posterior al cierre de la actividad';
                end if;
                if v_hoy > public.manpower_limite_cerrada(t.fecha_cierre) then
                    return 'vencido el plazo de la actividad cerrada';
                end if;
            end if;
        end if;
    end if;
    return null;
end;
$$;

create or replace function public.manpower_bloqueo_existente(p_fecha date, p_pendiente_id bigint)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_hoy date := public.manpower_hoy();
    t record;
begin
    if public.manpower_domingo(p_fecha) < v_hoy then
        return 'registro de semana cerrada';
    end if;
    if p_pendiente_id is not null then
        select estado, estado_cde, fecha_cierre, archivada_en into t
        from public.pendientes_bim where id = p_pendiente_id;
        if found then
            if t.archivada_en is not null then
                return 'actividad eliminada';
            end if;
            if t.estado_cde = 'Archived' then
                return 'actividad archivada';
            end if;
            if t.estado = 'Cerrado' and t.fecha_cierre is not null
               and v_hoy > public.manpower_limite_cerrada(t.fecha_cierre) then
                return 'vencido el plazo de la actividad cerrada';
            end if;
        end if;
    end if;
    return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) PPC: una archivada cuenta solo en semanas que terminaron antes de
--    archivarla (las fotos ya congeladas no se tocan).
--    Copia de ppc_calcular_semana con un único filtro nuevo en "base".
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

-- Verificación rápida (opcional):
-- select id, actividad, estado, fecha_cierre, estado_antes_cierre, archivada_en from public.pendientes_bim order by id desc limit 20;
