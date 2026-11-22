import { Response } from 'express';

interface Client {
  id: string;
  userId?: string;
  res: Response;
}

const clients: Map<string, Client> = new Map();

export function registerRealtimeClient(clientId: string, userId: string | undefined, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId })}\n\n`);

  clients.set(clientId, { id: clientId, userId, res });

  // Send keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

export function broadcastEvent(event: { type: string; payload: any; targetUserId?: string }) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients.values()) {
    if (!event.targetUserId || client.userId === event.targetUserId) {
      try {
        client.res.write(data);
      } catch (err) {
        console.error('Error sending SSE to client', client.id, err);
      }
    }
  }
}
