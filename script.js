document.addEventListener("DOMContentLoaded", () => {
    // 1. Cargar valores por defecto solicitados
    loadDefaults();
    bindEvents();

    // Iniciar con un cálculo limpio normal general
    runSimulation('normal');
});

// Referencias a inputs
const v = {
    monto: () => parseFloat(document.getElementById('monto').value) || 0,
    plazo: () => parseInt(document.getElementById('plazo').value) || 0,
    tasaValor: () => parseFloat(document.getElementById('tasaValor').value) || 0,
    cuotaTotal: () => parseFloat(document.getElementById('cuotaTotal').value) || 0,
    seguro: () => parseFloat(document.getElementById('seguro').value) || 0,
    extra: () => parseFloat(document.getElementById('pagoExtra').value) || 0,
    tipoTasa: () => document.getElementById('tipoTasa').value
};

let globalActiveTable = [];

function loadDefaults() {
    document.getElementById('monto').value = "1000.00";
    document.getElementById('plazo').value = "36";
    document.getElementById('tipoTasa').value = "nominal";
    document.getElementById('tasaValor').value = "21.15";
    document.getElementById('cuotaTotal').value = "39.83";
    document.getElementById('seguro').value = "2.08";
    document.getElementById('pagoExtra').value = "0";

    const list = document.getElementById('specificPaymentsList');
    if (list) list.innerHTML = '';

    updateLiveInfoBox();
    hideAlert();
}

function bindEvents() {
    document.getElementById('btnCalcular').addEventListener('click', () => runSimulation('normal'));
    document.getElementById('btnSimular').addEventListener('click', () => runSimulation('extra'));
    document.getElementById('btnLimpiar').addEventListener('click', loadDefaults);
    document.getElementById('btnExport').addEventListener('click', exportToCSV);
    document.getElementById('btnAddSpecificPayment').addEventListener('click', () => addSpecificPaymentRow());

    // Actualiza la tarjeta gris info-box en vivo si cambian la cuota total o el seguro
    ['cuotaTotal', 'seguro'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateLiveInfoBox);
    });
}

function addSpecificPaymentRow(mes = '', monto = '') {
    const list = document.getElementById('specificPaymentsList');
    const row = document.createElement('div');
    row.className = 'specific-payment-row';
    row.innerHTML = `
        <input type="number" class="sp-mes" placeholder="Mes (ej. 12)" min="1" step="1" value="${mes}">
        <input type="number" class="sp-monto" placeholder="Monto ($)" min="1" step="0.01" value="${monto}">
        <button type="button" class="btn-remove-payment" title="Eliminar">&times;</button>
    `;
    row.querySelector('.btn-remove-payment').addEventListener('click', () => {
        row.remove();
    });
    list.appendChild(row);
}

function getSpecificPayments() {
    const payments = {};
    const rows = document.querySelectorAll('.specific-payment-row');
    rows.forEach(row => {
        const mesInput = row.querySelector('.sp-mes');
        const montoInput = row.querySelector('.sp-monto');
        const mes = parseInt(mesInput.value);
        const monto = parseFloat(montoInput.value);
        if (mes > 0 && monto > 0) {
            payments[mes] = (payments[mes] || 0) + monto;
        }
    });
    return payments;
}

function updateLiveInfoBox() {
    const total = v.cuotaTotal();
    const s = v.seguro();
    document.getElementById('lblTotal').innerText = formatoDolar(total);
    document.getElementById('lblSeguro').innerText = formatoDolar(s);
    document.getElementById('lblCuota').innerText = formatoDolar(total - s);
}

function showAlert(msg) {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
}

function hideAlert() {
    document.getElementById('alertBox').classList.add('hidden');
}

// Convertidor para visualización en moneda
const formatoDolar = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

// Validaciones para evitar fallos matemáticos
function runSimulation(escenario) {
    hideAlert();

    if (v.monto() <= 0) return showAlert("El monto debe ser mayor a 0.");
    if (v.plazo() <= 0) return showAlert("El plazo de meses debe ser mayor a 0.");
    if (v.cuotaTotal() <= v.seguro()) return showAlert("La cuota mensual debe ser mayor al seguro para poder amortizar el capital.");
    if (v.tasaValor() < 0) return showAlert("La tasa de interés no puede ser negativa.");

    let tasaMensual = 0;

    // FÓRMULAS DE TASA:
    if (v.tipoTasa() === 'nominal') {
        tasaMensual = (v.tasaValor() / 100) / 12;
    } else {
        tasaMensual = Math.pow(1 + (v.tasaValor() / 100), 1 / 12) - 1;
    }

    const cuotaFijaReal = v.cuotaTotal() - v.seguro();
    const pagosEspecificos = getSpecificPayments();

    // Calcular los dos escenarios en background para nutrir el UI Comparativo
    const simNormal = generarAmortizacion(v.monto(), v.plazo(), tasaMensual, cuotaFijaReal, v.seguro(), 0, {});
    const valorExtra = v.extra() > 0 ? v.extra() : 0;
    const simExtra = generarAmortizacion(v.monto(), v.plazo(), tasaMensual, cuotaFijaReal, v.seguro(), valorExtra, pagosEspecificos);

    if (simNormal.errorInfinidad) {
        showAlert("ATENCIÓN: La cuota mensual es inferior al interés generado mes a mes. Para evitar congelar el navegador se detuvo tras 1000 iteraciones.");
    }

    // Configurar qué se muestra en la Tabla principal
    const activeData = escenario === 'normal' ? simNormal : simExtra;
    globalActiveTable = activeData.tableArray;

    let descTitle = '';
    const hasSpecific = Object.keys(pagosEspecificos).length > 0;
    if (valorExtra > 0 && hasSpecific) descTitle = `(${formatoDolar(valorExtra)}/mes + Abonos puntuales)`;
    else if (valorExtra > 0) descTitle = `(${formatoDolar(valorExtra)}/mes aplicados)`;
    else if (hasSpecific) descTitle = `(Abonos puntuales aplicados)`;
    else descTitle = `(Sin extras programados)`;

    document.getElementById('tableTitle').innerText = escenario === 'normal'
        ? 'Tabla de Amortización Normal'
        : `Tabla de Amortización Extra ${descTitle}`;

    // Mostrar u ocultar secciones de ahorro y comparativa dependiendo del botón que se presionó
    const mostrarExtra = escenario === 'extra';
    document.getElementById('cardAhorroInt').style.display = mostrarExtra ? 'block' : 'none';
    document.getElementById('cardAhorroMeses').style.display = mostrarExtra ? 'block' : 'none';
    document.getElementById('comparativaSection').style.display = mostrarExtra ? 'block' : 'none';

    actualizarResumenDirecto(simNormal, simExtra, activeData);
    actualizarTablaHTML(globalActiveTable);
}

// Función CORE de lógica matemática y cálculo del préstamo
function generarAmortizacion(monto, plazoOrig, tasaMensual, cuotaFija, seguroM, pagoExtraManual, pagosEspecificos = {}) {
    let tableArray = [];
    let saldo = monto;
    let tInteres = 0;
    let tSeguro = 0;
    let tPagado = 0;
    let mes = 1;
    let errorInfinidad = false;

    // Fila del Mes 0 inicializador
    tableArray.push({
        mes: 0,
        cuota: 0, pagoPrestamo: 0, interes: 0, capital: 0,
        pagoExtra: 0, seguro: 0, totalMes: 0, saldo: saldo
    });

    // Seguridad: Si la deuda es eterna, detener simulación en 1,200 periodos (100 años)
    while (saldo > 0.005 && mes <= 1200) {
        let interesMes = saldo * tasaMensual;
        let capitalTeorico = cuotaFija - interesMes;

        // Sumar pago extra fijo + el pago específico si existe en este mes
        let pagoExtraPuntual = pagosEspecificos[mes] || 0;
        let pagoExtraTotalMes = pagoExtraManual + pagoExtraPuntual;

        // Bloqueador de deuda expansiva sin solución
        if (capitalTeorico + pagoExtraTotalMes <= 0) {
            errorInfinidad = true;
            break;
        }

        let capitalAplicar = capitalTeorico > 0 ? capitalTeorico : 0;
        let pagoExtraAplicar = pagoExtraTotalMes;
        let cuotaPrestamoAfectada = cuotaFija;

        // Ajuste automático exacto para el mes final del plazo, o si se adelanta el pago:
        if (capitalAplicar + pagoExtraAplicar >= saldo || mes === plazoOrig) {
            // Se fuerza el capital a ser exactamente igual al saldo para dejar la deuda en $0
            capitalAplicar = saldo;
            pagoExtraAplicar = 0;
            cuotaPrestamoAfectada = capitalAplicar + interesMes;
        }

        let totalLiquidadoMes = capitalAplicar + pagoExtraAplicar + interesMes + seguroM;
        saldo = saldo - capitalAplicar - pagoExtraAplicar;
        if (saldo < 0) saldo = 0; // Precisión de decimales

        tInteres += interesMes;
        tSeguro += seguroM;
        tPagado += totalLiquidadoMes;

        tableArray.push({
            mes: mes,
            cuota: cuotaFija,
            pagoPrestamo: cuotaPrestamoAfectada,
            interes: interesMes,
            capital: capitalAplicar,
            pagoExtra: pagoExtraAplicar,
            seguro: seguroM,
            totalMes: totalLiquidadoMes,
            saldo: saldo
        });

        mes++;
    }

    if (mes > 1200) errorInfinidad = true;

    return {
        tableArray,
        tInteres,
        tSeguro,
        tPagado,
        mesesTerminados: mes - 1,
        errorInfinidad
    };
}

// Pintar la metadata en los paneles
function actualizarResumenDirecto(simN, simE, simActiva) {
    const plazoOriginalInput = v.plazo();
    const costoFinalNeto = simActiva.tInteres + simActiva.tSeguro;

    // Resumen Principal (Superior)
    document.getElementById('s_totalPagado').innerText = formatoDolar(simActiva.tPagado);
    document.getElementById('s_totalInteres').innerText = formatoDolar(simActiva.tInteres);
    document.getElementById('s_totalSeguro').innerText = formatoDolar(simActiva.tSeguro);
    document.getElementById('s_costoFinanciero').innerText = formatoDolar(costoFinalNeto);
    document.getElementById('s_mesesReales').innerText = simActiva.mesesTerminados;

    // Los ahorros parten de comparar lo que iba a pasar Normal (simN) contra como lo termino pagando hoy si tengo extra (simE)
    let ahInt = simN.tInteres - simE.tInteres;
    document.getElementById('s_ahorroInteres').innerText = ahInt > 0 ? formatoDolar(ahInt) : formatoDolar(0);

    // Comparado al plazo original que te da el banco, cuanto ahorraste
    let ahMeses = plazoOriginalInput - simE.mesesTerminados;
    document.getElementById('s_ahorroMeses').innerText = ahMeses > 0 ? `${ahMeses} meses libres` : `0 meses libres`;


    // Tarjetas de Comparativa de Escenarios Intermedios
    // -- Normal
    document.getElementById('compNormalMeses').innerText = simN.mesesTerminados;
    document.getElementById('compNormalInt').innerText = formatoDolar(simN.tInteres);
    document.getElementById('compNormalSeg').innerText = formatoDolar(simN.tSeguro);
    document.getElementById('compNormalTotal').innerText = formatoDolar(simN.tPagado);

    // -- Extra
    document.getElementById('compExtraMeses').innerText = simE.mesesTerminados;
    document.getElementById('compExtraInt').innerText = formatoDolar(simE.tInteres);
    document.getElementById('compExtraSeg').innerText = formatoDolar(simE.tSeguro);
    document.getElementById('compExtraTotal').innerText = formatoDolar(simE.tPagado);

    // Diferencias in-line de la tarjeta comparativa Extra
    const setDiffHtml = (elemId, numValue, textStr) => {
        document.getElementById(elemId).innerHTML = numValue > 0 ? `<span class="text-success">-${textStr}</span>` : '';
    };

    setDiffHtml('diffMeses', simN.mesesTerminados - simE.mesesTerminados, `${simN.mesesTerminados - simE.mesesTerminados}m`);
    setDiffHtml('diffInt', simN.tInteres - simE.tInteres, formatoDolar(simN.tInteres - simE.tInteres));
    setDiffHtml('diffSeg', simN.tSeguro - simE.tSeguro, formatoDolar(simN.tSeguro - simE.tSeguro));
    setDiffHtml('diffTotal', simN.tPagado - simE.tPagado, formatoDolar(simN.tPagado - simE.tPagado));
}

function actualizarTablaHTML(datosArray) {
    const tbody = document.querySelector('#amortizationTable tbody');
    tbody.innerHTML = ''; //Limpieza de DOM

    let htmlContent = '';
    for (let r of datosArray) {
        htmlContent += `
        <tr>
            <td>${r.mes}</td>
            <td>${r.mes === 0 ? '-' : formatoDolar(r.cuota)}</td>
            <td>${formatoDolar(r.pagoPrestamo)}</td>
            <td>${formatoDolar(r.interes)}</td>
            <td>${formatoDolar(r.capital)}</td>
            <td class="extra-val">${formatoDolar(r.pagoExtra)}</td>
            <td>${formatoDolar(r.seguro)}</td>
            <td>${formatoDolar(r.totalMes)}</td>
            <td><strong>${formatoDolar(r.saldo)}</strong></td>
        </tr>`;
    }
    tbody.innerHTML = htmlContent;
}

function exportToCSV() {
    if (!globalActiveTable || globalActiveTable.length === 0) return;

    let csvStr = "Mes,Cuota Base,Pago al Prestamo,Interes,Capital,Pago Extra a Capital,Seguro,Total Mensual Desembolsado,Saldo Restante\n";

    globalActiveTable.forEach(r => {
        csvStr += `${r.mes},${r.cuota.toFixed(2)},${r.pagoPrestamo.toFixed(2)},${r.interes.toFixed(2)},${r.capital.toFixed(2)},${r.pagoExtra.toFixed(2)},${r.seguro.toFixed(2)},${r.totalMes.toFixed(2)},${r.saldo.toFixed(2)}\n`;
    });

    // El BOM (\uFEFF) Obliga a MS Excel y programas a renderizado perfecto del UTF-8 sin errores
    const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "tabla_amortizacion_inteligente.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
