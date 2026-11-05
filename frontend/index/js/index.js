const API_URL = '/api';

document.getElementById('sim-date').value = new Date().toISOString().split('T')[0];
setInterval(() => document.getElementById('live-clock').textContent = new Date().toLocaleTimeString('es-MX'), 1000);
let ultimoEscaneo = 0;

async function registrarAsistencia(codigoQr) {
  const box = document.getElementById('result-box');
  const fecha = document.getElementById('sim-date').value;
  const hora = document.getElementById('sim-time').value;

  try {
    const res = await fetch(`${API_URL}/asistencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_qr: codigoQr, fecha_simulada: fecha, hora_simulada: hora })
    });
    
    if (!res.ok) {
        box.className = 'result-box error';
        box.innerHTML = `<strong>Error:</strong><br>El código no es válido o está fuera de horario.`;
        return;
    }

    const data = await res.json();
    box.className = 'result-box ok';
    let html = `
      <strong>¡Movimiento Registrado!</strong><br>
      Trabajador: <b>${data.trabajador} (#${data.idempleado})</b><br>
      Movimiento: <b>${data.tipo_movimiento}</b> | Clasificación: <b>${data.incidencia}</b><br>
      Programado: ${data.hora_programada} | Registrado: ${data.hora}
    `;
    if (data.notificacion_correo) {
      html += `<div class="mail-alert"><strong>✉ Notificación:</strong><br>${data.notificacion_correo.detalle}</div>`;
    }
    box.innerHTML = html;
  } catch (err) {
    box.className = 'result-box error';
    box.innerHTML = `<strong>Error de red:</strong> No se pudo conectar al servidor Rust.`;
  }
}

document.getElementById('btn-registrar').addEventListener('click', () => registrarAsistencia(document.getElementById('qr-input').value));

if (typeof Html5Qrcode !== 'undefined') {
  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } },
    (decodedText) => {
      const ahora = Date.now();
      if (ahora - ultimoEscaneo > 4000) {
        ultimoEscaneo = ahora;
        document.getElementById('qr-input').value = decodedText;
        registrarAsistencia(decodedText);
      }
    }, () => {}
  ).catch(() => document.getElementById('reader').innerHTML = '<p style="padding:20px; text-align:center;">Cámara no detectada.</p>');
}