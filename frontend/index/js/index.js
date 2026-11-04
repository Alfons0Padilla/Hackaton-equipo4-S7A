(() => {
  "use strict";

  const API_BASE_URL = window.CODE_SHIELD_API_BASE_URL || "";
  const STORAGE_KEY = "codeshieldqa.attendance.v1";
  const LOG_VIEW_TIMEOUT_MS = 30000;
  const QR_SUBMIT_COOLDOWN_MS = 5000;
  const PDF_DOWNLOAD_COOLDOWN_MS = 5000;

  const elements = {
    cameraButton: document.querySelector("#camera-button"),
    idButton: document.querySelector("#id-button"),
    qrButton: document.querySelector("#qr-button"),
    pdfButton: document.querySelector("#pdf-button"),
    idModal: document.querySelector("#id-modal"),
    idForm: document.querySelector("#id-form"),
    userId: document.querySelector("#user-id"),
    idError: document.querySelector("#id-error"),
    camera: document.querySelector("#camera"),
    cameraFrame: document.querySelector("#camera-frame"),
    cameraStatus: document.querySelector("#camera-status"),
    statusDot: document.querySelector("#status-dot"),
    logs: document.querySelector("#logs"),
    logCount: document.querySelector("#log-count"),
    emptyLogs: document.querySelector("#empty-logs")
  };

  let stream;
  let scanTimer;
  let lastScan = "";
  let lastScanAt = 0;
  let clearLogsTimer;
  let qrSubmissionInProgress = false;
  let lastQrSubmissionAt = 0;
  let pdfDownloadInProgress = false;
  let lastPdfDownloadAt = 0;
  let selectedWorkerId = "";
  let selectedWorkerLogs = [];

  const localRepository = {
    async listToday() {
      const saved = readStoredLogs();
      return saved.filter((log) => log.date === getTodayKey());
    },
    async createAttendance(attendance) {
      const logs = readStoredLogs();
      const stored = { ...attendance, id: createLocalId(), date: getTodayKey() };
      logs.push(stored);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
      return stored;
    }
  };

  const attendanceRepository = {
    async listToday() {
      if (!API_BASE_URL) return localRepository.listToday();
      const response = await fetch(`${API_BASE_URL}/attendance?date=${encodeURIComponent(getTodayKey())}`);
      if (!response.ok) throw new Error("No se pudieron cargar los registros.");
      return response.json();
    },
    async createAttendance(attendance) {
      if (!API_BASE_URL) return localRepository.createAttendance(attendance);
      const response = await fetch(`${API_BASE_URL}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado_idempleado: /^\d+$/.test(attendance.employeeId) ? Number(attendance.employeeId) : undefined,
          codigo_qr: attendance.workerId,
          fecha_asistencia: attendance.date,
          hora_movimiento: attendance.time,
          tipo_movimiento: attendance.movement.toUpperCase(),
          incidencia: getApiIncident(attendance.status)
        })
      });
      if (!response.ok) throw new Error("No se pudo guardar el registro.");
      return response.json();
    }
  };

  function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createLocalId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function readStoredLogs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error("No se pudieron leer los registros locales:", error);
      return [];
    }
  }

  function setStatus(message, isLive = false, isError = false) {
    elements.cameraFrame.classList.toggle("is-live", isLive);
    elements.statusDot.classList.toggle("live", isLive);
    elements.statusDot.classList.toggle("error", isError);
    elements.cameraStatus.textContent = message;
  }

  function getStatusClass(status) {
    if (status === "Retardo") return "badge-warning";
    if (status === "Falta") return "badge-danger";
    return "badge-success";
  }

  function renderLogs(logs) {
    elements.logs.replaceChildren();
    logs.slice().reverse().forEach((log) => {
      const row = document.createElement("tr");
      [log.workerName || log.workerId, log.time, log.movement].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge ${getStatusClass(log.status)}`;
      badge.textContent = log.status;
      statusCell.append(badge);
      row.append(statusCell);
      elements.logs.append(row);
    });
    elements.logCount.textContent = `${logs.length} ${logs.length === 1 ? "registro" : "registros"}`;
    elements.emptyLogs.style.display = logs.length ? "none" : "block";
  }

  function filterWorkerLogs(logs, workerId) {
    return logs.filter((log) => normalizeWorkerId(log.workerId || log.employeeId) === workerId);
  }

  function showWorkerLogs(logs, workerId) {
    selectedWorkerId = workerId;
    selectedWorkerLogs = filterWorkerLogs(logs, workerId);
    renderLogs(selectedWorkerLogs);
    clearTimeout(clearLogsTimer);
    clearLogsTimer = setTimeout(() => {
      selectedWorkerId = "";
      selectedWorkerLogs = [];
      renderLogs([]);
      elements.pdfButton.hidden = true;
    }, LOG_VIEW_TIMEOUT_MS);
  }

  function getMovement(readCount) {
    return readCount % 2 === 0 ? "Entrada" : "Salida";
  }

  function getIncident(movement, now) {
    if (movement === "Salida") return "Permitida";
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes <= 8 * 60 + 10 ? "Puntual" : "Retardo";
  }

  function getApiIncident(status) {
    return {
      Puntual: "PUNTUAL",
      Retardo: "RETARDO",
      Falta: "FALTA",
      Permitida: "SALIDA_PERMITIDA",
      Tardía: "SALIDA_TARDIA"
    }[status] || "PUNTUAL";
  }

  function normalizeWorkerId(value) {
    return String(value || "").trim().replace(/\s+/g, "-").toUpperCase();
  }

  function showIdError(message = "") {
    elements.idError.textContent = message;
    elements.idError.hidden = !message;
    elements.userId.setAttribute("aria-invalid", String(Boolean(message)));
  }

  async function registerAttendance(rawId, source = "id") {
    if (source !== "qr") elements.pdfButton.hidden = true;
    const workerId = normalizeWorkerId(rawId);
    if (!workerId || workerId.length < 3) throw new Error("Ingresa un ID de trabajador válido.");
    const todayLogs = await attendanceRepository.listToday();
    const workerLogs = filterWorkerLogs(todayLogs, workerId);
    const now = new Date();
    const movement = getMovement(workerLogs.length);
    const attendance = {
      employeeId: workerId,
      workerId,
      time: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      movement,
      status: getIncident(movement, now),
      date: getTodayKey()
    };
    await attendanceRepository.createAttendance(attendance);
    showWorkerLogs(await attendanceRepository.listToday(), workerId);
    elements.pdfButton.hidden = source !== "qr";
    setStatus(`${movement} registrada para ${workerId}`);
    return attendance;
  }

  function pdfSafeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function createPdf(lines) {
    const content = [
      "BT",
      "/F1 14 Tf",
      "50 760 Td",
      ...lines.flatMap((line, index) => [
        `(${pdfSafeText(line)}) Tj`,
        ...(index < lines.length - 1 ? ["0 -18 Td"] : [])
      ]),
      "ET"
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
  }

  function downloadWorkerPdf() {
    const now = Date.now();
    if (!selectedWorkerId || !selectedWorkerLogs.length || pdfDownloadInProgress ||
        now - lastPdfDownloadAt < PDF_DOWNLOAD_COOLDOWN_MS) return;
    pdfDownloadInProgress = true;
    lastPdfDownloadAt = now;
    elements.pdfButton.disabled = true;
    try {
      const lines = [
        "CodeShieldQA - Logs de asistencia",
        `Trabajador: ${selectedWorkerId}`,
        `Fecha: ${getTodayKey()}`,
        "",
        "Hora | Movimiento | Estado",
        ...selectedWorkerLogs.slice().reverse().map((log) =>
          `${log.time} | ${log.movement} | ${log.status}`)
      ];
      const url = URL.createObjectURL(createPdf(lines));
      const link = document.createElement("a");
      link.href = url;
      link.download = `logs-${selectedWorkerId}-${getTodayKey()}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setTimeout(() => {
        pdfDownloadInProgress = false;
        elements.pdfButton.disabled = false;
      }, PDF_DOWNLOAD_COOLDOWN_MS);
    }
  }

  function stopCamera(message = "Cámara desconectada") {
    if (scanTimer) cancelAnimationFrame(scanTimer);
    scanTimer = undefined;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = undefined;
    elements.camera.srcObject = null;
    setStatus(message);
    elements.cameraButton.hidden = true;
  }

  async function scanFrame(detector) {
    if (!stream) return;
    try {
      const codes = await detector.detect(elements.camera);
      const value = codes[0]?.rawValue?.trim();
      const now = Date.now();
      if (value && !qrSubmissionInProgress &&
          (value !== lastScan || now - lastScanAt > QR_SUBMIT_COOLDOWN_MS) &&
          now - lastQrSubmissionAt >= QR_SUBMIT_COOLDOWN_MS) {
        lastScan = value;
        lastScanAt = now;
        qrSubmissionInProgress = true;
        try {
          await registerAttendance(value, "qr");
          lastQrSubmissionAt = Date.now();
        } finally {
          qrSubmissionInProgress = false;
        }
      }
    } catch (error) {
      console.error("No se pudo leer el código QR:", error);
    }
    if (stream) scanTimer = requestAnimationFrame(() => scanFrame(detector));
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("El navegador no permite acceso a la cámara", false, true);
      return;
    }
    if (!("BarcodeDetector" in window)) {
      setStatus("Este navegador no incluye lector QR; usa Marcar por ID", false, true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      elements.camera.srcObject = stream;
      elements.cameraButton.hidden = false;
      setStatus("Cámara activa · buscando código QR", true);
      scanFrame(new BarcodeDetector({ formats: ["qr_code"] }));
    } catch (error) {
      stopCamera();
      setStatus("No se pudo acceder a la cámara. Verifica los permisos.", false, true);
      console.error("No se pudo iniciar la cámara:", error);
    }
  }

  function closeModal() {
    elements.idModal.classList.remove("open");
    showIdError();
  }

  document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date());
  elements.idButton.addEventListener("click", () => {
    elements.pdfButton.hidden = true;
    elements.idModal.classList.add("open");
    elements.userId.focus();
  });
  elements.qrButton.addEventListener("click", startCamera);
  elements.cameraButton.addEventListener("click", () => stopCamera());
  elements.pdfButton.addEventListener("click", downloadWorkerPdf);
  elements.idForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showIdError();
    try {
      await registerAttendance(elements.userId.value);
      elements.pdfButton.hidden = true;
      elements.idForm.reset();
      closeModal();
    } catch (error) {
      showIdError(error.message);
    }
  });
  document.querySelector("#close-id-button").addEventListener("click", closeModal);
  document.querySelector("#cancel-id-button").addEventListener("click", closeModal);
  elements.idModal.addEventListener("click", (event) => {
    if (event.target === elements.idModal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  window.addEventListener("beforeunload", () => {
    stopCamera();
    clearTimeout(clearLogsTimer);
  });
  renderLogs([]);
})();
