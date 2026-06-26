import pg from 'pg';
const { Pool } = pg;

// Создаём пул соединений с PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Инициализация таблиц
export async function initDB() {
  const client = await pool.connect();
  try {
    // Таблица задач
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id BIGINT PRIMARY KEY,
        entity_type_id VARCHAR(50),
        smart_process_name VARCHAR(255),
        stages JSONB,
        stages_names JSONB,
        run_time VARCHAR(10),
        bp_id VARCHAR(50),
        bp_name VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_run TIMESTAMP,
        last_result JSONB
      )
    `);

    // Таблица логов
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id BIGINT PRIMARY KEY,
        task_id BIGINT,
        task_name VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50),
        details JSONB,
        result JSONB
      )
    `);

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// Загрузка конфигурации
export async function loadConfig() {
  const client = await pool.connect();
  try {
    const tasksResult = await client.query('SELECT * FROM tasks ORDER BY created_at DESC');
    const logsResult = await client.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');

    return {
      tasks: tasksResult.rows.map(row => ({
        id: row.id,
        entityTypeId: row.entity_type_id,
        smartProcessName: row.smart_process_name,
        stages: row.stages,
        stagesNames: row.stages_names,
        runTime: row.run_time,
        bpId: row.bp_id,
        bpName: row.bp_name,
        active: row.active,
        createdAt: row.created_at,
        lastRun: row.last_run,
        lastResult: row.last_result
      })),
      logs: logsResult.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        timestamp: row.timestamp,
        status: row.status,
        details: row.details,
        result: row.result
      }))
    };
  } finally {
    client.release();
  }
}

// Сохранение задачи
export async function saveTask(task) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO tasks (id, entity_type_id, smart_process_name, stages, stages_names, run_time, bp_id, bp_name, active, created_at, last_run, last_result)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        entity_type_id = EXCLUDED.entity_type_id,
        smart_process_name = EXCLUDED.smart_process_name,
        stages = EXCLUDED.stages,
        stages_names = EXCLUDED.stages_names,
        run_time = EXCLUDED.run_time,
        bp_id = EXCLUDED.bp_id,
        bp_name = EXCLUDED.bp_name,
        active = EXCLUDED.active,
        last_run = EXCLUDED.last_run,
        last_result = EXCLUDED.last_result
    `, [
      task.id,
      task.entityTypeId,
      task.smartProcessName,
      JSON.stringify(task.stages),
      JSON.stringify(task.stagesNames),
      task.runTime,
      task.bpId,
      task.bpName,
      task.active,
      task.createdAt,
      task.lastRun,
      JSON.stringify(task.lastResult)
    ]);
  } finally {
    client.release();
  }
}

// Удаление задачи
export async function deleteTask(taskId) {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
  } finally {
    client.release();
  }
}

// Сохранение лога
export async function saveLog(log) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO logs (id, task_id, task_name, timestamp, status, details, result)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      log.id,
      log.taskId,
      log.taskName,
      log.timestamp,
      log.status,
      JSON.stringify(log.details),
      JSON.stringify(log.result)
    ]);
  } finally {
    client.release();
  }
}
