const API_URL = '/api';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

let empleados = [], empleadoActual = null, modoEdicion = false;
document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date());

function construirFilasHorario() {
  const container = document.getElementById('schedule-rows');
  container.innerHTML = '';
  DIAS.forEach(dia => {
    container.innerHTML += `
      <div class="schedule-row" data-dia="${dia}">
        <span class="day-name"><input type="checkbox" class="chk-dia" disabled> ${dia.substring(0,3)}</span>
        <input type="time" class="t-e1" disabled><input type="time" class="t-s1" disabled>
        <input type="time" class="t-e2" disabled><input type="time" class="t-s2" disabled>
      </div>`;
  });
}

async function cargarEmpleados() {
  try {
    const res = await fetch(`${API_URL}/empleados`);
    empleados = await res.json();
    renderizarLista(empleados);
    if (empleados.length && !empleadoActual) {
      seleccionarEmpleado(empleados[0].empleado, empleados[0].horarios);
    } else if (empleadoActual) {
      // Mantener seleccionado al empleado tras guardar
      const actualizado = empleados.find(e => e.empleado.idempleado === empleadoActual.idempleado);
      if (actualizado) seleccionarEmpleado(actualizado.empleado, actualizado.horarios);
    }
  } catch (e) {
    console.error("Error conectando al backend Rust", e);
  }
}

function renderizarLista(lista) {
  const ul = document.getElementById('employee-list');
  ul.innerHTML = '';
  lista.forEach(obj => {
    const li = document.createElement('li');
    if (empleadoActual && empleadoActual.idempleado === obj.empleado.idempleado) li.classList.add('active');
    li.innerHTML = `<span>${obj.empleado.nombre_empleado} ${obj.empleado.apellido_P_empleado}</span><span class="emp-badge-id">#${obj.empleado.idempleado}</span>`;
    li.onclick = () => {
      modoEdicion = false;
      document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = true);
      document.getElementById('btn-edit').textContent = 'Editar';
      seleccionarEmpleado(obj.empleado, obj.horarios);
      renderizarLista(empleados); // Actualiza clase active visualmente
    };
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
  if (emp.codigo_qr && typeof QRCode !== 'undefined') {
    new QRCode(document.getElementById('qr-container'), { text: emp.codigo_qr, width: 108, height: 108 });
  }
}

// Lógica para BOTÓN EDITAR / GUARDAR
document.getElementById('btn-edit').onclick = async () => {
  if (!modoEdicion) {
    modoEdicion = true;
    document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = false);
    document.getElementById('btn-edit').textContent = 'Guardar';
  } else {
    const payload = {
      idempleado: empleadoActual ? empleadoActual.idempleado : null,
      nombre_empleado: document.getElementById('emp-nombre').value,
      apellido_P_empleado: document.getElementById('emp-app').value,
      apellido_M_empleado: document.getElementById('emp-apm').value,
      correo_empleado: document.getElementById('emp-correo').value,
      horarios: []
    };
    
    document.querySelectorAll('#schedule-rows .schedule-row').forEach(row => {
      payload.horarios.push({
        dia_semana: row.dataset.dia, activo: row.querySelector('.chk-dia').checked,
        primera_entrada: row.querySelector('.t-e1').value, primera_salida: row.querySelector('.t-s1').value,
        segunda_entrada: row.querySelector('.t-e2').value || null, segunda_salida: row.querySelector('.t-s2').value || null
      });
    });

    const res = await fetch(`${API_URL}/empleados`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if(res.ok) {
        const data = await res.json();
        if (!empleadoActual) empleadoActual = { idempleado: data.idempleado }; // Asignar ID si es nuevo
        modoEdicion = false;
        document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = true);
        document.getElementById('btn-edit').textContent = 'Editar';
        await cargarEmpleados();
    } else {
        alert("Verifica que los campos Nombre, Apellido y Correo estén completos.");
    }
  }
};

// Lógica para BOTÓN AGREGAR
document.getElementById('btn-add').onclick = () => {
  modoEdicion = true;
  empleadoActual = null; // Reiniciar referencia
  
  document.getElementById('emp-id').value = 'SE GENERARÁ AL GUARDAR';
  document.getElementById('emp-nombre').value = '';
  document.getElementById('emp-app').value = '';
  document.getElementById('emp-apm').value = '';
  document.getElementById('emp-correo').value = '';

  // Configurar horario estándar por defecto (L-V)
  document.querySelectorAll('#schedule-rows .schedule-row').forEach(row => {
    const esLaboral = !['Sábado', 'Domingo'].includes(row.dataset.dia);
    row.querySelector('.chk-dia').checked = esLaboral;
    row.querySelector('.t-e1').value = esLaboral ? '08:00' : '';
    row.querySelector('.t-s1').value = esLaboral ? '16:00' : '';
    row.querySelector('.t-e2').value = '';
    row.querySelector('.t-s2').value = '';
  });

  document.getElementById('qr-text').textContent = 'SE GENERARÁ AL GUARDAR';
  document.getElementById('qr-container').innerHTML = '';

  document.querySelectorAll('#employee-form input:not(.readonly-input)').forEach(i => i.disabled = false);
  document.getElementById('btn-edit').textContent = 'Guardar';
};

// Lógica para BOTÓN ELIMINAR
document.getElementById('btn-delete').onclick = async () => {
  if (!empleadoActual) return;
  if (!confirm(`¿Eliminar de la base de datos a ${empleadoActual.nombre_empleado} ${empleadoActual.apellido_P_empleado}?`)) return;
  
  const res = await fetch(`${API_URL}/empleados`, { 
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ idempleado: empleadoActual.idempleado }) 
  });
  
  if (res.ok) {
    empleadoActual = null;
    await cargarEmpleados();
  } else {
    alert("Error al intentar eliminar.");
  }
};

// Lógica para GENERAR NUEVO QR
document.getElementById('btn-new-qr').onclick = async () => {
    if (!empleadoActual) return;
    const res = await fetch(`${API_URL}/qr`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idempleado: empleadoActual.idempleado}) });
    const data = await res.json();
    if(data.ok) {
      empleadoActual.codigo_qr = data.codigo_qr;
      const index = empleados.findIndex(e => e.empleado.idempleado === empleadoActual.idempleado);
      if (index !== -1) empleados[index].empleado.codigo_qr = data.codigo_qr;
      seleccionarEmpleado(empleadoActual, empleados[index].horarios);
    }
};

// Lógica para el BUSCADOR
document.getElementById('search-input').oninput = (e) => {
    const query = e.target.value.toLowerCase();
    const filtrados = empleados.filter(obj => 
        `${obj.empleado.nombre_empleado} ${obj.empleado.apellido_P_empleado} ${obj.empleado.idempleado}`.toLowerCase().includes(query)
    );
    renderizarLista(filtrados);
};

construirFilasHorario();
cargarEmpleados();