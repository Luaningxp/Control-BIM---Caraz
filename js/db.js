export const supabaseClient = window.supabase.createClient('https://zsrczkdpluafuoczfokw.supabase.co', 'sb_publishable_asRWjkS5NLVJ4-FrVA05sw_uW2kFP2A');

export const state = {
    currentUser: null, currentRol: 'operador', isAdmin: false, isCoordinador: false,
    tasksCache: [], gruposCache: [], perfilesCache: [], propDefsCache: [], propValsCache: [], manpowerCache: [],
    currentTab: 'dashboard', cdeTargetId: null, dragId: null, charts: {}
};

export async function fetchAll() {
    const [t, g, p, pd, pv, m] = await Promise.all([
        supabaseClient.from('pendientes_bim').select('*').order('id', { ascending: false }),
        supabaseClient.from('grupos_bim').select('*').order('nombre'),
        supabaseClient.from('perfiles').select('id,email,rol,cargo').order('email'),
        supabaseClient.from('propiedades_def').select('*').eq('activo', true).order('orden'),
        supabaseClient.from('propiedades_valores').select('*'),
        supabaseClient.from('manpower_registros').select('*').order('fecha', { ascending: false })
    ]);
    state.tasksCache = t.data || [];
    state.gruposCache = g.data || [];
    state.perfilesCache = p.data || [];
    state.propDefsCache = pd.data || [];
    state.propValsCache = pv.data || [];
    state.manpowerCache = m.data || [];
}
