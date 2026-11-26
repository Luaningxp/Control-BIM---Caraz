-- =====================================================================
-- MANPOWER: registro por fecha, semanas cerradas con justificación para todos (2026-11-25)
-- Zona horaria del proyecto: America/Lima
--
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Requiere haber ejecutado antes, en este orden:
--   sql/manpower_corte_semanal.sql
--   sql/archivar_actividades_cierre.sql
--   sql/manpower_justificar_retraso.sql
-- Este archivo es la versión vigente de las reglas: si re-ejecutas alguno de los
-- anteriores, vuelve a ejecutar este al final. Se puede volver a ejecutar sin romper nada.
-- Ejecutarlo ANTES (o junto) de publicar la versión de la app que lo usa.
--
-- Reglas (deben coincidir con clasificarRegistroManpower / bloqueoRegistroExistente en js/utils.js):
--   1. Nadie registra en fechas futuras.
--   2. PROHIBIDO PARA TODOS (también admin): actividad eliminada o archivada,
--      actividad cerrada sin fecha de cierre, fecha posterior al cierre de la actividad.
--   3. Con justificación, CUALQUIER usuario:
--        - registrar, editar o eliminar en una semana ya cerrada (sin límite hacia atrás);
--        - cargar en una actividad cerrada con el plazo vencido (cierre + 2 días, tope domingo).
--   4. Corregir un registro sin cambiarle la actividad no pide justificación por el plazo
--      de la cerrada (sí por semana cerrada).
--   5. Editar o eliminar un registro cuya actividad fue eliminada o archivada: solo admin,
--      con justificación.
--   6. Registrar antes del inicio programado (adelanto) es libre.
--   Toda justificación queda en manpower_correcciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fila nueva (insert o resultado de update): motivo o NULL si cumple.
--    Primero los prohibidos (regla 2), luego los justificables (regla 3).
-- ---------------------------------------------------------------------
create or replace function public.manpower_violacion_nueva(p_fecha date, p_pendiente_id bigint)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_hoy date := public.manpower_hoy();
    t record;
begin
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
            end if;
        end if;
    end if;
    if public.manpower_domingo(p_fecha) < v_hoy then
        return 'semana cerrada';
    end if;
    if p_pendiente_id is not null then
        if t.estado = 'Cerrado' and v_hoy > public.manpower_limite_cerrada(t.fecha_cierre) then
            return 'vencido el plazo de la actividad cerrada';
        end if;
    end if;
    return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Registro existente (antes de update / delete): motivo o NULL si libre.
-- ---------------------------------------------------------------------
create or replace function public.manpower_bloqueo_existente(p_fecha date, p_pendiente_id bigint)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    t record;
begin
    if p_pendiente_id is not null then
        select estado_cde, archivada_en into t
        from public.pendientes_bim where id = p_pendiente_id;
        if found then
            if t.archivada_en is not null then
                return 'actividad eliminada';
            end if;
            if t.estado_cde = 'Archived' then
                return 'actividad archivada';
            end if;
        end if;
    end if;
    if public.manpower_domingo(p_fecha) < public.manpower_hoy() then
        return 'registro de semana cerrada';
    end if;
    return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Trigger de validación
-- ---------------------------------------------------------------------
create or replace function public.manpower_validar_corte()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_admin   boolean;
    v_motivo  text;
    v_nuevo   text;
    v_justif  text;
    c_retraso constant text := 'vencido el plazo de la actividad cerrada';
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
        v_nuevo := public.manpower_violacion_nueva(new.fecha, new.pendiente_id);
        -- Regla 2: prohibido para todos
        if v_nuevo in ('actividad eliminada', 'actividad archivada',
                       'actividad cerrada sin fecha de cierre',
                       'fecha posterior al cierre de la actividad') then
            raise exception 'Operación no permitida: %.', v_nuevo
                using errcode = 'check_violation';
        end if;
        -- Regla 4: corregir sin cambiar la actividad no pide justificación por el plazo
        if tg_op = 'UPDATE' and v_nuevo = c_retraso
           and new.pendiente_id is not distinct from old.pendiente_id then
            v_nuevo := null;
        end if;
    end if;

    -- Primero el motivo del registro existente, luego el de la fila nueva
    if tg_op in ('UPDATE', 'DELETE') then
        v_motivo := public.manpower_bloqueo_existente(old.fecha, old.pendiente_id);
    end if;
    v_motivo := coalesce(v_motivo, v_nuevo);

    if v_motivo is null then
        if tg_op = 'DELETE' then return old; end if;
        new.justificacion_correccion := null;
        return new;
    end if;

    -- Regla 5: registros de actividades eliminadas o archivadas, solo admin
    if not v_admin and v_motivo in ('actividad eliminada', 'actividad archivada') then
        raise exception 'Operación no permitida: %. Pide la corrección a un administrador.', v_motivo
            using errcode = 'insufficient_privilege';
    end if;

    -- Fuera de regla: justificación obligatoria
    if tg_op = 'DELETE' then
        v_justif := nullif(trim(coalesce(current_setting('app.justificacion_manpower', true), '')), '');
    else
        v_justif := nullif(trim(coalesce(new.justificacion_correccion, '')), '');
    end if;

    if v_justif is null then
        raise exception 'Fuera de regla (%): la justificación es obligatoria.', v_motivo
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
-- El trigger trg_manpower_validar_corte ya existe y usa esta función: no hace falta recrearlo.
