-- =====================================================================
-- 015 · PPC SIN ACTIVIDADES ARCHIVADAS (eliminadas)
-- Cómo aplicarlo: Supabase > SQL Editor > pegar todo este archivo > Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- Requiere: sql/009 (PPC vigente), sql/004 (archivar) y sql/010 (registro).
--
-- Regla acordada (2026-11-28):
--   A) Una actividad archivada (eliminada) NO cuenta en el PPC de ninguna
--      semana: ni comprometida, ni cumplida, ni adelantada, ni no planificada,
--      ni en el PPC por responsable. Antes contaba en las semanas que
--      terminaron antes del día en que se archivó.
--   B) Las HORAS no cambian: las registradas en una archivada siguen
--      contando en horas de la semana, horas generales y horas no planificadas.
--      El resto de la foto (total, abiertas, vencidas, planos) tampoco cambia.
--   C) Fotos ya congeladas: este script recalcula una sola vez el PPC de las
--      semanas pasadas donde participaba alguna archivada (respaldo antes en
--      snapshots_semanales_respaldo_015). Solo se tocan los campos del PPC.
--   D) Desde ahora, al archivar o restaurar actividades se recalcula solo
--      el PPC de las semanas congeladas donde participa esa actividad.
--      Si se restaura, vuelve a contar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CÁLCULO DE UNA SEMANA (versión 015)
--    ids_ppc: actividades que participan en el PPC de la semana (incluidas
--    las archivadas); lo usa el recálculo al archivar o restaurar.
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
        select p.id, coalesce(p.created_at, '-infinity'::timestamptz) as created_at, p.estado, p.fecha_cierre, p.especialidad_id, p.responsable_id,
               public.ppc_fecha_vigente(p.id, i0)    as v_lunes,
               public.ppc_fecha_vigente(p.id, corte) as v_corte,
               public.ppc_fecha_vigente(p.id, greatest(coalesce(p.created_at, i0), i0)) as v_creacion,
               (p.archivada_en is not null) as arch,
               (p.archivada_en is null or p.archivada_en >= i_fin) as vig
        from public.pendientes_bim p
        where coalesce(p.estado, '') not in ('Cancelado', 'Anulado')
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
        select b.id, b.arch from base b
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
          and b.vig
    ),
    np_esp as (
        select coalesce(e.nombre, 'GENERAL') as esp,
               count(*) filter (where not ev.arch) as n,
               coalesce(sum(mp.horas), 0) as horas
        from evaluadas ev
        left join public.especialidades e on e.id = ev.especialidad_id
        left join mp on mp.pendiente_id = ev.id
        where ev.no_planificada
        group by 1    ),
    resp_comp as (
        select coalesce(ev.responsable_id::text, 'sin_asignar') as k,
               count(*) as comp,
               count(*) filter (where ev.cumplida) as cump
        from evaluadas ev
        where not ev.arch
        group by 1
    ),
    resp_adel as (
        select coalesce(b.responsable_id::text, 'sin_asignar') as k, count(*) as n
        from base b
        where b.id in (select id from adelantadas where not arch)
        group by 1
    ),
    por_resp as (
        select coalesce(c.k, a.k) as k,
               coalesce(c.comp, 0) as comp,
               coalesce(c.cump, 0) as cump,
               coalesce(a.n, 0) as adel
        from resp_comp c
        full outer join resp_adel a on a.k = c.k
    )
    select jsonb_build_object(
        'semana',            L,
        'cerrada',           now() >= i_fin,
        'comprometidas',     (select count(*) from evaluadas where not arch),
        'cumplidas',         (select count(*) from evaluadas where cumplida and not arch),
        'adelantadas',       (select count(*) from adelantadas where not arch),
        'ppc',               case when (select count(*) from evaluadas where not arch) = 0 then null
                                  else round(((select count(*) from evaluadas where cumplida and not arch)
                                            + (select count(*) from adelantadas where not arch)) * 100.0
                                            / (select count(*) from evaluadas where not arch)) end,
        'no_planificadas',   (select count(*) from evaluadas where no_planificada and not arch),
        'archivadas_excluidas', (select count(distinct x.id) from (
                                     select id, arch from evaluadas union all select id, arch from adelantadas) x
                                 where x.arch),
        'ids_ppc',           coalesce((select jsonb_agg(distinct x.id) from (
                                     select id from evaluadas union all select id from adelantadas) x), '[]'::jsonb),
        'horas_no_planificadas', round(coalesce((select sum(mp.horas) from mp
                                  where mp.pendiente_id in (select id from evaluadas where no_planificada)), 0)::numeric, 2),
        'no_planificadas_por_especialidad',
                             coalesce((select jsonb_object_agg(esp, jsonb_build_object('n', n, 'horas', round(horas::numeric, 2))) from np_esp), '{}'::jsonb),
        'horas_semana',      round(coalesce((select sum(horas) from mp), 0)::numeric, 2),
        'horas_generales',   round(coalesce((select sum(horas) from mp where mp.pendiente_id is null), 0)::numeric, 2),
        'por_responsable',   coalesce((select jsonb_object_agg(k, jsonb_build_object(
                                  'comprometidas', comp, 'cumplidas', cump, 'adelantadas', adel,
                                  'ppc', case when comp = 0 then null else round((cump + adel) * 100.0 / comp) end))
                              from por_resp), '{}'::jsonb),
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

-- ---------------------------------------------------------------------
-- 2) ACTUALIZAR SOLO EL PPC DE UNA FOTO CONGELADA
-- ---------------------------------------------------------------------
create or replace function public.ppc_actualizar_foto(p_lunes date, p_calc jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
    L date := public.ppc_lunes(p_lunes);
    s jsonb := coalesce(p_calc, public.ppc_calcular_semana(public.ppc_lunes(p_lunes)));
begin
    update public.snapshots_semanales
    set comprometidas   = (s->>'comprometidas')::int,
        cumplidas       = (s->>'cumplidas')::int,
        adelantadas     = (s->>'adelantadas')::int,
        ppc             = (s->>'ppc')::numeric,
        no_planificadas = (s->>'no_planificadas')::int,
        no_planificadas_por_especialidad = s->'no_planificadas_por_especialidad',
        ppc_por_responsable = s->'por_responsable'
    where semana::date = L and version = 2;
end;
$$;

revoke execute on function public.ppc_actualizar_foto(date, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) AL ARCHIVAR O RESTAURAR: recalcular el PPC de las fotos afectadas
--    (un solo recorrido por sentencia, también para "archivar todas")
-- ---------------------------------------------------------------------
create or replace function public.ppc_fotos_tras_archivo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ids  bigint[];
    w      record;
    v_calc jsonb;
begin
    select array_agg(n.id) into v_ids
    from nuevas n join viejas o on o.id = n.id
    where n.archivada_en is distinct from o.archivada_en;

    if v_ids is null then return null; end if;

    for w in select semana::date as lunes from public.snapshots_semanales where version = 2 loop
        v_calc := public.ppc_calcular_semana(w.lunes);
        if exists (select 1 from jsonb_array_elements_text(coalesce(v_calc->'ids_ppc', '[]'::jsonb)) x
                   where x::bigint = any (v_ids)) then
            perform public.ppc_actualizar_foto(w.lunes, v_calc);
        end if;
    end loop;
    return null;
end;
$$;

revoke execute on function public.ppc_fotos_tras_archivo() from public, anon, authenticated;

drop trigger if exists trg_pendientes_ppc_archivo on public.pendientes_bim;
create trigger trg_pendientes_ppc_archivo
    after update on public.pendientes_bim
    referencing old table as viejas new table as nuevas
    for each statement execute function public.ppc_fotos_tras_archivo();

-- ---------------------------------------------------------------------
-- 4) RECALCULAR UNA VEZ LAS FOTOS PASADAS (respaldo primero)
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = 'snapshots_semanales_respaldo_015') then
        create table public.snapshots_semanales_respaldo_015 as
            select * from public.snapshots_semanales;
        alter table public.snapshots_semanales_respaldo_015 enable row level security;
        revoke all on public.snapshots_semanales_respaldo_015 from anon, authenticated;
    end if;
end $$;

do $$
declare
    w      record;
    v_calc jsonb;
begin
    for w in select semana::date as lunes from public.snapshots_semanales where version = 2 loop
        v_calc := public.ppc_calcular_semana(w.lunes);
        if coalesce((v_calc->>'archivadas_excluidas')::int, 0) > 0 then
            perform public.ppc_actualizar_foto(w.lunes, v_calc);
        end if;
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) CONTROL DE VERSIONES: huella de ppc_calcular_semana (015)
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
        ('dashboard_semanas',          '009', '7f09073ca94a56f5436d5aacdf089b8a'),
        ('ppc_calcular_semana',        '015', 'a7b12a4a231bf84f324088ecaf1e9a21')
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
        ('ppc_calcular_semana',        '015', '015_ppc_sin_archivadas.sql'),
        ('ppc_congelar_semana',        '009', '009_espera_bloqueos_ppc_responsable.sql'),
        ('dashboard_semanas',          '009', '009_espera_bloqueos_ppc_responsable.sql')
    ) as e(funcion, esperada, archivo);
$$;

revoke execute on function public.bd_versiones_funciones() from public, anon, authenticated;

-- Semanas cuyo PPC cambió (comparado con el respaldo)
-- select r.semana, r.ppc as ppc_antes, s.ppc as ppc_ahora, r.comprometidas as comp_antes, s.comprometidas as comp_ahora
-- from public.snapshots_semanales s join public.snapshots_semanales_respaldo_015 r on r.semana = s.semana
-- where r.version = 2 and s.version = 2 and (r.ppc is distinct from s.ppc or r.comprometidas is distinct from s.comprometidas)
-- order by r.semana;

select public.registrar_migracion(15, '015_ppc_sin_archivadas');
