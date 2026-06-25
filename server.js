import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import cron from 'node-cron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Хранилище конфигурации (только задачи и логи, без вебхука)
const CONFIG_FILE = join(__dirname, 'data', 'config.json');

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return { tasks: [], logs: [] };
  }
}

async function saveConfig(config) {
  await fs.mkdir(dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Функция для получения вебхука из заголовка
function getWebhookFromHeaders(req) {
  const encoded = req.headers['x-webhook-encoded'];
  if (!encoded) {
    return null;
  }
  
  try {
    // Декодируем base64
    const decoded = decodeURIComponent(escape(Buffer.from(encoded, 'base64').toString('utf8')));
    return decoded;
  } catch (error) {
    console.error('Error decoding webhook:', error);
    return null;
  }
}

// API для работы с Битрикс24 через вебхук
async function callBitrixApi(webhook, method, params = {}) {
  if (!webhook) {
    throw new Error('Webhook not provided');
  }
  
  const url = webhook.endsWith('/') ? webhook : webhook + '/';
  console.log('Calling Bitrix API:', method, 'with URL:', url);
  
  const response = await fetch(url + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  const data = await response.json();
  console.log('Bitrix API response:', JSON.stringify(data).substring(0, 200));
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data.result;
}

// Получение стадий для ЭДО (entityTypeId: 138)
app.get('/api/stages/:entityTypeId', async (req, res) => {
  try {
    const webhook = getWebhookFromHeaders(req);
    if (!webhook) {
      return res.status(400).json({ error: 'Webhook not provided. Use X-Webhook-Encoded header' });
    }
    
    const { entityTypeId } = req.params;
    console.log('Getting stages for entityTypeId:', entityTypeId);
    
    const result = await callBitrixApi(webhook, 'crm.status.list', {
      order: { SORT: 'ASC' }
    });
    
    if (!Array.isArray(result)) {
      console.log('Stages result is not array:', typeof result);
      return res.json([]);
    }
    
    console.log('Total statuses received:', result.length);
    
    const prefix = 'DT' + entityTypeId + '_';
    const stages = result
      .filter(status => status.STATUS_ID && status.STATUS_ID.startsWith(prefix))
      .map(stage => ({
        id: stage.STATUS_ID,
        name: stage.NAME,
        sort: stage.SORT,
        color: stage.COLOR
      }));
    
    console.log('Filtered stages:', stages.length);
    res.json(stages);
  } catch (error) {
    console.error('Error getting stages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение бизнес-процессов
app.get('/api/business-processes/:entityTypeId', async (req, res) => {
  try {
    const webhook = getWebhookFromHeaders(req);
    if (!webhook) {
      return res.status(400).json({ error: 'Webhook not provided. Use X-Webhook-Encoded header' });
    }
    
    const { entityTypeId } = req.params;
    console.log('Getting BP for entityTypeId:', entityTypeId);
    
    const result = await callBitrixApi(webhook, 'bizproc.workflow.template.list', {
      select: ['ID', 'NAME', 'DESCRIPTION', 'MODULE_ID', 'ENTITY']
    });
    
    if (!Array.isArray(result)) {
      console.log('BP result is not array:', typeof result);
      return res.json([]);
    }
    
    console.log('Total BP received:', result.length);
    console.log('First BP:', JSON.stringify(result[0]).substring(0, 200));
    
    // Временно возвращаем все БП без фильтрации для диагностики
    const bps = result.map(bp => ({
      id: bp.ID,
      name: bp.NAME || 'БП #' + bp.ID,
      description: bp.DESCRIPTION,
      entity: bp.ENTITY
    }));
    
    console.log('Returning BP:', bps.length);
    res.json(bps);
  } catch (error) {
    console.error('Error getting business processes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение задач
app.get('/api/tasks', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config.tasks || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Создание задачи
app.post('/api/tasks', async (req, res) => {
  try {
    const config = await loadConfig();
    const task = {
      id: Date.now(),
      ...req.body,
      createdAt: new Date().toISOString(),
      lastRun: null,
      active: true
    };
    
    config.tasks = config.tasks || [];
    config.tasks.push(task);
    await saveConfig(config);
    
    await initCronJobs();
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Обновление задачи
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const taskId = parseInt(req.params.id);
    const index = config.tasks.findIndex(t => t.id === taskId);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    config.tasks[index] = { ...config.tasks[index], ...req.body };
    await saveConfig(config);
    
    await initCronJobs();
    
    res.json(config.tasks[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Удаление задачи
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const taskId = parseInt(req.params.id);
    config.tasks = config.tasks.filter(t => t.id !== taskId);
    await saveConfig(config);
    
    await initCronJobs();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Запуск задачи вручную
app.post('/api/tasks/:id/run', async (req, res) => {
  try {
    const config = await loadConfig();
    const webhook = getWebhookFromHeaders(req);
    
    if (!webhook) {
      return res.status(400).json({ error: 'Webhook not provided. Use X-Webhook-Encoded header' });
    }
    
    const taskId = parseInt(req.params.id);
    const task = config.tasks.find(t => t.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const result = await runTask(config, task, webhook);
    res.json(result);
  } catch (error) {
    console.error('Error running task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение логов
app.get('/api/logs', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config.logs || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Функция запуска задачи
async function runTask(config, task, webhook) {
  const log = {
    id: Date.now(),
    taskId: task.id,
    taskName: task.smartProcessName,
    timestamp: new Date().toISOString(),
    status: 'running',
    details: []
  };
  
  try {
    const elements = await callBitrixApi(webhook, 'crm.item.list', {
      entityTypeId: task.entityTypeId,
      filter: {
        stageId: task.stages
      }
    });
    
    const items = elements.items || [];
    log.details.push('Найдено элементов: ' + items.length);
    
    let started = 0;
    let errors = 0;
    
    for (const item of items) {
      try {
        await callBitrixApi(webhook, 'bizproc.workflow.start', {
          TEMPLATE_ID: task.bpId,
          DOCUMENT_ID: ['crm_item_' + task.entityTypeId, item.id]
        });
        started++;
      } catch (error) {
        console.error('Error starting BP for element ' + item.id + ':', error);
        errors++;
        log.details.push('Ошибка для элемента ' + item.id + ': ' + error.message);
      }
    }
    
    log.status = errors > 0 ? 'warning' : 'success';
    log.result = { started, errors, total: items.length };
    log.details.push('Запущено: ' + started + ', Ошибок: ' + errors);
    
    task.lastRun = new Date().toISOString();
    task.lastResult = log.result;
    
    config.logs = config.logs || [];
    config.logs.unshift(log);
    if (config.logs.length > 100) {
      config.logs = config.logs.slice(0, 100);
    }
    
    await saveConfig(config);
    
    return log;
  } catch (error) {
    log.status = 'error';
    log.details.push('Ошибка: ' + error.message);
    
    config.logs = config.logs || [];
    config.logs.unshift(log);
    await saveConfig(config);
    
    throw error;
  }
}

// Cron задачи
let cronJobs = {};

async function initCronJobs() {
  const config = await loadConfig();
  
  for (const job of Object.values(cronJobs)) {
    job.stop();
  }
  cronJobs = {};
  
  // Для cron нужен вебхук из переменной окружения
  const webhook = process.env.BITRIX_WEBHOOK;
  if (!webhook) {
    console.log('No BITRIX_WEBHOOK env var, skipping cron initialization');
    return;
  }
  
  for (const task of config.tasks || []) {
    if (!task.active || !task.runTime) continue;
    
    const [hours, minutes] = task.runTime.split(':');
    const cronExpression = minutes + ' ' + hours + ' * * *';
    
    cronJobs[task.id] = cron.schedule(cronExpression, async () => {
      console.log('Running scheduled task: ' + task.smartProcessName);
      try {
        await runTask(config, task, webhook);
      } catch (error) {
        console.error('Scheduled task error:', error);
      }
    });
  }
}

// Инициализация при старте
(async () => { await initCronJobs(); })();

// Static SPA
app.use(express.static(join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server listening on ' + PORT));
