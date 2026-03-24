export default async function handler(req, res) {
  // Allow TradingView to access this
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'text/plain')

  // Fetch your CSV from GitHub
  const url = 'https://raw.githubusercontent.com/lenski84/test-data1/main/data/scores.csv'
  const response = await fetch(url)
  const csv = await response.text()

  // Parse CSV into scores object
  const lines = csv.trim().split('\n')
  const scores = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    scores[cols[0]] = {
      zinsen:       parseInt(cols[1]),
      inflation:    parseInt(cols[2]),
      arbeitsmarkt: parseInt(cols[3]),
      wachstum:     parseInt(cols[4]),
      cb_ton:       parseInt(cols[5]),
      total:        parseInt(cols[9])
    }
  }

  // Return as simple text that Pine Script can read
  // Format: USD_ZINSEN,USD_INF,USD_ARB,USD_WACHS,EUR_ZINSEN,...
  const ccys = ['USD','EUR','GBP','JPY','CHF','AUD','NZD']
  const values = []
  for (const c of ccys) {
    const s = scores[c]
    values.push(s.zinsen, s.inflation, s.arbeitsmarkt, s.wachstum, s.total)
  }

  res.status(200).send(values.join(','))
}
