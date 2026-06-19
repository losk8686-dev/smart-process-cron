// Smart Process Cron - Production Build (CDN Version)
const { useState, useEffect } = React;

// API Client
const API = '/api';

async function getConfig() {
  const res = await fetch(`${API}/config`);
  return res.json();
}

async function setConfig(cfg) {
  const res = await fetch(`${API}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
  return res.json();
}

async function runNow() {
  const res = await fetch(`${API}/run-now`, { method: 'POST' });
  return res.json();
}

// JobConfigForm Component
function JobConfigForm() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getConfig().then(setCfg);
  }, []);

  if (!cfg) return React.createElement('div', { className: 'loading' }, 'Загрузка...');

  const handleChange = (field, value) => {
    setCfg({ ...cfg, [field]: value });
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setConfig(cfg);
      setMessage({ type: 'success', text: 'Настройки сохранены!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Ошибка сохранения: ' + e.message });
    }
    setSaving(false);
  };

  const handleRunNow = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await runNow();
      if (result.ok) {
        setMessage({ type: 'success', text: `Задание выполнено! Найдено: ${result.lastRun?.found || 0}, Запущено БП: ${result.lastRun?.started || 0}` });
      } else {
        setMessage({ type: 'error', text: 'Ошибка выполнения задания' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Ошибка: ' + e.message });
    }
    setSaving(false);
  };

  return React.createElement('div', { className: 'card' },
    React.createElement('h2', null, 'Настройка задания'),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'checkbox-label' },
        React.createElement('input', {
          type: 'checkbox',
          checked: cfg.enabled || false,
          onChange: e => handleChange('enabled', e.target.checked)
        }),
        'Включить автоматический запуск'
      )
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', null, 'Время запуска (ЧЧ:ММ)'),
      React.createElement('input', {
        type: 'time',
        value: cfg.runTime || '10:00',
        onChange: e => handleChange('runTime', e.target.value)
      })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', null, 'ID смарт-процесса (entityTypeId)'),
      React.createElement('input', {
        type: 'number',
        value: cfg.entityTypeId || '',
        onChange: e => handleChange('entityTypeId', e.target.value ? Number(e.target.value) : null),
        placeholder: 'Например: 1058'
      })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', null, 'Стадии (через запятую)'),
      React.createElement('input', {
        type: 'text',
        value: (cfg.stageIds || []).join(','),
        onChange: e => handleChange('stageIds', e.target.value.split(',').filter(Boolean)),
        placeholder: 'Например: DT1058_1:NEW,DT1058_1:PROCESS'
      })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', null, 'ID шаблона БП'),
      React.createElement('input', {
        type: 'number',
        value: cfg.templateId || '',
        onChange: e => handleChange('templateId', e.target.value ? Number(e.target.value) : null),
        placeholder: 'Например: 77'
      })
    ),
    React.createElement('button', {
      onClick: handleSave,
      disabled: saving
    }, saving ? 'Сохранение...' : 'Сохранить настройки'),
    React.createElement('button', {
      onClick: handleRunNow,
      disabled: saving,
      style: { marginTop: '0.5rem', background: '#34a853' }
    }, saving ? 'Выполнение...' : 'Запустить сейчас (тест)'),
    message && React.createElement('div', {
      className: `status ${message.type}`
    }, message.text)
  );
}

// LastRunLog Component
function LastRunLog() {
  const [lastRun, setLastRun] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConfig().then(c => {
      setLastRun(c.lastRun);
      setLoading(false);
    });
  }, []);

  if (loading) return React.createElement('div', { className: 'loading' }, 'Загрузка...');

  if (!lastRun) {
    return React.createElement('div', { className: 'card' },
      React.createElement('h2', null, 'Последний запуск'),
      React.createElement('div', { className: 'info' }, 'Задание еще не выполнялось. Нажмите "Запустить сейчас (тест)" для проверки.')
    );
  }

  return React.createElement('div', { className: 'card' },
    React.createElement('h2', null, 'Последний запуск'),
    React.createElement('div', { className: 'log-entry' },
      React.createElement('strong', null, 'Время: '),
      React.createElement('span', null, new Date(lastRun.timestamp).toLocaleString('ru-RU'))
    ),
    React.createElement('div', { className: 'log-entry' },
      React.createElement('strong', null, 'Найдено элементов: '),
      React.createElement('span', null, lastRun.found || 0)
    ),
    React.createElement('div', { className: 'log-entry' },
      React.createElement('strong', null, 'Запущено БП: '),
      React.createElement('span', null, lastRun.started || 0)
    ),
    lastRun.error && React.createElement('div', { className: 'log-entry' },
      React.createElement('strong', null, 'Ошибка: '),
      React.createElement('span', { style: { color: '#d93025' } }, lastRun.error)
    )
  );
}

// App Component
function App() {
  return React.createElement('div', { className: 'container' },
    React.createElement('h1', null, 'Smart Process Cron'),
    React.createElement('div', { className: 'info' }, 
      'Это приложение автоматически сканирует выбранный смарт-процесс и запускает бизнес-процесс для каждого элемента в указанных стадиях.'
    ),
    React.createElement(JobConfigForm),
    React.createElement(LastRunLog)
  );
}

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
