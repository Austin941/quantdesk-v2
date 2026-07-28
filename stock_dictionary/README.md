# 🇹🇼 台股全市場字典與標籤資料庫 (Taiwan Stock & Theme Dictionary)

本資料夾包含了台股全市場 1,979+ 檔上市/上櫃股票的完整字典資料庫、產業分類以及多維度概念題材標籤對照表。

---

## 📁 檔案結構

```
stock_dictionary/
├── README.md               # 本說明文檔
├── taiwan_stocks.csv       # 全市場個股與題材標籤原始 CSV 資料庫
├── taiwan_stocks.json      # 結構化個股字典 (個股導向 JSON)
└── theme_taxonomy.json     # 產業與概念題材反向索引字典 (題材/族群導向 JSON)
```

---

## 📊 數據庫統計總覽

- **個股總數**：1,979 檔（涵蓋 TWSE 上市與 TPEX 上櫃全個股）
- **主產業類別**：35 個主產業別（如：半導體業、電子零組件業、建材營造、電腦及週邊設備業等）
- **概念題材標籤**：950+ 個細分概念題材（如：CoWoS、AI伺服器、矽光子、重電、機器人、高股息、綠能等）

---

## 📄 欄位定義說明

### 1. `taiwan_stocks.json` (個股字典)

每個個股物件包含以下欄位：

```json
{
  "code": "1101",
  "name": "台泥",
  "sector": "水泥工業",
  "market": "上市",
  "listed_date": "1962/02/09",
  "isin": "TW0001101004",
  "themes": [
    "不動產/建設",
    "水泥",
    "水泥建材",
    "水泥製品",
    "汽電共生",
    "電力",
    "預拌混凝土"
  ],
  "theme_count": 7
}
```

| 欄位名稱 | 型態 | 說明 |
| :--- | :--- | :--- |
| `code` | String | 股票代號（例：`2330`） |
| `name` | String | 股票名稱（例：`台積電`） |
| `sector` | String | 主所屬產業分類（例：`半導體業`） |
| `market` | String | 市場別（`上市` / `上櫃`） |
| `listed_date` | String | 上市/掛牌日期 |
| `isin` | String | 國際證券識別碼 (ISIN) |
| `themes` | Array\<String\> | 該個股所涵蓋之所有概念題材標籤清單 |
| `theme_count` | Number | 題材標籤總數量 |

---

### 2. `theme_taxonomy.json` (題材/族群反向索引字典)

方便依據「題材名稱」反向查詢包含的所有個股：

```json
{
  "themes": {
    "CoWoS": {
      "theme": "CoWoS",
      "count": 9,
      "stocks": [
        { "code": "2330", "name": "台積電", "sector": "半導體業", "market": "上市" },
        { "code": "3131", "name": "弘塑", "sector": "半導體業", "market": "上櫃" }
      ]
    }
  }
}
```

---

## 💡 使用範例

### Python 讀取範例
```python
import json

# 讀取個股字典
with open('stock_dictionary/taiwan_stocks.json', 'r', encoding='utf-8') as f:
    stocks = json.load(f)

# 查詢台積電包含的題材
tsmc = next(s for s in stocks if s['code'] == '2330')
print(tsmc['name'], tsmc['themes'])
```

### Node.js / JavaScript 讀取範例
```javascript
import fs from 'fs';

const taxonomy = JSON.parse(fs.readFileSync('./stock_dictionary/theme_taxonomy.json', 'utf-8'));
console.log('CoWoS 概念股清單：', taxonomy.themes['CoWoS'].stocks);
```
