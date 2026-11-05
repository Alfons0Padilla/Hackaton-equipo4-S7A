const API_URL = '/api';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
let empleados = [], empleadoActual = null, modoEdicion = false;

// TABS
document.getElementById('tab-empleados').onclick = (e) => { e.preventDefault(); document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active')); e.currentTarget.classList.add('active'); document.getElementById('view-empleados').style.display = 'grid'; document.getElementById('view-reportes').style.display = 'none'; document.getElementById('view-admins').style.display = 'none'; document.getElementById('top-title').textContent = 'Administración'; };
document.getElementById('tab-reportes').onclick = (e) => { e.preventDefault(); document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active')); e.currentTarget.classList.add('active'); document.getElementById('view-empleados').style.display = 'none'; document.getElementById('view-reportes').style.display = 'grid'; document.getElementById('view-admins').style.display = 'none'; document.getElementById('top-title').textContent = 'Reportes Laborales'; cargarReportes(); };
document.getElementById('tab-admins').onclick = (e) => { e.preventDefault(); document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active')); e.currentTarget.classList.add('active'); document.getElementById('view-empleados').style.display = 'none'; document.getElementById('view-reportes').style.display = 'none'; document.getElementById('view-admins').style.display = 'grid'; document.getElementById('top-title').textContent = 'Control de Accesos'; cargarAdmins(); };

async function intentarLogin() {
  const u = document.getElementById('login-user').value; const p = document.getElementById('login-pass').value;
  const res = await fetch(`${API_URL}/login`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usuario:u, password:p}) });
  if(res.ok) { document.getElementById('login-overlay').style.display = 'none'; document.getElementById('main-app').style.display = 'flex'; cargarEmpleados(); } 
  else { document.getElementById('login-err').style.display = 'block'; }
}

// SIMULADOR
document.getElementById('btn-robot').onclick = () => {
  const drop = document.getElementById('sim-dropdown'); drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
  document.getElementById('sim-date').value = localStorage.getItem('sim_date') || new Date().toISOString().split('T')[0];
  document.getElementById('sim-time').value = localStorage.getItem('sim_time') || '08:15';
};
function fijarSimulacion() { localStorage.setItem('sim_date', document.getElementById('sim-date').value); localStorage.setItem('sim_time', document.getElementById('sim-time').value); alert("Hora global fijada."); document.getElementById('sim-dropdown').style.display = 'none'; }
function limpiarSimulacion() { localStorage.removeItem('sim_date'); localStorage.removeItem('sim_time'); alert("Simulación apagada."); document.getElementById('sim-dropdown').style.display = 'none'; }

// ADMINS
async function cargarAdmins() {
    const res = await fetch(`${API_URL}/admin`); const data = await res.json(); const ul = document.getElementById('admin-list'); ul.innerHTML = '';
    data.forEach(a => { ul.innerHTML += `<li style="display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid var(--line);"><span>👤 ${a.usuario}</span> <button onclick="eliminarAdmin(${a.idadmin})" style="background:var(--danger); color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer;">X</button></li>`; });
}
async function crearAdmin() {
    const u = document.getElementById('new-admin-user').value; const p = document.getElementById('new-admin-pass').value;
    const res = await fetch(`${API_URL}/admin`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({usuario:u, password:p}) });
    if(res.ok) { document.getElementById('new-admin-user').value = ''; document.getElementById('new-admin-pass').value = ''; cargarAdmins(); } else alert("Error al crear. (Usuario duplicado)");
}
async function eliminarAdmin(id) { if(confirm("¿Eliminar usuario administrador?")) { await fetch(`${API_URL}/admin`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({idadmin: id}) }); cargarAdmins(); } }

// REPORTES AUTOMÁTICOS
document.getElementById('report-date').value = new Date().toISOString().split('T')[0];
document.getElementById('report-date').addEventListener('change', cargarReportes);

async function cargarReportes() {
  const res = await fetch(`${API_URL}/reportes?fecha=${document.getElementById('report-date').value}`);
  const data = await res.json();
  const tbodyD = document.getElementById('daily-report-body'); tbodyD.innerHTML = '';
  data.diario.forEach(r => { const c = r.incidencia.includes('Falta') ? 'badge-danger' : (r.incidencia.includes('Retardo') ? 'badge-warning' : 'badge-success'); tbodyD.innerHTML += `<tr><td><strong>${r.trabajador}</strong></td><td>${r.idempleado}</td><td>${r.horario}</td><td>${r.registro}</td><td><span class="badge ${c}">${r.incidencia}</span></td></tr>`; });
  document.getElementById('quincena-label').textContent = `Periodo quincenal: ${data.quincena_rango} · Cada 2 retardos = 1 falta administrativa.`;
  const tbodyQ = document.getElementById('biweekly-report-body'); tbodyQ.innerHTML = '';
  data.quincenal.forEach(q => { tbodyQ.innerHTML += `<tr><td><strong>${q.trabajador}</strong></td><td>${q.idempleado}</td><td>${q.retardos}</td><td><strong>${q.faltas_admin}</strong></td><td>${q.incidencia_resumen}</td></tr>`; });
}

// EMPLEADOS
function construirFilasHorario() { 
    const container = document.getElementById('schedule-rows'); container.innerHTML = '';
    DIAS.forEach(dia => { container.innerHTML += `<div class="schedule-row" data-dia="${dia}"><span class="day-name"><input type="checkbox" class="chk-dia" disabled> ${dia.substring(0,3)}</span><input type="time" class="t-e1" disabled><input type="time" class="t-s1" disabled><input type="time" class="t-e2" disabled><input type="time" class="t-s2" disabled></div>`; }); 
}

async function cargarEmpleados() { 
    const res = await fetch(`${API_URL}/empleados`); 
    empleados = await res.json(); 
    renderizarLista(empleados); 
    if (empleados.length && (!empleadoActual || modoEdicion === false)) seleccionarEmpleado(empleados[0].empleado, empleados[0].horarios); 
}

function renderizarLista(lista) { 
    const ul = document.getElementById('employee-list'); ul.innerHTML = ''; 
    lista.forEach(obj => { 
        const li = document.createElement('li'); 
        if (empleadoActual && empleadoActual.idempleado === obj.empleado.idempleado) li.classList.add('active'); 
        li.innerHTML = `<span>${obj.empleado.nombre_empleado} ${obj.empleado.apellido_P_empleado}</span><span class="emp-badge-id">#${obj.empleado.idempleado}</span>`; 
        li.onclick = () => { modoEdicion = false; document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i=>i.disabled=true); document.getElementById('btn-edit').textContent = 'Editar'; seleccionarEmpleado(obj.empleado, obj.horarios); renderizarLista(empleados); }; 
        ul.appendChild(li); 
    }); 
}

function seleccionarEmpleado(emp, horarios) { 
    empleadoActual = emp; 
    document.getElementById('emp-id').value = emp.idempleado || ''; 
    document.getElementById('emp-nombre').value = emp.nombre_empleado || ''; 
    document.getElementById('emp-app').value = emp.apellido_P_empleado || ''; 
    document.getElementById('emp-apm').value = emp.apellido_M_empleado || ''; 
    document.getElementById('emp-correo').value = emp.correo_empleado || ''; 
    document.querySelectorAll('#schedule-rows .schedule-row').forEach(row => { 
        const h = horarios.find(item => item.dia_semana === row.dataset.dia); 
        row.querySelector('.chk-dia').checked = !!h; 
        row.querySelector('.t-e1').value = h ? h.primera_entrada.substring(0,5) : ''; 
        row.querySelector('.t-s1').value = h ? h.primera_salida.substring(0,5) : ''; 
        row.querySelector('.t-e2').value = h && h.segunda_entrada ? h.segunda_entrada.substring(0,5) : ''; 
        row.querySelector('.t-s2').value = h && h.segunda_salida ? h.segunda_salida.substring(0,5) : ''; 
    }); 
    document.getElementById('qr-text').textContent = emp.codigo_qr || 'SIN QR'; 
    document.getElementById('qr-container').innerHTML = ''; 
    if (emp.codigo_qr && typeof QRCode !== 'undefined') new QRCode(document.getElementById('qr-container'), { text: emp.codigo_qr, width: 108, height: 108 }); 
}

// CORRECCIÓN PRINCIPAL: BOTÓN AGREGAR Y GUARDAR
document.getElementById('btn-add').onclick = () => { 
    modoEdicion = true; 
    empleadoActual = null; 
    document.getElementById('emp-id').value = 'SE GENERARÁ'; 
    document.getElementById('emp-nombre').value = ''; 
    document.getElementById('emp-app').value = ''; 
    document.getElementById('emp-apm').value = ''; 
    document.getElementById('emp-correo').value = ''; 

    document.querySelectorAll('#schedule-rows .schedule-row').forEach(row => {
        row.querySelector('.chk-dia').checked = false;
        row.querySelector('.t-e1').value = ''; row.querySelector('.t-s1').value = ''; row.querySelector('.t-e2').value = ''; row.querySelector('.t-s2').value = '';
    });

    document.getElementById('qr-text').textContent = 'SE GENERARÁ';
    document.getElementById('qr-container').innerHTML = '';

    document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i=>i.disabled=false); 
    document.getElementById('btn-edit').textContent = 'Guardar'; 
    document.querySelectorAll('.employee-list li').forEach(li => li.classList.remove('active'));
};

document.getElementById('btn-edit').onclick = async () => { 
    if (!modoEdicion) { 
        modoEdicion = true; 
        document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = false); 
        document.getElementById('btn-edit').textContent = 'Guardar'; 
    } else { 
        const nom = document.getElementById('emp-nombre').value.trim();
        const app = document.getElementById('emp-app').value.trim();
        const cor = document.getElementById('emp-correo').value.trim();
        const apm = document.getElementById('emp-apm').value.trim();

        if (!nom || !app || !cor) { alert("Error: Nombre, Apellido Paterno y Correo son obligatorios."); return; }

        const payload = { 
            idempleado: empleadoActual ? empleadoActual.idempleado : null, 
            nombre_empleado: nom, apellido_P_empleado: app, apellido_M_empleado: apm || null, correo_empleado: cor, horarios: [] 
        }; 
        
        document.querySelectorAll('#schedule-rows .schedule-row').forEach(row => { 
            payload.horarios.push({ 
                dia_semana: row.dataset.dia, activo: row.querySelector('.chk-dia').checked, 
                primera_entrada: row.querySelector('.t-e1').value, primera_salida: row.querySelector('.t-s1').value, 
                segunda_entrada: row.querySelector('.t-e2').value || null, segunda_salida: row.querySelector('.t-s2').value || null 
            }); 
        }); 

        try {
            const res = await fetch(`${API_URL}/empleados`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); 
            if (res.ok) {
                const data = await res.json();
                modoEdicion = false; 
                document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = true); 
                document.getElementById('btn-edit').textContent = 'Editar'; 
                
                await cargarEmpleados(); 
                
                // Forzar la selección del empleado recién guardado usando su nuevo ID
                const empleadoGuardado = empleados.find(e => e.empleado.idempleado === data.idempleado);
                if (empleadoGuardado) seleccionarEmpleado(empleadoGuardado.empleado, empleadoGuardado.horarios);
                renderizarLista(empleados);
            } else { alert("Error al guardar: Falta información de horarios o el correo ya existe."); }
        } catch(e) { alert("Error de red al conectarse a la API."); }
    } 
};

document.getElementById('btn-delete').onclick = async () => { 
    if(empleadoActual && confirm("¿Eliminar empleado?")) { 
        await fetch(`${API_URL}/empleados`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempleado: empleadoActual.idempleado }) }); 
        empleadoActual = null; await cargarEmpleados(); 
    } 
};

document.getElementById('btn-new-qr').onclick = async () => { 
    if(!empleadoActual) return;
    const res = await fetch(`${API_URL}/qr`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idempleado: empleadoActual.idempleado}) }); 
    const data = await res.json(); 
    seleccionarEmpleado({...empleadoActual, codigo_qr: data.codigo_qr}, []); 
    cargarEmpleados();
};

document.getElementById('search-input').oninput = (e) => { 
  const q = e.target.value.toLowerCase(); 
  renderizarLista(empleados.filter(obj => 
    `${obj.empleado.nombre_empleado} ${obj.empleado.apellido_P_empleado} ${obj.empleado.apellido_M_empleado || ''} ${obj.empleado.idempleado}`.toLowerCase().includes(q)
  )); 
};

construirFilasHorario();