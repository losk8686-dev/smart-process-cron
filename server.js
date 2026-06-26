import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import cron from 'node-cron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Basic Auth защита
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'admin';

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Smart Process Cron"');
    return res.status(401).send('Authentication required');
  }
  
  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const user = credentials[0];
  const pass = credentials[1];
  
  if (user !== AUTH_USER || pass !== AUTH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Smart Process Cron"');
    return res.status(401).send('Invalid credentials');
  }
  
  next();
}

// Применяем Basic Auth ко всем маршрутам
app.use(basicAuth);

// Хранилище конфигурации
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

// Вебхук хранится только на сервере (переменные окружения)
const WEBHOOK = process.env.BITRIX_WEBHOOK;

// API для работы с Битрикс24 через вебхук
async function callBitrixApi(webhook, method, params = {}) {
  if (!webhook) {
    throw new Error('Webhook not provided');
  }
  
  const url = webhook.endsWith('/') ? webhook : webhook + '/';
  
  // Таймаут для запроса (30 секунд)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(url + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    
    return data.result;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Битрикс24 не отвечает более 30 секунд');
    }
    throw error;
  }
}

// Функция для получения ВСЕХ элементов с пагинацией
async function getAllElements(webhook, entityTypeId, stages) {
  const allItems = [];
  let start = 0;
  const limit = 50;
  const maxIterations = 200; // Максимум 200 итераций (200 * 50 = 10000 элементов)
  let iterations = 0;
  
  while (true) {
    iterations++;
    if (iterations > maxIterations) {
      console.error(`Safety limit exceeded: ${maxIterations} iterations`);
      break;
    }
    
    console.log(`Fetching elements: start=${start}, limit=${limit}, iteration=${iterations}`);
    
    let result;
    try {
      result = await callBitrixApi(WEBHOOK, 'crm.item.list', {
        entityTypeId: entityTypeId,
        filter: {
          stageId: stages
        },
        start: start,
        limit: limit
      });
    } catch (error) {
      console.error(`Error fetching elements at start=${start}:`, error.message);
      break;
    }
    
    if (!result || typeof result !== 'object') {
      console.error('Invalid API response:', result);
      break;
    }
    
    const items = Array.isArray(result.items) ? result.items : [];
    console.log(`Received ${items.length} items`);
    
    if (items.length === 0) {
      console.log('Empty response - stopping');
      break;
    }
    
    allItems.push(...items);
    
    if (items.length < limit) {
      console.log('Last page reached');
      break;
    }
    
    if (result.total && allItems.length >= parseInt(result.total)) {
      console.log('All items fetched based on total');
      break;
    }
    
    start += limit;
    
    // Задержка между запросами чтобы не перегружать API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Total items fetched: ${allItems.length}`);
  return allItems;
}

// Получение стадий для ЭДО
app.get('/api/stages/:entityTypeId', async (req, res) => {
  try {
    if (!WEBHOOK) {
      return res.status(500).json({ error: 'BITRIX_WEBHOOK not configured on server' });
    }
    
    const { entityTypeId } = req.params;
    
    const result = await callBitrixApi(WEBHOOK, 'crm.status.list', {
      order: { SORT: 'ASC' }
    });
    
    if (!Array.isArray(result)) {
      return res.json([]);
    }
    
    const prefix = 'DT' + entityTypeId + '_';
    const stages = result
      .filter(status => status.STATUS_ID && status.STATUS_ID.startsWith(prefix))
      .map(stage => ({
        id: stage.STATUS_ID,
        name: stage.NAME,
        sort: stage.SORT,
        color: stage.COLOR
      }));
    
    res.json(stages);
  } catch (error) {
    console.error('Error getting stages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение бизнес-процессов для ЭДО
app.get('/api/business-processes/:entityTypeId', async (req, res) => {
  try {
    if (!WEBHOOK) {
      return res.status(500).json({ error: 'BITRIX_WEBHOOK not configured on server' });
    }
    
    const { entityTypeId } = req.params;
    
    const result = await callBitrixApi(WEBHOOK, 'bizproc.workflow.template.list', {
      select: ['ID', 'NAME', 'DESCRIPTION', 'MODULE_ID', 'ENTITY'],
      limit: 100
    });
    
    if (!Array.isArray(result)) {
      return res.json([]);
    }
    
    // Фильтруем БП для смарт-процессов (Dynamic)
    const bps = result
      .filter(bp => {
        const entity = bp.ENTITY || '';
        return entity.includes('Dynamic') || entity.includes('DYNAMIC');
      })
      .map(bp => ({
        id: bp.ID,
        name: bp.NAME || 'БП #' + bp.ID,
        description: bp.DESCRIPTION,
        entity: bp.ENTITY
      }));
    
    res.json(bps);
  } catch (error) {
    console.error('Error getting business processes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Подсчёт сущностей в стадиях
app.post('/api/tasks/:id/count', async (req, res) => {
  try {
    if (!WEBHOOK) {
      return res.status(500).json({ error: 'BITRIX_WEBHOOK not configured on server' });
    }
    
    const config = await loadConfig();
    const taskId = parseInt(req.params.id);
    const task = config.tasks.find(t => t.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const allItems = await getAllElements(webhook, task.entityTypeId, task.stages);
    
    res.json({
      count: allItems.length,
      stages: task.stagesNames || task.stages
    });
  } catch (error) {
    console.error('Error counting elements:', error);
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
    const webhook = getWebhookFromHeaders(req);
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
    
    // Переинициализируем крон после создания задачи
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
    
    if (!WEBHOOK) {
      return res.status(500).json({ error: 'BITRIX_WEBHOOK not configured on server' });
    }
    
    const taskId = parseInt(req.params.id);
    const task = config.tasks.find(t => t.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const result = await runTask(config, task);
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

// Получение вебхука с сервера (только из env vars)
app.get('/api/webhook', async (req, res) => {
  try {
    // На Render используем только переменные окружения
    const webhook = process.env.BITRIX_WEBHOOK || null;
    res.json({ webhook: webhook });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Проверка статуса крона
app.get('/api/cron-status', async (req, res) => {
  try {
    const config = await loadConfig();
    const tasks = config.tasks || [];
    
    res.json({
      serverTime: new Date().toISOString(),
      timezoneOffset: new Date().getTimezoneOffset(),
      webhookConfigured: !!process.env.BITRIX_WEBHOOK,
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => t.active).length,
      cronJobsRunning: Object.keys(cronJobs).length,
      tasks: tasks.map(t => ({
        id: t.id,
        name: t.smartProcessName,
        active: t.active,
        runTime: t.runTime,
        lastRun: t.lastRun
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Функция запуска задачи - ИСПРАВЛЕННАЯ
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
    // Получаем ВСЕ элементы с пагинацией
    const allItems = await getAllElements(webhook, task.entityTypeId, task.stages);
    
    log.details.push('Найдено элементов: ' + allItems.length);
    
    let started = 0;
    let errors = 0;
    const errorDetails = [];
    
    for (const item of allItems) {
      try {
        // ИСПРАВЛЕНО: Используем bizproc.workflow.start с правильным форматом DOCUMENT_ID
        // Формат: ["crm", "Bitrix\Crm\Integration\BizProc\Document\Dynamic", "DYNAMIC_138_26"]
        const documentId = ['crm', 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Dynamic', 'DYNAMIC_' + task.entityTypeId + '_' + item.id];
        
        console.log('Starting BP for item:', item.id, 'with documentId:', documentId);
        
        const result = await callBitrixApi(WEBHOOK, 'bizproc.workflow.start', {
          TEMPLATE_ID: task.bpId,
          DOCUMENT_ID: documentId
        });
        
        console.log('BP started successfully for item:', item.id, 'result:', result);
        started++;
        
        // Задержка между запусками чтобы не перегружать API
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error('Error starting BP for element ' + item.id + ':', error);
        errors++;
        const errorMsg = 'Ошибка для элемента ' + item.id + ': ' + error.message;
        log.details.push(errorMsg);
        errorDetails.push(errorMsg);
      }
    }
    
    log.status = errors > 0 ? 'warning' : 'success';
    log.result = { started, errors, total: allItems.length };
    log.details.push('Запущено: ' + started + ', Ошибок: ' + errors);
    
    if (errorDetails.length > 0) {
      log.details.push('Примеры ошибок: ' + errorDetails.slice(0, 3).join('; '));
    }
    
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
  
  console.log('Initializing cron jobs...');
  console.log('Total tasks:', config.tasks ? config.tasks.length : 0);
  console.log('Active tasks:', config.tasks ? config.tasks.filter(t => t.active).length : 0);
  
  for (const job of Object.values(cronJobs)) {
    job.stop();
  }
  cronJobs = {};
  
  for (const task of config.tasks || []) {
    if (!task.active || !task.runTime) continue;
    
    const webhook = process.env.BITRIX_WEBHOOK;
    if (!webhook) {
      console.log('No webhook for task:', task.smartProcessName, '- skipping');
      continue;
    }
    
    // Преобразуем время из UTC+7 (пользовательское) в UTC (серверное)
    // Вычитаем 7 часов
    const [userHours, userMinutes] = task.runTime.split(':');
    let serverHours = parseInt(userHours) - 7;
    if (serverHours < 0) {
      serverHours += 24; // Если получилось отрицательное, добавляем 24 часа
    }
    const hours = serverHours.toString();
    const minutes = userMinutes;
    const cronExpression = minutes + ' ' + hours + ' * * *';
    
    cronJobs[task.id] = cron.schedule(cronExpression, async () => {
      console.log('Running scheduled task: ' + task.smartProcessName);
      try {
        await runTask(config, task);
      } catch (error) {
        console.error('Scheduled task error:', error);
      }
    });
    
    console.log('Scheduled task:', task.smartProcessName, 'user time:', task.runTime, '(UTC+7) -> server time:', hours + ':' + minutes, '(UTC)');
  }
  
  console.log('Cron initialization complete. Active jobs:', Object.keys(cronJobs).length);
}

// Инициализация при старте
(async () => {
  console.log('Server starting...');
  console.log('Current time:', new Date().toISOString());
  console.log('Timezone offset:', new Date().getTimezoneOffset(), 'minutes');
  console.log('BITRIX_WEBHOOK env:', process.env.BITRIX_WEBHOOK ? 'Set' : 'Not set');
  await initCronJobs();
})();

// Static SPA
app.use(express.static(join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server listening on ' + PORT));
