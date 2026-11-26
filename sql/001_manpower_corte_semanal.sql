-- =====================================================================
-- [Control de versiones] Script 001 de sql/. Si lo vuelves a ejecutar, revisa
-- después Configuración > Base de datos: te dirá si hay que re-ejecutar alguno
-- posterior que redefine las mismas funciones.
-- MANPOWER: corte semanal, actividades cerradas y auditoría de correcciones
-- Zona horaria del proyecto: America/Lima
--
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Se puede volver a ejecutar sin romper nada.
-- Ejecutarlo ANTES de publicar la versión de la app que lo usa.
--
-- OJO: este archivo ya no es la versión final de las reglas. Si alguna vez lo vuelves
-- a ejecutar, ejecuta DESPUÉS, en este orden:
--   sql/archivar_actividades_cierre.sql
--   sql/manpower_justificar_retraso.sql
--
-- Reglas (deben coincidir con js/utils.js):
--   1. "Hoy" = fecha actual en America/Lima.
--   2. La semana va de lunes a domingo; se cierra el domingo 23:59.
--   3. Nadie registra horas en fechas futuras.
--   4. Sin rol admin, no se crea, edita ni elimina nada de una semana cerrada.
--   5. Actividad cerrada: solo fechas <= fecha_cierre, y solo hasta
--      fecha_cierre + 2 días calendario (sin pasar del domingo de esa semana).
--   6. Actividades archivadas en el CDE no reciben horas.
--   7. Rol admin (admin / coordinador_bim: BIM Manager y Coordinador BIM)
--      puede saltarse 4-6 con justificación obligatoria, que queda auditada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funciones de apoyo
-- ---------------------------------------------------------------------
create or replace function public.manpower_hoy()
returns date language sql stable as $$
    select (now() at time zone 'America/Lima')::date;
$$;

-- Domingo de la semana (lunes-domingo) que contiene la fecha
create or replace function public.manpower_domingo(p_fecha date)
returns date language sql immutable as $$
    select p_fecha + (7 - extract(isodow from p_fecha)::int);
$$;

-- Último día en que una actividad cerrada admite horas: cierre + 2, tope domingo
create or replace function public.manpower_limite_cerrada(p_fecha_cierre date)
returns date language sql immutable as $$
    select least(p_fecha_cierre + 2, public.manpower_domingo(p_fecha_cierre));
$$;

create or replace function public.manpower_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.perfiles
        where id = auth.uid()
          and lower(trim(coalesce(rol, ''))) in ('admin', 'coordinador_bim')
    );
$$;

-- Motivo por el que una fila NUEVA (insert / resultado de update) rompe la regla; NULL si cumple.
-- No incluye "fecha futura", que se rechaza siempre aparte.
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
        select estado, estado_cde, fecha_cierre into t
        from public.pendientes_bim where id = p_pendiente_id;
        if found then
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

-- Motivo por el que una fila EXISTENTE (antes de update / delete) está bloqueada; NULL si libre.
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
        select estado, estado_cde, fecha_cierre into t
        from public.pendientes_bim where id = p_pendiente_id;
        if found then
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
-- 2) Campo de paso para la justificación (el trigger lo consume y lo deja en NULL)
-- ---------------------------------------------------------------------
alter table public.manpower_registros
    add column if not exists justificacion_correccion text;

-- ---------------------------------------------------------------------
-- 3) Tabla de auditoría (solo lectura para admin; solo escribe el trigger)
-- ---------------------------------------------------------------------
create table if not exists public.manpower_correcciones (
    id              bigint generated always as identity primary key,
    registro_id     bigint,
    accion          text        not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
    justificacion   text        not null,
    motivo_regla    text,
    datos_antes     jsonb,
    datos_despues   jsonb,
    realizado_por   uuid        default auth.uid(),
    realizado_en    timestamptz not null default now()
);

alter table public.manpower_correcciones enable row level security;

drop policy if exists "manpower_correcciones_select_admin" on public.manpower_correcciones;
create policy "manpower_correcciones_select_admin" on public.manpower_correcciones
    for select to authenticated
    using (public.manpower_es_admin());

-- ---------------------------------------------------------------------
-- 4) Trigger de validación
-- ---------------------------------------------------------------------
create or replace function public.manpower_validar_corte()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_admin   boolean;
    v_motivo  text;
    v_justif  text;
begin
    -- Operaciones sin usuario (SQL Editor, service role, tareas internas) no se validan
    if auth.uid() is null then
        if tg_op = 'DELETE' then return old; end if;
        new.justificacion_correccion := null;
        return new;
    end if;

    v_admin := public.manpower_es_admin();

    if tg_op in ('INSERT', 'UPDATE') then
        if new.fecha > public.manpower_hoy() then
            raise exception 'No se pueden registrar horas en una fecha futura (%).', new.fecha
                using errcode = 'check_violation';
        end if;
        v_motivo := public.manpower_violacion_nueva(new.fecha, new.pendiente_id);
    end if;

    if tg_op in ('UPDATE', 'DELETE') and v_motivo is null then
        v_motivo := public.manpower_bloqueo_existente(old.fecha, old.pendiente_id);
    end if;

    if v_motivo is null then
        if tg_op = 'DELETE' then return old; end if;
        new.justificacion_correccion := null;
        return new;
    end if;

    if not v_admin then
        raise exception 'Operación no permitida: %. Pide la corrección a un administrador.', v_motivo
            using errcode = 'insufficient_privilege';
    end if;

    -- Admin fuera de regla: justificación obligatoria
    if tg_op = 'DELETE' then
        v_justif := nullif(trim(coalesce(current_setting('app.justificacion_manpower', true), '')), '');
    else
        v_justif := nullif(trim(coalesce(new.justificacion_correccion, '')), '');
    end if;

    if v_justif is null then
        raise exception 'Corrección fuera del corte (%): la justificación es obligatoria.', v_motivo
            using errcode = 'check_violation';
    end if;

    insert into public.manpower_correcciones
        (registro_id, accion, justificacion, motivo_regla, datos_antes, datos_despues)
    values (
        case when tg_op = 'DELETE' then old.id else new.id end,
        tg_op,
        v_justif,
        v_motivo,
        case when tg_op = 'INSERT' then null else to_jsonb(old) - 'justificacion_correccion' end,
        case when tg_op = 'DELETE' then null else to_jsonb(new) - 'justificacion_correccion' end
    );

    if tg_op = 'DELETE' then return old; end if;
    new.justificacion_correccion := null;
    return new;
end;
$$;

drop trigger if exists trg_manpower_validar_corte on public.manpower_registros;
create trigger trg_manpower_validar_corte
    before insert or update or delete on public.manpower_registros
    for each row execute function public.manpower_validar_corte();

-- ---------------------------------------------------------------------
-- 5) Eliminación justificada (para admin fuera del corte)
--    SECURITY INVOKER: respeta las políticas RLS de DELETE ya existentes.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_manpower_justificado(p_id bigint, p_justificacion text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
    v_count int;
begin
    if nullif(trim(coalesce(p_justificacion, '')), '') is null then
        raise exception 'La justificación es obligatoria.' using errcode = 'check_violation';
    end if;
    perform set_config('app.justificacion_manpower', p_justificacion, true);
    delete from public.manpower_registros where id = p_id;
    get diagnostics v_count = row_count;
    return v_count > 0;
end;
$$;

grant execute on function public.eliminar_manpower_justificado(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- Control de versiones: deja la marca de que este script se ejecutó
-- (ver sql/010_control_versiones.sql y Configuración > Base de datos)
-- ---------------------------------------------------------------------
do $registro$
begin
    if to_regprocedure('public.registrar_migracion(integer,text,text)') is not null then
        perform public.registrar_migracion(1, '001_manpower_corte_semanal');
    end if;
end
$registro$;
