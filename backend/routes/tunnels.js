import { Router } from 'express';
import net from 'net';
import { TUNNEL_PORTS } from '../config.js';

const router = Router();

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error',   () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

router.get('/', async (req, res) => {
  const results = await Promise.all(
    TUNNEL_PORTS.map(async (port) => [String(port), await checkPort(port)])
  );
  res.json(Object.fromEntries(results));
});

export default router;
