import { Hono } from 'hono';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createRoom, getAllRooms, getRoom } from '../ws/rooms.js';
import { nanoid } from 'nanoid';

const createRoomSchema = z.object({
  name: z.string().min(1).max(50),
  simulationId: z.string().uuid(),
});

export const roomRoutes = new Hono();

roomRoutes.get('/', async (c) => {
  const rooms = getAllRooms();
  return c.json(rooms);
});

roomRoutes.get('/:id', async (c) => {
  const room = getRoom(c.req.param('id'));
  if (!room) return c.json({ error: 'Room not found' }, 404);
  return c.json(room);
});

roomRoutes.post('/', authRequired, validateBody(createRoomSchema), async (c) => {
  const user = c.get('user');
  const body = createRoomSchema.parse(await c.req.json());

  const roomId = nanoid(12);
  const room = createRoom(roomId, body.name, user.sub, body.simulationId, user.username);

  return c.json(room, 201);
});
