const API_URL = '/api';

// REVISIÓN DEL RELOJ EN TIEMPO REAL CON SIMULADOR
setInterval(() => {
  const simD = localStorage.getItem('sim_date');
  const simT = localStorage.getItem('sim_time');
  const clock = document.getElementById('live-clock');
  
  if (simD && simT) {
    clock.innerHTML = `<span style="font-size:1rem; display:block; color:gray;">Modo Simulación Activo</span>${simD} a las ${simT}`;
    clock.style.color = "var(--warning)";
  } else {
    clock.textContent = new Date().toLocaleTimeString('es-MX');
    clock.style.color = "var(--primary)";
  }
}, 1000);

let ultimoEscaneo = 0;

async function registrarAsistencia(codigoQr) {
  const box = document.getElementById('result-box');
  const fechaSimulada = localStorage.getItem('sim_date') || null;
  const horaSimulada = localStorage.getItem('sim_time') || null;

  try {
    const res = await fetch(`${API_URL}/asistencia`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_qr: codigoQr, fecha_simulada: fechaSimulada, hora_simulada: horaSimulada })
    });
    
    if (!res.ok) {
        box.style.display = 'block'; box.style.background = '#fee2e2'; box.style.border = '1px solid var(--danger)';
        box.innerHTML = `<strong>Rechazado:</strong> Código inválido, empleado sin turno hoy, o límite de registros alcanzado.`;
        return;
    }
    
    const data = await res.json();
    box.style.display = 'block'; box.style.background = '#e4f6ed'; box.style.border = '1px solid var(--success)';
    box.innerHTML = `<strong>¡Registrado exitosamente!</strong><br>${data.trabajador} (#${data.idempleado})<br>${data.tipo_movimiento} | ${data.incidencia}<br>Hora de registro: ${data.hora}`;
  } catch (err) {
    box.style.display = 'block'; box.style.background = '#fee2e2'; box.innerHTML = `<strong>Error de conexión al servidor backend</strong>`;
  }
}

document.getElementById('btn-registrar').addEventListener('click', () => registrarAsistencia(document.getElementById('qr-input').value));

// INICIALIZACIÓN DE CÁMARA CORREGIDA
document.addEventListener("DOMContentLoaded", () => {
    if (typeof Html5Qrcode !== 'undefined') {
        const html5QrCode = new Html5Qrcode("reader");
        
        // Pide la cámara delantera o trasera intentando iniciar el video de inmediato
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
            (errorMessage) => { /* ignora advertencias menores de lectura */ }
        ).catch(err => {
            console.error("Error al iniciar cámara:", err);
            document.getElementById('reader').innerHTML = `<p style="padding:20px; text-align:center; color:red; font-size:0.85rem; border:2px solid red;">Cámara bloqueada por el navegador. <br><br>Si estás en la IP de AWS, entra a <b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b>, agrega <b>http://TU_IP_AQUI</b>, marca "Enabled" y reinicia el navegador.</p>`;
        });
    }
});