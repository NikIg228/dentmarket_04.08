// Isolated read-only preview. No app imports, API, directory listings or write endpoints.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.md':'text/plain; charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{const url=new URL(req.url,'http://127.0.0.1:4327');const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep)||!mime[path.extname(target)]||target.includes(path.sep+'originals'+path.sep)||target.includes(path.sep+'concepts'+path.sep)){res.writeHead(403).end();return;}
    const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'"});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(4327,'127.0.0.1',()=>console.log(`Design preview only: http://127.0.0.1:4327/preview.html?page=buyer-documents | pid ${process.pid}`));
