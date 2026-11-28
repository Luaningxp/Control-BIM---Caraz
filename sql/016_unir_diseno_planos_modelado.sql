-- =====================================================================
-- 016 · UNIR "DISEÑO - RFCS Y REDISEÑOS - PLANOS" Y "... - MODELADO"
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/007 (catálogo grupos_bim y sus triggers) y sql/010 (registro).
--
-- Regla acordada (2026-11-28): los modeladores no separan modelar de
-- membretar planos, así que los dos grupos pasan a ser uno solo:
--     DISEÑO - RFCS Y REDISEÑOS
--   1) Crea el grupo nuevo (renombrando el de PLANOS si existe).
--   2) Pasa al grupo nuevo TODAS las actividades de los dos grupos viejos,
--      también las cerradas y las archivadas.
--   3) Borra del catálogo los dos grupos viejos.
-- No toca ningún otro grupo. No guarda el grupo anterior.
-- =====================================================================

do $unir$
declare
    v_nuevo  text   := 'DISEÑO - RFCS Y REDISEÑOS';
    v_viejos text[] := array['DISEÑO - RFCS Y REDISEÑOS - PLANOS',
                             'DISEÑO - RFCS Y REDISEÑOS - MODELADO'];
    v_claves text[];
    v_n int;
begin
    select array_agg(public.grupo_clave(x)) into v_claves from unnest(v_viejos) x;

    -- Bloquear ambas tablas a la vez (evita choques con la app abierta)
    perform set_config('lock_timeout', '30s', true);
    lock table public.grupos_bim, public.pendientes_bim in access exclusive mode;

    -- 1) Grupo nuevo
    if not exists (select 1 from public.grupos_bim
                   where public.grupo_clave(nombre) = public.grupo_clave(v_nuevo)) then
        update public.grupos_bim set nombre = v_nuevo, activo = true
        where id = (select id from public.grupos_bim
                    where public.grupo_clave(nombre) = v_claves[1] limit 1);
        if not found then
            insert into public.grupos_bim (nombre, activo) values (v_nuevo, true);
        end if;
    end if;

    -- 2) Actividades (vigentes, cerradas y archivadas)
    update public.pendientes_bim set grupo = v_nuevo
    where public.grupo_clave(grupo) = any (v_claves);
    get diagnostics v_n = row_count;
    raise notice 'Actividades movidas a %: %', v_nuevo, v_n;

    -- 3) Borrar los grupos viejos (ya no tienen actividades)
    delete from public.grupos_bim where public.grupo_clave(nombre) = any (v_claves);
end
$unir$;

-- Resultado: catálogo y actividades por grupo
select g.nombre, g.activo, count(p.*) as actividades
from public.grupos_bim g
left join public.pendientes_bim p on p.grupo = g.nombre
group by g.nombre, g.activo
order by g.nombre;

select public.registrar_migracion(16, '016_unir_diseno_planos_modelado');
