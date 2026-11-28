-- =====================================================================
-- 017 · LOS MODELADORES CIERRAN, REABREN Y CORRIGEN SUS ACTIVIDADES
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/004 (reglas de cierre), sql/009 (historial de estados)
--           y sql/010 (registro).
--
-- Regla acordada (2026-11-28):
--   A) Los modeladores (rol operador) pueden cerrar una actividad solo si
--      están asignados a ella (responsable o recurso). Admin, coordinador
--      y supervisor siguen cerrando cualquiera.
--   B) La fecha de cierre sigue las reglas de siempre: nunca futura (hora
--      Lima) ni anterior al inicio programado; Cerrado sin fecha = hoy.
--      Si cierra después del Fin Prog. debe registrar la causa (la app y
--      validar_guardado_tarea ya lo exigen para todos los roles).
--   C) También pueden reabrirla o corregir la fecha de cierre, SIEMPRE
--      (sin límite de semana), en las actividades donde están asignados.
--   D) Cada cambio de estado, de motivo de espera o de fecha de cierre
--      queda en pendientes_estado_historial (quién, cuándo, antes/después).
--      Ahora guarda también la fecha de cierre anterior y la nueva.
--   E) Solo los administradores (admin y coordinador) leen el historial.
-- No cambia ningún dato existente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Historial: fecha de cierre anterior y nueva + lectura solo admin
-- ---------------------------------------------------------------------
alter table public.pendientes_estado_historial
    add column if not exists fecha_cierre_anterior date,
    add column if not exists fecha_cierre_nueva    date;

drop policy if exists "estado_hist_select" on public.pendientes_estado_historial;
create policy "estado_hist_select" on public.pendientes_estado_historial
    for select to authenticated using (public.manpower_es_admin());

-- ---------------------------------------------------------------------
-- 2) Reglas de cierre (sql/004): se quita "los modeladores no cierran".
--    El permiso por asignación se valida en pendientes_espera_antes (3).
-- ---------------------------------------------------------------------
create or replace function public.pendientes_reglas_cierre_archivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_hoy     date := public.app_hoy_lima();
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

-- ---------------------------------------------------------------------
-- 3) Antes de guardar (sql/009): los modeladores cambian estado, motivo
--    de espera y fecha de cierre solo donde están asignados
-- ---------------------------------------------------------------------
create or replace function public.pendientes_espera_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.app_rol_actual();
    v_asignado boolean;
    v_cambia boolean;
begin
    if new.estado is distinct from 'En espera' then
        new.motivo_espera_id := null;
    end if;

    if auth.uid() is not null
       and coalesce(nullif(v_rol, ''), 'operador') not in ('admin', 'coordinador_bim', 'supervisor_bim') then
        if tg_op = 'INSERT' then
            v_cambia := new.estado = 'Cerrado' or new.fecha_cierre is not null;
        else
            v_cambia := new.estado is distinct from old.estado
                     or new.motivo_espera_id is distinct from old.motivo_espera_id
                     or new.fecha_cierre is distinct from old.fecha_cierre;
        end if;
        if v_cambia then
            select (new.responsable_id = auth.uid())
                or exists (select 1 from public.actividad_recursos r
                           where r.pendiente_id = new.id and r.usuario_id = auth.uid())
            into v_asignado;
            if not coalesce(v_asignado, false) then
                raise exception 'Solo puedes cambiar el estado o el cierre de las actividades en las que estás asignado.';
            end if;
        end if;
    end if;

    if tg_op = 'UPDATE' and auth.uid() is not null then
        -- Motivo obligatorio al entrar a "En espera" (o si se borra estando en espera)
        if new.estado = 'En espera' and new.motivo_espera_id is null
           and (old.estado is distinct from 'En espera' or old.motivo_espera_id is not null) then
            raise exception 'Elige el motivo de espera.';
        end if;
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Validación de cierre (función creada en Supabase, no versionada
--    antes): se quita el "solo supervisor, coordinador o BIM Manager".
--    Se mantiene: no se cierra sin fecha de cierre real.
-- ---------------------------------------------------------------------
create or replace function public.trg_validar_cierre_actividad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    -- Permite operaciones de servidor / SQL Editor (sin usuario autenticado)
    if auth.uid() is null then
        return new;
    end if;
    if new.estado = 'Cerrado' and new.fecha_cierre is null then
        raise exception 'No se puede cerrar la actividad sin Fecha de Cierre Real.';
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Después de guardar (sql/009): historial con fecha de cierre
-- ---------------------------------------------------------------------
create or replace function public.pendientes_espera_despues()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_old_estado text := case when tg_op = 'UPDATE' then old.estado end;
    v_old_motivo bigint := case when tg_op = 'UPDATE' then old.motivo_espera_id end;
    v_old_cierre date := case when tg_op = 'UPDATE' then old.fecha_cierre end;
begin
    if tg_op = 'INSERT' or new.estado is distinct from v_old_estado
       or new.motivo_espera_id is distinct from v_old_motivo
       or new.fecha_cierre is distinct from v_old_cierre then
        insert into public.pendientes_estado_historial
            (pendiente_id, estado_anterior, estado_nuevo, motivo_espera_id,
             fecha_cierre_anterior, fecha_cierre_nueva, cambiado_por)
        values (new.id, v_old_estado, new.estado, new.motivo_espera_id,
                v_old_cierre, new.fecha_cierre, auth.uid());
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

select public.registrar_migracion(17, '017_modeladores_cierran');
