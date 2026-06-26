import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

// PostgreSQL (опционально)
let pool = null;
let usePostgreSQL = false;

async function initPostgreSQL() {
  if (!process.env.DATABASE_URL) return false;
  try {
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    // Тестовое соединение
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    usePostgreSQL = true;
    console.log('PostgreSQL connected');
    return true;
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message);
    return false;
  }
}

// Файловое хранилище
async function loadFileConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { tasks: [], logs: [] };
  }
}

async function saveFileConfig(config) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Инициализация
export async function initDB() {
  const pgOk = await initPostgreSQL();
  if (pgOk) {
    const client = await pool.connect();
    try {
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
          is_running BOOLEAN DEFAULT false,
          run_started_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_run TIMESTAMP,
          last_result JSONB
        )
      `);
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
      
      // Add missing columns to existing table
      await client.query(`
        ALTER TABLE tasks 
        ADD COLUMN IF NOT EXISTS is_running BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS run_started_at TIMESTAMP
      `);
    } finally {
      client.release();
    }
  }
}

export async function loadConfig() {
  if (usePostgreSQL && pool) {
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
          isRunning: row.is_running || false,
          runStartedAt: row.run_started_at ? row.run_started_at.toISOString() : null,
          createdAt: row.created_at ? row.created_at.toISOString() : null,
          lastRun: row.last_run ? row.last_run.toISOString() : null,
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
  return loadFileConfig();
}

export async function saveTask(task) {
  console.log('saveTask called with isRunning:', task.isRunning, 'type:', typeof task.isRunning);
  
  if (usePostgreSQL && pool) {
    const client = await pool.connect();
    try {
      const isRunningValue = task.isRunning === true ? true : false;
      console.log('Saving isRunning as:', isRunningValue);
      
      await client.query(`
        INSERT INTO tasks (id, entity_type_id, smart_process_name, stages, stages_names, run_time, bp_id, bp_name, active, is_running, run_started_at, created_at, last_run, last_result)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          entity_type_id = EXCLUDED.entity_type_id,
          smart_process_name = EXCLUDED.smart_process_name,
          stages = EXCLUDED.stages,
          stages_names = EXCLUDED.stages_names,
          run_time = EXCLUDED.run_time,
          bp_id = EXCLUDED.bp_id,
          bp_name = EXCLUDED.bp_name,
          active = EXCLUDED.active,
          is_running = EXCLUDED.is_running,
          run_started_at = EXCLUDED.run_started_at,
          last_run = EXCLUDED.last_run,
          last_result = EXCLUDED.last_result
      `, [
        task.id, task.entityTypeId, task.smartProcessName,
        JSON.stringify(task.stages), JSON.stringify(task.stagesNames),
        task.runTime, task.bpId, task.bpName, task.active,
        isRunningValue, task.runStartedAt,
        task.createdAt, task.lastRun, JSON.stringify(task.lastResult)
      ]);
    } finally {
      client.release();
    }
    return;
  }
  const config = await loadFileConfig();
  const idx = config.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) config.tasks[idx] = task;
  else config.tasks.push(task);
  await saveFileConfig(config);
}

export async function deleteTask(taskId) {
  if (usePostgreSQL && pool) {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    } finally {
      client.release();
    }
    return;
  }
  const config = await loadFileConfig();
  config.tasks = config.tasks.filter(t => t.id !== taskId);
  await saveFileConfig(config);
}

export async function saveLog(log) {
  if (usePostgreSQL && pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO logs (id, task_id, task_name, timestamp, status, details, result)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        log.id, log.taskId, log.taskName, log.timestamp,
        log.status, JSON.stringify(log.details), JSON.stringify(log.result)
      ]);
    } finally {
      client.release();
    }
    return;
  }
  const config = await loadFileConfig();
  if (!config.logs) config.logs = [];
  config.logs.unshift(log);
  if (config.logs.length > 100) config.logs = config.logs.slice(0, 100);
  await saveFileConfig(config);
}
