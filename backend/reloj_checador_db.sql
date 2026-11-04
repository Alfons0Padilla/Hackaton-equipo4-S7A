-- 1. Crear la base de datos y seleccionarla
CREATE DATABASE IF NOT EXISTS reloj_checador_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reloj_checador_db;

-- 2. Tabla de empleados
CREATE TABLE IF NOT EXISTS empleado (
    idempleado INT NOT NULL AUTO_INCREMENT,
    nombre_empleado VARCHAR(60) NOT NULL,
    apellido_P_empleado VARCHAR(45) NOT NULL,
    apellido_M_empleado VARCHAR(45) DEFAULT NULL,
    correo_empleado VARCHAR(100) NOT NULL UNIQUE,
    codigo_qr VARCHAR(255) NOT NULL UNIQUE,
    PRIMARY KEY (idempleado)
)

-- 3. Tabla de horarios (soporta jornada continua y dividida)
CREATE TABLE IF NOT EXISTS horario (
    idhorario INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    dia_semana ENUM('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo') NOT NULL,
    primera_entrada TIME NOT NULL,
    primera_salida TIME NOT NULL,
    segunda_entrada TIME DEFAULT NULL,
    segunda_salida TIME DEFAULT NULL,
    PRIMARY KEY (idhorario),
    KEY fk_horario_empleado_idx (empleado_idempleado),
    CONSTRAINT fk_horario_empleado 
        FOREIGN KEY (empleado_idempleado) 
        REFERENCES empleado (idempleado) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
)

-- 4. Tabla de registros de asistencia
CREATE TABLE IF NOT EXISTS registro_asistencia (
    idregistro_asistencia INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    fecha_asistencia DATE NOT NULL,
    hora_movimiento TIME NOT NULL,
    tipo_movimiento ENUM('ENTRADA', 'SALIDA') NOT NULL,
    incidencia ENUM('PUNTUAL', 'RETARDO', 'FALTA', 'SALIDA_PERMITIDA', 'SALIDA_TARDIA') NOT NULL,
    PRIMARY KEY (idregistro_asistencia),
    KEY fk_registro_asistencia_empleado1_idx (empleado_idempleado),
    CONSTRAINT fk_registro_asistencia_empleado1 
        FOREIGN KEY (empleado_idempleado) 
        REFERENCES empleado (idempleado) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
)

-- 5. Tabla de control y acumulación de retardos (quincenal)
CREATE TABLE IF NOT EXISTS registro_retardos (
    idregistro_retardos INT NOT NULL AUTO_INCREMENT,
    empleado_idempleado INT NOT NULL,
    quincena_inicio DATE NOT NULL,
    quincena_fin DATE NOT NULL,
    total_retardos INT NOT NULL DEFAULT 0,
    faltas_admin_gener INT NOT NULL DEFAULT 0,
    PRIMARY KEY (idregistro_retardos),
    KEY fk_registro_retardos_empleado1_idx (empleado_idempleado),
    CONSTRAINT fk_registro_retardos_empleado1 
        FOREIGN KEY (empleado_idempleado) 
        REFERENCES empleado (idempleado) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
)