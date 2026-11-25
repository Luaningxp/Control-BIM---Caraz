// Tema visual (paleta 60-30-10 · Marino noche y Azafrán).
// Las gráficas de Chart.js no leen CSS: aquí se les pasan los colores del tema activo.

/** Valor de una variable CSS del tema activo (definidas en css/styles.css). */
export function colorTema(variable, respaldo = '#56627A') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return v || respaldo;
}

/** Ajusta los colores por defecto de Chart.js al tema activo. Llamar antes de dibujar. */
export function aplicarTemaCharts() {
    if (!window.Chart) return;
    const d = window.Chart.defaults;
    d.color = colorTema('--chart-text');
    d.borderColor = colorTema('--chart-grid', 'rgba(15,29,48,.08)');
    d.font.family = "'Inter', system-ui, sans-serif";
    if (d.plugins?.tooltip) {
        d.plugins.tooltip.backgroundColor = colorTema('--struct', '#0F1D30');
        d.plugins.tooltip.titleColor = '#FFFFFF';
        d.plugins.tooltip.bodyColor = '#E2E9F3';
        d.plugins.tooltip.borderColor = colorTema('--struct-soft', '#1A2B44');
        d.plugins.tooltip.borderWidth = 1;
    }
}
