(() => {
  "use strict";

  const API_BASE_URL = window.CODE_SHIELD_API_BASE_URL || "";
  const STORAGE_KEY = "codeshieldqa.attendance.v1";
  const DEMO_LOGS = [
    { workerId: "USR-001", workerName: "Ana López", time: "08:05", movement: "Entrada", status: "Puntual" },
    { workerId: "USR-002", workerName: "Juan Pérez", time: "08:15", movement: "Entrada", status: "Retardo" },
    { workerId: "USR-003", workerName: "María Ruiz", time: "08:25", movement: "Entrada", status: "Falta" },
    { workerId: "USR-004", workerName: "Pedro Díaz", time: "16:02", movement: "Salida", status: "Permitida" }
  ];

  const elements = {
    cameraButton: document.querySelector("#camera-button"),
    idButton: document.querySelector("#id-button"),
    qrButton: document.querySelector("#qr-button"),
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
  let activeDate = getTodayKey();

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

  async function registerAttendance(rawId) {
    const workerId = normalizeWorkerId(rawId);
    if (!workerId || workerId.length < 3) throw new Error("Ingresa un ID de trabajador válido.");
    const todayLogs = await attendanceRepository.listToday();
    const workerLogs = todayLogs.filter((log) => normalizeWorkerId(log.workerId || log.employeeId) === workerId);
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
    renderLogs(await attendanceRepository.listToday());
    setStatus(`${movement} registrada para ${workerId}`);
    return attendance;
  }

  async function loadLogs() {
    try {
      let logs = await attendanceRepository.listToday();
      if (!API_BASE_URL && !logs.length && activeDate === getTodayKey()) {
        logs = DEMO_LOGS.map((log) => ({ ...log, date: getTodayKey() }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
      }
      renderLogs(logs);
    } catch (error) {
      renderLogs([]);
      setStatus(error.message, false, true);
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
      if (value && (value !== lastScan || Date.now() - lastScanAt > 3000)) {
        lastScan = value;
        lastScanAt = Date.now();
        await registerAttendance(value);
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
    elements.idModal.classList.add("open");
    elements.userId.focus();
  });
  elements.qrButton.addEventListener("click", startCamera);
  elements.cameraButton.addEventListener("click", () => stopCamera());
  elements.idForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showIdError();
    try {
      await registerAttendance(elements.userId.value);
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
  window.addEventListener("beforeunload", () => stopCamera());
  loadLogs();
})();
