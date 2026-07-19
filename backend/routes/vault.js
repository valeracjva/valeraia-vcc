import { Router } from 'express';
import { readdir, readFile, stat, writeFile, copyFile } from 'fs/promises';
import { join, parse as parsePath } from 'path';
import { existsSync } from 'fs';
import { PATHS } from '../config.js';

const router = Router();

// GET /api/vault — listar categorías (archivos .env)
router.get('/', async (_req, res, next) => {
  try {
    const files = await readdir(PATHS.secretsDir);
    const envFiles = files.filter(f => f.endsWith('.env'));

    const categories = await Promise.all(
      envFiles.map(async (file) => {
        const category = parsePath(file).name;
        const filePath = join(PATHS.secretsDir, file);
        const { mtime } = await stat(filePath);
        const content = await readFile(filePath, 'utf-8');
        const keysCount = content.split('\n')
          .filter(l => /^[A-Z_][A-Z0-9_]*=/.test(l.trim()))
          .length;
        return {
          category,
          file,
          keys_count: keysCount,
          modified_at: mtime.toISOString(),
        };
      })
    );

    // Ordenar alfabéticamente por categoría
    categories.sort((a, b) => a.category.localeCompare(b.category));

    res.json(categories);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json([]);
    }
    next(err);
  }
});

// GET /api/vault/:category — leer claves de una categoría
router.get('/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    // Sanitizar: solo caracteres seguros
    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    const filePath = join(PATHS.secretsDir, `${category}.env`);
    const content = await readFile(filePath, 'utf-8');
    const { mtime } = await stat(filePath);

    const lines = content.split('\n');
    const comments = [];
    const keys = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') {
        comments.push(trimmed);
      } else if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) {
        const eqIdx = trimmed.indexOf('=');
        const key = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        keys.push({ key, value, comment: comments.join('\n') || null });
        comments.length = 0;
      } else {
        comments.push(trimmed);
      }
    }

    res.json({
      category,
      file: `${category}.env`,
      modified_at: mtime.toISOString(),
      keys,
      preamble: comments.length > 0 ? comments.join('\n') : null,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    next(err);
  }
});

// PUT /api/vault/:category/:key — actualizar valor de una clave
router.put('/:category/:key', async (req, res, next) => {
  try {
    const { category, key } = req.params;
    const { value } = req.body;

    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key y value requeridos' });
    }

    const filePath = join(PATHS.secretsDir, `${category}.env`);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await copyFile(filePath, `${filePath}.bak.${timestamp}`);

    // Leer, modificar, escribir
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let found = false;

    const updated = lines.map(line => {
      const trimmed = line.trim();
      if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) {
        const eqIdx = trimmed.indexOf('=');
        const lineKey = trimmed.slice(0, eqIdx);
        if (lineKey === key) {
          found = true;
          return `${key}=${value}`;
        }
      }
      return line;
    });

    if (!found) {
      return res.status(404).json({ error: `Clave ${key} no encontrada en ${category}` });
    }

    await writeFile(filePath, updated.join('\n'), 'utf-8');
    res.json({ ok: true, key, category, modified_at: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/vault/:category/:key — eliminar una clave
router.delete('/:category/:key', async (req, res, next) => {
  try {
    const { category, key } = req.params;

    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    const filePath = join(PATHS.secretsDir, `${category}.env`);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await copyFile(filePath, `${filePath}.bak.${timestamp}`);

    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let found = false;

    const updated = lines.filter(line => {
      const trimmed = line.trim();
      if (/^[A-Z_][A-Z0-9_]*=/.test(trimmed)) {
        const eqIdx = trimmed.indexOf('=');
        const lineKey = trimmed.slice(0, eqIdx);
        if (lineKey === key) {
          found = true;
          return false;  // eliminar esta línea
        }
      }
      return true;
    });

    if (!found) {
      return res.status(404).json({ error: `Clave ${key} no encontrada en ${category}` });
    }

    await writeFile(filePath, updated.join('\n'), 'utf-8');
    res.json({ ok: true, key, category, deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/vault/:category — agregar clave nueva
router.post('/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const { key, value } = req.body;

    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key y value requeridos' });
    }

    const filePath = join(PATHS.secretsDir, `${category}.env`);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await copyFile(filePath, `${filePath}.bak.${timestamp}`);

    // Agregar al final del archivo
    const content = await readFile(filePath, 'utf-8');
    const newContent = content.endsWith('\n') ? `${content}${key}=${value}\n` : `${content}\n${key}=${value}\n`;
    await writeFile(filePath, newContent, 'utf-8');

    res.json({ ok: true, key, value, category, created: true });
  } catch (err) {
    next(err);
  }
});

export default router;
