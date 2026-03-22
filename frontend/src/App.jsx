import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL ||
  'http://192.168.1.22:30002'

function App() {
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({
    title: '', description: '', status: 'pending'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { fetchTasks() }, [])

  const fetchTasks = async () => {
    try {
      const res = await axios.get(`${API}/api/tasks`)
      setTasks(res.data)
      setError('')
    } catch {
      setError('Cannot connect to backend')
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    try {
      await axios.post(`${API}/api/tasks`, form)
      setForm({ title: '', description: '', status: 'pending' })
      fetchTasks()
    } catch { setError('Failed to create task') }
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/api/tasks/${id}`)
      fetchTasks()
    } catch { setError('Failed to delete task') }
  }

  const handleStatus = async (id, status) => {
    try {
      await axios.put(`${API}/api/tasks/${id}`, { status })
      fetchTasks()
    } catch { setError('Failed to update task') }
  }

  return (
    <div className="app">
      <header>
        <h1>DevSecOps Task Manager</h1>
        <p>k3s · Jenkins · ArgoCD · Prometheus</p>
      </header>
      <main>
        <section className="form-section">
          <h2>New Task</h2>
          <form onSubmit={handleSubmit}>
            <input
              placeholder="Task title"
              value={form.title}
              onChange={e => setForm({
                ...form, title: e.target.value
              })}
              required
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={e => setForm({
                ...form, description: e.target.value
              })}
            />
            <select
              value={form.status}
              onChange={e => setForm({
                ...form, status: e.target.value
              })}>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
            <button type="submit">Add Task</button>
          </form>
        </section>
        {error && <div className="error">{error}</div>}
        <section className="tasks-section">
          <h2>Tasks ({tasks.length})</h2>
          {loading ? <p>Loading...</p> :
            tasks.length === 0
              ? <p className="empty">No tasks yet. Add one above.</p>
              : tasks.map(task => (
                <div key={task._id}
                  className={`task ${task.status}`}>
                  <div className="task-info">
                    <h3>{task.title}</h3>
                    {task.description &&
                      <p>{task.description}</p>}
                  </div>
                  <div className="task-actions">
                    <select
                      value={task.status}
                      onChange={e => handleStatus(
                        task._id, e.target.value
                      )}>
                      <option value="pending">Pending</option>
                      <option value="in-progress">
                        In Progress
                      </option>
                      <option value="completed">
                        Completed
                      </option>
                    </select>
                    <button
                      onClick={() => handleDelete(task._id)}
                      className="delete">
                      Delete
                    </button>
                  </div>
                </div>
              ))
          }
        </section>
      </main>
    </div>
  )
}

export default App
