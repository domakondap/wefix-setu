import { createApp } from './app.js';
import { migrate, dialect } from './db.js';
import { config } from './config.js';
import { seedIfEmpty } from './seed.js';

await migrate();

// On platforms with an ephemeral filesystem (e.g. plain Cloud Run + SQLite),
// seed demo data when the database starts out empty so the app is never blank.
if (process.env.SEED_ON_BOOT === 'true') {
  await seedIfEmpty();
}

const app = createApp();

app.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(
    `WeFix Setu API listening on http://0.0.0.0:${config.port} (${config.env}, db=${dialect})`
  );
});

