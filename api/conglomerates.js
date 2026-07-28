import fs from 'fs';
import path from 'path';

/**
 * GET /api/conglomerates
 * 回傳台股集團股 (台塑、中美晶、鴻海、聯電等) 結構與反向索引 JSON
 */
export default async function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), 'stock_dictionary', 'group_taxonomy.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(data);
    }
    return res.status(404).json({ error: 'Group taxonomy not found' });
  } catch (err) {
    console.error('API /api/conglomerates error:', err);
    return res.status(500).json({ error: err.message });
  }
}
