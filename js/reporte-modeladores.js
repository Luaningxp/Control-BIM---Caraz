// ============================================================
// REPORTE PDF · Actividades planificadas por modelador y semana
// (botón en Recursos > "Riesgo por modelador", para presentar a residencia)
//
// Reglas:
// - Filas: todos los modeladores. Columnas: las N semanas cerradas (lun–dom)
//   anteriores + la semana en curso (hora Lima). N = 4, 8 o 12.
// - Una actividad aparece en una semana si su rango [inicio, fin vigente]
//   toca algún día de esa semana. Inicio = fecha_inicio_programado o, si no
//   hay, la fecha de creación (Lima). Sin fecha fin vigente = no entra.
// - Se incluye si el modelador es responsable o recurso de la actividad.
// - Se excluyen canceladas/anuladas. Las archivadas no llegan (tasksCache).
// - Sin riesgo, horas ni respaldo: es un resumen para residencia.
// ============================================================
import { hoyLima, lunesDeSemana, sumarDias, nombreFormateado, TZ_PROYECTO } from './utils.js';

const fmtFechaLima = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_PROYECTO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fechaLima = (ts) => ts ? fmtFechaLima.format(new Date(ts)) : null;

/** Número de semana ISO 8601 de una fecha 'YYYY-MM-DD'. */
export function semanaISO(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00Z');
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - inicioAnio) / 86400000 + 1) / 7);
}

const ddmm = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Semanas del reporte: N cerradas + la semana en curso, de la más antigua a la actual. */
export function semanasReporte(hoy, nCerradas) {
    const lunesActual = lunesDeSemana(hoy);
    const out = [];
    for (let i = nCerradas; i >= 0; i--) {
        const lunes = sumarDias(lunesActual, -7 * i);
        const domingo = sumarDias(lunes, 6);
        out.push({ lunes, domingo, codigo: `S${String(semanaISO(lunes)).padStart(2, '0')}`, rango: `${ddmm(lunes)} – ${ddmm(domingo)}`, enCurso: i === 0 });
    }
    return out;
}

/**
 * Arma la matriz modelador × semana con las actividades planificadas.
 * @returns {{ semanas, filas: [{ id, nombre, celdas: [[{ actividad, especialidad, codigo }]] }] }}
 */
export function armarReporteModeladores({ modeladores, tareas, recursos, especialidades, hoy = hoyLima(), nCerradas = 4 }) {
    const semanas = semanasReporte(hoy, nCerradas);
    const desde = semanas[0].lunes, hasta = semanas[semanas.length - 1].domingo;
    const espNombre = {};
    (especialidades || []).forEach(e => espNombre[String(e.id)] = e.nombre);

    const recursosPorTarea = {};
    (recursos || []).forEach(r => (recursosPorTarea[r.pendiente_id] ||= new Set()).add(r.usuario_id));

    const actividades = (tareas || [])
        .filter(t => t.fecha_fin && t.estado !== 'Cancelado' && t.estado !== 'Anulado' && !t.archivada_en)
        .map(t => {
            let ini = t.fecha_inicio_programado || fechaLima(t.created_at) || t.fecha_fin;
            if (ini > t.fecha_fin) ini = t.fecha_fin;
            const personas = new Set(recursosPorTarea[t.id] || []);
            if (t.responsable_id) personas.add(t.responsable_id);
            return {
                ini, fin: t.fecha_fin, personas,
                actividad: (t.actividad || '').trim() || '(sin nombre)',
                especialidad: espNombre[String(t.especialidad_id)] || '',
                codigo: t.codigo_contenedor || ''
            };
        })
        .filter(a => a.ini <= hasta && a.fin >= desde);

    const filas = modeladores.map(p => {
        const propias = actividades.filter(a => a.personas.has(p.id));
        const celdas = semanas.map(s => propias
            .filter(a => a.ini <= s.domingo && a.fin >= s.lunes)
            .sort((x, y) => x.especialidad.localeCompare(y.especialidad) || x.actividad.localeCompare(y.actividad))
            .map(({ actividad, especialidad, codigo }) => ({ actividad, especialidad, codigo })));
        return { id: p.id, nombre: nombreFormateado(p) || p.nombre || p.email || 'Sin nombre', celdas };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));

    return { semanas, filas };
}

// ------------------------------------------------------------
// Dibujo del PDF (jsPDF, A4 horizontal). Colores fijos de la paleta
// "Marino noche y Azafrán" para que el PDF salga igual en modo claro u oscuro.
// ------------------------------------------------------------
const C = {
    marino: [15, 29, 48], marinoSuave: [26, 43, 68], azafran: [245, 158, 11],
    texto: [15, 29, 48], gris: [86, 98, 122], grisClaro: [174, 187, 208],
    fila: [246, 243, 236], linea: [228, 224, 213], blanco: [255, 255, 255]
};

export function exportarPDFModeladores(datos, { generado = new Date() } = {}) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    const M = 12, top = 22, bottom = H - 13;
    const { semanas, filas } = datos;
    const periodo = `${ddmm(semanas[0].lunes)}/${semanas[0].lunes.slice(0, 4)} al ${ddmm(semanas[semanas.length - 1].domingo)}/${semanas[semanas.length - 1].domingo.slice(0, 4)}`;
    const sello = new Intl.DateTimeFormat('es-PE', { timeZone: TZ_PROYECTO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(generado);

    const muchas = semanas.length > 7;
    const anchoNombre = muchas ? 32 : 42;
    const anchoSemana = (W - 2 * M - anchoNombre) / semanas.length;
    const fs = semanas.length > 9 ? 5.8 : semanas.length > 5 ? 6.6 : 7.5;
    const lh = fs * 0.42;
    const pad = 2;

    const encabezadoPagina = () => {
        pdf.setFillColor(...C.marino); pdf.rect(0, 0, W, 14, 'F');
        pdf.setFillColor(...C.azafran); pdf.rect(0, 14, W, 1, 'F');
        pdf.setTextColor(...C.blanco); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
        pdf.text('Actividades planificadas por modelador y semana', M, 9);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.text(`Control BIM – Caraz · ${periodo}`, W - M, 9, { align: 'right' });
    };
    const encabezadoTabla = (y) => {
        const h = 11;
        pdf.setFillColor(...C.marino); pdf.rect(M, y, W - 2 * M, h, 'F');
        pdf.setFillColor(...C.azafran); pdf.rect(M, y + h, W - 2 * M, 0.6, 'F');
        pdf.setTextColor(...C.blanco); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.text('Modelador', M + pad, y + 6.5);
        semanas.forEach((s, i) => {
            const cx = M + anchoNombre + anchoSemana * i + anchoSemana / 2;
            if (s.enCurso) { pdf.setFillColor(...C.marinoSuave); pdf.rect(cx - anchoSemana / 2, y, anchoSemana, h, 'F'); }
            pdf.setTextColor(...C.blanco); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
            pdf.text(s.codigo, cx, y + 4.5, { align: 'center' });
            pdf.setTextColor(...C.grisClaro); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
            pdf.text(muchas ? (s.enCurso ? 'en curso' : ddmm(s.lunes)) : s.rango + (s.enCurso ? ' · en curso' : ''), cx, y + 8.5, { align: 'center' });
        });
        return y + h + 0.6;
    };

    // Prepara las líneas de cada celda: "• Actividad  ESP"
    const lineasCelda = (items) => {
        pdf.setFontSize(fs);
        const out = [];
        items.forEach(it => {
            pdf.setFont('helvetica', 'normal');
            const esp = it.especialidad ? `  ${it.especialidad}` : '';
            pdf.setFontSize(fs - 1); const wEsp = esp ? pdf.getTextWidth(esp) : 0; pdf.setFontSize(fs);
            const partes = pdf.splitTextToSize(`• ${it.actividad}`, anchoSemana - 2 * pad);
            // la especialidad va en la última línea si cabe; si no, en una línea propia
            const ultima = partes[partes.length - 1];
            const cabe = pdf.getTextWidth(ultima) + wEsp <= anchoSemana - 2 * pad;
            partes.forEach((t, k) => out.push({ t: k === 0 ? t : '  ' + t, esp: (k === partes.length - 1 && cabe) ? esp : '' }));
            if (esp && !cabe) out.push({ t: '', esp: '  ' + it.especialidad });
        });
        return out;
    };

    encabezadoPagina();
    let y = encabezadoTabla(top - 2);

    filas.forEach((f, idx) => {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
        const nombreL = pdf.splitTextToSize(f.nombre, anchoNombre - 2 * pad);
        const celdas = f.celdas.map(lineasCelda);
        const nLineas = Math.max(nombreL.length * 1.15, ...celdas.map(c => c.length), 1);
        const alto = nLineas * lh + 2 * pad + 1;
        if (y + alto > bottom) { pdf.addPage(); encabezadoPagina(); y = encabezadoTabla(top - 2); }

        if (idx % 2 === 1) { pdf.setFillColor(...C.fila); pdf.rect(M, y, W - 2 * M, alto, 'F'); }
        pdf.setDrawColor(...C.linea); pdf.setLineWidth(0.25);
        pdf.rect(M, y, W - 2 * M, alto);
        for (let i = 0; i < semanas.length; i++) pdf.line(M + anchoNombre + anchoSemana * i, y, M + anchoNombre + anchoSemana * i, y + alto);

        pdf.setTextColor(...C.texto); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
        nombreL.forEach((t, k) => pdf.text(t, M + pad, y + pad + 3 + k * 3.8));

        celdas.forEach((lineas, i) => {
            const x0 = M + anchoNombre + anchoSemana * i + pad;
            if (!lineas.length) {
                pdf.setTextColor(...C.grisClaro); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs);
                pdf.text('—', x0, y + pad + 2.8);
                return;
            }
            lineas.forEach((l, k) => {
                const yy = y + pad + 2.8 + k * lh;
                pdf.setTextColor(...C.texto); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs);
                if (l.t) pdf.text(l.t, x0, yy);
                if (l.esp) {
                    const wx = l.t ? pdf.getTextWidth(l.t) : 0;
                    pdf.setTextColor(...C.gris); pdf.setFontSize(fs - 1);
                    pdf.text(l.esp, x0 + wx, yy);
                }
            });
        });
        y += alto;
    });

    if (!filas.length) {
        pdf.setTextColor(...C.gris); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        pdf.text('No hay modeladores registrados.', M + pad, y + 6); y += 8;
    }

    const nota = 'Una actividad aparece en una semana si sus fechas de inicio y fin vigente tocan algún día de esa semana. Se incluyen las actividades donde el modelador es responsable o recurso.';
    if (y + 8 > bottom) { pdf.addPage(); encabezadoPagina(); y = top; }
    pdf.setTextColor(...C.gris); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text(pdf.splitTextToSize(nota, W - 2 * M), M, y + 6);

    const total = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setTextColor(...C.gris); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
        pdf.text(`Generado ${sello} (hora Lima)`, M, H - 7);
        pdf.text(`Página ${p} de ${total}`, W - M, H - 7, { align: 'right' });
    }

    pdf.save(`Actividades_por_modelador_${semanas[0].lunes}_al_${semanas[semanas.length - 1].domingo}.pdf`);
}
