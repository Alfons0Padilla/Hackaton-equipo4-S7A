use axum::{extract::{Query, State}, http::StatusCode, routing::{get, post, delete}, Json, Router};
use chrono::{Datelike, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, MySqlPool};
use std::{collections::HashMap, net::SocketAddr};
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState { pool: MySqlPool }

#[derive(Serialize, Deserialize, FromRow, Clone)]
struct Empleado {
    idempleado: i32, nombre_empleado: String, apellido_P_empleado: String, 
    apellido_M_empleado: Option<String>, correo_empleado: String, codigo_qr: String,
}

#[derive(Serialize, Deserialize, FromRow, Clone)]
struct Horario {
    dia_semana: String, primera_entrada: NaiveTime, primera_salida: NaiveTime,
    segunda_entrada: Option<NaiveTime>, segunda_salida: Option<NaiveTime>,
}

#[derive(Serialize, Deserialize, FromRow, Clone)]
struct Administrador { idadmin: i32, usuario: String }

#[derive(Deserialize)]
struct GuardarEmpleadoPayload {
    idempleado: Option<i32>, nombre_empleado: String, apellido_P_empleado: String,
    apellido_M_empleado: Option<String>, correo_empleado: String, horarios: Vec<HorarioPayload>,
}

#[derive(Deserialize)]
struct HorarioPayload {
    dia_semana: String, activo: bool, primera_entrada: String, primera_salida: String,
    segunda_entrada: Option<String>, segunda_salida: Option<String>,
}

#[derive(Deserialize)]
struct AsistenciaPayload { codigo_qr: String, fecha_simulada: Option<String>, hora_simulada: Option<String> }

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("Falta DATABASE_URL en .env");
    let pool = MySqlPool::connect(&db_url).await.unwrap();
    let state = AppState { pool };

    let app = Router::new()
        .route("/api/login", post(login_admin))
        .route("/api/admin", get(listar_admins).post(crear_admin).delete(eliminar_admin))
        .route("/api/empleados", get(listar_empleados).post(guardar_empleado).delete(eliminar_empleado))
        .route("/api/asistencia", post(registrar_asistencia))
        .route("/api/reportes", get(obtener_reportes))
        .route("/api/qr", post(regenerar_qr))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = "0.0.0.0:5000".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn login_admin(State(state): State<AppState>, Json(payload): Json<HashMap<String, String>>) -> Result<Json<serde_json::Value>, StatusCode> {
    let user = payload.get("usuario").unwrap_or(&"".to_string()).clone();
    let pass = payload.get("password").unwrap_or(&"".to_string()).clone();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM administrador WHERE usuario = ? AND password = ?")
        .bind(user).bind(pass).fetch_one(&state.pool).await.unwrap_or(0);
    if count > 0 { Ok(Json(serde_json::json!({"ok": true}))) } else { Err(StatusCode::UNAUTHORIZED) }
}

async fn listar_admins(State(state): State<AppState>) -> Result<Json<Vec<Administrador>>, StatusCode> {
    let admins = sqlx::query_as::<_, Administrador>("SELECT idadmin, usuario FROM administrador ORDER BY idadmin ASC").fetch_all(&state.pool).await.unwrap();
    Ok(Json(admins))
}

async fn crear_admin(State(state): State<AppState>, Json(payload): Json<HashMap<String, String>>) -> Result<Json<serde_json::Value>, StatusCode> {
    let user = payload.get("usuario").unwrap_or(&"".to_string()).clone();
    let pass = payload.get("password").unwrap_or(&"".to_string()).clone();
    if user.is_empty() || pass.is_empty() { return Err(StatusCode::BAD_REQUEST); }
    sqlx::query("INSERT INTO administrador (usuario, password) VALUES (?, ?)").bind(user).bind(pass).execute(&state.pool).await.map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn eliminar_admin(State(state): State<AppState>, Json(payload): Json<HashMap<String, i32>>) -> Result<Json<serde_json::Value>, StatusCode> {
    let id = payload.get("idadmin").unwrap_or(&0).clone();
    sqlx::query("DELETE FROM administrador WHERE idadmin = ?").bind(id).execute(&state.pool).await.unwrap();
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn listar_empleados(State(state): State<AppState>) -> Result<Json<Vec<serde_json::Value>>, StatusCode> {
    let empleados = sqlx::query_as::<_, Empleado>("SELECT * FROM empleado ORDER BY idempleado ASC").fetch_all(&state.pool).await.unwrap();
    let mut resp = Vec::new();
    for emp in empleados {
        let horarios = sqlx::query_as::<_, Horario>("SELECT * FROM horario WHERE empleado_idempleado = ?").bind(emp.idempleado).fetch_all(&state.pool).await.unwrap_or_default();
        resp.push(serde_json::json!({ "empleado": emp, "horarios": horarios }));
    }
    Ok(Json(resp))
}

async fn obtener_reportes(State(state): State<AppState>, Query(params): Query<HashMap<String, String>>) -> Result<Json<serde_json::Value>, StatusCode> {
    let fecha_str = params.get("fecha").cloned().unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let fecha = NaiveDate::parse_from_str(&fecha_str, "%Y-%m-%d").unwrap_or_else(|_| Utc::now().naive_local().date());
    let dia_semana = match fecha.weekday().number_from_monday() { 1=>"Lunes", 2=>"Martes", 3=>"Miércoles", 4=>"Jueves", 5=>"Viernes", 6=>"Sábado", _=>"Domingo" };

    let empleados = sqlx::query_as::<_, Empleado>("SELECT * FROM empleado ORDER BY idempleado ASC").fetch_all(&state.pool).await.unwrap();
    
    let mut diario = Vec::new();
    let mut quincenal = Vec::new();

    let anio_mes = fecha.format("%Y-%m").to_string();
    let (q_inicio, q_fin) = if fecha.day() <= 15 { (format!("{}-01", anio_mes), format!("{}-15", anio_mes)) } 
                            else { (format!("{}-16", anio_mes), format!("{}-{}", anio_mes, chrono::NaiveDate::from_ymd_opt(fecha.year(), fecha.month() % 12 + 1, 1).unwrap().pred_opt().unwrap().day())) };

    for emp in &empleados {
        let hor = sqlx::query_as::<_, Horario>("SELECT * FROM horario WHERE empleado_idempleado=? AND dia_semana=?").bind(emp.idempleado).bind(dia_semana).fetch_optional(&state.pool).await.unwrap();
        let regs: Vec<(NaiveTime, String)> = sqlx::query_as("SELECT hora_movimiento, incidencia FROM registro_asistencia WHERE empleado_idempleado=? AND fecha_asistencia=?").bind(emp.idempleado).bind(fecha).fetch_all(&state.pool).await.unwrap_or_default();

        let mut reg_str = Vec::new();
        let mut inc_final = if hor.is_some() { "Sin registro (Falta)".to_string() } else { "Día no laboral".to_string() };
        
        for (h, i) in &regs {
            reg_str.push(h.format("%H:%M").to_string());
            if i == "FALTA" { inc_final = "Falta".to_string(); }
            else if i == "RETARDO" && inc_final != "Falta" { inc_final = "Retardo".to_string(); }
            else if inc_final == "Sin registro (Falta)" { inc_final = "Puntual".to_string(); }
        }

        let hor_str = match &hor {
            Some(h) => {
                let mut s = format!("{}-{}", h.primera_entrada.format("%H:%M"), h.primera_salida.format("%H:%M"));
                if let (Some(e2), Some(s2)) = (h.segunda_entrada, h.segunda_salida) { s = format!("{} / {}-{}", s, e2.format("%H:%M"), s2.format("%H:%M")); }
                s
            },
            None => "Descanso".to_string()
        };

        diario.push(serde_json::json!({
            "idempleado": emp.idempleado, "trabajador": format!("{} {}", emp.nombre_empleado, emp.apellido_P_empleado),
            "horario": hor_str, "registro": if reg_str.is_empty() { "—".to_string() } else { reg_str.join(" / ") }, "incidencia": inc_final
        }));

        let ret_row: Option<(i32, i32)> = sqlx::query_as("SELECT total_retardos, faltas_admin_gener FROM registro_retardos WHERE empleado_idempleado=? AND quincena_inicio=?").bind(emp.idempleado).bind(&q_inicio).fetch_optional(&state.pool).await.unwrap();
        let faltas_directas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM registro_asistencia WHERE empleado_idempleado=? AND incidencia='FALTA' AND fecha_asistencia BETWEEN ? AND ?").bind(emp.idempleado).bind(&q_inicio).bind(&q_fin).fetch_one(&state.pool).await.unwrap_or(0);
        let (retardos, faltas_admin) = ret_row.unwrap_or((0, 0));

        quincenal.push(serde_json::json!({
            "idempleado": emp.idempleado, "trabajador": format!("{} {}", emp.nombre_empleado, emp.apellido_P_empleado),
            "retardos": retardos, "faltas_admin": faltas_admin, "incidencia_resumen": format!("Retardos: {} | Faltas Admin: {} | Faltas directas: {}", retardos, faltas_admin, faltas_directas)
        }));
    }

    Ok(Json(serde_json::json!({ "fecha": fecha_str, "quincena_rango": format!("{} al {}", q_inicio, q_fin), "diario": diario, "quincenal": quincenal })))
}

async fn registrar_asistencia(State(state): State<AppState>, Json(payload): Json<AsistenciaPayload>) -> Result<Json<serde_json::Value>, StatusCode> {
    // Si viene la fecha simulada del Frontend, la usamos. Si no, tomamos la fecha real del servidor.
    let fecha_str = match payload.fecha_simulada {
        Some(f) if !f.is_empty() => f,
        _ => Utc::now().format("%Y-%m-%d").to_string(),
    };
    let hora_str = match payload.hora_simulada {
        Some(h) if !h.is_empty() => h,
        _ => Utc::now().format("%H:%M").to_string(),
    };

    let fecha = NaiveDate::parse_from_str(&fecha_str, "%Y-%m-%d").unwrap();
    let hora = NaiveTime::parse_from_str(&format!("{}:00", hora_str), "%H:%M:%S").unwrap();

    let emp = sqlx::query_as::<_, Empleado>("SELECT * FROM empleado WHERE codigo_qr = ?").bind(&payload.codigo_qr).fetch_optional(&state.pool).await.unwrap().ok_or(StatusCode::NOT_FOUND)?;
    let dia = match fecha.weekday().number_from_monday() { 1=>"Lunes", 2=>"Martes", 3=>"Miércoles", 4=>"Jueves", 5=>"Viernes", 6=>"Sábado", _=>"Domingo" };
    let hor = sqlx::query_as::<_, Horario>("SELECT * FROM horario WHERE empleado_idempleado=? AND dia_semana=?").bind(emp.idempleado).bind(dia).fetch_optional(&state.pool).await.unwrap().ok_or(StatusCode::BAD_REQUEST)?;

    let movs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM registro_asistencia WHERE empleado_idempleado=? AND fecha_asistencia=?").bind(emp.idempleado).bind(fecha).fetch_one(&state.pool).await.unwrap();
    let max_movs = if hor.segunda_entrada.is_some() { 4 } else { 2 };
    if movs >= max_movs { return Err(StatusCode::BAD_REQUEST); }

    let (tipo, hora_prog) = match movs { 0 => ("ENTRADA", hor.primera_entrada), 1 => ("SALIDA", hor.primera_salida), 2 => ("ENTRADA", hor.segunda_entrada.unwrap()), _ => ("SALIDA", hor.segunda_salida.unwrap()), };

    let diff_mins = (hora.signed_duration_since(hora_prog).num_seconds()) as f64 / 60.0;
    let incidencia = if tipo == "ENTRADA" {
        if diff_mins < -20.0 { return Err(StatusCode::BAD_REQUEST); }
        if diff_mins <= 10.0 { "PUNTUAL" } else if diff_mins <= 20.0 { "RETARDO" } else { "FALTA" }
    } else {
        if diff_mins < -10.0 { return Err(StatusCode::BAD_REQUEST); }
        if diff_mins <= 20.0 { "SALIDA_PERMITIDA" } else { "SALIDA_TARDIA" }
    };

    sqlx::query("INSERT INTO registro_asistencia (empleado_idempleado, fecha_asistencia, hora_movimiento, tipo_movimiento, incidencia) VALUES (?, ?, ?, ?, ?)").bind(emp.idempleado).bind(fecha).bind(hora).bind(tipo).bind(&incidencia).execute(&state.pool).await.unwrap();

    if incidencia == "RETARDO" {
        let anio_mes = fecha.format("%Y-%m").to_string();
        let (q_inicio, q_fin) = if fecha.day() <= 15 { (format!("{}-01", anio_mes), format!("{}-15", anio_mes)) } else { (format!("{}-16", anio_mes), format!("{}-31", anio_mes)) };
        
        let row: Option<(i32, i32, i32)> = sqlx::query_as("SELECT idregistro_retardos, total_retardos, faltas_admin_gener FROM registro_retardos WHERE empleado_idempleado=? AND quincena_inicio=?").bind(emp.idempleado).bind(&q_inicio).fetch_optional(&state.pool).await.unwrap();
        if let Some((id, total, _)) = row { sqlx::query("UPDATE registro_retardos SET total_retardos=?, faltas_admin_gener=? WHERE idregistro_retardos=?").bind(total + 1).bind((total + 1) / 2).bind(id).execute(&state.pool).await.unwrap(); } 
        else { sqlx::query("INSERT INTO registro_retardos (empleado_idempleado, quincena_inicio, quincena_fin, total_retardos, faltas_admin_gener) VALUES (?, ?, ?, 1, 0)").bind(emp.idempleado).bind(&q_inicio).bind(&q_fin).execute(&state.pool).await.unwrap(); }
    }

    Ok(Json(serde_json::json!({
        "ok": true, "trabajador": format!("{} {}", emp.nombre_empleado, emp.apellido_P_empleado), "idempleado": emp.idempleado,
        "tipo_movimiento": tipo, "incidencia": incidencia, "hora_programada": hora_prog.format("%H:%M").to_string(), "hora": hora.format("%H:%M").to_string()
    })))
}

async fn guardar_empleado(State(state): State<AppState>, Json(payload): Json<GuardarEmpleadoPayload>) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut tx = state.pool.begin().await.unwrap();
    let emp_id = if let Some(id) = payload.idempleado {
        sqlx::query("UPDATE empleado SET nombre_empleado=?, apellido_P_empleado=?, apellido_M_empleado=?, correo_empleado=? WHERE idempleado=?").bind(&payload.nombre_empleado).bind(&payload.apellido_P_empleado).bind(&payload.apellido_M_empleado).bind(&payload.correo_empleado).bind(id).execute(&mut *tx).await.unwrap(); id
    } else {
        let res = sqlx::query("INSERT INTO empleado (nombre_empleado, apellido_P_empleado, apellido_M_empleado, correo_empleado, codigo_qr) VALUES (?, ?, ?, ?, ?)").bind(&payload.nombre_empleado).bind(&payload.apellido_P_empleado).bind(&payload.apellido_M_empleado).bind(&payload.correo_empleado).bind(format!("QR-TEMP-{}", uuid::Uuid::new_v4())).execute(&mut *tx).await.unwrap();
        let id = res.last_insert_id() as i32;
        sqlx::query("UPDATE empleado SET codigo_qr=? WHERE idempleado=?").bind(format!("QR-EMP-{:03}", id)).bind(id).execute(&mut *tx).await.unwrap(); id
    };
    sqlx::query("DELETE FROM horario WHERE empleado_idempleado=?").bind(emp_id).execute(&mut *tx).await.unwrap();
    for h in payload.horarios {
        if h.activo {
            sqlx::query("INSERT INTO horario (empleado_idempleado, dia_semana, primera_entrada, primera_salida, segunda_entrada, segunda_salida) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(emp_id).bind(h.dia_semana).bind(NaiveTime::parse_from_str(&format!("{}:00", h.primera_entrada), "%H:%M:%S").unwrap_or_default()).bind(NaiveTime::parse_from_str(&format!("{}:00", h.primera_salida), "%H:%M:%S").unwrap_or_default())
                .bind(h.segunda_entrada.and_then(|s| NaiveTime::parse_from_str(&format!("{}:00", s), "%H:%M:%S").ok())).bind(h.segunda_salida.and_then(|s| NaiveTime::parse_from_str(&format!("{}:00", s), "%H:%M:%S").ok())).execute(&mut *tx).await.unwrap();
        }
    }
    tx.commit().await.unwrap();
    Ok(Json(serde_json::json!({ "ok": true, "idempleado": emp_id })))
}

async fn eliminar_empleado(State(state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, StatusCode> {
    sqlx::query("DELETE FROM empleado WHERE idempleado=?").bind(payload.get("idempleado").and_then(|v| v.as_i64()).unwrap_or(0) as i32).execute(&state.pool).await.unwrap(); Ok(Json(serde_json::json!({ "ok": true })))
}
async fn regenerar_qr(State(state): State<AppState>, Json(payload): Json<serde_json::Value>) -> Result<Json<serde_json::Value>, StatusCode> {
    let id = payload.get("idempleado").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let nuevo_qr = format!("QR-EMP-{:03}-{}", id, &uuid::Uuid::new_v4().to_string()[..4].to_uppercase());
    sqlx::query("UPDATE empleado SET codigo_qr=? WHERE idempleado=?").bind(&nuevo_qr).bind(id).execute(&state.pool).await.unwrap();
    Ok(Json(serde_json::json!({ "ok": true, "codigo_qr": nuevo_qr })))
}