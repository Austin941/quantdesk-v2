import fs from 'fs';
import path from 'path';

/**
 * GET /api/dictionary
 * 對外開放全台股個股與題材/集團字典 REST API
 */
export default async function handler(req, res) {
  try {
    const type = req.query ? req.query.type : null;
    let fileName = 'taiwan_stocks.json';

    if (type === 'taxonomy') {
      fileName = 'theme_taxonomy.json';
    } else if (type === 'groups') {
      fileName = 'group_taxonomy.json';
    }

    const filePath = path.join(process.cwd(), 'stock_dictionary', fileName);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    }
    return res.status(404).json({ error: `${fileName} not found` });
  } catch (err) {
    console.error('API /api/dictionary error:', err);
    return res.status(500).json({ error: err.message });
  }
}
