import { mkdirSync } from 'node:fs';
import { OpenDatabase } from './db.ts';
import { CreateServer } from './server.ts';

mkdirSync('data', { recursive: true });
const port = Number(process.env.PORT ?? 3000);
CreateServer(OpenDatabase('data/miyunime.db')).listen(port, () => {
  console.log(`Miyunime Creator Hub berjalan di http://localhost:${port}`);
});
