CREATE DATABASE IF NOT EXISTS reloj_checador_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reloj_checador_db;

CREATE TABLE IF NOT EXISTS administrador (
    idadmin INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);
INSERT IGNORE INTO administrador (usuario, password) VALUES ('admin', 'admin123');

CREATE TABLE IF NOT EXISTS empleado (
    idempleado INT NOT NULL AUTO_INCREMENT,
    nombre_empleado VARCHAR(60) NOT NULL,
    apellido_P_empleado VARCHAR(45) NOT NULL,
    apellido_M_empleado VARCHAR(45) DEFAULT NULL,
    correo_empleado VARCHAR(100) NOT NULL UNIQUE,
    codigo_qr VARCHAR(255) NOT NULL UNIQUE,
    PRIMARY KEY (idempleado)
);

CREATE TABLE IF NOT EXISTS horario (
    idhorario INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    dia_semana ENUM('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo') NOT NULL,
    primera_entrada TIME NOT NULL,
    primera_salida TIME NOT NULL,
    segunda_entrada TIME DEFAULT NULL,
    segunda_salida TIME DEFAULT NULL,
    PRIMARY KEY (idhorario),
    CONSTRAINT fk_horario_empleado FOREIGN KEY (empleado_idempleado) REFERENCES empleado (idempleado) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registro_asistencia (
    idregistro_asistencia INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    fecha_asistencia DATE NOT NULL,
    hora_movimiento TIME NOT NULL,
    tipo_movimiento ENUM('ENTRADA', 'SALIDA') NOT NULL,
    incidencia ENUM('PUNTUAL', 'RETARDO', 'FALTA', 'SALIDA_PERMITIDA', 'SALIDA_TARDIA') NOT NULL,
    PRIMARY KEY (idregistro_asistencia),
    CONSTRAINT fk_registro_asistencia_empleado1 FOREIGN KEY (empleado_idempleado) REFERENCES empleado (idempleado) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registro_retardos (
    idregistro_retardos INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    quincena_inicio DATE NOT NULL,
    quincena_fin DATE NOT NULL,
    total_retardos INT NOT NULL DEFAULT 0,
    faltas_admin_gener INT NOT NULL DEFAULT 0,
    PRIMARY KEY (idregistro_retardos),
    CONSTRAINT fk_registro_retardos_empleado1 FOREIGN KEY (empleado_idempleado) REFERENCES empleado (idempleado) ON DELETE CASCADE
);

-- Semilla de 10 trabajadores
INSERT IGNORE INTO empleado (idempleado, nombre_empleado, apellido_P_empleado, apellido_M_empleado, correo_empleado, codigo_qr) VALUES
(1, 'Ana', 'López', 'García', 'ana.lopez@empresa.mx', 'QR-EMP-001'),
(2, 'Juan', 'Pérez', 'Hernández', 'juan.perez@empresa.mx', 'QR-EMP-002'),
(3, 'María', 'Ruiz', 'Sánchez', 'maria.ruiz@empresa.mx', 'QR-EMP-003'),
(4, 'Pedro', 'Díaz', 'Ramírez', 'pedro.diaz@empresa.mx', 'QR-EMP-004'),
(5, 'Carlos', 'Gómez', 'Mendoza', 'carlos.gomez@empresa.mx', 'QR-EMP-005'),
(6, 'Laura', 'Torres', 'Flores', 'laura.torres@empresa.mx', 'QR-EMP-006'),
(7, 'Miguel', 'Vázquez', 'Cruz', 'miguel.vazquez@empresa.mx', 'QR-EMP-007'),
(8, 'Sofía', 'Morales', 'Reyes', 'sofia.morales@empresa.mx', 'QR-EMP-008'),
(9, 'Jorge', 'Castillo', 'Ortiz', 'jorge.castillo@empresa.mx', 'QR-EMP-009'),
(10, 'Lucía', 'Romero', 'Gutiérrez', 'lucia.romero@empresa.mx', 'QR-EMP-010');

-- Horarios (El empleado 1 tiene jornada dividida el miércoles)
INSERT INTO horario (empleado_idempleado, dia_semana, primera_entrada, primera_salida, segunda_entrada, segunda_salida) VALUES
(1, 'Lunes', '08:00:00', '16:00:00', NULL, NULL), (1, 'Martes', '08:00:00', '16:00:00', NULL, NULL), (1, 'Miércoles', '08:00:00', '13:00:00', '17:00:00', '20:00:00'), (1, 'Jueves', '09:00:00', '17:00:00', NULL, NULL), (1, 'Viernes', '08:00:00', '15:00:00', NULL, NULL),
(2, 'Lunes', '08:00:00', '16:00:00', NULL, NULL), (2, 'Martes', '08:00:00', '16:00:00', NULL, NULL), (2, 'Miércoles', '08:00:00', '16:00:00', NULL, NULL), (2, 'Jueves', '08:00:00', '16:00:00', NULL, NULL), (2, 'Viernes', '08:00:00', '16:00:00', NULL, NULL),
(3, 'Lunes', '08:00:00', '13:00:00', '17:00:00', '20:00:00'), (3, 'Martes', '08:00:00', '13:00:00', '17:00:00', '20:00:00'), (3, 'Miércoles', '08:00:00', '13:00:00', '17:00:00', '20:00:00'), (3, 'Jueves', '08:00:00', '13:00:00', '17:00:00', '20:00:00'), (3, 'Viernes', '08:00:00', '13:00:00', '17:00:00', '20:00:00'),
(4, 'Lunes', '09:00:00', '17:00:00', NULL, NULL), (4, 'Martes', '09:00:00', '17:00:00', NULL, NULL), (4, 'Miércoles', '09:00:00', '17:00:00', NULL, NULL), (4, 'Jueves', '09:00:00', '17:00:00', NULL, NULL), (4, 'Viernes', '09:00:00', '17:00:00', NULL, NULL);