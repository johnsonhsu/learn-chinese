import { Router } from 'express';
import {
  getAllUsers, getUser, getUserByName, createUser, updateUser, deleteUser,
  getSettings, updateSettings,
} from './db.js';

export const userRoutes = Router();

userRoutes.get('/', (_req, res) => {
  res.json(getAllUsers());
});

userRoutes.get('/:id', (req, res) => {
  const user = getUser(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

userRoutes.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const existing = getUserByName(name.trim());
  if (existing) return res.status(409).json({ error: 'Name already exists' });
  const user = createUser(name.trim());
  res.status(201).json(user);
});

userRoutes.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = getUser(id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  updateUser(id, req.body);
  res.json(getUser(id));
});

userRoutes.delete('/:id', (req, res) => {
  deleteUser(Number(req.params.id));
  res.json({ ok: true });
});

// --- Settings ---

userRoutes.get('/:id/settings', (req, res) => {
  const user = getUser(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(getSettings(user.id));
});

userRoutes.patch('/:id/settings', (req, res) => {
  const id = Number(req.params.id);
  const user = getUser(id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  updateSettings(id, req.body);
  res.json(getSettings(id));
});
