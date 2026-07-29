import fs from 'fs';
import path from 'path';

const apiDir = path.join(process.cwd(), 'api');
const routesDir = path.join(apiDir, '_routes');

if (!fs.existsSync(routesDir)) {
  fs.mkdirSync(routesDir);
}

// Files to move to _routes
const filesToMove = [
  'proxy.js', 'closing.js', 'chip.js', 'margin.js', 'kline.js', 
  'banks.js', 'branches.js', 'conglomerates.js', 'dictionary.js', 
  'drawer_data.js', 'stock_info.js', 'tdcc.js', 'tdcc_history.js', 
  'supply_chain.js', 'ping.js'
];

filesToMove.forEach(file => {
  const oldPath = path.join(apiDir, file);
  const newPath = path.join(routesDir, file);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
});
