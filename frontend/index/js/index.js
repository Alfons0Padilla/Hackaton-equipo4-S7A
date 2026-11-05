const API_URL = '/api';

// Sincronización del Reloj (Si la pestaña de admin fijó una hora simulada en localStorage, la mostramos)
setInterval(() => {
  const simD = localStorage.getItem('sim_date');
  const simT = localStorage.getItem('sim_time');
  const clock = document.getElementById('live-clock');
  
  if (simD && simT) {
    clock.textContent = `[SIMULADO] ${simD} ${simT}`;
    clock.style.color = "var(--warning)";
  } else {
    clock.textContent = new Date().toLocaleTimeString('es-MX');
    clock.style.color = "var(--primary)";
  }
}, 1000);

let ultimoEscaneo = 0;

async function registrarAsistencia(codigoQr) {
  const box = document.getElementById('result-box');
  
  // Extraemos la hora de la simulación si existe, sino null (Rust usará la hora real)
  const fechaSimulada = localStorage.getItem('sim_date') || null;
  const horaSimulada = localStorage.getItem('sim_time') || null;

  try {
    const res = await fetch(`${API_URL}/asistencia`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_qr: codigoQr, fecha_simulada: fechaSimulada, hora_simulada: horaSimulada })
    });
    
    if (!res.ok) {
        box.style.display = 'block';
        box.style.background = '#fee2e2'; box.style.border = '1px solid var(--danger)';
        box.innerHTML = `<strong>Rechazado:</strong> Código no válido o límite de registros alcanzado hoy.`;
        return;
    }
    const data = await res.json();
    box.style.display = 'block';
    box.style.background = '#e4f6ed'; box.style.border = '1px solid var(--success)';
    box.innerHTML = `<strong>¡Registrado!</strong><br>${data.trabajador}<br>${data.tipo_movimiento} | ${data.incidencia}<br>Hora guardada: ${data.hora}`;
  } catch (err) {
    box.style.display = 'block'; box.style.background = '#fee2e2';
    box.innerHTML = `<strong>Error de red</strong>`;
  }
}

document.getElementById('btn-registrar').addEventListener('click', () => registrarAsistencia(document.getElementById('qr-input').value));

// Inicialización Robusta de Cámara
if (typeof Html5Qrcode !== 'undefined') {
  const html5QrCode = new Html5Qrcode("reader-container");
  html5QrCode.start(
    { facingMode: "environment" }, 
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      const ahora = Date.now();
      if (ahora - ultimoEscaneo > 4000) { 
        ultimoEscaneo = ahora; 
        document.getElementById('qr-input').value = decodedText; 
        registrarAsistencia(decodedText); 
      }
    }, 
    (err) => { /* Ignorar errores de frame vacío */ }
  ).catch(err => {
    document.getElementById('reader-container').innerHTML = `<p style="padding:20px; text-align:center; color:red;">Para encender la cámara, accede a chrome://flags/#unsafely-treat-insecure-origin-as-secure, ingresa la IP del servidor y selecciona Enabled.</p>`;
  });
}