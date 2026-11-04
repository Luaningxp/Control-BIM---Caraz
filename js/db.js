export const supabaseClient = window.supabase.createClient('https://zsrczkdpluafuoczfokw.supabase.co', 'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A');

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
    currentTab: 'dashboard',
    cdeTargetId: null,
    dragId: null,
    charts: {}
};

export async function fetchAll() {
    try {
        const [t, g, p, pd, pv, m] = await Promise.all([
            supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
            supabaseClient.from('grupos_bim').select('*').order('nombre'),
            supabaseClient.from('perfiles').select('id,email,rol,cargo').order('email'),
            supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
            supabaseClient.from('propiedades_valores').select('*'),
            supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false })
        ]);

        if (t.error) console.error('Error tareas:', t.error);
        if (g.error) console.error('Error grupos:', g.error);
        if (p.error) console.error('Error perfiles:', p.error);
        if (pd.error) console.error('Error propiedades:', pd.error);
        if (pv.error) console.error('Error valores:', pv.error);
        if (m.error) console.error('Error manpower:', m.error);

        state.tasksCache = t.data || [];
        state.gruposCache = g.data || [];
        state.perfilesCache = p.data || [];
        state.propDefsCache = pd.data || [];
        state.propValsCache = pv.data || [];
        state.manpowerCache = m.data || [];

    } catch (err) {
        console.error('Error general en fetchAll:', err);
    }
}
