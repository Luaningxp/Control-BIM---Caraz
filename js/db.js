export const supabaseClient = window.supabase.createClient(
    'https://zsrczkdpluafuoczfokw.supabase.co',
    'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A'
);

export const state = {
    currentUser: null,
    currentRol: 'operador',
    currentCargo: '',
    isAdmin: false,
    isCoordinador: false,
    isSupervisor: false,
    isModelador: false,
    tasksCache: [],
    gruposCache: [],
    perfilesCache: [],
    propDefsCache: [],
    propValsCache: [],
    manpowerCache: [],
    actividadRecursosCache: [],
    planosCache: [],
    actividadPlanosCache: [],
    causasCache: [],
    tareaCausasCache: [],
    snapshotsCache: [],
    descansosCache: [],
    feriadosCache: [],
    subcontratasCache: [],
    trabajosExtraCache: [],
    currentTab: 'dashboard',
    cdeTargetId: null,
    dragId: null,
    charts: {}
};

export async function fetchAll() {
    try {
        const [t, g, p, pd, pv, m, ar, pl, ap, ca, tc, sn, de, fe, te] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo,avatar_url').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('propiedades_valores').select('*'),
            supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false }),
            supabaseClient.from('actividad_recursos').select('*'),
            supabaseClient.from('planos').select('*').order('codigo'),
            supabaseClient.from('actividad_planos').select('*'),
            supabaseClient.from('causas_incumplimiento').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('tarea_causas').select('*'),
            supabaseClient.from('snapshots_semanales').select('*').order('semana', { ascending: false }),
            supabaseClient.from('descansos').select('*'),
            supabaseClient.from('feriados').select('*'),
            supabaseClient.from('subcontratas').select('*').eq('activo', true).order('nombre'),
            supabaseClient.from('trabajos_extra').select('*')
        ]);

        if (t.error) console.error('Error tareas:', t.error);
        if (pl.error) console.error('Error planos:', pl.error);
        if (ap.error) console.error('Error actividad_planos:', ap.error);
        if (ca.error) console.error('Error causas:', ca.error);
        if (tc.error) console.error('Error tarea_causas:', tc.error);
        if (sn.error) console.error('Error snapshots:', sn.error);
        if (de.error) console.error('Error descansos:', de.error);
        if (fe.error) console.error('Error feriados:', fe.error);
        if (te.error) console.error('Error trabajos_extra:', te.error);

        state.tasksCache = t.data || [];
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.propValsCache = pv.data || [];
        state.manpowerCache = m.data || [];
        state.actividadRecursosCache = ar.data || [];
        state.planosCache = pl.data || [];
        state.actividadPlanosCache = ap.data || [];
        state.causasCache = ca.data || [];
        state.tareaCausasCache = tc.data || [];
        state.snapshotsCache = sn.data || [];
        state.descansosCache = de.data || [];
        state.feriadosCache = fe.data || [];
        state.subcontratasCache = subRes.data || [];
        state.trabajosExtraCache = te.data || [];

    } catch (err) {
        console.error('Error general en fetchAll:', err);
    }
}

export async function guardarSnapshotSemanal() {
    try {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        const dia = hoy.getDay();
        const diff = hoy.getDate() - dia + (dia === 0 ? -6 : 1);
        const lunes = new Date(hoy); lunes.setDate(diff);
        const semana = lunes.toISOString().split('T')[0];

        const { semaforo, isCerrado } = await import('./utils.js');

        const tareas = state.tasksCache || [];
        const abiertas = tareas.filter(t => !isCerrado(t));
        const vencidas = abiertas.filter(t => semaforo(t) === 'Vencida').length;
        const porVencer = abiertas.filter(t => semaforo(t) === 'Por vencer').length;
        const sinFecha = abiertas.filter(t => !t.fecha_fin).length;

        const finSemana = new Date(lunes); finSemana.setDate(lunes.getDate() + 6); finSemana.setHours(23,59,59,999);
        const tareasSemana = tareas.filter(t => t.fecha_fin && new Date(t.fecha_fin + 'T00:00:00') >= lunes && new Date(t.fecha_fin + 'T00:00:00') <= finSemana);
        const cumplidas = tareasSemana.filter(t => t.fecha_cierre && new Date(t.fecha_cierre + 'T00:00:00') <= finSemana);
        const ppc = tareasSemana.length > 0 ? Math.round((cumplidas.length / tareasSemana.length) * 100) : null;

        const horasSemana = (state.manpowerCache || []).filter(m => {
            if (!m.fecha) return false;
            const f = new Date(m.fecha + 'T00:00:00');
            return f >= lunes && f <= finSemana;
        }).reduce((s, m) => s + (parseFloat(m.porcentaje_dia || 0) * 9.3333) / 100, 0);

        const conteo = { WIP: 0, Shared: 0, Published: 0, Archived: 0 };
        (state.actividadPlanosCache || []).forEach(ap => {
            const p = (state.planosCache || []).find(x => x.id === ap.plano_id);
            if (p && p.estado && conteo[p.estado] !== undefined) conteo[p.estado]++;
        });

        const causasTop = {};
        (state.tareaCausasCache || []).forEach(tc => {
            const c = (state.causasCache || []).find(x => x.id === tc.causa_id);
            if (c) causasTop[c.nombre] = (causasTop[c.nombre] || 0) + 1;
        });

        const payload = {
            semana,
            total_tareas: tareas.length,
            abiertas: abiertas.length,
            cerradas: tareas.length - abiertas.length,
            vencidas, por_vencer: porVencer, sin_fecha: sinFecha,
            ppc, horas_semana: +horasSemana.toFixed(2),
            planos_wip: conteo.WIP, planos_shared: conteo.Shared,
            planos_published: conteo.Published, planos_archived: conteo.Archived,
            causas_top: causasTop
        };

        const { error } = await supabaseClient.from('snapshots_semanales').upsert([payload], { onConflict: 'semana' });
        if (error) console.error('Snapshot error:', error);
        return !error;
    } catch (e) {
        console.error('guardarSnapshotSemanal', e);
        return false;
    }
}
