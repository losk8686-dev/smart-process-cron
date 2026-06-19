import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_DIR = join(__dirname, 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return { enabled: false, entityTypeId: null, stageIds: [], templateId: null, runTime: '10:00', lastRun: null };
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();

const app = express();
app.use(express.json());

// Bitrix24 REST helper
const BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK;

async function bx(method, params = {}) {
  if (!BITRIX_WEBHOOK) throw new Error('BITRIX_WEBHOOK not set');
  const url = BITRIX_WEBHOOK + method + '.json';
  const { data } = await axios.get(url, { params, timeout: 30000 });
  if (data.error) throw new Error(data.error_description || data.error);
  return data.result;
}

// Cron job logic
async function runJob() {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.entityTypeId || !cfg.templateId || !cfg.stageIds.length) {
    console.log('[cron] Job skipped — not fully configured');
    return;
  }

  console.log('[cron] Starting job…');
  let found = 0;
  let started = 0;
  let error = null;

  try {
    // Fetch all items in selected stages (paginated)
    const items = [];
    let offset = 0;
    const limit = 50;
    while (true) {
      const res = await bx('crm.item.list', {
        entityTypeId: cfg.entityTypeId,
        filter: { stageId: cfg.stageIds },
        select: ['id', 'title', 'stageId'],
        start: offset
      });
      const batch = res.items || [];
      items.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }

    found = items.length;
    console.log('[cron] Found ' + found + ' items');

    // Start BP for each item
    for (const item of items) {
      try {
        await bx('bizproc.workflow.start', {
          TEMPLATE_ID: cfg.templateId,
          DOCUMENT_ID: ['crm', 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Dynamic', 'DYNAMIC_' + item.id]
        });
        started++;
      } catch (e) {
        console.error('[cron] Failed to start BP for item ' + item.id + ':', e.message);
      }
    }
  } catch (e) {
    error = e.message;
    console.error('[cron] Job failed:', error);
  }

  // Persist last-run log
  const updated = loadConfig();
  updated.lastRun = { timestamp: new Date().toISOString(), found, started, error };
  saveConfig(updated);
  console.log('[cron] Job finished —', updated.lastRun);
}

// Schedule cron job
let task = null;

function scheduleJob() {
  if (task) task.stop();
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.runTime) return;
  const [hour, minute] = cfg.runTime.split(':');
  const cronExpr = minute + ' ' + hour + ' * * *';
  task = cron.schedule(cronExpr, runJob, { timezone: 'Europe/Moscow' });
  console.log('[cron] Scheduled at ' + cfg.runTime + ' (' + cronExpr + ')');
}

scheduleJob();

// API routes
app.get('/api/config', (req, res) => res.json(config));

app.post('/api/config', (req, res) => {
  config = { ...config, ...req.body };
  saveConfig(config);
  scheduleJob();
  res.json(config);
});

app.post('/api/run-now', async (req, res) => {
  await runJob();
  res.json({ ok: true, lastRun: loadConfig().lastRun });
});

// Static SPA
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log('Server listening on ' + PORT));
