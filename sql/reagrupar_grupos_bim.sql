-- =====================================================================
-- REAGRUPAR ACTIVIDADES: nuevo catálogo de grupos BIM (14 grupos)
--
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Requisitos: haber ejecutado antes sql/manpower_corte_semanal.sql
--             (usa public.manpower_es_admin = rol admin o coordinador_bim).
--
-- Qué hace:
--   1) Crea los 14 grupos nuevos (en MAYÚSCULAS).
--   2) Pasa cada actividad (vigentes y archivadas) de su grupo viejo al nuevo.
--      Las actividades de grupos que se eliminan quedan SIN GRUPO.
--   3) Borra del catálogo todos los grupos que no son de la lista nueva.
--   4) Solo admin edita el catálogo (RLS). Todos los nombres se guardan en
--      mayúsculas.
--   5) Al guardar una actividad, el grupo se ajusta al nombre exacto del
--      catálogo (sin importar mayúsculas ni tildes); si no existe, queda sin grupo.
--   6) Renombrar un grupo renombra sus actividades; borrarlo las deja sin grupo.
--
-- OJO: no se guarda respaldo del grupo viejo. Antes de ejecutar, exporta el
-- Excel de actividades desde Configuración si quieres conservar la foto.
-- Se puede volver a ejecutar, PERO borra cualquier grupo que no sea de esta
-- lista: no lo ejecutes otra vez después de crear grupos nuevos desde la app.
-- =====================================================================

-- Clave de comparación: mayúsculas, sin tildes, sin espacios repetidos
create or replace function public.grupo_clave(p text)
returns text language sql immutable as $$
    select nullif(regexp_replace(
        translate(upper(trim(coalesce(p, ''))), 'ÁÉÍÓÚÜÑÀÈÌÒÙ', 'AEIOUUNAEIOU'),
        '\s+', ' ', 'g'), '');
$$;

-- ---------------------------------------------------------------------
-- 1) Nombres siempre en mayúsculas
-- ---------------------------------------------------------------------
create or replace function public.grupos_bim_mayusculas()
returns trigger language plpgsql as $$
begin
    new.nombre := regexp_replace(upper(trim(new.nombre)), '\s+', ' ', 'g');
    if new.nombre = '' then
        raise exception 'El nombre del grupo es obligatorio.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_grupos_bim_mayusculas on public.grupos_bim;
create trigger trg_grupos_bim_mayusculas
    before insert or update on public.grupos_bim
    for each row execute function public.grupos_bim_mayusculas();

-- ---------------------------------------------------------------------
-- 2) Catálogo nuevo
-- ---------------------------------------------------------------------
drop table if exists tmp_grupos_nuevos;
create temporary table tmp_grupos_nuevos (nombre text primary key);
insert into tmp_grupos_nuevos (nombre) values
    ('DISEÑO - RFCS Y REDISEÑOS - PLANOS'),
    ('DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('DISEÑO - NODS'),
    ('DISEÑO - ACTIVIDADES PUNTUALES NO PROGRAMADAS'),
    ('ACTUALIZACIÓN DE PLANOS CONTRACTUALES'),
    ('EVENTOS COMPENSABLES'),
    ('VALORIZACIONES'),
    ('CIERRE COMERCIAL'),
    ('PROCURAS'),
    ('ACTUALIZACIÓN CON ESCANEO LÁSER'),
    ('FEDERACIÓN DE MODELOS'),
    ('GESTIÓN BIM'),
    ('ERRORES Y FALLAS'),
    ('APOYO A OTRAS ÁREAS');

insert into public.grupos_bim (nombre, activo)
select n.nombre, true
from tmp_grupos_nuevos n
where not exists (
    select 1 from public.grupos_bim g
    where public.grupo_clave(g.nombre) = public.grupo_clave(n.nombre)
);

-- Deja con el nombre exacto y activos a los que ya existían con otra escritura
update public.grupos_bim g
set nombre = n.nombre, activo = true
from tmp_grupos_nuevos n
where public.grupo_clave(g.nombre) = public.grupo_clave(n.nombre)
  and (g.nombre is distinct from n.nombre or g.activo is distinct from true);

-- ---------------------------------------------------------------------
-- 3) Mapeo viejo -> nuevo (NULL = queda sin grupo)
-- ---------------------------------------------------------------------
drop table if exists tmp_mapeo_grupos;
create temporary table tmp_mapeo_grupos (viejo text primary key, nuevo text);
insert into tmp_mapeo_grupos (viejo, nuevo) values
    ('DISEÑO F4 PLANOS',                'DISEÑO - RFCS Y REDISEÑOS - PLANOS'),
    ('DISEÑO F5 PLANOS',                'DISEÑO - RFCS Y REDISEÑOS - PLANOS'),
    ('DISEÑO EXTERIORES F5 PLANOS',     'DISEÑO - RFCS Y REDISEÑOS - PLANOS'),
    ('AS BUILT PLANOS',                 'DISEÑO - RFCS Y REDISEÑOS - PLANOS'),
    ('DISEÑO F4 MODELO',                'DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('DISEÑO F5 MODELO',                'DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('DISEÑO EXTERIORES F5 MODELO',     'DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('COMPATIBLIZACIONES',              'DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('COMPATIBILIZACIONES',             'DISEÑO - RFCS Y REDISEÑOS - MODELADO'),
    ('ESPECIALISTAS-DISEÑO',            'DISEÑO - ACTIVIDADES PUNTUALES NO PROGRAMADAS'),
    ('ESPECIALISTAS - DISEÑO',          'DISEÑO - ACTIVIDADES PUNTUALES NO PROGRAMADAS'),
    ('CONTRACTUAL 5D',                  'VALORIZACIONES'),
    ('CIERRE COMERCIAL',                'CIERRE COMERCIAL'),
    ('AS BUILT MODELOS',                'ACTUALIZACIÓN CON ESCANEO LÁSER'),
    ('FEDERACIÓN',                      'FEDERACIÓN DE MODELOS'),
    ('GESTIÓN CONTRACTUAL',             'GESTIÓN BIM'),
    ('ANIN',                            'GESTIÓN BIM'),
    ('AUTOMATIZACIONES',                'GESTIÓN BIM'),
    ('CONTRACTUAL 7D',                  'GESTIÓN BIM'),
    ('GESTIÓN Y ESTANDARIZACIÓN BIM',   'GESTIÓN BIM'),
    ('SESIONES ICE',                    'GESTIÓN BIM'),
    ('ERRORES Y FALLAS',                'ERRORES Y FALLAS'),
    ('SUBCONTRATOS',                    'APOYO A OTRAS ÁREAS'),
    ('CONTRATOS',                       'APOYO A OTRAS ÁREAS'),
    ('INTERVENCIÓN A SUBCONTRATAS',     null),
    ('OFICINA TECNICA',                 null),
    ('PLANEAMIENTO',                    null),
    ('PRODUCCIÓN',                      null);

-- Vista previa (opcional): cuántas actividades pasan de cada grupo viejo a cada nuevo
-- select p.grupo as viejo, coalesce(n.nombre, m.nuevo, '(sin grupo)') as nuevo, count(*)
-- from public.pendientes_bim p
-- left join tmp_grupos_nuevos n on public.grupo_clave(n.nombre) = public.grupo_clave(p.grupo)
-- left join tmp_mapeo_grupos m on public.grupo_clave(m.viejo) = public.grupo_clave(p.grupo)
-- where p.grupo is not null group by 1, 2 order by 2, 1;

-- Se migra antes de crear el trigger de normalización (paso 5)
drop trigger if exists trg_pendientes_grupo_catalogo on public.pendientes_bim;

update public.pendientes_bim p
set grupo = coalesce(
        (select n.nombre from tmp_grupos_nuevos n
          where public.grupo_clave(n.nombre) = public.grupo_clave(p.grupo)),
        (select m.nuevo from tmp_mapeo_grupos m
          where public.grupo_clave(m.viejo) = public.grupo_clave(p.grupo))
    )
where p.grupo is not null;

-- ---------------------------------------------------------------------
-- 4) Borrar del catálogo los grupos viejos
-- ---------------------------------------------------------------------
delete from public.grupos_bim g
where not exists (select 1 from tmp_grupos_nuevos n where n.nombre = g.nombre);

-- ---------------------------------------------------------------------
-- 5) Al guardar una actividad, el grupo debe existir en el catálogo
-- ---------------------------------------------------------------------
create or replace function public.pendientes_grupo_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.grupo is null then return new; end if;
    if tg_op = 'UPDATE' and new.grupo is not distinct from old.grupo then return new; end if;
    select g.nombre into new.grupo
    from public.grupos_bim g
    where public.grupo_clave(g.nombre) = public.grupo_clave(new.grupo)
    limit 1;   -- si no existe, queda NULL (sin grupo)
    return new;
end;
$$;

create trigger trg_pendientes_grupo_catalogo
    before insert or update of grupo on public.pendientes_bim
    for each row execute function public.pendientes_grupo_catalogo();

-- ---------------------------------------------------------------------
-- 6) Renombrar / borrar un grupo se refleja en las actividades vigentes
--    (las archivadas no se pueden editar desde la app)
-- ---------------------------------------------------------------------
create or replace function public.grupos_bim_cascada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
        update public.pendientes_bim set grupo = new.nombre
        where grupo = old.nombre and archivada_en is null;
    elsif tg_op = 'DELETE' then
        update public.pendientes_bim set grupo = null
        where grupo = old.nombre and archivada_en is null;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_grupos_bim_cascada on public.grupos_bim;
create trigger trg_grupos_bim_cascada
    after update or delete on public.grupos_bim
    for each row execute function public.grupos_bim_cascada();

-- ---------------------------------------------------------------------
-- 7) Permisos: todos leen, solo admin escribe
-- ---------------------------------------------------------------------
alter table public.grupos_bim enable row level security;

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'grupos_bim'
    loop
        execute format('drop policy %I on public.grupos_bim', r.policyname);
    end loop;
end $$;

create policy "grupos_bim_select" on public.grupos_bim
    for select to authenticated using (true);

create policy "grupos_bim_admin_write" on public.grupos_bim
    for all to authenticated
    using (public.manpower_es_admin())
    with check (public.manpower_es_admin());

drop table if exists tmp_mapeo_grupos;
drop table if exists tmp_grupos_nuevos;

-- Resultado
select nombre, activo from public.grupos_bim order by nombre;
