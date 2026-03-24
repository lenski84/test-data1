import requests, json, datetime, os, sys

FRED_KEY = os.environ["FRED_API_KEY"]

def fred(series):
    r = requests.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": series,
            "api_key": FRED_KEY,
            "sort_order": "desc",
            "limit": 10,
            "file_type": "json"
        }
    )
    data = r.json()
    print(f"FRED {series}: status {r.status_code}")

    if "observations" not in data:
        print(f"ERROR for {series}: {data}")
        sys.exit(1)

    valid = [o for o in data["observations"] if o["value"] != "."]

    if len(valid) < 2:
        print(f"Not enough data for {series}, using 0")
        return 0.0, 0.0

    return float(valid[0]["value"]), float(valid[1]["value"])

def score_direction(current, previous):
    if current > previous * 1.002: return 1
    if current < previous * 0.998: return -1
    return 0

print("Starting fetch...")

cpi_now, cpi_prev     = fred("CPIAUCSL")
gdp_now, gdp_prev     = fred("GDP")
unemp_now, _          = fred("UNRATE")
fedfunds_now, ff_prev = fred("FEDFUNDS")
y10_now, y10_prev     = fred("DGS10")

print(f"CPI: {cpi_now} / {cpi_prev}")
print(f"GDP: {gdp_now} / {gdp_prev}")
print(f"Unemployment: {unemp_now}")
print(f"Fed Funds: {fedfunds_now} / {ff_prev}")
print(f"10Y: {y10_now} / {y10_prev}")

scores = {
    "timestamp": datetime.datetime.utcnow().isoformat(),
    "USD": {
        "zinsen":       score_direction(fedfunds_now, ff_prev),
        "inflation":    score_direction(cpi_now, cpi_prev),
        "arbeitsmarkt": -1 if unemp_now > 4.5 else (1 if unemp_now < 3.8 else 0),
        "wachstum":     score_direction(gdp_now, gdp_prev),
        "cb_ton":       0,
        "yields":       score_direction(y10_now, y10_prev),
        "zinsdiff":     0,
        "risk":         0,
    }
}

scores["USD"]["total"] = sum(
    v for k, v in scores["USD"].items() if k != "total"
)

print(f"USD total score: {scores['USD']['total']}")

# Write JSON
os.makedirs("data", exist_ok=True)
with open("data/scores.json", "w") as f:
    json.dump(scores, f, indent=2)
print("scores.json written")

# Write CSV for Pine Script
usd = scores["USD"]
with open("data/scores.csv", "w") as f:
    f.write("currency,zinsen,inflation,arbeitsmarkt,wachstum,cb_ton,yields,zinsdiff,risk,total\n")
    f.write(f"USD,{usd['zinsen']},{usd['inflation']},{usd['arbeitsmarkt']},"
            f"{usd['wachstum']},{usd['cb_ton']},{usd['yields']},"
            f"{usd['zinsdiff']},{usd['risk']},{usd['total']}\n")
print("scores.csv written")

print("All done!")
print(json.dumps(scores, indent=2))
