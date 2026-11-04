import { initAuth, handleLogin, handleLogout, checkUser } from './auth.js';
import { fetchAll, state } from './db.js';
import { renderDashboard } from './dashboard.js';
import { renderTabla, openModal, closeModal, saveTask, editTask, deleteTask, openModalCDE, closeModalCDE, confirmarTransicion } from './tabla.js';
import { renderKanban, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } from './kanban.js';
import { renderEisenhower } from './eisenhower.js';
import { renderConfig, openGrupoModal, closeGrupoModal, saveGrupo, deleteGrupo, openCargoModal, closeCargoModal, saveCargo, openPropModal, closePropModal, saveProp, deleteProp } from './config.js';
import { renderMiTrabajo, openManpowerModal, closeManpowerModal, saveManpower } from './manpower.js';

window.handleLogin = handleLogin;
window.handleLogout = handleLogout;

window.switchTab = function(tab) {
    state.currentTab = tab;
    ['mitrabajo', 'dashboard', 'tabla', 'kanban', 'eisenhower', 'manpower', 'config'].forEach(t => {
        const btn = document.querySelector(`[data-tab="${t}"]`);
        if(btn) btn.classList.toggle('tab-active', t === tab);
    });
    renderView();
}

function renderView() {
    const container = document.getElementById('view-container');
    container.innerHTML = ''; // Limpiar vista actual

    if (state.currentTab === 'mitrabajo') renderMiTrabajo(container);
    else if (state.currentTab === 'dashboard') renderDashboard(container);
    else if (state.currentTab === 'tabla') renderTabla(container);
    else if (state.currentTab === 'kanban') renderKanban(container);
    else if (state.currentTab === 'eisenhower') renderEisenhower(container);
    else if (state.currentTab === 'manpower') renderManpower(container);
    else if (state.currentTab === 'config') renderConfig(container);
}

// Inicialización
window.onload = async () => {
    const user = await checkUser();
    if (user) {
        await initAuth(user);
        await fetchAll();
        switchTab(state.isCoordinador || state.isAdmin ? 'dashboard' : 'mitrabajo');
    }
};

// Exponer funciones al HTML
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
