-- =====================================================================
-- PRUEBAS DE ROLES Y PERMISOS (no es una migración: es una herramienta)
-- Cómo usarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Se puede ejecutar todas las veces que quieras, por ejemplo después de
-- cada script nuevo. Para repetirlas basta con:
--     select * from public.pruebas_roles();
--
-- NO CAMBIA NADA DE TU BASE: crea 4 usuarios ficticios (admin, coordinador,
-- supervisor y modelador), intenta cada acción como cada uno y al final
-- DESHACE TODO (usuarios, actividades, horas, catálogos). Cada prueba se
-- deshace además por separado, así una no afecta a la siguiente.
-- Si Supabase no deja crear usuarios ficticios, usa usuarios reales de cada
-- rol, pero igual deshace todo: ninguna acción queda guardada.
--
-- Resultado: una tabla con ✅ (se comporta como se acordó) o ❌ (no).
-- Si aparece algún ❌, copia la tabla en el hilo para revisarla.
--
-- Requiere: sql/010_control_versiones.sql
-- =====================================================================

-- Ejecuta UNA acción como un usuario y dice si tuvo efecto. Siempre la deshace.
--   p_pre   : preparación, como administrador de la base (puede ser null)
--   p_sql   : la acción, como el usuario (si p_check es null debe devolver boolean)
--   p_check : consulta boolean, como administrador, que confirma el efecto
create or replace function public.prueba_como(p_uid uuid, p_pre text, p_sql text, p_check text)
returns text language plpgsql as $$
declare
    v_ok  boolean;
    v_err text;
begin
    begin
        if p_pre is not null then
            execute p_pre;
        end if;
        perform set_config('request.jwt.claims',
                           json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', p_uid::text, true);
        perform set_config('request.jwt.claim.role', 'authenticated', true);
        perform set_config('role', 'authenticated', true);
        if p_check is null then
            execute p_sql into v_ok;
        else
            execute p_sql;
        end if;
        execute 'reset role';
        if p_check is not null then
            execute p_check into v_ok;
        end if;
        raise exception 'DESHACER_PRUEBA';
    exception when others then
        v_err := sqlerrm;
    end;
    if v_err = 'DESHACER_PRUEBA' then
        return case when coalesce(v_ok, false) then 'permitido' else 'sin efecto' end;
    end if;
    return 'bloqueado: ' || v_err;
end;
$$;

-- Reemplaza {X}, {YO}, etc. por sus valores (ya escritos como SQL)
create or replace function public.prueba_sustituir(p text, p_vars jsonb)
returns text language plpgsql immutable as $$
declare
    k text;
    v text;
begin
    if p is null then
        return null;
    end if;
    for k, v in select key, value from jsonb_each_text(p_vars) loop
        p := replace(p, '{' || k || '}', coalesce(v, 'null'));
    end loop;
    return p;
end;
$$;

create or replace function public.pruebas_roles()
returns table (n int, prueba text, rol text, esperado text, obtenido text, resultado text)
language plpgsql as $$
declare
    v_roles  text[] := array['admin', 'coordinador_bim', 'supervisor_bim', 'operador'];
    v_nombre text[] := array['Admin', 'Coordinador', 'Supervisor', 'Modelador'];
    v_uid    uuid[] := array[null, null, null, null]::uuid[];
    v_res    jsonb  := '[]'::jsonb;
    v_modo   text   := 'usuarios ficticios';
    v_hoy    date;
    v_x      bigint;
    v_y      bigint;
    v_causa  bigint;
    v_grupo  text;
    v_plano  bigint;
    v_prop   bigint;
    v_err    text;
    v_otro   uuid;
    v_vars   jsonb;
    v_esp    text;
    v_obt    text;
    v_ok     boolean;
    t        record;
    i        int;
    s        text;
begin
    if auth.uid() is not null then
        raise exception 'Ejecuta las pruebas desde el SQL Editor de Supabase.';
    end if;

    begin   -- Todo lo de este bloque se deshace al final
        -- 1) Usuarios de prueba
        begin
            for i in 1..4 loop
                v_uid[i] := gen_random_uuid();
                insert into auth.users (id, email, aud, role, created_at, updated_at)
                values (v_uid[i], 'prueba.' || v_roles[i] || '@pruebas.invalid',
                        'authenticated', 'authenticated', now(), now());
                insert into public.perfiles (id, email, rol)
                values (v_uid[i], 'prueba.' || v_roles[i] || '@pruebas.invalid', v_roles[i])
                on conflict (id) do update set rol = excluded.rol;
            end loop;
        exception when others then
            v_modo := 'usuarios reales (no se pudieron crear ficticios: ' || sqlerrm || ')';
            for i in 1..4 loop
                select p.id into v_uid[i] from public.perfiles p
                where lower(trim(coalesce(p.rol, ''))) = v_roles[i]
                order by p.email limit 1;
            end loop;
        end;

        -- 2) Datos de prueba: dos actividades abiertas que ya empezaron
        v_hoy := public.app_hoy_lima();
        select p.id into v_x from public.pendientes_bim p
        where p.archivada_en is null and p.estado in ('No iniciado', 'En proceso')
          and (p.fecha_inicio_programado is null or p.fecha_inicio_programado <= v_hoy)
        order by p.id limit 1;
        if v_x is null then
            raise exception 'No hay actividades abiertas (No iniciado / En proceso) con inicio hasta hoy para probar.';
        end if;
        -- El modelador participa en X como recurso
        if v_uid[4] is not null then
            insert into public.actividad_recursos (pendiente_id, usuario_id)
            select v_x, v_uid[4]
            where not exists (select 1 from public.actividad_recursos r
                              where r.pendiente_id = v_x and r.usuario_id = v_uid[4]);
        end if;
        -- Y: otra actividad donde el modelador NO participa
        select p.id into v_y from public.pendientes_bim p
        where p.archivada_en is null and p.estado in ('No iniciado', 'En proceso')
          and (p.fecha_inicio_programado is null or p.fecha_inicio_programado <= v_hoy)
          and p.id <> v_x
          and p.responsable_id is distinct from v_uid[4]
          and not exists (select 1 from public.actividad_recursos r
                          where r.pendiente_id = p.id and r.usuario_id = v_uid[4])
        order by p.id limit 1;
        select c.id into v_causa from public.causas_incumplimiento c order by c.id limit 1;
        select g.nombre into v_grupo from public.grupos_bim g order by g.nombre limit 1;
        select pl.id into v_plano from public.planos pl order by pl.id limit 1;
        select pd.id into v_prop from public.propiedades_def pd order by pd.id limit 1;
        insert into public.parametros_app (clave, valor, descripcion)
        values ('meta_ppc', 80, 'Meta de PPC semanal en % (Dashboard). Referencia Last Planner: 80%')
        on conflict (clave) do nothing;

        v_res := v_res || jsonb_build_object('n', 0, 'prueba', 'Preparación', 'rol', '',
            'esperado', '', 'obtenido',
            v_modo || ' · actividad X = ' || v_x || ' · actividad Y = ' || coalesce(v_y::text, 'ninguna'),
            'resultado', 'ℹ️');

        -- 3) Pruebas. "esperado": una letra por rol (Admin, Coordinador, Supervisor, Modelador)
        --    S = debe poder · N = no debe poder · - = no aplica
        for t in
            select * from (values
                (1, 'Crear un grupo BIM (catálogo)', null,
                 $q$insert into public.grupos_bim (nombre) values ('ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.grupos_bim where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (2, 'Crear una especialidad (catálogo)', null,
                 $q$insert into public.especialidades (nombre) values ('ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.especialidades where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (3, 'Crear una causa de incumplimiento (catálogo)', null,
                 $q$insert into public.causas_incumplimiento (nombre, activo) values ('ZZ PRUEBA DE ROL', true)$q$,
                 $q$select exists (select 1 from public.causas_incumplimiento where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (4, 'Cambiar la meta de PPC (parámetros)', null,
                 $q$update public.parametros_app set valor = 37 where clave = 'meta_ppc'$q$,
                 $q$select valor = 37 from public.parametros_app where clave = 'meta_ppc'$q$, 'SSNN'),
                (5, 'Eliminar (archivar) una actividad', null,
                 $q$select public.archivar_actividad({X})$q$,
                 $q$select archivada_en is not null from public.pendientes_bim where id = {X}$q$, 'SSSN'),
                (6, 'Restaurar una actividad eliminada',
                 $q$update public.pendientes_bim set archivada_en = now() where id = {X}$q$,
                 $q$select public.restaurar_actividad({X})$q$,
                 $q$select archivada_en is null from public.pendientes_bim where id = {X}$q$, 'SSNN'),
                (7, 'Borrar una actividad para siempre', null,
                 $q$delete from public.pendientes_bim where id = {X}$q$,
                 $q$select not exists (select 1 from public.pendientes_bim where id = {X})$q$, 'NNNN'),
                (8, 'Cambiar el grupo en lote',
                 $q$update public.pendientes_bim set grupo = {GRUPO} where id = {X}$q$,
                 $q$select public.cambiar_grupo_masivo(array[{X}]::bigint[], '')$q$,
                 $q$select grupo is null from public.pendientes_bim where id = {X}$q$, 'SSNN'),
                (9, 'Reemplazar toda la base (archivar todas)', null,
                 $q$select public.archivar_todas_actividades()$q$,
                 $q$select archivada_en is not null from public.pendientes_bim where id = {X}$q$, 'SSNN'),
                (10, 'Cerrar una actividad', null,
                 $q$update public.pendientes_bim set estado = 'Cerrado' where id = {X}$q$,
                 $q$select estado = 'Cerrado' from public.pendientes_bim where id = {X}$q$, 'SSSN'),
                (11, 'Pasar a En espera una actividad donde participa', null,
                 $q$update public.pendientes_bim set estado = 'En espera', motivo_espera_id = {CAUSA} where id = {X}$q$,
                 $q$select estado = 'En espera' from public.pendientes_bim where id = {X}$q$, 'SSSS'),
                (12, 'Pasar a En espera una actividad donde NO participa', null,
                 $q$update public.pendientes_bim set estado = 'En espera', motivo_espera_id = {CAUSA} where id = {Y}$q$,
                 $q$select estado = 'En espera' from public.pendientes_bim where id = {Y}$q$, 'SSSN'),
                (13, 'Pasar a En espera SIN motivo', null,
                 $q$update public.pendientes_bim set estado = 'En espera', motivo_espera_id = null where id = {X}$q$,
                 $q$select estado = 'En espera' from public.pendientes_bim where id = {X}$q$, 'NNNN'),
                (14, 'Registrar horas hoy en una actividad donde participa', null,
                 $q$insert into public.manpower_registros (pendiente_id, usuario_id, fecha, porcentaje_dia, descripcion)
                    values ({X}, {YO}, {HOY}, 10, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.manpower_registros where usuario_id = {YO} and descripcion = 'ZZ PRUEBA DE ROL')$q$, 'SSSS'),
                (15, 'Registrar horas en una fecha futura', null,
                 $q$insert into public.manpower_registros (pendiente_id, usuario_id, fecha, porcentaje_dia, descripcion)
                    values ({X}, {YO}, {FUTURO}, 10, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.manpower_registros where usuario_id = {YO} and descripcion = 'ZZ PRUEBA DE ROL')$q$, 'NNNN'),
                (16, 'Cambiar su propio rol a admin', null,
                 $q$update public.perfiles set rol = 'admin' where id = {YO}$q$,
                 $q$select rol = 'admin' from public.perfiles where id = {YO}$q$, '--NN'),
                (17, 'Cambiar el rol de otro usuario a admin', null,
                 $q$update public.perfiles set rol = 'admin' where id = {OTRO}$q$,
                 $q$select rol = 'admin' from public.perfiles where id = {OTRO}$q$, '--NN'),
                (18, 'Ver el registro de scripts SQL', null,
                 $q$select count(*) > 0 from public.migraciones_aplicadas$q$,
                 null, 'SSNN'),
                (19, 'Modificar una foto congelada del PPC', null,
                 $q$update public.snapshots_semanales set ppc = -1
                    where semana = (select max(semana) from public.snapshots_semanales)$q$,
                 $q$select exists (select 1 from public.snapshots_semanales where ppc = -1)$q$, 'NNNN'),
                (20, 'Crear un feriado (Roster)', null,
                 $q$insert into public.feriados (fecha, nombre) values ({HOY}, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.feriados where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (21, 'Registrar descanso de otro usuario (Roster)', null,
                 $q$insert into public.descansos (usuario_id, fecha_inicio, fecha_fin, motivo) values ({OTRO}, {HOY}, {HOY}, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.descansos where motivo = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (22, 'Registrar descanso médico (Roster)', null,
                 $q$insert into public.descansos_medicos (usuario_id, fecha_inicio, fecha_fin, motivo) values ({OTRO}, {HOY}, {HOY}, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.descansos_medicos where motivo = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (23, 'Registrar trabajo extra (Roster)', null,
                 $q$insert into public.trabajos_extra (usuario_id, fecha, motivo) values ({OTRO}, {HOY}, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.trabajos_extra where motivo = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (24, 'Crear una subcontrata (Configuración)', null,
                 $q$insert into public.subcontratas (nombre) values ('ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.subcontratas where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (25, 'Crear un parámetro personalizado (Configuración)', null,
                 $q$insert into public.propiedades_def (nombre, tipo) values ('ZZ PRUEBA DE ROL', 'texto')$q$,
                 $q$select exists (select 1 from public.propiedades_def where nombre = 'ZZ PRUEBA DE ROL')$q$, 'SSNN'),
                (26, 'Crear un plano (Log de planos)', null,
                 $q$insert into public.planos (codigo, revision, titulo) values ('ZZ-PRUEBA-ROL', '0', 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.planos where codigo = 'ZZ-PRUEBA-ROL')$q$, 'SSNN'),
                (27, 'Asignar causa a una actividad donde participa',
                 $q$delete from public.tarea_causas where pendiente_id = {X}$q$,
                 $q$insert into public.tarea_causas (pendiente_id, causa_id) values ({X}, {CAUSA})$q$,
                 $q$select exists (select 1 from public.tarea_causas where pendiente_id = {X})$q$, 'SSSS'),
                (28, 'Asignar causa a una actividad donde NO participa',
                 $q$delete from public.tarea_causas where pendiente_id = {Y}$q$,
                 $q$insert into public.tarea_causas (pendiente_id, causa_id) values ({Y}, {CAUSA})$q$,
                 $q$select exists (select 1 from public.tarea_causas where pendiente_id = {Y})$q$, 'SSSN'),
                (29, 'Vincular un plano a una actividad donde NO participa',
                 $q$delete from public.actividad_planos where pendiente_id = {Y}$q$,
                 $q$insert into public.actividad_planos (pendiente_id, plano_id) values ({Y}, {PLANO})$q$,
                 $q$select exists (select 1 from public.actividad_planos where pendiente_id = {Y})$q$, 'SSSN'),
                (30, 'Guardar parámetro personalizado en actividad donde NO participa',
                 $q$delete from public.propiedades_valores where pendiente_id = {Y}$q$,
                 $q$insert into public.propiedades_valores (pendiente_id, propiedad_id, valor_texto) values ({Y}, {PROP}, 'ZZ PRUEBA DE ROL')$q$,
                 $q$select exists (select 1 from public.propiedades_valores where pendiente_id = {Y})$q$, 'SSSN')
            ) as v(num, nombre, pre, accion, chequeo, esperados)
        loop
            for i in 1..4 loop
                v_esp := substr(t.esperados, i, 1);
                continue when v_esp = '-';
                v_obt := null;
                if v_uid[i] is null then
                    v_obt := 'no probado: no hay usuario con este rol';
                elsif t.accion like '%{Y}%' and v_y is null then
                    v_obt := 'no probado: falta una segunda actividad abierta';
                elsif t.accion like '%{CAUSA}%' and v_causa is null then
                    v_obt := 'no probado: no hay causas de incumplimiento';
                elsif coalesce(t.pre, '') like '%{GRUPO}%' and v_grupo is null then
                    v_obt := 'no probado: no hay grupos BIM';
                elsif t.accion like '%{PLANO}%' and v_plano is null then
                    v_obt := 'no probado: no hay planos';
                elsif t.accion like '%{PROP}%' and v_prop is null then
                    v_obt := 'no probado: no hay parámetros personalizados';
                end if;

                if v_obt is null then
                    -- "Otro usuario": el supervisor prueba con el modelador y viceversa
                    v_otro := case when i = 4 then v_uid[3] else v_uid[4] end;
                    v_vars := jsonb_build_object(
                        'X', v_x::text,
                        'Y', v_y::text,
                        'CAUSA', v_causa::text,
                        'GRUPO', quote_nullable(v_grupo),
                        'YO', quote_literal(v_uid[i]::text) || '::uuid',
                        'OTRO', coalesce(quote_literal(v_otro::text) || '::uuid', 'null'),
                        'HOY', quote_literal(v_hoy::text) || '::date',
                        'FUTURO', quote_literal((v_hoy + 3)::text) || '::date',
                        'PLANO', v_plano::text,
                        'PROP', v_prop::text);
                    v_obt := public.prueba_como(v_uid[i],
                        public.prueba_sustituir(t.pre, v_vars),
                        public.prueba_sustituir(t.accion, v_vars),
                        public.prueba_sustituir(t.chequeo, v_vars));
                end if;

                v_ok := case when v_obt like 'no probado%' then null
                             when v_esp = 'S' then v_obt = 'permitido'
                             else v_obt <> 'permitido' end;
                v_res := v_res || jsonb_build_object(
                    'n', t.num, 'prueba', t.nombre, 'rol', v_nombre[i],
                    'esperado', case v_esp when 'S' then 'Permitido' else 'Bloqueado' end,
                    'obtenido', v_obt,
                    'resultado', case when v_ok is null then '⏭️ sin probar'
                                      when v_ok then '✅ OK' else '❌ REVISAR' end);
            end loop;
        end loop;

        raise exception 'FIN_PRUEBAS';
    exception when others then
        v_err := sqlerrm;
    end;

    if v_err is distinct from 'FIN_PRUEBAS' then
        v_res := v_res || jsonb_build_object('n', -1, 'prueba', 'ERROR al preparar las pruebas',
            'rol', '', 'esperado', '', 'obtenido', v_err, 'resultado', '❌ REVISAR');
    end if;

    return query
        select (e->>'n')::int, e->>'prueba', e->>'rol', e->>'esperado', e->>'obtenido', e->>'resultado'
        from jsonb_array_elements(v_res) with ordinality as x(e, ord)
        order by (e->>'n')::int, x.ord;
end;
$$;

revoke execute on function public.prueba_como(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.pruebas_roles() from public, anon, authenticated;
revoke execute on function public.prueba_sustituir(text, jsonb) from public, anon, authenticated;

select * from public.pruebas_roles();
