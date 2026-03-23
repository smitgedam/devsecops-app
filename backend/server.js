const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI ||
  'mongodb://admin:devsecops@mongodb-service:27017/devsecopsdb?authSource=admin';

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 100
}));

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

const taskSchema = new mongoose.Schema({
  title: {
    type: String, required: true,
    trim: true, maxlength: 100
  },
  description: {
    type: String, trim: true, maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', taskSchema);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'devsecops-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find()
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id, req.body,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404)
      .json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404)
      .json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});

module.exports = app;

// Health check v2 — added for Phase 8 demo
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.1.0',
    environment: process.env.NODE_ENV,
    phase: 'Phase 8 - Testing Complete'
  });
});
