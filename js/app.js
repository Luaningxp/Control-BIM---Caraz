import { supabaseClient, state, fetchAll } from './db.js';
import { initAuth, checkUser } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderTabla, openModal, closeModal, saveTask, editTask, deleteTask, openModalCDE, closeModalCDE, confirmarTransicion } from './tabla.js';
import { renderKanban, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } from './kanban.js';
import { renderEisenhower } from './eisenhower.js';
import { renderConfig, openGrupoModal, closeGrupoModal, saveGrupo, deleteGrupo, openCargoModal, closeCargoModal, saveCargo, openPropModal, closePropModal, saveProp, deleteProp } from './config.js';
import { renderMiTrabajo, renderManpower, openManpowerModal, closeManpowerModal, saveManpower } from './manpower.js';

// Escuchar el submit del login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
    errorDiv.style.display = 'none';

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Ingresar';
        errorDiv.innerText = "Error: Credenciales inválidas";
        errorDiv.style.display = 'block';
    } else {
        // Login exitoso
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
        
        // Inicializar la app
        await initApp(data.user);
    }
});

// Escuchar logout
document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

async function initApp(user) {
    state.currentUser = user;
    // Buscar rol
    const { data: perfil } = await supabaseClient.from('perfiles').select('rol,cargo').eq('id', user.id).maybeSingle();
    state.currentRol = (perfil?.rol ? String(perfil.rol).trim().toLowerCase() : 'operador');
    state.isAdmin = state.currentRol === 'admin';
    state.isCoordinador = state.currentRol === 'coordinador_bim';

    // Actualizar UI
    document.getElementById('user-display').innerText = user.email;
    document.getElementById('role-display').innerText = state.isAdmin ? 'Administrador' : state.isCoordinador ? 'Coordinador BIM' : 'Modelador';

    if (state.isAdmin || state.isCoordinador) document.getElementById('btn-new-task').classList.remove('hidden');
    if (state.isAdmin) document.getElementById('tab-config-btn').classList.remove('hidden');
    if (!state.isAdmin && !state.isCoordinador) document.querySelector('[data-tab="mitrabajo"]').classList.remove('hidden');

    // Cargar datos e ir a la primera pestaña
    await fetchAll();
    window.switchTab(state.isAdmin || state.isCoordinador ? 'dashboard' : 'mitrabajo');
}

window.switchTab = function(tab) {
    state.currentTab = tab;
    ['mitrabajo', 'dashboard', 'tabla', 'kanban', 'eisenhower', 'manpower', 'config'].forEach(t => {
        const btn = document.querySelector(`[data-tab="${t}"]`);
        if(btn) btn.classList.toggle('tab-active', t === tab);
    });
    window.renderView();
}

window.renderView = function() {
    const container = document.getElementById('view-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.currentTab === 'mitrabajo') renderMiTrabajo(container);
    else if (state.currentTab === 'dashboard') renderDashboard(container);
    else if (state.currentTab === 'tabla') renderTabla(container);
    else if (state.currentTab === 'kanban') renderKanban(container);
    else if (state.currentTab === 'eisenhower') renderEisenhower(container);
    else if (state.currentTab === 'manpower') renderManpower(container);
    else if (state.currentTab === 'config') renderConfig(container);
}

// Asignar a window para que el HTML los use
window.openModal = openModal;
window.closeModal = closeModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.openModalCDE = openModalCDE;
window.closeModalCDE = closeModalCDE;
window.confirmarTransicion = confirmarTransicion;
window.onDragStart = onDragStart;
window.onDragEnd = onDragEnd;
window.onDragOver = onDragOver;
window.onDragLeave = onDragLeave;
window.onDrop = onDrop;
window.openGrupoModal = openGrupoModal;
window.closeGrupoModal = closeGrupoModal;
window.saveGrupo = saveGrupo;
window.deleteGrupo = deleteGrupo;
window.openCargoModal = openCargoModal;
window.closeCargoModal = closeCargoModal;
window.saveCargo = saveCargo;
window.openPropModal = openPropModal;
window.closePropModal = closePropModal;
window.saveProp = saveProp;
window.deleteProp = deleteProp;
window.openManpowerModal = openManpowerModal;
window.closeManpowerModal = closeManpowerModal;
window.saveManpower = saveManpower;
window.fetchAll = fetchAll;

// Comprobar si ya hay sesión iniciada al cargar la página
window.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUser();
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
        await initApp(user);
    }
});
