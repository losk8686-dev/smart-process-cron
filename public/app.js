const { useState, useEffect } = React;

// Константы для ЭДО (цифровое рабочее место)
const EDO_ENTITY_TYPE_ID = '138';
const EDO_NAME = 'ЭДО';

// Часовой пояс сервера
const SERVER_TIMEZONE = 'UTC+7';

// Функция для отображения времени с учетом часового пояса
function formatTime(timeString) {
  if (!timeString) return 'Не запускалась';
  const date = new Date(timeString);
  return date.toLocaleString('ru-RU', { timeZone: 'Asia/Novosibirsk' }) + ' (UTC+7)';
}

function App() {
  const [currentTab, setCurrentTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stages, setStages] = useState([]);
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [showModal, setShowModal] = useState(false);
  const [entityCounts, setEntityCounts] = useState({});
  const [serverConnected, setServerConnected] = useState(false);

  // Загружаем данные при старте
  useEffect(() => {
    loadData();
  }, []);

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

      // Загружаем стадии (сервер использует env var)
      const stagesRes = await fetch('/api/stages/' + EDO_ENTITY_TYPE_ID);
      const stagesData = await stagesRes.json();
      
      if (stagesData.error) {
        throw new Error(stagesData.error);
      }
      setStages(stagesData);

      // Загружаем бизнес-процессы
      const bpRes = await fetch('/api/business-processes/' + EDO_ENTITY_TYPE_ID);
      const bpData = await bpRes.json();
      
      if (bpData.error) {
        throw new Error(bpData.error);
      }
      setBusinessProcesses(bpData);

      // Подсчитываем сущности для каждой задачи
      const counts = {};
      for (const task of tasksData) {
        try {
          const countRes = await fetch('/api/tasks/' + task.id + '/count', {
            method: 'POST'
          });
          const countData = await countRes.json();
          counts[task.id] = countData.count || 0;
        } catch (err) {
          counts[task.id] = 0;
        }
      }
      setEntityCounts(counts);
      
      setServerConnected(true);
    } catch (err) {
      console.error('Error loading data:', err);
      setStatus({ type: 'error', message: 'Ошибка загрузки: ' + err.message });
      setServerConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const runTask = async (taskId) => {
    if (!confirm('Запустить задачу сейчас?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/tasks/' + taskId + '/run', { 
        method: 'POST'
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

  // Показываем статус подключения
  if (!serverConnected && !loading) {
    return React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'header' },
        React.createElement('h1', null, 'Автоматический запуск Бизнес-процессов по таймеру'),
        React.createElement('p', null, 'Автоматический запуск бизнес-процессов для ЭДО')
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h2', null, 'Статус подключения'),
        React.createElement('div', { className: 'status error' }, 
          'Сервер не настроен. Пожалуйста, убедитесь, что переменная окружения BITRIX_WEBHOOK установлена на сервере.'
        ),
        React.createElement('button', { onClick: loadData }, 'Повторить попытку')
      )
    );
  }

  return React.createElement('div', { className: 'container' },
    React.createElement('div', { className: 'header' },
      React.createElement('h1', null, 'Автоматический запуск Бизнес-процессов по таймеру'),
      React.createElement('p', null, 'Разработчик Goldpartner24.ru - профессиональные интеграторы Битрикс24!')
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
      }, 'Логи (' + logs.length + ')')
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
          tasks.map(task => {
            const entityCount = entityCounts[task.id] || 0;
            return React.createElement('div', { key: task.id, className: 'task-item' },
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
                  React.createElement('strong', null, 'Время запуска:'), ' ' + task.runTime + ' (' + SERVER_TIMEZONE + ')',
                  React.createElement('br', null),
                  React.createElement('strong', null, 'Последний запуск:'), ' ' + formatTime(task.lastRun),
                  React.createElement('br', null),
                  React.createElement('strong', null, 'Статус:'), ' ',
                  React.createElement('span', { className: 'badge ' + (task.active ? 'badge-success' : 'badge-warning') },
                    task.active ? 'Активна' : 'Остановлена'
                  ),
                  React.createElement('br', null),
                  React.createElement('strong', null, 'Сущностей для обработки:'), ' ',
                  React.createElement('span', { 
                    style: { 
                      fontWeight: 'bold', 
                      color: entityCount > 0 ? '#1a73e8' : '#999',
                      fontSize: '1.1em'
                    } 
                  }, entityCount)
                )
              ),
              
              task.lastResult && React.createElement('div', { style: { marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' } },
                React.createElement('strong', null, 'Последний результат:'), ' ',
                'Запущено: ' + task.lastResult.started + ', Ошибок: ' + task.lastResult.errors + ', Всего: ' + task.lastResult.total
              ),

              React.createElement('div', { className: 'task-actions', style: { display: 'flex', gap: '8px', marginTop: '15px' } },
                React.createElement('button', { 
                  onClick: () => runTask(task.id),
                  disabled: !task.active || loading,
                  style: { 
                    background: '#34a853', 
                    flex: '2',
                    fontSize: '14px',
                    padding: '10px'
                  }
                }, loading ? 'Запуск...' : '▶ Запустить сейчас'),
                React.createElement('button', { 
                  className: 'secondary',
                  onClick: () => toggleTask(task),
                  style: { flex: '1' }
                }, task.active ? '⏸ Остановить' : '▶ Активировать'),
                React.createElement('button', { 
                  className: 'secondary danger',
                  onClick: () => deleteTask(task.id),
                  style: { flex: '1' }
                }, '🗑 Удалить')
              )
            );
          })
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
              React.createElement('span', { className: 'timestamp' }, formatTime(log.timestamp)),
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
  const [bpIdManual, setBpIdManual] = useState('');
  const [useManualBp, setUseManualBp] = useState(false);
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

    const finalBpId = useManualBp ? bpIdManual : bpId;
    if (!finalBpId) {
      alert('Выберите или введите ID бизнес-процесса');
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
      bpId: finalBpId,
      bpName: useManualBp ? 'БП #' + finalBpId : (businessProcesses.find(bp => bp.id === finalBpId)?.name || 'БП #' + finalBpId)
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
              React.createElement('p', { style: { color: '#999' } }, 'Нет доступных стадий. Проверьте подключение к серверу.')
          )
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Время запуска (каждый день)'),
          React.createElement('input', { 
            type: 'time', 
            value: runTime,
            onChange: (e) => setRunTime(e.target.value),
            required: true
          }),
          React.createElement('small', { style: { color: '#5f6368', display: 'block', marginTop: '5px' } }, 
            'Часовой пояс: ' + SERVER_TIMEZONE + ' (будет преобразовано к серверному времени)'
          )
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Бизнес-процесс'),
          
          businessProcesses.length > 0 ?
            React.createElement('select', { 
              value: bpId, 
              onChange: (e) => {
                setBpId(e.target.value);
                setUseManualBp(false);
              },
              style: { width: '100%', marginBottom: '10px' }
            },
              React.createElement('option', { value: '' }, 'Выберите бизнес-процесс...'),
              businessProcesses.map(bp => 
                React.createElement('option', { key: bp.id, value: bp.id }, bp.name)
              )
            ) :
            React.createElement('p', { style: { color: '#999', marginBottom: '10px' } }, 
              'Автоматически не найдены БП для ЭДО. Введите ID вручную:'
            ),
          
          React.createElement('input', {
            type: 'text',
            value: bpIdManual,
            onChange: (e) => {
              setBpIdManual(e.target.value);
              setUseManualBp(true);
            },
            placeholder: 'ID бизнес-процесса (например: 884)',
            style: { width: '100%' }
          })
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
