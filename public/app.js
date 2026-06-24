const { useState, useEffect } = React;

// Константы для ЭДО (цифровое рабочее место)
const EDO_ENTITY_TYPE_ID = '138';
const EDO_NAME = 'ЭДО';

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

  useEffect(() => {
    if (webhook) {
      loadData();
    }
  }, [webhook]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Сохраняем вебхук
      await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook })
      });

      // Загружаем задачи, логи, стадии и БП параллельно
      const [tasksRes, logsRes, stagesRes, bpRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/logs'),
        fetch(`/api/stages/${EDO_ENTITY_TYPE_ID}`),
        fetch(`/api/business-processes/${EDO_ENTITY_TYPE_ID}`)
      ]);

      const tasksData = await tasksRes.json();
      const logsData = await logsRes.json();
      const stagesData = await stagesRes.json();
      const bpData = await bpRes.json();

      if (tasksData.error) throw new Error(tasksData.error);
      if (logsData.error) throw new Error(logsData.error);

      setTasks(tasksData);
      setLogs(logsData);
      setStages(stagesData);
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
    
    try {
      await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: normalizedUrl })
      });
      
      setStatus({ type: 'success', message: 'Подключение установлено!' });
      loadData();
    } catch (err) {
      setStatus({ type: 'error', message: 'Ошибка: ' + err.message });
    }
  };

  const runTask = async (taskId) => {
    if (!confirm('Запустить задачу?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/run`, { method: 'POST' });
      const data = await res.json();
      
      if (data.status === 'error') {
        setStatus({ type: 'error', message: 'Ошибка: ' + (data.details || []).join(', ') });
      } else {
        setStatus({ 
          type: 'success', 
          message: `Запущено: ${data.result?.started || 0}, Ошибок: ${data.result?.errors || 0}` 
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
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !task.active })
      });
      
      if (res.ok) {
        setStatus({ 
          type: 'success', 
          message: `Задача ${task.active ? 'остановлена' : 'активирована'}` 
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
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setStatus({ type: 'success', message: 'Задача удалена' });
      loadData();
    } catch (err) {
      setStatus({ type: 'error', message: 'Ошибка удаления: ' + err.message });
    }
  };

  if (!webhook) {
    return (
      <div className="container">
        <div className="header">
          <h1>Smart Process Cron - ЭДО</h1>
          <p>Автоматический запуск бизнес-процессов для ЭДО</p>
        </div>
        <div className="card">
          <h2>Настройка подключения</h2>
          <p>Для работы приложения необходимо указать входящий вебхук Битрикс24.</p>
          <form onSubmit={saveWebhook}>
            <div className="form-group">
              <label>Входящий вебхук URL</label>
              <input
                type="text"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://your-portal.bitrix24.ru/rest/1/..."
                required
              />
            </div>
            <button type="submit">Сохранить и подключиться</button>
          </form>
          {status.message && <div className={`status ${status.type}`}>{status.message}</div>}
          <div style={{marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '4px'}}>
            <strong>Как получить вебхук:</strong>
            <ol style={{marginTop: '10px', paddingLeft: '20px'}}>
              <li>Перейдите в Битрикс24 → Разработчикам → Другое → Входящий вебхук</li>
              <li>Создайте новый вебхук с правами: CRM, Бизнес-процессы</li>
              <li>Скопируйте URL и вставьте его выше</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Smart Process Cron - ЭДО</h1>
        <p>Автоматический запуск бизнес-процессов для цифрового рабочего места ЭДО</p>
      </div>

      {status.message && (
        <div className={`status ${status.type}`} style={{marginBottom: '20px'}}>
          {status.message}
        </div>
      )}

      <div className="tabs">
        <div 
          className={`tab ${currentTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setCurrentTab('tasks')}
        >
          Задачи ({tasks.length})
        </div>
        <div 
          className={`tab ${currentTab === 'logs' ? 'active' : ''}`}
          onClick={() => setCurrentTab('logs')}
        >
          Логи ({logs.length})
        </div>
        <div 
          className={`tab ${currentTab === 'settings' ? 'active' : ''}`}
          onClick={() => setCurrentTab('settings')}
        >
          Настройки
        </div>
      </div>

      {currentTab === 'tasks' && (
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <h2>Задачи ЭДО</h2>
            <button onClick={() => setShowModal(true)}>
              + Новая задача
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <h3>Нет задач</h3>
              <p>Создайте задачу для автоматического запуска бизнес-процессов ЭДО</p>
              <button onClick={() => setShowModal(true)}>
                Создать задачу
              </button>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map(task => (
                <div key={task.id} className="task-item">
                  <h3>ЭДО</h3>
                  <div className="task-details">
                    <div>
                      <strong>Стадии:</strong>
                      <div className="stage-list">
                        {(task.stagesNames || task.stages || []).map((stage, idx) => (
                          <span key={idx} className="stage-item selected">{stage}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <strong>Время запуска:</strong> {task.runTime}<br/>
                      <strong>Последний запуск:</strong> {task.lastRun 
                        ? new Date(task.lastRun).toLocaleString('ru-RU') 
                        : 'Не запускалась'}<br/>
                      <strong>Статус:</strong>{' '}
                      <span className={`badge ${task.active ? 'badge-success' : 'badge-warning'}`}>
                        {task.active ? 'Активна' : 'Остановлена'}
                      </span>
                    </div>
                  </div>
                  
                  {task.lastResult && (
                    <div style={{marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px'}}>
                      <strong>Последний результат:</strong>{' '}
                      Запущено: {task.lastResult.started}, 
                      Ошибок: {task.lastResult.errors}, 
                      Всего: {task.lastResult.total}
                    </div>
                  )}

                  <div className="task-actions">
                    <button 
                      onClick={() => runTask(task.id)}
                      disabled={!task.active || loading}
                    >
                      {loading ? 'Запуск...' : 'Запустить сейчас'}
                    </button>
                    <button 
                      className="secondary"
                      onClick={() => toggleTask(task)}
                    >
                      {task.active ? 'Остановить' : 'Запустить'}
                    </button>
                    <button 
                      className="secondary danger"
                      onClick={() => deleteTask(task.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentTab === 'logs' && (
        <div className="card">
          <h2>История запусков</h2>
          {logs.length === 0 ? (
            <div className="empty-state">
              <p>История запусков пуста</p>
            </div>
          ) : (
            <div className="logs">
              {logs.map(log => (
                <div key={log.id} className={`log-entry ${log.status}`}>
                  <span className="timestamp">
                    {new Date(log.timestamp).toLocaleString('ru-RU')}
                  </span>
                  <div>
                    <strong>{log.taskName}</strong>
                    <div>{(log.details || []).join(', ')}</div>
                    {log.result && (
                      <div style={{marginTop: '5px'}}>
                        Результат: Запущено {log.result.started}, Ошибок {log.result.errors}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentTab === 'settings' && (
        <div className="card">
          <h2>Настройки</h2>
          <div className="form-group">
            <label>Текущий вебхук</label>
            <input 
              type="text" 
              value={webhook} 
              readOnly 
              style={{width: '100%', padding: '10px', background: '#f5f5f5'}}
            />
          </div>
          <button onClick={() => {
            localStorage.removeItem('b24_webhook');
            setWebhook('');
            setTasks([]);
            setLogs([]);
          }}>
            Изменить вебхук
          </button>
        </div>
      )}

      {showModal && (
        <TaskModal
          stages={stages}
          businessProcesses={businessProcesses}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); loadData(); }}
        />
      )}
    </div>
  );
}

function TaskModal({ stages, businessProcesses, onClose, onSave }) {
  const [selectedStages, setSelectedStages] = useState([]);
  const [runTime, setRunTime] = useState('10:00');
  const [bpId, setBpId] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleStage = (stageId) => {
    setSelectedStages(prev => 
      prev.includes(stageId) 
        ? prev.filter(id => id !== stageId)
        : [...prev, stageId]
    );
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
      runTime,
      bpId,
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

  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Новая задача ЭДО</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Стадии ЭДО</label>
            <div className="stage-list">
              {stages.length > 0 ? (
                stages.map(stage => (
                  <label 
                    key={stage.id} 
                    className={`stage-item ${selectedStages.includes(stage.id) ? 'selected' : ''}`}
                    style={{cursor: 'pointer'}}
                    onClick={() => toggleStage(stage.id)}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedStages.includes(stage.id)}
                      onChange={() => {}}
                      style={{display: 'none'}}
                    />
                    {stage.name}
                  </label>
                ))
              ) : (
                <p style={{color: '#999'}}>Загрузка стадий...</p>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Время запуска (каждый день)</label>
            <input 
              type="time" 
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Бизнес-процесс</label>
            <select 
              value={bpId} 
              onChange={(e) => setBpId(e.target.value)}
              required
            >
              <option value="">Выберите бизнес-процесс...</option>
              {businessProcesses.map(bp => (
                <option key={bp.id} value={bp.id}>{bp.name}</option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Сохранение...' : 'Сохранить задачу'}
          </button>
        </form>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
