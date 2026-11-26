-- =====================================================================
-- CAMBIO MASIVO DE GRUPO (Tabla > casillas > "Cambiar grupo a")
--
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Requisitos: sql/reagrupar_grupos_bim.sql (usa public.grupo_clave) y
--             sql/manpower_corte_semanal.sql (usa public.manpower_es_admin).
--
-- Reglas:
--   * Solo admin (rol admin o coordinador_bim).
--   * Aplica a cualquier actividad vigente (abierta o cerrada). Las archivadas
--     no se tocan.
--   * El grupo debe existir en el catálogo; NULL o '' = dejar sin grupo.
--   * Todo o nada: si algo falla, no cambia ninguna.
--   * Solo cambia el grupo. Sin historial.
-- Se puede volver a ejecutar sin romper nada.
-- =====================================================================

create or replace function public.cambiar_grupo_masivo(p_ids bigint[], p_grupo text)
returns integer language plpgsql security definer set search_path = public as $$
declare
    v_grupo text;
    v_n     integer;
begin
    if not public.manpower_es_admin() then
        raise exception 'Solo los administradores pueden cambiar grupos en lote.';
    end if;
    if p_ids is null or cardinality(p_ids) = 0 then
        return 0;
    end if;

    if nullif(trim(coalesce(p_grupo, '')), '') is not null then
        select g.nombre into v_grupo
        from public.grupos_bim g
        where public.grupo_clave(g.nombre) = public.grupo_clave(p_grupo)
        limit 1;
        if v_grupo is null then
            raise exception 'El grupo "%" no existe en el catálogo.', p_grupo;
        end if;
    end if;

    update public.pendientes_bim
    set grupo = v_grupo
    where id = any (p_ids)
      and archivada_en is null
      and grupo is distinct from v_grupo;
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

revoke all on function public.cambiar_grupo_masivo(bigint[], text) from public;
grant execute on function public.cambiar_grupo_masivo(bigint[], text) to authenticated;
