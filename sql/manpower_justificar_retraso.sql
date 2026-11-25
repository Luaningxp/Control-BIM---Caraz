-- =====================================================================
-- MANPOWER: justificación de retraso también para modeladores (2026-11-25)
-- Zona horaria del proyecto: America/Lima
--
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Requiere haber ejecutado antes sql/manpower_corte_semanal.sql y
-- sql/archivar_actividades_cierre.sql. Se puede volver a ejecutar sin romper nada.
-- Ejecutarlo ANTES (o junto) de publicar la versión de la app que lo usa.
--
-- Reglas nuevas (deben coincidir con js/utils.js y js/manpower.js):
--   A. Pasado el plazo de una actividad cerrada (cierre + 2 días, tope domingo),
--      CUALQUIER usuario puede cargarle horas justificando el retraso. La
--      justificación queda en manpower_correcciones. Sin aprobación.
--      Sigue valiendo: solo semana en curso (sin rol admin) y fecha <= fecha_cierre.
--   B. Corregir un registro de la semana en curso (editarlo sin cambiarle la
--      actividad, o eliminarlo) no pide justificación aunque su actividad haya
--      cerrado hace más de 2 días.
--   C. El resto no cambia: semanas cerradas, actividades eliminadas o archivadas
--      y fechas posteriores al cierre siguen siendo solo para admin con justificación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Registro existente: el plazo de la cerrada ya no lo bloquea (regla B)
-- ---------------------------------------------------------------------
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
    return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Trigger de validación (reglas A y B)
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
        -- Regla B: corregir sin cambiar la actividad no pide justificación por el plazo
        if tg_op = 'UPDATE' and v_nuevo = c_retraso
           and new.pendiente_id is not distinct from old.pendiente_id then
            v_nuevo := null;
        end if;
    end if;

    -- Primero el bloqueo del registro existente (más estricto), luego el de la fila nueva
    if tg_op in ('UPDATE', 'DELETE') then
        v_motivo := public.manpower_bloqueo_existente(old.fecha, old.pendiente_id);
    end if;
    v_motivo := coalesce(v_motivo, v_nuevo);

    if v_motivo is null then
        if tg_op = 'DELETE' then return old; end if;
        new.justificacion_correccion := null;
        return new;
    end if;

    -- Regla A: el retraso en una cerrada lo justifica cualquiera; el resto, solo un admin
    if not v_admin and v_motivo <> c_retraso then
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
