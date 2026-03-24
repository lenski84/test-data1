import requests, json, datetime, os

FRED_KEY = os.environ["FRED_API_KEY"]

def fred(series):
    r = requests.get(
        f"https://api.stlouisfed.org/fred/series/observations",
        params={"series_id": series, "api_key": FRED_KEY,
                "sort_order": "desc", "limit": 2, "file_type": "json"}
    )
    obs = r.json()["observations"]
    return float(obs[0]["value"]), float(obs[1]["value"])

def score_direction(current, previous):
    if current > previous * 1.002: return 1
    if current < previous * 0.998: return -1
    return 0

# --- Daten holen ---
cpi_now, cpi_prev   = fred("CPIAUCSL")      # US CPI
gdp_now, gdp_prev   = fred("GDP")           # US BIP (quarterly)
unemp_now, _        = fred("UNRATE")        # Arbeitslosigkeit
fedfunds_now, ff_p  = fred("FEDFUNDS")      # Fed Funds Rate

# US10Y via FRED
y10_now, y10_prev   = fred("DGS10")

# --- Score Berechnung (US Dollar Beispiel) ---
scores = {
    "timestamp": datetime.datetime.utcnow().isoformat(),
    "USD": {
        "zinsen":       1 if fedfunds_now > ff_p else (-1 if fedfunds_now < ff_p else 0),
        "inflation":    score_direction(cpi_now, cpi_prev),
        "arbeitsmarkt": -1 if unemp_now > 4.5 else (1 if unemp_now < 3.8 else 0),
        "wachstum":     score_direction(gdp_now, gdp_prev),
        "cb_ton":       0,   # manuell oder via Sentiment API
        "yields":       score_direction(y10_now, y10_prev),
        "zinsdiff":     0,   # wird im Pine berechnet
        "risk":         0,   # wird im Pine berechnet
    }
}

# Summe berechnen
for ccy in scores:
    if isinstance(scores[ccy], dict) and "zinsen" in scores[ccy]:
        scores[ccy]["total"] = sum(scores[ccy].values())

os.makedirs("data", exist_ok=True)
with open("data/scores.json", "w") as f:
    json.dump(scores, f, indent=2)

print("Done:", scores)
