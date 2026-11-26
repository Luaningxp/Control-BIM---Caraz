-- =====================================================================
-- 010 · CONTROL DE VERSIONES DE LA BASE DE DATOS
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- No cambia ningún dato de la app: solo agrega herramientas de control.
--
-- Qué agrega:
--   1) migraciones_aplicadas: anota cada script de sql/ que se ejecutó
--      (número, nombre, cuándo y quién). Cada script desde el 010 se
--      registra solo al terminar.
--   2) Detección de los scripts 001-009, que se ejecutaron antes de existir
--      este control: se revisa si sus tablas, columnas y funciones están en
--      la base y, si están, se registran como "detectado".
--   3) Revisión de las funciones que varios scripts redefinen (Manpower y
--      PPC): dice de qué script es la versión que está vigente.
--   4) exportar_esquema(): devuelve la estructura de la base (sin datos)
--      como texto .sql. En la app: Configuración > Base de datos.
--   5) estado_base_datos(): lo que muestra Configuración > Base de datos.
-- Solo los administradores (admin y coordinador_bim) lo pueden consultar.
--
-- Al final muestra una tabla con el estado de cada script.
-- Requiere: sql/001_manpower_corte_semanal.sql (public.manpower_es_admin).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) REGISTRO DE SCRIPTS EJECUTADOS
-- ---------------------------------------------------------------------
create table if not exists public.migraciones_aplicadas (
    numero        int primary key,
    nombre        text        not null,
    aplicada_en   timestamptz not null default now(),
    aplicada_por  text,
    metodo        text        not null default 'ejecutado'
                  check (metodo in ('ejecutado', 'detectado'))
);

alter table public.migraciones_aplicadas enable row level security;

drop policy if exists "migraciones_select_admin" on public.migraciones_aplicadas;
create policy "migraciones_select_admin" on public.migraciones_aplicadas
    for select to authenticated using (public.manpower_es_admin());
-- Sin políticas de escritura: solo se escribe desde el SQL Editor.

-- ¿La llamada viene de la app (usuario con sesión) o del SQL Editor?
create or replace function public.bd_desde_app()
returns boolean language sql stable as $$
    select auth.uid() is not null or session_user in ('authenticator', 'anon', 'authenticated');
$$;

-- Lo llama cada script al terminar. Si se vuelve a ejecutar, actualiza fecha y autor.
create or replace function public.registrar_migracion(p_numero int, p_nombre text, p_metodo text default 'ejecutado')
returns void language plpgsql security definer set search_path = public as $$
begin
    if public.bd_desde_app() then
        raise exception 'Los scripts solo se registran desde el SQL Editor de Supabase.';
    end if;
    insert into public.migraciones_aplicadas as m (numero, nombre, aplicada_en, aplicada_por, metodo)
    values (p_numero, p_nombre, now(), session_user, p_metodo)
    on conflict (numero) do update
        set nombre = excluded.nombre,
            aplicada_en = case when excluded.metodo = 'ejecutado' then excluded.aplicada_en
                               else m.aplicada_en end,
            aplicada_por = case when excluded.metodo = 'ejecutado' then excluded.aplicada_por
                                else m.aplicada_por end,
            metodo = case when m.metodo = 'ejecutado' then 'ejecutado'
                          else excluded.metodo end;
end;
$$;

revoke execute on function public.registrar_migracion(int, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) VERSIONES DE LAS FUNCIONES QUE VARIOS SCRIPTS REDEFINEN
--    Huella (md5) del cuerpo de cada versión publicada en el repositorio.
-- ---------------------------------------------------------------------
create or replace function public.bd_huellas()
returns table (funcion text, script text, huella text) language sql immutable as $$
    values
        ('manpower_violacion_nueva',   '001', '811083089123828b4f54861ab36449a3'),
        ('manpower_violacion_nueva',   '004', 'd851bae3f0dead724a021adbeef5b60f'),
        ('manpower_violacion_nueva',   '006', '109bc610b9c4505d5b9f6c9b3e0ad455'),
        ('manpower_bloqueo_existente', '001', '810fcd25769c1e8a70d26201bb82ece3'),
        ('manpower_bloqueo_existente', '004', '4043ea91ea51ab4a516f03a2020e5eb9'),
        ('manpower_bloqueo_existente', '004', 'db721e5ee50a6b9eef68a8562f28e7fe'),
        ('manpower_bloqueo_existente', '005', 'dbff3682f047aebda98c67f8e843c7dc'),
        ('manpower_bloqueo_existente', '006', '5a4707d79d3774d94f1784a1062581f8'),
        ('manpower_validar_corte',     '001', '6a372b256939ddcc6dc072bae3c13a7a'),
        ('manpower_validar_corte',     '005', '37032773fec555af03b3b33ceb843710'),
        ('manpower_validar_corte',     '006', 'f395f96b5898be9e4c47419034bc9040'),
        ('ppc_calcular_semana',        '002', '52a1b73880a0196374c2e497186c2452'),
        ('ppc_calcular_semana',        '002', 'a9276fc1ce742b907268effd3f093d69'),
        ('ppc_calcular_semana',        '004', '6fb7c0b431c1107dd4c2f36a0d83b206'),
        ('ppc_calcular_semana',        '009', '8eab37a8a45ba72710acf929e275eebc'),
        ('ppc_congelar_semana',        '002', '048fd67b6cce7f861b54c528c71faeb5'),
        ('ppc_congelar_semana',        '002', '22f516339cea0c4aa51e5e136974b263'),
        ('ppc_congelar_semana',        '009', '296cca83cec499c2abb3da9c71571bf4'),
        ('dashboard_semanas',          '002', '962508f394a4db07f24d5fef8511e5a8'),
        ('dashboard_semanas',          '009', '7f09073ca94a56f5436d5aacdf089b8a')
$$;

create or replace function public.bd_version_funcion(p_funcion text)
returns text language sql stable security definer set search_path = public as $$
    select coalesce(
        (select h.script
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
         join public.bd_huellas() h
           on h.funcion = p.proname
          and h.huella = md5(regexp_replace(replace(p.prosrc, chr(13), ''), '^\s+|\s+$', '', 'g'))
         where p.proname = p_funcion
         order by h.script desc
         limit 1),
        case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = p_funcion)
             then 'cambiada' else 'no existe' end);
$$;

-- Versión vigente vs. la que debería estar (la del script más nuevo que la define)
create or replace function public.bd_versiones_funciones()
returns table (funcion text, vigente text, esperada text, script_esperado text, ok boolean)
language sql stable security definer set search_path = public as $$
    select e.funcion, public.bd_version_funcion(e.funcion), e.esperada, e.archivo,
           public.bd_version_funcion(e.funcion) = e.esperada
    from (values
        ('manpower_violacion_nueva',   '006', '006_manpower_registro_por_fecha.sql'),
        ('manpower_bloqueo_existente', '006', '006_manpower_registro_por_fecha.sql'),
        ('manpower_validar_corte',     '006', '006_manpower_registro_por_fecha.sql'),
        ('ppc_calcular_semana',        '009', '009_espera_bloqueos_ppc_responsable.sql'),
        ('ppc_congelar_semana',        '009', '009_espera_bloqueos_ppc_responsable.sql'),
        ('dashboard_semanas',          '009', '009_espera_bloqueos_ppc_responsable.sql')
    ) as e(funcion, esperada, archivo);
$$;

-- ---------------------------------------------------------------------
-- 3) DETECCIÓN DE LOS SCRIPTS 001-009 (anteriores a este control)
-- ---------------------------------------------------------------------
create or replace function public.bd_columna_existe(p_tabla text, p_columna text)
returns boolean language sql stable as $$
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = p_tabla and column_name = p_columna);
$$;

create or replace function public.bd_migraciones_detectadas()
returns table (numero int, nombre text, detectada boolean, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare
    v_mp_viol text := public.bd_version_funcion('manpower_violacion_nueva');
    v_mp_bloq text := public.bd_version_funcion('manpower_bloqueo_existente');
    v_mp_val  text := public.bd_version_funcion('manpower_validar_corte');
    v_meta    boolean := false;
begin
    if to_regclass('public.parametros_app') is not null then
        execute 'select exists (select 1 from public.parametros_app where clave = ''meta_ppc'')' into v_meta;
    end if;

    numero := 1; nombre := '001_manpower_corte_semanal';
    detectada := to_regclass('public.manpower_correcciones') is not null
             and to_regprocedure('public.eliminar_manpower_justificado(bigint,text)') is not null;
    detalle := 'tabla manpower_correcciones y función eliminar_manpower_justificado';
    return next;

    numero := 2; nombre := '002_dashboard_ppc_especialidades';
    detectada := to_regclass('public.especialidades') is not null
             and public.bd_columna_existe('snapshots_semanales', 'congelado_en')
             and to_regprocedure('public.dashboard_semanas(integer)') is not null;
    detalle := 'tabla especialidades, fotos congeladas y dashboard_semanas';
    return next;

    numero := 3; nombre := '003_parametros_app';
    detectada := to_regclass('public.parametros_app') is not null;
    detalle := 'tabla parametros_app';
    return next;

    numero := 4; nombre := '004_archivar_actividades_cierre';
    detectada := public.bd_columna_existe('pendientes_bim', 'archivada_en')
             and to_regprocedure('public.archivar_actividad(bigint)') is not null
             and to_regprocedure('public.restaurar_actividad(bigint)') is not null;
    detalle := 'columna archivada_en y funciones archivar/restaurar';
    return next;

    -- El 005 solo redefine funciones de Manpower; el 006 lo incluye y lo reemplaza
    numero := 5; nombre := '005_manpower_justificar_retraso';
    detectada := v_mp_bloq in ('005', '006') or v_mp_val in ('005', '006');
    detalle := 'reglas de Manpower versión 005 o posterior (vigentes: ' || v_mp_val || ')';
    return next;

    numero := 6; nombre := '006_manpower_registro_por_fecha';
    detectada := v_mp_viol = '006' or v_mp_val = '006';
    detalle := 'reglas de Manpower versión 006 (vigentes: ' || v_mp_val || ')';
    return next;

    numero := 7; nombre := '007_reagrupar_grupos_bim';
    detectada := to_regprocedure('public.grupos_bim_cascada()') is not null
             and to_regprocedure('public.grupo_clave(text)') is not null;
    detalle := 'funciones grupo_clave y grupos_bim_cascada';
    return next;

    numero := 8; nombre := '008_cambio_masivo_grupo';
    detectada := to_regprocedure('public.cambiar_grupo_masivo(bigint[],text)') is not null;
    detalle := 'función cambiar_grupo_masivo';
    return next;

    numero := 9; nombre := '009_espera_bloqueos_ppc_responsable';
    detectada := to_regclass('public.bloqueos_espera') is not null
             and public.bd_columna_existe('snapshots_semanales', 'ppc_por_responsable')
             and v_meta;
    detalle := 'tabla bloqueos_espera, PPC por responsable y meta_ppc';
    return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) ESTADO PARA LA APP (Configuración > Base de datos)
-- ---------------------------------------------------------------------
create or replace function public.estado_base_datos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if public.bd_desde_app() and not public.manpower_es_admin() then
        raise exception 'Solo los administradores pueden ver el estado de la base de datos.';
    end if;
    return jsonb_build_object(
        'generado_en', now(),
        'registradas', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'numero', m.numero, 'nombre', m.nombre, 'aplicada_en', m.aplicada_en,
                       'aplicada_por', m.aplicada_por, 'metodo', m.metodo) order by m.numero)
            from public.migraciones_aplicadas m), '[]'::jsonb),
        'detectadas', coalesce((
            select jsonb_agg(jsonb_build_object('numero', d.numero, 'nombre', d.nombre,
                       'detectada', d.detectada, 'detalle', d.detalle) order by d.numero)
            from public.bd_migraciones_detectadas() d), '[]'::jsonb),
        'funciones', coalesce((
            select jsonb_agg(jsonb_build_object('funcion', f.funcion, 'vigente', f.vigente,
                       'esperada', f.esperada, 'script', f.script_esperado, 'ok', f.ok))
            from public.bd_versiones_funciones() f), '[]'::jsonb)
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) EXPORTAR LA ESTRUCTURA (sin datos) COMO TEXTO .sql
-- ---------------------------------------------------------------------
create or replace function public.exportar_esquema()
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
    v_out  text;
    v_cron text;
    r      record;
begin
    if public.bd_desde_app() and not public.manpower_es_admin() then
        raise exception 'Solo los administradores pueden exportar la estructura de la base.';
    end if;

    v_out := '-- =====================================================================' || E'\n'
          || '-- ESTRUCTURA DE LA BASE DE DATOS (solo esquema, SIN datos)' || E'\n'
          || '-- Generado: ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') || ' (hora de Lima)' || E'\n'
          || '-- Es una foto de referencia para el repositorio. NO se ejecuta.' || E'\n'
          || '-- =====================================================================' || E'\n';

    -- Tipos enumerados
    v_out := v_out || E'\n-- ---------- TIPOS ----------\n';
    for r in
        select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as etiquetas
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname order by t.typname
    loop
        v_out := v_out || format('create type public.%I as enum (%s);', r.typname, r.etiquetas) || E'\n';
    end loop;

    -- Secuencias que no son de columnas identity
    v_out := v_out || E'\n-- ---------- SECUENCIAS ----------\n';
    for r in
        select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'i')
        order by c.relname
    loop
        v_out := v_out || format('create sequence if not exists public.%I;', r.relname) || E'\n';
    end loop;

    -- Tablas y columnas
    v_out := v_out || E'\n-- ---------- TABLAS ----------\n';
    for r in
        select c.oid, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
        order by c.relname
    loop
        v_out := v_out || E'\n' || format('create table public.%I (', r.relname) || E'\n'
              || coalesce((
                    select string_agg(format('    %I %s%s%s%s',
                               a.attname,
                               format_type(a.atttypid, a.atttypmod),
                               case a.attidentity when 'a' then ' generated always as identity'
                                                  when 'd' then ' generated by default as identity' else '' end,
                               case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                                    when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
                                    else '' end,
                               case when a.attnotnull then ' not null' else '' end),
                           E',\n' order by a.attnum)
                    from pg_attribute a
                    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
                    where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped), '')
              || E'\n);\n';
    end loop;

    -- Restricciones (las claves foráneas al final)
    v_out := v_out || E'\n-- ---------- RESTRICCIONES ----------\n';
    for r in
        select c.relname, k.conname, pg_get_constraintdef(k.oid) as def
        from pg_constraint k
        join pg_class c on c.oid = k.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and k.contype in ('p', 'u', 'c', 'x', 'f')
        order by (k.contype = 'f'), c.relname, k.conname
    loop
        v_out := v_out || format('alter table public.%I add constraint %I %s;', r.relname, r.conname, r.def) || E'\n';
    end loop;

    -- Índices que no vienen de una restricción
    v_out := v_out || E'\n-- ---------- ÍNDICES ----------\n';
    for r in
        select pg_get_indexdef(i.indexrelid) as def
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_class ic on ic.oid = i.indexrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_constraint k
                          where k.conindid = i.indexrelid and k.conrelid = i.indrelid
                            and k.contype in ('p', 'u', 'x'))
        order by c.relname, ic.relname
    loop
        v_out := v_out || r.def || ';' || E'\n';
    end loop;

    -- Vistas
    v_out := v_out || E'\n-- ---------- VISTAS ----------\n';
    for r in
        select c.relname, c.relkind, pg_get_viewdef(c.oid, true) as def
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v', 'm')
        order by c.relname
    loop
        v_out := v_out || format('create %s public.%I as', case when r.relkind = 'm' then 'materialized view' else 'or replace view' end, r.relname)
              || E'\n' || r.def || E'\n';
    end loop;

    -- Funciones
    v_out := v_out || E'\n-- ---------- FUNCIONES ----------\n';
    for r in
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind in ('f', 'p')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by p.proname, pg_get_function_identity_arguments(p.oid)
    loop
        v_out := v_out || E'\n' || r.def || ';' || E'\n';
    end loop;

    -- Triggers (de public y el de alta de usuarios en auth.users, si existe)
    v_out := v_out || E'\n-- ---------- TRIGGERS ----------\n';
    for r in
        select pg_get_triggerdef(t.oid, true) as def
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal
          and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
        order by n.nspname, c.relname, t.tgname
    loop
        v_out := v_out || r.def || ';' || E'\n';
    end loop;

    -- Seguridad por filas (RLS) y políticas
    v_out := v_out || E'\n-- ---------- SEGURIDAD POR FILAS (RLS) ----------\n';
    for r in
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
        order by c.relname
    loop
        v_out := v_out || format('alter table public.%I enable row level security;', r.relname) || E'\n';
        if r.relforcerowsecurity then
            v_out := v_out || format('alter table public.%I force row level security;', r.relname) || E'\n';
        end if;
    end loop;

    v_out := v_out || E'\n-- ---------- POLÍTICAS ----------\n';
    for r in
        select c.relname, pol.polname, pol.polpermissive, pol.polcmd,
               case when pol.polroles = '{0}'::oid[] then 'public'
                    else (select string_agg(quote_ident(ro.rolname), ', ' order by ro.rolname)
                          from pg_roles ro where ro.oid = any (pol.polroles)) end as roles,
               pg_get_expr(pol.polqual, pol.polrelid) as qual,
               pg_get_expr(pol.polwithcheck, pol.polrelid) as wcheck
        from pg_policy pol
        join pg_class c on c.oid = pol.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by c.relname, pol.polname
    loop
        v_out := v_out || format('create policy %I on public.%I as %s for %s to %s%s%s;',
                     r.polname, r.relname,
                     case when r.polpermissive then 'permissive' else 'restrictive' end,
                     case r.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                                   when 'd' then 'delete' else 'all' end,
                     r.roles,
                     coalesce(E'\n    using (' || r.qual || ')', ''),
                     coalesce(E'\n    with check (' || r.wcheck || ')', '')) || E'\n';
    end loop;

    -- Tareas programadas (pg_cron), solo como referencia
    v_out := v_out || E'\n-- ---------- TAREAS PROGRAMADAS (pg_cron) ----------\n';
    if to_regclass('cron.job') is not null then
        begin
            execute $q$select string_agg(format('-- %s | %s | %s', coalesce(jobname, '(sin nombre)'), schedule,
                                                  replace(command, E'\n', ' ')), E'\n' order by jobid)
                       from cron.job$q$ into v_cron;
        exception when others then
            v_cron := '-- (no se pudo leer cron.job: ' || sqlerrm || ')';
        end;
        v_out := v_out || coalesce(v_cron, '-- (sin tareas)') || E'\n';
    else
        v_out := v_out || '-- (pg_cron no está activado)' || E'\n';
    end if;

    return v_out;
end;
$$;

revoke execute on function public.estado_base_datos() from public, anon;
revoke execute on function public.exportar_esquema()  from public, anon;
grant  execute on function public.estado_base_datos() to authenticated;
grant  execute on function public.exportar_esquema()  to authenticated;
revoke execute on function public.bd_migraciones_detectadas() from public, anon, authenticated;
revoke execute on function public.bd_versiones_funciones()    from public, anon, authenticated;
revoke execute on function public.bd_version_funcion(text)    from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) REGISTRAR LO QUE YA ESTÁ EN LA BASE Y ESTE MISMO SCRIPT
-- ---------------------------------------------------------------------
do $$
declare d record;
begin
    for d in select * from public.bd_migraciones_detectadas() where detectada loop
        perform public.registrar_migracion(d.numero, d.nombre, 'detectado');
    end loop;
    perform public.registrar_migracion(10, '010_control_versiones');
end;
$$;

-- ---------------------------------------------------------------------
-- 7) RESULTADO: estado de cada script y de las funciones redefinidas
-- ---------------------------------------------------------------------
select d.nombre as script,
       case when d.detectada or m.numero is not null then '✅ aplicado' else '⚠️ FALTA' end as estado,
       coalesce(m.metodo, '') as como_se_registro,
       d.detalle as que_se_reviso
from public.bd_migraciones_detectadas() d
left join public.migraciones_aplicadas m on m.numero = d.numero
union all
select 'función ' || f.funcion,
       case when f.ok then '✅ vigente (' || f.vigente || ')'
            else '⚠️ versión ' || f.vigente || ', debería ser ' || f.esperada end,
       '',
       case when f.ok then '' else 'vuelve a ejecutar sql/' || f.script_esperado end
from public.bd_versiones_funciones() f;
