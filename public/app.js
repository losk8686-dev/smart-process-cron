const { useState, useEffect } = React;

// Константы для ЭДО (цифровое рабочее место)
const EDO_ENTITY_TYPE_ID = '138';
const EDO_NAME = 'ЭДО';

// Функция для маскирования вебхука - скрываем токен после /rest/1/
function maskWebhook(url) {
  if (!url) return '';
  return url.replace(/(\/rest\/\d+\/)[^\/]+/, '$1****');
}

function App() {
  const [webhook, setWebhook] = useState(localStorage.getItem('b24_webhook') || '');
  const [currentTab, setCurrentTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stages, setStages] = useState([]);
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [showModal, setShowModal] = useState(false);

  // Функция для создания заголовков с вебхуком (кодируем URL)
  const getHeaders = () => {
    const encodedWebhook = btoa(unescape(encodeURIComponent(webhook)));
    return {
      'Content-Type': 'application/json',
      'X-Webhook-Encoded': encodedWebhook
    };
  };

  useEffect(() => {
    if (webhook) {
      loadData();
    }
  }, [webhook]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Загружаем задачи и логи
      const [tasksRes, logsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/logs')
      ]);

      const tasksData = await tasksRes.json();
      const logsData = await logsRes.json();

      setTasks(tasksData);
      setLogs(logsData);

      // Загружаем стадии
      const stagesRes = await fetch('/api/stages/' + EDO_ENTITY_TYPE_ID, {
        headers: getHeaders()
      });
      const stagesData = await stagesRes.json();
      
      if (stagesData.error) {
        throw new Error(stagesData.error);
      }
      setStages(stagesData);

      // Загружаем бизнес-процессы
      const bpRes = await fetch('/api/business-processes/' + EDO_ENTITY_TYPE_ID, {
        headers: getHeaders()
      });
      const bpData = await bpRes.json();
      
      if (bpData.error) {
        throw new Error(bpData.error);
      }
      setBusinessProcesses(bpData);
    } catch (err) {
      console.error('Error loading data:', err);
      setStatus({ type: 'error', message: 'Ошибка загрузки: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const saveWebhook = async (e) => {
    e.preventDefault();
    const url = webhook.trim();
    if (!url) {
      setStatus({ type: 'error', message: 'Введите URL вебхука' });
      return;
    }

    const normalizedUrl = url.endsWith('/') ? url : url + '/';
    setWebhook(normalizedUrl);
    localStorage.setItem('b24_webhook', normalizedUrl);
    
    setStatus({ type: 'success', message: 'Подключение установлено!' });
    loadData();
  };

  const runTask = async (taskId) => {
    if (!confirm('Запустить задачу?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/tasks/' + taskId + '/run', { 
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      
      if (data.status === 'error') {
        setStatus({ type: 'error', message: 'Ошибка: ' + (data.details || []).join(', ') });
      } else {
        setStatus({ 
          type: 'success', 
          message: 'Запущено: ' + (data.result?.started || 0) + ', Ошибок: ' + (data.result?.errors || 0)
        });
      }
      
      loadData();
    } catch (err) {
      setStatus({ type: 'error', message: 'Ошибка запуска: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      const res = await fetch('/api/tasks/' + task.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !task.active })
      });
      
      if (res.ok) {
        setStatus({ 
          type: 'success', 
          message: 'Задача ' + (task.active ? 'остановлена' : 'активирована')
        });
        loadData();
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Ошибка: ' + err.message });
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Удалить задачу?')) return;
    
    try {
      await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
      setStatus({ type: 'success', message: 'Задача удалена' });
      loadData();
    } catch (err) {
      setStatus({ type: 'error', message: 'Ошибка удаления: ' + err.message });
    }
  };

  if (!webhook) {
    return React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'header' },
        React.createElement('h1', null, 'Smart Process Cron - ЭДО'),
        React.createElement('p', null, 'Автоматический запуск бизнес-процессов для ЭДО')
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Настройка подключения'),
        React.createElement('p', null, 'Для работы приложения необходимо указать входящий вебхук Битрикс24.'),
        React.createElement('form', { onSubmit: saveWebhook },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, 'Входящий вебхук URL'),
            React.createElement('input', {
              type: 'text',
              value: webhook,
              onChange: (e) => setWebhook(e.target.value),
              placeholder: 'https://your-portal.bitrix24.ru/rest/1/...',
              required: true
            })
          ),
          React.createElement('button', { type: 'submit' }, 'Сохранить и подключиться')
        ),
        status.message && React.createElement('div', { className: 'status ' + status.type }, status.message)
      )
    );
  }

  return React.createElement('div', { className: 'container' },
    React.createElement('div', { className: 'header' },
      React.createElement('h1', null, 'Smart Process Cron - ЭДО'),
      React.createElement('p', null, 'Автоматический запуск бизнес-процессов для цифрового рабочего места ЭДО')
    ),

    status.message && React.createElement('div', { className: 'status ' + status.type, style: { marginBottom: '20px' } }, status.message),

    React.createElement('div', { className: 'tabs' },
      React.createElement('div', { 
        className: 'tab ' + (currentTab === 'tasks' ? 'active' : ''),
        onClick: () => setCurrentTab('tasks')
      }, 'Задачи (' + tasks.length + ')'),
      React.createElement('div', { 
        className: 'tab ' + (currentTab === 'logs' ? 'active' : ''),
        onClick: () => setCurrentTab('logs')
      }, 'Логи (' + logs.length + ')'),
      React.createElement('div', { 
        className: 'tab ' + (currentTab === 'settings' ? 'active' : ''),
        onClick: () => setCurrentTab('settings')
      }, 'Настройки')
    ),

    currentTab === 'tasks' && React.createElement('div', { className: 'card' },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
        React.createElement('h2', null, 'Задачи ЭДО'),
        React.createElement('button', { onClick: () => setShowModal(true) }, '+ Новая задача')
      ),

      tasks.length === 0 ? 
        React.createElement('div', { className: 'empty-state' },
          React.createElement('h3', null, 'Нет задач'),
          React.createElement('p', null, 'Создайте задачу для автоматического запуска бизнес-процессов ЭДО'),
          React.createElement('button', { onClick: () => setShowModal(true) }, 'Создать задачу')
        ) :
        React.createElement('div', { className: 'task-list' },
          tasks.map(task => 
            React.createElement('div', { key: task.id, className: 'task-item' },
              React.createElement('h3', null, 'ЭДО'),
              React.createElement('div', { className: 'task-details' },
                React.createElement('div', null,
                  React.createElement('strong', null, 'Стадии:'),
                  React.createElement('div', { className: 'stage-list' },
                    (task.stagesNames || task.stages || []).map((stage, idx) => 
                      React.createElement('span', { key: idx, className: 'stage-item selected' }, stage)
                    )
                  )
                ),
                React.createElement('div', null,
                  React.createElement('strong', null, 'Время запуска:'), ' ' + task.runTime,
                  React.createElement('br', null),
                  React.createElement('strong', null, 'Последний запуск:'), ' ' + (task.lastRun ? new Date(task.lastRun).toLocaleString('ru-RU') : 'Не запускалась'),
                  React.createElement('br', null),
                  React.createElement('strong', null, 'Статус:'), ' ',
                  React.createElement('span', { className: 'badge ' + (task.active ? 'badge-success' : 'badge-warning') },
                    task.active ? 'Активна' : 'Остановлена'
                  )
                )
              ),
              
              task.lastResult && React.createElement('div', { style: { marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' } },
                React.createElement('strong', null, 'Последний результат:'), ' ',
                'Запущено: ' + task.lastResult.started + ', Ошибок: ' + task.lastResult.errors + ', Всего: ' + task.lastResult.total
              ),

              React.createElement('div', { className: 'task-actions' },
                React.createElement('button', { 
                  onClick: () => runTask(task.id),
                  disabled: !task.active || loading
                }, loading ? 'Запуск...' : 'Запустить сейчас'),
                React.createElement('button', { 
                  className: 'secondary',
                  onClick: () => toggleTask(task)
                }, task.active ? 'Остановить' : 'Запустить'),
                React.createElement('button', { 
                  className: 'secondary danger',
                  onClick: () => deleteTask(task.id)
                }, 'Удалить')
              )
            )
          )
        )
    ),

    currentTab === 'logs' && React.createElement('div', { className: 'card' },
      React.createElement('h2', null, 'История запусков'),
      logs.length === 0 ? 
        React.createElement('div', { className: 'empty-state' },
          React.createElement('p', null, 'История запусков пуста')
        ) :
        React.createElement('div', { className: 'logs' },
          logs.map(log => 
            React.createElement('div', { key: log.id, className: 'log-entry ' + log.status },
              React.createElement('span', { className: 'timestamp' }, new Date(log.timestamp).toLocaleString('ru-RU')),
              React.createElement('div', null,
                React.createElement('strong', null, log.taskName),
                React.createElement('div', null, (log.details || []).join(', ')),
                log.result && React.createElement('div', { style: { marginTop: '5px' } },
                  'Результат: Запущено ' + log.result.started + ', Ошибок ' + log.result.errors
                )
              )
            )
          )
        )
    ),

    currentTab === 'settings' && React.createElement('div', { className: 'card' },
      React.createElement('h2', null, 'Настройки'),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Текущий вебхук'),
        React.createElement('input', { 
          type: 'text', 
          value: maskWebhook(webhook), 
          readOnly: true,
          style: { width: '100%', padding: '10px', background: '#f5f5f5' }
        })
      ),
      React.createElement('button', { onClick: () => {
        localStorage.removeItem('b24_webhook');
        setWebhook('');
        setTasks([]);
        setLogs([]);
      }}, 'Изменить вебхук')
    ),

    showModal && React.createElement(TaskModal, {
      stages: stages,
      businessProcesses: businessProcesses,
      onClose: () => setShowModal(false),
      onSave: () => { setShowModal(false); loadData(); }
    })
  );
}

function TaskModal({ stages, businessProcesses, onClose, onSave }) {
  const [selectedStages, setSelectedStages] = useState([]);
  const [runTime, setRunTime] = useState('10:00');
  const [bpId, setBpId] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleStage = (stageId) => {
    setSelectedStages(prev => {
      const isSelected = prev.includes(stageId);
      if (isSelected) {
        return prev.filter(id => id !== stageId);
      } else {
        return [...prev, stageId];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedStages.length === 0) {
      alert('Выберите хотя бы одну стадию');
      return;
    }

    const selectedStagesNames = stages
      .filter(s => selectedStages.includes(s.id))
      .map(s => s.name);

    const task = {
      entityTypeId: EDO_ENTITY_TYPE_ID,
      smartProcessName: EDO_NAME,
      stages: selectedStages,
      stagesNames: selectedStagesNames,
      runTime: runTime,
      bpId: bpId,
      bpName: businessProcesses.find(bp => bp.id === bpId)?.name || ''
    };

    try {
      setLoading(true);
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });

      if (res.ok) {
        onSave();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Ошибка сохранения');
      }
    } catch (err) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', { className: 'modal active' },
    React.createElement('div', { className: 'modal-content' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, 'Новая задача ЭДО'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, '×')
      ),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Стадии ЭДО (' + stages.length + ' доступно)'),
          React.createElement('div', { className: 'stage-list' },
            stages.length > 0 ?
              stages.map(stage => {
                const isSelected = selectedStages.includes(stage.id);
                return React.createElement('div', { 
                  key: stage.id,
                  className: 'stage-item ' + (isSelected ? 'selected' : ''),
                  style: { 
                    cursor: 'pointer',
                    padding: '8px 12px',
                    margin: '4px',
                    borderRadius: '16px',
                    display: 'inline-block',
                    border: '2px solid ' + (isSelected ? '#1a73e8' : 'transparent'),
                    background: isSelected ? '#e8f0fe' : '#e8eaed',
                    color: isSelected ? '#1967d2' : '#5f6368'
                  },
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleStage(stage.id);
                  }
                }, stage.name);
              }) :
              React.createElement('p', { style: { color: '#999' } }, 'Нет доступных стадий. Проверьте вебхук.')
          )
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Время запуска (каждый день)'),
          React.createElement('input', { 
            type: 'time', 
            value: runTime,
            onChange: (e) => setRunTime(e.target.value),
            required: true
          })
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Бизнес-процесс (' + businessProcesses.length + ' доступно)'),
          React.createElement('select', { 
            value: bpId, 
            onChange: (e) => setBpId(e.target.value),
            required: true
          },
            React.createElement('option', { value: '' }, 
              businessProcesses.length > 0 ? 'Выберите бизнес-процесс...' : 'Нет доступных БП'
            ),
            businessProcesses.map(bp => 
              React.createElement('option', { key: bp.id, value: bp.id }, bp.name)
            )
          )
        ),

        React.createElement('button', { type: 'submit', disabled: loading },
          loading ? 'Сохранение...' : 'Сохранить задачу'
        )
      )
    )
  );
}

// Используем старый ReactDOM.render для совместимости с UMD
ReactDOM.render(React.createElement(App), document.getElementById('root'));
