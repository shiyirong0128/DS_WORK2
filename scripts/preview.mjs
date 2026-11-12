import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/complete.html', 'complete.html']]);
http.createServer((request, response) => {
  const file = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(root, file)).pipe(response);
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173/'));
