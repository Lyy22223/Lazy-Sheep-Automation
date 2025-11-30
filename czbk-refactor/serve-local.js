/**
 * 本地开发服务器 - 用于油猴脚本自动更新
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const DIST_PATH = path.join(__dirname, 'dist');

const server = http.createServer((req, res) => {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const filePath = path.join(DIST_PATH, req.url === '/' ? 'lazy-sheep-auto-answer.dev.user.js' : req.url);
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.writeHead(200);
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 本地开发服务器已启动: http://localhost:${PORT}`);
    console.log(`📝 脚本地址: http://localhost:${PORT}/lazy-sheep-auto-answer.dev.user.js`);
    console.log(`\n请在油猴脚本中添加：`);
    console.log(`// @updateURL    http://localhost:${PORT}/lazy-sheep-auto-answer.dev.user.js`);
    console.log(`// @downloadURL  http://localhost:${PORT}/lazy-sheep-auto-answer.dev.user.js`);
});
